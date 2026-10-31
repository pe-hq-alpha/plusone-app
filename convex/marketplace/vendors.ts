import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireUserId } from "../lib/auth";
import { isTrial } from "../lib/marketplace";

/**
 * Who a Partner request is from. A vendor needs an account, except a demo guest trying
 * Partner with their own sample business, which can only answer their own sample event.
 */
export async function requireVendor(ctx: QueryCtx | MutationCtx): Promise<{ userId: Id<"users">; profile: Doc<"vendorProfiles"> }> {
  const userId = await requireUserId(ctx);
  const profile = await currentBusiness(ctx, userId);
  if (!profile) throw new ConvexError("Set up your business on PlusOne Partner first.");
  const user = await ctx.db.get(userId);
  if (user?.isAnonymous && !isTrial(profile)) throw new ConvexError("Create an account to answer customers as a vendor.");
  return { userId, profile };
}

/** How many businesses one account can run on Partner: a caterer who also does decor, a studio with two names. */
export const MAX_BUSINESSES = 5;

/** Every business an account runs, oldest first. */
export async function businessesOf(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"vendorProfiles">[]> {
  return await ctx.db
    .query("vendorProfiles")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
    .take(MAX_BUSINESSES * 2);
}

/** The business an account is working on now: the one it chose last, else its first. */
export async function currentBusiness(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"vendorProfiles"> | null> {
  const user = await ctx.db.get(userId);
  if (user?.activeVendorId) {
    const chosen = await ctx.db.get(user.activeVendorId);
    if (chosen && chosen.ownerUserId === userId) return chosen;
  }
  return await ctx.db
    .query("vendorProfiles")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
    .first();
}

/** Stops an account taking on more businesses than Partner allows. */
export async function roomForAnother(ctx: QueryCtx, userId: Id<"users">, who = "Your account"): Promise<void> {
  if ((await businessesOf(ctx, userId)).length >= MAX_BUSINESSES) {
    throw new ConvexError(`${who} already runs ${MAX_BUSINESSES} businesses on PlusOne Partner, the most one account can.`);
  }
}

/** The events a person belongs to: for a demo guest, their own sample event. */
export async function eventIdsOf(ctx: QueryCtx, userId: Id<"users">): Promise<Set<Id<"events">>> {
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(50);
  return new Set(memberships.map((m) => m.eventId));
}

/**
 * When a person's account goes (or a demo guest is cleared away): their own business
 * and everything it made go with it. A listing PlusOne added and they had claimed goes
 * back to waiting for its vendor, without their prices; their claims go too.
 */
export async function deleteVendorRecords(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  for (const claim of await ctx.db.query("vendorClaims").withIndex("by_userId", (q) => q.eq("userId", userId)).take(50)) {
    await ctx.db.delete(claim._id);
  }
  const profiles = await ctx.db
    .query("vendorProfiles")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
    .take(MAX_BUSINESSES * 2);
  for (const profile of profiles) await letGoOf(ctx, profile);
}

/**
 * One business taken off PlusOne by its own vendor. One they set up goes, with everything
 * it made; a listing PlusOne added goes back to waiting for its vendor, without their prices.
 */
export async function letGoOf(ctx: MutationCtx, profile: Doc<"vendorProfiles">): Promise<void> {
  if (profile.source === "plusone_added" && !profile.sample) {
    await clearOwnWork(ctx, profile._id);
    await ctx.db.patch(profile._id, { ownerUserId: undefined, status: "pending", statusReason: undefined, statusAt: Date.now() });
    return;
  }
  await deleteProfile(ctx, profile._id);
}

/** A business's prices and the offers it sent. */
async function clearOwnWork(ctx: MutationCtx, profileId: Id<"vendorProfiles">): Promise<void> {
  for (const o of await ctx.db.query("vendorOfferings").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).take(200)) {
    await ctx.db.delete(o._id);
  }
  for (const o of await ctx.db.query("vendorOffers").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).take(500)) {
    await ctx.db.delete(o._id);
  }
}

/** A listing and everything that hangs off it: prices, offers, reviews, claims, checks, photos and waiting changes. */
async function deleteProfile(ctx: MutationCtx, profileId: Id<"vendorProfiles">): Promise<void> {
  await clearOwnWork(ctx, profileId);
  for (const r of await ctx.db.query("vettingReviews").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).take(100)) {
    await ctx.db.delete(r._id);
  }
  for (const c of await ctx.db.query("vendorClaims").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).take(50)) {
    await ctx.db.delete(c._id);
  }
  for (const c of await ctx.db.query("vendorChecks").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).take(100)) {
    await ctx.db.delete(c._id);
  }
  for (const ph of await ctx.db.query("vendorPhotos").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).take(100)) {
    await ctx.storage.delete(ph.storageId).catch(() => undefined);
    await ctx.db.delete(ph._id);
  }
  for (const status of ["waiting", "approved", "rejected"] as const) {
    for (const ch of await ctx.db.query("listingChanges").withIndex("by_profileId_and_status", (q) => q.eq("profileId", profileId).eq("status", status)).take(100)) {
      await ctx.db.delete(ch._id);
    }
  }
  await ctx.db.delete(profileId);
}

/**
 * Takes a listing off PlusOne by its exact name, for the founders' own test listings.
 * Run it once with `confirm` left out to see what matches; nothing is deleted then.
 */
export const removeListing = internalMutation({
  args: { name: v.string(), confirm: v.optional(v.boolean()) },
  returns: v.array(v.object({ id: v.id("vendorProfiles"), name: v.string(), city: v.string(), status: v.string(), owned: v.boolean() })),
  handler: async (ctx, args) => {
    const want = args.name.trim().toLowerCase();
    const found = [];
    for (const status of ["pending", "verified", "rejected", "suspended"] as const) {
      for (const p of await ctx.db.query("vendorProfiles").withIndex("by_status", (q) => q.eq("status", status)).take(2000)) {
        if (p.name.trim().toLowerCase() === want) found.push(p);
      }
    }
    if (args.confirm) for (const p of found) await deleteProfile(ctx, p._id);
    return found.map((p) => ({ id: p._id, name: p.name, city: p.city, status: p.status, owned: Boolean(p.ownerUserId) }));
  },
});
