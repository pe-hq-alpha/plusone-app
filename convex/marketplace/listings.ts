import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { badgesFor, cityKey, inRangeUnit, isListed, isTrial, levelFor, MIN_BAND_COUNT, startingOffering, tierFor, type Band } from "../lib/marketplace";
import type { Basis } from "../lib/comparable";
import { canonicalWebsite } from "../lib/text";
import { placeFor } from "../lib/places";
import { offeringUnit, placeValidator } from "../schema";
import { customerPhoto, photosForCustomers } from "./photos";

/**
 * What PlusOne Events reads from PlusOne Partner (docs/marketplace-contract.md): listed
 * vendors for a need in a city, a city's price range, and the listing behind a website.
 * Internal only: Events calls these from its own functions, after its own access checks.
 */

/** Cards returned per search: a family compares a handful, never a directory. */
const MAX_CARDS = 20;
/** Listings read per search before giving up on finding more in this category. */
const MAX_SCANNED = 500;
/** Offerings read per listing; a vendor with more is summarised by its first ones. */
const MAX_OFFERINGS = 50;

export const badge = v.union(v.literal("plusone_added"), v.literal("verified"), v.literal("transparent_pricing"));
export const tier = v.union(v.literal("Value"), v.literal("Standard"), v.literal("Premium"), v.literal("Luxury"));
export const level = v.union(v.literal("New"), v.literal("Trusted"), v.literal("Top"));

export const listingCard = v.object({
  _id: v.id("vendorProfiles"),
  name: v.string(),
  website: v.optional(v.string()),
  city: v.string(),
  categories: v.array(v.string()),
  badges: v.array(badge),
  tier: v.optional(tier),
  level,
  /** `priceUnit`: the way of charging on the sheet, so a rate per hour is never read as a price for the event. */
  startingPrice: v.optional(v.object({ price: v.number(), unit: offeringUnit, priceUnit: v.optional(v.string()), currency: v.string() })),
  phone: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  /** A sample vendor, shown only on sample events and labelled as one. */
  sample: v.boolean(),
  /** Photos of their work customers may see: checked clean, or approved in Ops. */
  photos: v.array(customerPhoto),
  /** Events done through PlusOne, which set the level: a track record, not a rating bought. */
  completedEvents: v.number(),
  /** Where they work from, for the map: the area they name, or only their city. */
  place: v.optional(placeValidator),
  /** Found through public web listings, not yet verified: said beside the listing, with its map and social links. */
  foundOnWeb: v.optional(v.boolean()),
  links: v.optional(v.object({ maps: v.optional(v.string()), instagram: v.optional(v.string()), facebook: v.optional(v.string()) })),
});

export const bandResult = v.union(
  v.null(),
  v.object({
    count: v.number(),
    p25: v.number(),
    p50: v.number(),
    p75: v.number(),
    p90: v.number(),
    currency: v.string(),
    computedAt: v.number(),
  }),
);

export async function offeringsOf(ctx: QueryCtx, profile: Doc<"vendorProfiles">): Promise<Doc<"vendorOfferings">[]> {
  return await ctx.db
    .query("vendorOfferings")
    .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
    .take(MAX_OFFERINGS);
}

/**
 * A city's range for a category and unit, or null until enough prices sit behind it.
 * `samples`: count the sample vendors' prices too, for a sample event only.
 */
export async function bandRow(ctx: QueryCtx, category: string, unit: Basis, city: string, samples = false): Promise<Doc<"priceBands"> | null> {
  const band = await ctx.db
    .query("priceBands")
    .withIndex("by_category_and_unit_and_city_and_sample", (q) =>
      q.eq("category", category).eq("unit", unit).eq("city", cityKey(city)).eq("sample", samples),
    )
    .first();
  return band && band.count >= MIN_BAND_COUNT ? band : null;
}

/**
 * A listing as a family's vendor card shows it, for one category; a sample listing is
 * placed in the sample range. A starting price in another way of charging than the
 * range's (a rate per hour) is shown without a place in it.
 */
