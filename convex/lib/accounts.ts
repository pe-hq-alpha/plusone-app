import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteVendorRecords } from "../marketplace/vendors";

/**
 * Remove a person's own records: their unfinished onboarding and its pictures, their
 * planning conversation, their feedback, every sign-in authSession and token, their
 * accounts and codes, and the user row itself. What happens to their events is decided
 * by the caller first; the larger trail (assistant chats in events that stay, visit
 * logs) is cleared in batches by users.purgeTrail.
 */
export async function deleteUserRecords(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  await deleteVendorRecords(ctx, userId);

  for (const chat of await ctx.db.query("planningChats").withIndex("by_userId", (q) => q.eq("userId", userId)).take(20)) {
    await ctx.db.delete(chat._id);
  }

  const drafts = await ctx.db
    .query("onboardingDrafts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(20);
  for (const draft of drafts) {
    for (const picture of draft.pictures) {
      try {
        await ctx.storage.delete(picture);
      } catch {
        // already deleted
      }
    }
    await ctx.db.delete(draft._id);
  }

  // What they told the team goes with them.
  for (const note of await ctx.db.query("feedback").withIndex("by_userId", (q) => q.eq("userId", userId)).take(200)) {
    await ctx.db.delete(note._id);
  }

  const authSessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .take(200);
  for (const authSession of authSessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", authSession._id))
      .take(500);
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(authSession._id);
  }
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .take(20);
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .take(50);
    for (const code of codes) await ctx.db.delete(code._id);
    await ctx.db.delete(account._id);
  }
  if (await ctx.db.get(userId)) await ctx.db.delete(userId);
}

const TRAIL_BATCH = 200;

/**
 * One batch of a deleted account's trail: what they said to the assistant in events that
 * stay for others, their visits, and the browsers linked to them with those browsers'
 * visits. Returns true when there is more to do. The do-not-contact list is never touched.
 */
export async function deleteTrailBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
  clerkUserId: string | undefined,
): Promise<boolean> {
  const chats = await ctx.db.query("chatMessages").withIndex("by_userId", (q) => q.eq("userId", userId)).take(TRAIL_BATCH);
  for (const row of chats) await ctx.db.delete(row._id);
  if (chats.length === TRAIL_BATCH) return true;
  if (!clerkUserId) return false;

  const visits = await ctx.db
    .query("visits")
    .withIndex("by_clerkUserId_and_at", (q) => q.eq("clerkUserId", clerkUserId))
    .take(TRAIL_BATCH);
  for (const row of visits) await ctx.db.delete(row._id);
  if (visits.length === TRAIL_BATCH) return true;

  const link = await ctx.db.query("visitorLinks").withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId)).first();
  if (!link) return false;
  // A browser someone else also signs in on keeps its anonymous visits; only the link goes.
  const shared = (await ctx.db.query("visitorLinks").withIndex("by_visitorId", (q) => q.eq("visitorId", link.visitorId)).take(10))
    .some((other) => other.clerkUserId !== clerkUserId);
  if (!shared) {
    const browserVisits = await ctx.db
      .query("visits")
      .withIndex("by_visitorId_and_at", (q) => q.eq("visitorId", link.visitorId))
      .take(TRAIL_BATCH);
    for (const row of browserVisits) await ctx.db.delete(row._id);
    if (browserVisits.length === TRAIL_BATCH) return true;
  }
  await ctx.db.delete(link._id);
  return true;
}
