import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { researchRunDoc } from "./lib/docs";
import { defaultSearchText, partOfNeed } from "./lib/searchTerms";
import { anOccasion } from "./lib/occasion";
import { spend } from "./rateLimits";
import { workflow } from "./workflows";
import { track } from "./analytics";
import { BRAND } from "./lib/brand";

export const start = mutation({
  args: { slotId: v.id("vendorSlots"), query: v.string(), area: v.optional(v.string()), more: v.optional(v.boolean()) },
  returns: v.id("researchRuns"),
  handler: async (ctx, args): Promise<Id<"researchRuns">> => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new ConvexError("Slot not found.");
    const { userId, event } = await requireMember(ctx, slot.eventId, "planner");
    await track(ctx, "vendor_search.started", userId, { category: slot.category, more: Boolean(args.more) });
    return await startResearchHelper(ctx, { slot, event, userId, query: args.query, area: args.area, more: args.more });
  },
});

/**
 * Start one search. Shared by the vendors screen and the assistant, so both refuse a
 * need that is already booked and one that is already being searched.
 */
export async function startResearchHelper(
  ctx: MutationCtx,
  args: {
    slot: Doc<"vendorSlots">;
    event: Doc<"events">;
    userId: Id<"users">;
    query: string;
    area?: string;
    more?: boolean;
  },
): Promise<Id<"researchRuns">> {
  const { slot, event, userId } = args;
  await spend(ctx, "research", event, userId);
  if (slot.status === "booked") {
    throw new ConvexError(`${slot.title} is already booked. Un-book it first if you want to look again.`);
  }
  const q = args.query.trim();
  if (q.length < 3) throw new ConvexError("Describe what you are looking for in a few words.");
  if (q.length > 300) throw new ConvexError("Keep the search under 300 characters.");

  const running = await ctx.db
    .query("researchRuns")
    .withIndex("by_slotId", (s) => s.eq("slotId", slot._id))
    .order("desc")
    .take(1);
  if (running[0]?.status === "running" && Date.now() - running[0].startedAt < 5 * 60_000) {
    throw new ConvexError("Research is already running for this slot. Give it a minute.");
  }

  // An explicit area overrides the wedding's own neighbourhood for this search only.
  const area = args.area?.trim().slice(0, 120) || event.area;
  const researchRunId = await ctx.db.insert("researchRuns", {
    eventId: slot.eventId,
    slotId: slot._id,
    query: q,
    area: area || undefined,
    ...(args.more ? { more: true } : {}),
    status: "running",
    step: "Queued",
    foundCount: 0,
    startedAt: Date.now(),
  });
  await logActivity(ctx, {
    eventId: event._id,
    actorUserId: userId,
    type: "research_started",
    text: args.more ? `asked ${BRAND.name} for more ${slot.title.toLowerCase()} options.` : `started researching "${q}" for ${slot.title}.`,
    refs: { slotId: slot._id },
  });
  await workflow.start(ctx, internal.workflows.researchWorkflow, { researchRunId });
  return researchRunId;
}

/** Seconds between each need's search, so a whole plan doesn't hit the web at once. */
const STAGGER_MS = 20_000;
/** How many searches "find them all" starts in the demo, within its daily allowance. */
const DEMO_SEARCHES_AT_ONCE = 2;

/** The search PlusOne runs for a need when nobody has typed one: the Vendors page's default, word for word. */
function defaultQuery(slot: Doc<"vendorSlots">, event: Doc<"events">, sessions: Doc<"sessions">[]): string {
  return defaultSearchText({
    category: slot.category,
    title: slot.title,
    area: event.area,
    city: event.city,
    occasion: anOccasion(event),
    part: partOfNeed(slot.sessionIds, sessions),
    vibes: event.styleVibes,
    amount: slot.budget,
    currency: event.currency,
  });
}

/**
 * Research every need that hasn't been looked into yet, one after another. Booked
 * needs, needs already being researched and needs with vendors found are left alone.
 */
