import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { deleteTrailBatch, deleteUserRecords } from "./lib/accounts";
import { startPurge } from "./maintenance";
import { userSummary } from "./lib/docs";
import { clerkIssuer, currentUserId, isClerkIdentity, nameFromEmail } from "./lib/auth";
import { isDisposableEmail } from "./lib/disposableEmail";
import { rateLimiter } from "./rateLimits";
import { TERMS_VERSION } from "./lib/terms";

export const me = query({
  args: {},
  returns: v.union(userSummary, v.null()),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      image: user.image,
      nameFromEmail: nameFromEmail(user.email),
      ...(user.isAnonymous ? { isGuest: true } : {}),
    };
  },
});

/** Their own name, for the top of the app and the activity feed. */
export const setName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in to continue.");
    const name = args.name.trim().slice(0, 80);
    if (!name) throw new ConvexError("Enter your name.");
    await ctx.db.patch(userId, { name });
    return null;
  },
});

/**
 * Delete the signed-in person's account and everything that is only theirs.
 *
 * An event they own alone is deleted with them. An event that has another owner, or
 * that they were only invited to, stays for the others and they are removed from it.
 * Their saved onboarding draft, its pictures, their planning and assistant chats, their
 * feedback, their visit logs and every sign-in record go too, and so does their Clerk
 * user. The do-not-contact list stays, so nobody who asked to be left alone is written to.
 */
export const deleteAccount = mutation({
  args: { confirm: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in to continue.");
    if (args.confirm.trim().toUpperCase() !== "DELETE") {
      throw new ConvexError("Type DELETE to confirm. Nothing was deleted.");
    }

    const memberships = await ctx.db
      .query("members")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(200);
    for (const mine of memberships) {
      const others = await ctx.db
        .query("members")
        .withIndex("by_eventId", (q) => q.eq("eventId", mine.eventId))
        .take(200);
      const anotherOwner = others.some((m) => m.userId !== userId && m.role === "owner");
      if (mine.role === "owner" && !anotherOwner) await startPurge(ctx, mine.eventId);
      else await ctx.db.delete(mine._id);
    }

    const clerkUserId = (await ctx.db.get(userId))?.clerkId;
    await deleteUserRecords(ctx, userId);
    await ctx.scheduler.runAfter(0, internal.users.purgeTrail, { userId, clerkUserId });
    if (clerkUserId) await ctx.scheduler.runAfter(0, internal.users.deleteClerkUser, { clerkUserId });
    return null;
  },
});

/** Clears a deleted account's trail a batch at a time, calling itself until nothing is left. */
export const purgeTrail = internalMutation({
  args: { userId: v.id("users"), clerkUserId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await deleteTrailBatch(ctx, args.userId, args.clerkUserId)) {
      await ctx.scheduler.runAfter(0, internal.users.purgeTrail, args);
    }
    return null;
  },
});

/** Deletes the person at Clerk too, so no sign-in record outlives the account. Skipped without CLERK_SECRET_KEY. */
export const deleteClerkUser = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const key = process.env.CLERK_SECRET_KEY;
    if (!key) {
      console.log("CLERK_SECRET_KEY not set; the Clerk user was not deleted", args.clerkUserId);
      return null;
    }
    const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(args.clerkUserId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${key}` },
    });
    // Already gone is as good as deleted.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Clerk refused to delete the user (${res.status})`);
    }
    return null;
  },
});

/**
 * Record that the signed-in person agreed to the Terms and Privacy Policy, from the box
 * on the sign-in page. The time is the server's; only the current version is recorded.
 */
export const acceptTerms = mutation({
  args: { version: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) throw new ConvexError("Please sign in to continue.");
    const user = await ctx.db.get(userId);
    if (!user || user.isAnonymous || args.version !== TERMS_VERSION) return false;
    if (user.termsVersion !== TERMS_VERSION) {
      await ctx.db.patch(userId, { termsAcceptedAt: Date.now(), termsVersion: TERMS_VERSION });
    }
    return true;
  },
});

/**
 * Make sure a Clerk account has its row here, the first time it signs in. Someone who
 * had an account before Clerk is matched by their verified email, so their weddings,
 * memberships and history carry over. Called by the app right after Clerk signs in.
 */
export const syncClerk = mutation({
  args: {},
  returns: v.object({ userId: v.id("users"), created: v.boolean() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !isClerkIdentity(identity)) throw new ConvexError("Please sign in to continue.");
    const email = identity.email?.trim().toLowerCase() || undefined;
    const verified = identity.emailVerified === true && Boolean(email);
    const name = identity.name?.trim().slice(0, 80) || undefined;

    const mine = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (mine) {
      // Their email can change in Clerk; follow it only once it's verified there.
      if (verified && mine.email !== email) await ctx.db.patch(mine._id, { email });
      if (!mine.name && name) await ctx.db.patch(mine._id, { name });
      return { userId: mine._id, created: false };
    }

    if (verified) {
      const before = (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).take(10)).find(
        (u) => !u.isAnonymous && !u.clerkId,
      );
      if (before) {
        await ctx.db.patch(before._id, { clerkId: identity.subject, ...(before.name ? {} : name ? { name } : {}) });
        return { userId: before._id, created: false };
      }
    }

    // A new account needs an address the person keeps (Terms, section 2).
    if (isDisposableEmail(email)) {
      throw new ConvexError("Please use an email address that is yours and that you keep. Temporary or disposable addresses can't be used for a PlusOne account.");
    }

    const room = await rateLimiter.limit(ctx, "signUps");
    if (!room.ok) throw new ConvexError("We're getting a lot of sign-ups right now. Try again in a few minutes.");
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      ...(email ? { email } : {}),
      ...(verified ? { emailVerificationTime: Date.now() } : {}),
      ...(name ? { name } : {}),
    });
    return { userId, created: true };
  },
});

/** For actions, which can't read the database themselves: the account a Clerk user signs in as. */
export const byClerkId = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    if (!clerkIssuer()) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    return user?._id ?? null;
  },
});
