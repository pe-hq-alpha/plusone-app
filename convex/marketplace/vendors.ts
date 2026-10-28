import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUserId } from "../lib/auth";
import { isTrial } from "../lib/marketplace";

/**
 * Who a Partner request is from. A vendor needs an account, except a demo guest trying
 * Partner with their own sample business, which can only answer their own sample event.
 */
export async function requireVendor(ctx: QueryCtx | MutationCtx): Promise<{ userId: Id<"users">; profile: Doc<"vendorProfiles"> }> {
  const userId = await requireUserId(ctx);
  const profile = await ctx.db
    .query("vendorProfiles")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
    .first();
  if (!profile) throw new ConvexError("Set up your business on PlusOne Partner first.");
  const user = await ctx.db.get(userId);
  if (user?.isAnonymous && !isTrial(profile)) throw new ConvexError("Create an account to answer families as a vendor.");
  return { userId, profile };
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
    .take(5);
  for (const profile of profiles) {
    for (const o of await ctx.db.query("vendorOfferings").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).take(200)) {
      await ctx.db.delete(o._id);
    }
    for (const o of await ctx.db.query("vendorOffers").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).take(500)) {
      await ctx.db.delete(o._id);
    }
    if (profile.source === "plusone_added" && !profile.sample) {
      await ctx.db.patch(profile._id, { ownerUserId: undefined, status: "pending", statusReason: undefined, statusAt: Date.now() });
      continue;
    }
    for (const r of await ctx.db.query("vettingReviews").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).take(100)) {
      await ctx.db.delete(r._id);
    }
    for (const c of await ctx.db.query("vendorClaims").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).take(50)) {
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(profile._id);
  }
}
