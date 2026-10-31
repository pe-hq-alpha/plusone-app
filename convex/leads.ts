import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { leadKey } from "./lib/leads";
import { placeFor } from "./lib/places";
import { canonicalWebsite } from "./lib/text";

/**
 * The vendor lead queue: names to look up on the open web (leadsRun.ts), and what came of
 * each. A business found becomes a listing PlusOne added, shown as not yet verified until
 * its owner claims it; one not found stays a lead and is never shown.
 */

const seed = v.object({ name: v.string(), area: v.optional(v.string()), category: v.string() });

/** Adds names to look up, once each: a business already queued, found or not found is left as it is. */
export const addSeeds = internalMutation({
  args: { seeds: v.array(seed) },
  returns: v.object({ added: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    let added = 0;
    let skipped = 0;
    for (const s of args.seeds.slice(0, 500)) {
      const name = s.name.trim().slice(0, 120);
      if (!name) continue;
      const key = leadKey(name, s.category);
      if (await ctx.db.query("vendorLeads").withIndex("by_key", (q) => q.eq("key", key)).first()) {
        skipped++;
        continue;
      }
      await ctx.db.insert("vendorLeads", { name, ...(s.area?.trim() ? { area: s.area.trim().slice(0, 60) } : {}), category: s.category, key, status: "queued" });
      added++;
    }
    return { added, skipped };
  },
});

/** The next leads to look up, oldest first. */
export const nextQueued = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({ _id: v.id("vendorLeads"), name: v.string(), area: v.optional(v.string()), category: v.string() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("vendorLeads").withIndex("by_status", (q) => q.eq("status", "queued")).take(Math.min(50, args.limit));
    return rows.map((r) => ({ _id: r._id, name: r.name, ...(r.area ? { area: r.area } : {}), category: r.category }));
  },
});

const found = v.object({
  name: v.string(),
  area: v.optional(v.string()),
  website: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  maps: v.optional(v.string()),
  instagram: v.optional(v.string()),
  facebook: v.optional(v.string()),
  image: v.optional(v.string()),
  sources: v.array(v.string()),
});

/**
 * What a lookup found. A business already listed under the same website isn't listed twice;
 * a new one is listed as PlusOne added, not yet verified, with every page its facts came from.
 */
export const saveResult = internalMutation({
  args: {
    leadId: v.id("vendorLeads"),
    status: v.union(v.literal("found"), v.literal("not_found"), v.literal("error")),
    reason: v.optional(v.string()),
    found: v.optional(found),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.status !== "queued") return null;
    const now = Date.now();
    if (args.status !== "found" || !args.found) {
      await ctx.db.patch(lead._id, { status: args.status, checkedAt: now, ...(args.reason ? { reason: args.reason.slice(0, 200) } : {}) });
      return null;
    }
    const f = args.found;
    const website = f.website ? canonicalWebsite(f.website) : undefined;
    const existing = website ? await ctx.db.query("vendorProfiles").withIndex("by_website", (q) => q.eq("website", website)).first() : null;
    if (existing) {
      await ctx.db.patch(lead._id, { status: "found", profileId: existing._id, checkedAt: now, reason: "Already listed under the same website" });
      return null;
    }
    const place = f.area ? placeFor(f.area, "Chennai") : null;
    const links = { ...(f.maps ? { maps: f.maps } : {}), ...(f.instagram ? { instagram: f.instagram } : {}), ...(f.facebook ? { facebook: f.facebook } : {}) };
    const profileId = await ctx.db.insert("vendorProfiles", {
      name: f.name.slice(0, 120),
      categories: [lead.category],
      city: "Chennai",
      cityKey: "chennai",
      ...(f.area ? { serviceArea: [f.area] } : {}),
      ...(place && place.precision !== "city" ? { place } : {}),
      ...(website ? { website } : {}),
      ...(f.phone ? { phone: f.phone } : {}),
      ...(f.email ? { email: f.email } : {}),
      source: "plusone_added",
      status: "pending",
      statusReason: "Found through public web listings; not yet verified by PlusOne.",
      statusAt: now,
      joinedAt: now,
      completedEvents: 0,
      leadCategory: lead.category,
      ...(Object.keys(links).length ? { links } : {}),
      foundVia: { urls: f.sources.slice(0, 6), at: now },
      ...(f.image && website ? { cover: { url: f.image, from: website } } : {}),
      coverCheckedAt: now,
    });
    await ctx.db.patch(lead._id, { status: "found", profileId, checkedAt: now });
    return null;
  },
});

