import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { badgesFor, cityKey, isListed, isTrial, levelFor, MIN_BAND_COUNT, startingOffering, tierFor, type Band } from "../lib/marketplace";
import type { Basis } from "../lib/comparable";
import { canonicalWebsite } from "../lib/text";
import { offeringUnit } from "../schema";

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
  startingPrice: v.optional(v.object({ price: v.number(), unit: offeringUnit, currency: v.string() })),
  phone: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  /** A sample vendor, shown only on sample events and labelled as one. */
  sample: v.boolean(),
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

/** A listing as a family's vendor card shows it, for one category; a sample listing is placed in the sample range. */
export async function cardFor(ctx: QueryCtx, profile: Doc<"vendorProfiles">, category: string) {
  const offerings = await offeringsOf(ctx, profile);
  const start = startingOffering(offerings, category);
  const band: Band | null = start ? await bandRow(ctx, category, start.unit, profile.cityKey, profile.sample === true) : null;
  return {
    _id: profile._id,
    name: profile.name,
    website: profile.website,
    city: profile.city,
    categories: profile.categories,
    badges: badgesFor(profile, offerings),
    tier: start ? tierFor(start.price, band) : undefined,
    level: levelFor(profile.completedEvents),
    startingPrice: start ? { price: start.price, unit: start.unit, currency: start.currency } : undefined,
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    sample: profile.sample === true,
  };
}

/**
 * Listed vendors for one need in one city: verified vendors first, then listings
 * PlusOne added from public pages. Never a suspended or rejected vendor, never a
 * vendor's own sign-up before a person has verified it, and sample vendors only when
 * `samples` is set, for a sample event.
 */
export const searchProfiles = internalQuery({
  args: { category: v.string(), city: v.string(), samples: v.optional(v.boolean()) },
  returns: v.array(listingCard),
  handler: async (ctx, args) => {
    const key = cityKey(args.city);
    const cards = [];
    let scanned = 0;
    for (const status of ["verified", "pending"] as const) {
      const rows = ctx.db.query("vendorProfiles").withIndex("by_cityKey_and_status", (q) => q.eq("cityKey", key).eq("status", status));
      for await (const profile of rows) {
        if (cards.length >= MAX_CARDS || ++scanned > MAX_SCANNED) break;
        if (!isListed(profile) || !profile.categories.includes(args.category)) continue;
        if ((profile.sample && !args.samples) || isTrial(profile)) continue;
        cards.push(await cardFor(ctx, profile, args.category));
      }
    }
    return cards;
  },
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
