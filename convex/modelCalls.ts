import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { RECORDED_RUN } from "./lib/recordedRun";
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
      provider: v.union(v.literal("meta"), v.literal("claude"), v.literal("spark_open"), v.literal("glimmer")),
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

/**
 * On a sample event, the recorded Muse Spark run on its own catering quotes (`lib/recordedRun.ts`),
 * so the demo shows real steps before anyone types. Real events get nothing here.
 */
export const recorded = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      feature: v.string(),
      note: v.string(),
      provider: v.literal("meta"),
      model: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      costUsd: v.number(),
      durationMs: v.number(),
      recordedOn: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "viewer");
    const event = await ctx.db.get(args.eventId);
    if (event?.demo !== true) return [];
    return RECORDED_RUN.calls.map((c) => ({ ...c, provider: "meta" as const, recordedOn: RECORDED_RUN.on }));
  },
});

/** An event's newest call for one feature, as the cost record kept it. */
export const latestFor = internalQuery({
  args: { eventId: v.id("events"), feature: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("modelCalls").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).order("desc").take(100);
    return rows.find((r) => r.feature === args.feature) ?? null;
  },
});
