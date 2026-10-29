import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalQuery, query } from "../_generated/server";
import { requireActionUserId } from "../lib/auth";
import { fallbackQueries, searchLocation } from "../lib/searchTerms";
import { rateLimiter } from "../rateLimits";
import { isListed, isTrial } from "../lib/marketplace";
import { VENDOR_CATEGORIES } from "../lib/vendorNeeds";
import { cardFor, listedVendors, listingCard, offeringsOf } from "./listings";

/**
 * Find vendors: PlusOne's vendor directory, open to anyone, with no plan bought and no
 * sign-in. The same listings a family's planner shows, by trade and city. A Partner
 * vendor's phone and WhatsApp are kept back: customers reach them through PlusOne until a
 * booking is made. Until real vendors are listed in a trade, the sample vendors show, each
 * marked as a sample.
 */

const publicCard = v.object({ ...listingCard.fields });

type Card = Awaited<ReturnType<typeof cardFor>>;
const withoutContact = (c: Card): Card => ({ ...c, phone: undefined, whatsapp: undefined });

export const trades = query({
  args: {},
  returns: v.array(v.string()),
  handler: async () => VENDOR_CATEGORIES,
});

export const search = query({
  args: { category: v.string(), city: v.string() },
  returns: v.object({ vendors: v.array(publicCard), samplesOnly: v.boolean() }),
  handler: async (ctx, args) => {
    const city = args.city.trim().slice(0, 60) || "Chennai";
    if (!VENDOR_CATEGORIES.includes(args.category)) return { vendors: [], samplesOnly: false };
    const real = await listedVendors(ctx, args.category, city);
    if (real.length > 0) return { vendors: real.map(withoutContact), samplesOnly: false };
    const samples = (await listedVendors(ctx, args.category, city, true)).filter((c) => c.sample);
    return { vendors: samples.map(withoutContact), samplesOnly: samples.length > 0 };
  },
});

const pkg = v.object({
  category: v.string(),
  title: v.string(),
  price: v.number(),
  currency: v.string(),
  priceUnit: v.optional(v.string()),
  includes: v.array(v.string()),
  taxIncluded: v.optional(v.boolean()),
});

/** One listed vendor's page: their card, and every package on the sheet as customers read it. */
export const vendor = query({
  args: { profileId: v.id("vendorProfiles") },
  returns: v.union(v.null(), v.object({ card: publicCard, about: v.optional(v.string()), packages: v.array(pkg) })),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || !isListed(profile) || isTrial(profile)) return null;
    const card = withoutContact(await cardFor(ctx, profile, profile.categories[0] ?? ""));
    const packages = (await offeringsOf(ctx, profile)).map((o) => ({
      category: o.category,
      title: o.title,
      price: o.price,
      currency: o.currency,
      ...(o.priceUnit ? { priceUnit: o.priceUnit } : {}),
      includes: o.includes,
      ...(o.taxIncluded !== undefined ? { taxIncluded: o.taxIncluded } : {}),
    }));
    return { card, ...(profile.about ? { about: profile.about } : {}), packages };
  },
});

const webResult = v.object({ url: v.string(), host: v.string(), title: v.optional(v.string()), description: v.optional(v.string()) });

export const isGuest = internalQuery({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, args) => (await ctx.db.get(args.userId))?.isAnonymous === true,
});

const BUSY = "That's as many web searches as we can run today. Browse the vendors on PlusOne, or try tomorrow.";

/**
 * Vendors on the open web, for anyone: the planner's own search, without the emails. A
 * visitor who hasn't signed in gets a guest session for it, so each search counts against
 * a daily allowance. Each result is the vendor's own site, read under the same rules (no listing or
 * review sites), and nothing is sent to anyone.
 */
export const searchWeb = action({
  args: { category: v.string(), city: v.string(), area: v.optional(v.string()) },
  returns: v.array(webResult),
  handler: async (ctx, args): Promise<{ url: string; host: string; title?: string; description?: string }[]> => {
    const userId = await requireActionUserId(ctx);
    if (!VENDOR_CATEGORIES.includes(args.category)) throw new ConvexError("Pick a kind of vendor first.");
    const city = args.city.trim().slice(0, 60) || "Chennai";
    const guest: boolean = await ctx.runQuery(internal.marketplace.directory.isGuest, { userId });
    const mine = await rateLimiter.limit(ctx, guest ? "directoryWebDemo" : "directoryWeb", { key: userId });
    if (!mine.ok) throw new ConvexError(BUSY);
    const all = await rateLimiter.limit(ctx, "directoryWebAll");
    if (!all.ok) throw new ConvexError(BUSY);
    const place = searchLocation(args.area?.trim().slice(0, 60), city);
    const found = await ctx.runAction(internal.firecrawl.searchVendors, {
      queries: fallbackQueries({ need: args.category, place }).slice(0, 3),
      city: place,
      limit: 8,
      currency: "INR",
    });
    return found.map((r) => ({
      url: r.url,
      host: new URL(r.url).hostname.replace(/^www\./, ""),
      ...(r.title ? { title: r.title.slice(0, 120) } : {}),
      ...(r.description ? { description: r.description.slice(0, 280) } : {}),
    }));
  },
});