/** How the lookups stand, trade by trade: queued, found, not found and failed, and the share found. */
export const report = internalQuery({
  args: {},
  returns: v.array(
    v.object({ category: v.string(), total: v.number(), queued: v.number(), found: v.number(), notFound: v.number(), error: v.number(), withPhone: v.number(), withWebsite: v.number(), withMap: v.number() }),
  ),
  handler: async (ctx) => {
    const by = new Map<string, { category: string; total: number; queued: number; found: number; notFound: number; error: number; withPhone: number; withWebsite: number; withMap: number }>();
    for await (const lead of ctx.db.query("vendorLeads")) {
      const row = by.get(lead.category) ?? { category: lead.category, total: 0, queued: 0, found: 0, notFound: 0, error: 0, withPhone: 0, withWebsite: 0, withMap: 0 };
      row.total++;
      if (lead.status === "queued") row.queued++;
      else if (lead.status === "not_found") row.notFound++;
      else if (lead.status === "error") row.error++;
      else {
        row.found++;
        const p = lead.profileId ? await ctx.db.get(lead.profileId) : null;
        if (p?.phone) row.withPhone++;
        if (p?.website) row.withWebsite++;
        if (p?.links?.maps || p?.place) row.withMap++;
      }
      by.set(lead.category, row);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  },
});

/** Puts leads that failed back in the queue, to try again. */
export const retryErrors = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let n = 0;
    for (const lead of await ctx.db.query("vendorLeads").withIndex("by_status", (q) => q.eq("status", "error")).take(500)) {
      await ctx.db.patch(lead._id, { status: "queued", reason: undefined });
      n++;
    }
    return n;
  },
});

/**
 * Clears what the lead job made, to run it again: listings it added that no one has claimed
 * are deleted, and their leads go back in the queue. A claimed listing is left alone.
 */
export const resetFound = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    let n = 0;
    for (const status of ["found", "not_found", "error"] as const) {
      for (const lead of await ctx.db.query("vendorLeads").withIndex("by_status", (q) => q.eq("status", status)).take(args.limit ?? 200)) {
        const p = lead.profileId ? await ctx.db.get(lead.profileId) : null;
        if (p && p.leadCategory && !p.ownerUserId) await ctx.db.delete(p._id);
        await ctx.db.patch(lead._id, { status: "queued", profileId: undefined, reason: undefined, checkedAt: undefined });
        n++;
      }
    }
    return n;
  },
});

/** Listings the job added with a website of their own whose preview image hasn't been looked for yet. */
export const needCovers = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({ _id: v.id("vendorProfiles"), website: v.string() })),
  handler: async (ctx, args) => {
    const out: { _id: Id<"vendorProfiles">; website: string }[] = [];
    const rows = ctx.db.query("vendorProfiles").withIndex("by_cityKey_and_leadCategory", (q) => q.eq("cityKey", "chennai").gt("leadCategory", ""));
    for await (const p of rows) {
      if (out.length >= args.limit) break;
      if (p.website && !p.coverCheckedAt && !p.ownerUserId) out.push({ _id: p._id, website: p.website });
    }
    return out;
  },
});

/** Records a listing's preview image, or that it has none. */
export const setCover = internalMutation({
  args: { profileId: v.id("vendorProfiles"), url: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.profileId);
    if (!p || p.ownerUserId) return null;
    await ctx.db.patch(p._id, { coverCheckedAt: Date.now(), ...(args.url && p.website ? { cover: { url: args.url.slice(0, 2000), from: p.website } } : {}) });
    return null;
  },
});
