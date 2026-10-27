import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { modelCallFields } from "./schema";

/**
 * The cost record: one row per model call, written by `convex/lib/models.ts`. Admin's
 * spend view sums it against the $150 of Meta credit and the $40 kept for judging, and an
 * event's "Under the hood" view lists its own calls.
 */
export const record = internalMutation({
  args: modelCallFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("modelCalls", args);
    return null;
  },
});

/** The model calls made for one event, newest first: what ran, on which model, how long it took and what it cost. */
export const forEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      _id: v.id("modelCalls"),
      at: v.number(),
      feature: v.string(),
      provider: v.union(v.literal("meta"), v.literal("claude")),
      model: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      costUsd: v.optional(v.number()),
      durationMs: v.optional(v.number()),
      fellBack: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "viewer");
    const rows = await ctx.db
      .query("modelCalls")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(30);
    return rows.map((r) => ({
      _id: r._id,
      at: r._creationTime,
      feature: r.feature,
      provider: r.provider,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      fellBack: r.fellBack,
    }));
  },
});
