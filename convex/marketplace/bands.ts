import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { bandOf, isListed } from "../lib/marketplace";

/**
 * Each city's price ranges, worked out from the prices listed vendors publish on
 * Partner: one band per category, unit, city and currency, from at least eight prices
 * with no names attached. Run on a schedule (crons.ts); a band whose prices fall below
 * eight is removed rather than shown on too little. Each band is worked out twice: from
 * real vendors only, for real families, and with the sample vendors too, for sample events.
 */

/** Listings read per run; well above one city's vendors for now. */
const MAX_PROFILES = 2000;

export const recompute = internalMutation({
  args: {},
  returns: v.object({ bands: v.number(), removed: v.number() }),
  handler: async (ctx) => {
    type Pool = { category: string; unit: "per_person" | "per_piece" | "per_day" | "total"; city: string; currency: string; sample: boolean; prices: number[] };
    const pools = new Map<string, Pool>();
    const add = (o: Doc<"vendorOfferings">, city: string, sample: boolean) => {
      const key = [o.category, o.unit, city, o.currency, sample].join("|");
      const pool = pools.get(key) ?? { category: o.category, unit: o.unit, city, currency: o.currency, sample, prices: [] };
      pool.prices.push(o.price);
      pools.set(key, pool);
    };
    let read = 0;
    for (const status of ["verified", "pending"] as const) {
      for await (const profile of ctx.db.query("vendorProfiles").withIndex("by_status", (q) => q.eq("status", status))) {
        if (++read > MAX_PROFILES) break;
        if (!isListed(profile)) continue;
        const offerings = await ctx.db
          .query("vendorOfferings")
          .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
          .take(50);
        for (const o of offerings) {
          add(o, profile.cityKey, true);
          if (!profile.sample) add(o, profile.cityKey, false);
        }
      }
    }

    const now = Date.now();
    const kept = new Set<string>();
    let bands = 0;
    for (const pool of pools.values()) {
      const band = bandOf(pool.prices);
      if (!band) continue;
      const existing = await ctx.db
        .query("priceBands")
        .withIndex("by_category_and_unit_and_city_and_sample", (q) =>
          q.eq("category", pool.category).eq("unit", pool.unit).eq("city", pool.city).eq("sample", pool.sample),
        )
        .take(10);
      const row = existing.find((b) => b.currency === pool.currency);
      const fields = { category: pool.category, unit: pool.unit, city: pool.city, currency: pool.currency, sample: pool.sample, ...band, computedAt: now };
      if (row) {
        await ctx.db.replace(row._id, fields);
        kept.add(row._id);
      } else {
        kept.add(await ctx.db.insert("priceBands", fields));
      }
      bands++;
    }

    let removed = 0;
    for await (const band of ctx.db.query("priceBands")) {
      if (!kept.has(band._id)) {
        await ctx.db.delete(band._id);
        removed++;
      }
    }
    return { bands, removed };
  },
});
