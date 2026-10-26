import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { clampLimit, logActivity, nameFromEmail, requireMember } from "./lib/auth";
import { activityDoc } from "./lib/docs";
import { activityActorKind, activityRefsValidator, activityType } from "./lib/validators";
import { APP_ACTOR, BRAND, isAppActor } from "./lib/brand";

/** What a couple sees when PlusOne can start writing on their behalf. */
export const INBOX_READY_TEXT = `${BRAND.name} is ready to email vendors for you.`;

export const list = query({
  args: { eventId: v.id("events"), limit: v.optional(v.number()) },
  returns: v.array(activityDoc),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    const limit = clampLimit(args.limit, 30, 50);
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(limit);
    // Older entries named the mailbox address, signed themselves with one, or used the app's old label.
    return rows.map((r) => ({
      ...r,
      ...(r.type === "inbox_ready" ? { text: INBOX_READY_TEXT } : {}),
      actorLabel: isAppActor(r) ? APP_ACTOR : r.actorLabel.includes("@") ? (nameFromEmail(r.actorLabel) ?? "Someone") : r.actorLabel,
    }));
  },
});

export const log = internalMutation({
  args: {
    eventId: v.id("events"),
    actorUserId: v.optional(v.id("users")),
    actorLabel: v.optional(v.string()),
    actorKind: v.optional(activityActorKind),
    type: activityType,
    text: v.string(),
    refs: v.optional(activityRefsValidator),
  },
  returns: v.id("activity"),
  handler: async (ctx, args) => {
    return await logActivity(ctx, args);
  },
});

/** The whole history, newest first, a page at a time. */
export const page = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(activityDoc), isDone: v.boolean(), continueCursor: v.string(), splitCursor: v.optional(v.union(v.string(), v.null())), pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())) }),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    const result = await ctx.db
      .query("activity")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((r) => ({
        ...r,
        ...(r.type === "inbox_ready" ? { text: INBOX_READY_TEXT } : {}),
        actorLabel: isAppActor(r) ? APP_ACTOR : r.actorLabel.includes("@") ? (nameFromEmail(r.actorLabel) ?? "Someone") : r.actorLabel,
      })),
    };
  },
});