export const startAll = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({ started: v.number() }),
  handler: async (ctx, args) => {
    const { userId, event } = await requireMember(ctx, args.eventId, "planner");
    const slots = await ctx.db
      .query("vendorSlots")
      .withIndex("by_eventId_and_status", (q) => q.eq("eventId", args.eventId).eq("status", "research"))
      .take(50);
    const due: Doc<"vendorSlots">[] = [];
    for (const slot of slots) {
      const lastRun = await ctx.db
        .query("researchRuns")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .order("desc")
        .first();
      if (lastRun && (lastRun.status === "running" || lastRun.status === "done")) continue;
      due.push(slot);
    }
    // The demo shows the search working on a couple of needs rather than all of them.
    const starting = event.demo ? due.slice(0, DEMO_SEARCHES_AT_ONCE) : due;
    if (starting.length > 0) await spend(ctx, "research", event, userId, starting.length);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(100);
    let started = 0;
    for (const slot of starting) {
      await ctx.scheduler.runAfter(started * STAGGER_MS, internal.research.startForSlot, {
        slotId: slot._id,
        query: defaultQuery(slot, event, sessions),
      });
      started += 1;
    }
    if (started > 0) {
      await logActivity(ctx, {
        eventId: event._id,
        actorUserId: userId,
        type: "research_started",
        text: `asked ${BRAND.name} to find vendors for ${started} ${started === 1 ? "need" : "needs"}.`,
      });
    }
    return { started };
  },
});

export const latestForSlot = query({
  args: { slotId: v.id("vendorSlots") },
  returns: v.union(researchRunDoc, v.null()),
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new ConvexError("Slot not found.");
    await requireMember(ctx, slot.eventId);
    const runs = await ctx.db
      .query("researchRuns")
      .withIndex("by_slotId", (q) => q.eq("slotId", args.slotId))
      .order("desc")
      .take(1);
    return runs[0] ?? null;
  },
});

// ---- internal ---------------------------------------------------------------

/** Start a research run without a signed-in caller (CLI checks, scheduled re-research). */
export const startForSlot = internalMutation({
  args: { slotId: v.id("vendorSlots"), query: v.string(), area: v.optional(v.string()) },
  returns: v.union(v.id("researchRuns"), v.null()),
  handler: async (ctx, args): Promise<Id<"researchRuns"> | null> => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) return null;
    const q = args.query.trim().slice(0, 300);
    if (q.length < 3) return null;
    const event = await ctx.db.get(slot.eventId);
    const researchRunId = await ctx.db.insert("researchRuns", {
      eventId: slot.eventId,
      slotId: args.slotId,
      query: q,
      area: args.area?.trim().slice(0, 120) || event?.area,
      status: "running",
      step: "Queued",
      foundCount: 0,
      startedAt: Date.now(),
    });
    await workflow.start(ctx, internal.workflows.researchWorkflow, { researchRunId });
    return researchRunId;
  },
});

/** Records the searches the planner wrote, for the progress line. */
export const setQueries = internalMutation({
  args: { researchRunId: v.id("researchRuns"), queries: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.researchRunId, { queries: args.queries.slice(0, 3).map((q) => q.slice(0, 200)) });
    return null;
  },
});

export const getRun = internalQuery({
  args: { researchRunId: v.id("researchRuns") },
  returns: v.union(researchRunDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.researchRunId);
  },
});

export const setStep = internalMutation({
  args: { researchRunId: v.id("researchRuns"), step: v.string(), foundCount: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.researchRunId);
    if (!run) return null;
    await ctx.db.patch(args.researchRunId, {
      step: args.step,
      ...(args.foundCount !== undefined ? { foundCount: args.foundCount } : {}),
    });
    return null;
  },
});

export const finish = internalMutation({
  args: {
    researchRunId: v.id("researchRuns"),
    status: v.union(v.literal("done"), v.literal("failed")),
    foundCount: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.researchRunId);
    if (!run) return null;
    await ctx.db.patch(args.researchRunId, {
      status: args.status,
      step: args.status === "done" ? `Done — ${args.foundCount ?? run.foundCount} vendors found` : "Failed",
      foundCount: args.foundCount ?? run.foundCount,
      error: args.error,
      finishedAt: Date.now(),
    });
    if (args.status === "done") {
      const slot = await ctx.db.get(run.slotId);
      await logActivity(ctx, {
        eventId: run.eventId,
        // A milestone ("Found 6 options for your catering" on Overview), not a free-text note.
        type: "vendor_found",
        text: `Research finished for ${slot?.title ?? "a need"}: ${args.foundCount ?? run.foundCount} ${(args.foundCount ?? run.foundCount) === 1 ? "vendor" : "vendors"} found.`,
        refs: { slotId: run.slotId },
      });
    }
    return null;
  },
});