export async function cardFor(ctx: QueryCtx, profile: Doc<"vendorProfiles">, category: string) {
  const offerings = await offeringsOf(ctx, profile);
  const start = startingOffering(offerings, category);
  const band: Band | null = start && inRangeUnit(start) ? await bandRow(ctx, category, start.unit, profile.cityKey, profile.sample === true) : null;
  return {
    _id: profile._id,
    name: profile.name,
    website: profile.website,
    city: profile.city,
    categories: profile.categories,
    badges: badgesFor(profile, offerings),
    tier: start ? tierFor(start.price, band) : undefined,
    level: levelFor(profile.completedEvents),
    startingPrice: start ? { price: start.price, unit: start.unit, ...(start.priceUnit ? { priceUnit: start.priceUnit } : {}), currency: start.currency } : undefined,
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    sample: profile.sample === true,
    photos: await photosForCustomers(ctx, profile),
    completedEvents: profile.completedEvents,
    place: profile.place ?? placeFor(profile.serviceArea?.join(", "), profile.city) ?? undefined,
    ...(profile.foundVia && !profile.ownerUserId ? { foundOnWeb: true } : {}),
    ...(profile.links ? { links: profile.links } : {}),
  };
}

/**
 * Listed vendors for one need in one city: verified vendors first, then listings
 * PlusOne added from public pages. Never a suspended or rejected vendor, never a
 * vendor's own sign-up before a person has verified it, and sample vendors only when
 * `samples` is set, for a sample event.
 */
export async function listedVendors(ctx: QueryCtx, category: string, city: string, samples = false) {
  const key = cityKey(city);
  const cards = [];
  let scanned = 0;
  for (const status of ["verified", "pending"] as const) {
    const rows = ctx.db.query("vendorProfiles").withIndex("by_cityKey_and_status", (q) => q.eq("cityKey", key).eq("status", status));
    for await (const profile of rows) {
      if (cards.length >= MAX_CARDS || ++scanned > MAX_SCANNED) break;
      // Listings found on the open web are reached by their own index below, so thousands of them never crowd out the rest.
      if (profile.leadCategory && status === "pending") continue;
      if (!isListed(profile) || !profile.categories.includes(category)) continue;
      if ((profile.sample && !samples) || isTrial(profile)) continue;
      cards.push(await cardFor(ctx, profile, category));
    }
  }
  if (cards.length < MAX_CARDS) {
    const found = ctx.db.query("vendorProfiles").withIndex("by_cityKey_and_leadCategory", (q) => q.eq("cityKey", key).eq("leadCategory", category));
    for await (const profile of found) {
      if (cards.length >= MAX_CARDS) break;
      if (profile.status !== "pending" || !isListed(profile)) continue;
      cards.push(await cardFor(ctx, profile, category));
    }
  }
  return cards;
}

export const searchProfiles = internalQuery({
  args: { category: v.string(), city: v.string(), samples: v.optional(v.boolean()) },
  returns: v.array(listingCard),
  handler: async (ctx, args) => await listedVendors(ctx, args.category, args.city, args.samples === true),
});

export const bandFor = internalQuery({
  args: { category: v.string(), unit: offeringUnit, city: v.string(), samples: v.optional(v.boolean()) },
  returns: bandResult,
  handler: async (ctx, args) => {
    const band = await bandRow(ctx, args.category, args.unit, args.city, args.samples === true);
    if (!band) return null;
    const { count, p25, p50, p75, p90, currency, computedAt } = band;
    return { count, p25, p50, p75, p90, currency, computedAt };
  },
});

/** The listing behind a website a search found, for linking `vendors.profileId`. */
export const profileByWebsite = internalQuery({
  args: { website: v.string() },
  returns: v.union(v.id("vendorProfiles"), v.null()),
  handler: async (ctx, args) => {
    const website = canonicalWebsite(args.website);
    if (!website) return null;
    const profile = await ctx.db
      .query("vendorProfiles")
      .withIndex("by_website", (q) => q.eq("website", website))
      .first();
    return profile && isListed(profile) && !profile.sample ? profile._id : null;
  },
});
