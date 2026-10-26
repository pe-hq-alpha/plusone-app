import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import type { Id } from "./_generated/dataModel";
import { sessionDoc } from "./lib/docs";
import { rebalanceEventBudget } from "./lib/budget";
import { SESSION_COLORS } from "./lib/templates";
import { addDays, daysBetween } from "./lib/text";
import { byDayThenOrder } from "./lib/sessionOrder";
import { partWord } from "./lib/occasion";

export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(sessionDoc),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    return sessions.sort(byDayThenOrder);
  },
});

export const update = mutation({
  args: {
    sessionId: v.id("sessions"),
    patch: v.object({
      name: v.optional(v.string()),
      dayIndex: v.optional(v.number()),
      date: v.optional(v.string()),
      guestCount: v.optional(v.number()),
      budget: v.optional(v.number()),
      color: v.optional(v.string()),
      order: v.optional(v.number()),
      description: v.optional(v.string()),
      icon: v.optional(v.string()),
      startTime: v.optional(v.string()),
      endTime: v.optional(v.string()),
      location: v.optional(v.string()),
      significance: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Event not found.");
    const { userId } = await requireMember(ctx, session.eventId, "planner");
    for (const key of ["startTime", "endTime"] as const) {
      const t = args.patch[key];
      if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new ConvexError("Times are written as HH:MM.");
    }
    // Free text is kept to a sensible size. Only fields actually sent are touched:
    // patching a field to undefined would delete it.
    const caps = { location: 160, significance: 600, icon: 40 } as const;
    for (const [key, max] of Object.entries(caps) as [keyof typeof caps, number][]) {
      const value = args.patch[key];
      if (value === undefined) delete args.patch[key];
      else args.patch[key] = value.trim().slice(0, max);
    }
    for (const key of Object.keys(args.patch) as (keyof typeof args.patch)[]) {
      if (args.patch[key] === undefined) delete args.patch[key];
    }
    // An emptied optional field is removed rather than stored as "".
    const optional = ["startTime", "endTime", "location", "significance", "icon"] as const;
    const patch: Record<string, unknown> = { ...args.patch };
    for (const key of optional) if (patch[key] === "") patch[key] = undefined;
    for (const key of ["guestCount", "budget", "dayIndex", "order"] as const) {
      const val = args.patch[key];
      if (val !== undefined && (!Number.isFinite(val) || val < 0)) {
        throw new ConvexError(`${key} must be a non-negative number.`);
      }
    }
    // The day and the date are one fact: whichever the caller changed, the other follows,
    // and the ceremony goes to the end of its new day (its `order` is renumbered below).
    const movedDay = args.patch.dayIndex !== undefined || args.patch.date !== undefined;
    let landed: { dayIndex: number; date: string } | null = null;
    if (movedDay) {
      const event = await ctx.db.get(session.eventId);
      if (event) {
        const date = args.patch.date;
        if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ConvexError("A day needs a date as YYYY-MM-DD.");
        const dayIndex = Math.max(0, date !== undefined ? daysBetween(event.startDate, date) : Math.floor(args.patch.dayIndex ?? session.dayIndex));
        landed = { dayIndex, date: addDays(event.startDate, dayIndex) };
        if (dayIndex > daysBetween(event.startDate, event.endDate)) {
          await ctx.db.patch(event._id, { endDate: addDays(event.startDate, dayIndex) });
        }
        patch.dayIndex = landed.dayIndex;
        patch.date = landed.date;
        if (landed.dayIndex === session.dayIndex) landed = null;
        else delete patch.order;
      }
    }
    await ctx.db.patch(args.sessionId, patch);
    if (landed) await placeInDay(ctx, session.eventId, args.sessionId, landed.dayIndex, landed.date, Number.MAX_SAFE_INTEGER);

    // The history says what changed, in words, once per save (the order is the board's business).
    const NAMES: Record<string, string> = {
      name: "name", date: "date", guestCount: "guests", budget: "budget", startTime: "time", endTime: "time",
      location: "place", significance: "meaning", icon: "icon",
    };
    const changed = [...new Set(Object.keys(patch).map((k) => NAMES[k]).filter(Boolean))];
    if (changed.length) {
      const list = changed.length === 1 ? changed[0] : `${changed.slice(0, -1).join(", ")} and ${changed[changed.length - 1]}`;
      await logActivity(ctx, { eventId: session.eventId, actorUserId: userId, type: "note", text: `changed the ${session.name}'s ${list}.`, refs: { sessionId: session._id } });
    }

    // Changing one function's budget moves money away from the others. The couple
    // gets exactly the number they typed and the rest share what is left in the
    // proportions they already had, so the total never drifts.
    if (args.patch.budget !== undefined) {
      const event = await ctx.db.get(session.eventId);
      const weights = new Map<Id<"sessions">, number>();
      if (event) {
        const sessions = await ctx.db
          .query("sessions")
          .withIndex("by_eventId", (q) => q.eq("eventId", session.eventId))
          .take(50);
        const others = sessions.filter((e) => e._id !== args.sessionId);
        const mine = Math.min(args.patch.budget, event.totalBudget);
        const rest = Math.max(0, event.totalBudget - mine);
        const otherTotal = others.reduce((a, e) => a + e.budget, 0);
        weights.set(args.sessionId, mine);
        for (const e of others) {
          weights.set(e._id, otherTotal > 0 ? (e.budget / otherTotal) * rest : rest / Math.max(1, others.length));
        }
      }
      await rebalanceEventBudget(ctx, session.eventId, weights.size > 0 ? weights : undefined);
    }
    return null;
  },
});

export const add = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    date: v.string(),
    dayIndex: v.number(),
    budget: v.number(),
    guestCount: v.number(),
  },
  returns: v.id("sessions"),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    return await addSessionHelper(ctx, args.eventId, args);
  },
});

/**
 * One more day in the plan. Its budget is a weight rather than an amount: the rebalance
 * re-splits the same total across every day, so every share moves.
 */
export async function addSessionHelper(
  ctx: MutationCtx,
  eventId: Id<"events">,
  args: { name: string; date: string; dayIndex: number; budget: number; guestCount: number },
): Promise<Id<"sessions">> {
  if (!Number.isFinite(args.budget) || args.budget < 0) throw new ConvexError("Budget must be a non-negative number.");
  if (!Number.isFinite(args.guestCount) || args.guestCount < 0) throw new ConvexError("Guest count must be non-negative.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new ConvexError("A day needs a date as YYYY-MM-DD.");
  const existing = await ctx.db
    .query("sessions")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(50);
  if (existing.length >= 20) throw new ConvexError("An event can have at most 20 sessions or days.");
  const order = existing.length;
  const sessionId = await ctx.db.insert("sessions", {
    eventId,
    name: args.name.trim(),
    date: args.date,
    dayIndex: Math.max(0, Math.floor(args.dayIndex)),
    budget: args.budget,
    guestCount: Math.floor(args.guestCount),
    color: SESSION_COLORS[order % SESSION_COLORS.length],
    order,
  });
  // The order the colours were dealt in is not the order on the page: it joins the end of its own day.
  await placeInDay(ctx, eventId, sessionId, Math.max(0, Math.floor(args.dayIndex)), args.date, Number.MAX_SAFE_INTEGER);
  // The new function's budget comes out of the same total as everyone else's.
  await rebalanceEventBudget(ctx, eventId);
  await logActivity(ctx, {
    eventId,
    type: "note",
    text: `added ${args.name.trim()} to the plan.`,
    refs: { sessionId },
  });
  return sessionId;
}

/**
 * Remove one function from the plan.
 *
 * Work already done for that day is never thrown away: a need that has only ever
 * been researched and is left serving nothing is removed with it, but a need that
 * has been contacted, quoted or booked — or that has vendors or email threads
 * against it — moves across to the first remaining function instead.
 */
export const remove = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("That function is no longer part of your plan.");
    const { userId } = await requireMember(ctx, session.eventId, "planner");
    const eventId = session.eventId;

    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(50)
    ).sort(byDayThenOrder);
    const remaining = sessions.filter((e) => e._id !== args.sessionId);
    if (remaining.length === 0) {
      throw new ConvexError("You can't remove your only function. Add another one first.");
    }
    const fallbackSessionId = remaining[0]._id;

    const slots = await ctx.db
      .query("vendorSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(200);

    let removedSlots = 0;
    let movedSlots = 0;
    for (const slot of slots) {
      if (!slot.sessionIds.some((id) => id === args.sessionId)) continue;
      const sessionIds = slot.sessionIds.filter((id) => id !== args.sessionId);
      if (sessionIds.length > 0) {
        await ctx.db.patch(slot._id, { sessionIds });
        continue;
      }
      const vendor = await ctx.db
        .query("vendors")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .first();
      const thread = await ctx.db
        .query("threads")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .first();
      const untouched = slot.status === "research" && vendor === null && thread === null;
      if (!untouched) {
        // Never destroy work: park the need on the first remaining function.
        await ctx.db.patch(slot._id, { sessionIds: [fallbackSessionId] });
        movedSlots += 1;
        continue;
      }
      for (const run of await ctx.db
        .query("researchRuns")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .take(100)) {
        await ctx.db.delete(run._id);
      }
      const line = await ctx.db
        .query("budgetLines")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .first();
      if (line) await ctx.db.delete(line._id);
      await ctx.db.delete(slot._id);
      removedSlots += 1;
    }

    // Budget lines pinned to this function lose their pin.
    const lines = await ctx.db
      .query("budgetLines")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(200);
    for (const line of lines) {
      if (line.sessionId === args.sessionId) await ctx.db.patch(line._id, { sessionId: undefined });
    }

    // What was kept in its Space moves to the wedding's own Space, after what is already there.
    const wide = await ctx.db
      .query("spaceItems")
      .withIndex("by_eventId_and_sessionId_and_order", (q) => q.eq("eventId", eventId).eq("sessionId", undefined))
      .order("desc")
      .first();
    let nextOrder = (wide?.order ?? 0) + 1;
    for (const item of await ctx.db
      .query("spaceItems")
      .withIndex("by_eventId_and_sessionId_and_order", (q) => q.eq("eventId", eventId).eq("sessionId", args.sessionId))
      .take(200)) {
      await ctx.db.patch(item._id, { sessionId: undefined, order: nextOrder++ });
    }

    // Its to-dos stay on the wedding, no longer tied to a ceremony that has gone.
    for (const task of await ctx.db.query("tasks").withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId)).take(200)) {
      await ctx.db.patch(task._id, { sessionId: undefined });
    }
    await ctx.db.delete(args.sessionId);

    // Keep `order` a clean 0..n-1 — the day tints in the UI come from it.
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) await ctx.db.patch(remaining[i]._id, { order: i });
    }

    // This function's share of the money goes back to the others.
    await rebalanceEventBudget(ctx, eventId);

    await logActivity(ctx, {
      eventId,
      actorUserId: userId,
      type: "note",
      text:
        `removed ${session.name} from the plan` +
        (movedSlots > 0 ? `, moving ${movedSlots} need${movedSlots === 1 ? "" : "s"} to ${remaining[0].name}` : "") +
        (removedSlots > 0 ? `, and removed ${removedSlots} need${removedSlots === 1 ? "" : "s"} nobody had started` : "") +
        ".",
    });
    return null;
  },
});

/**
 * Re-split the wedding budget across the functions. The numbers given are read as
 * a split, not as amounts, so the functions always add back up to the couple's
 * total — exactly how the budget is set when the wedding is created.
 */
export const setBudgets = mutation({
  args: {
    eventId: v.id("events"),
    allocations: v.array(v.object({ sessionId: v.id("sessions"), budget: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, event } = await requireMember(ctx, args.eventId, "planner");
    if (args.allocations.length === 0) throw new ConvexError("Tell us how to split the budget first.");
    if (args.allocations.length > 20) throw new ConvexError("An event can have at most 20 sessions or days.");

    const weights = new Map<Id<"sessions">, number>();
    for (const a of args.allocations) {
      if (!Number.isFinite(a.budget) || a.budget < 0) {
        throw new ConvexError(`Every ${partWord(event)}'s budget must be zero or more.`);
      }
      const session = await ctx.db.get(a.sessionId);
      if (!session || session.eventId !== args.eventId) {
        throw new ConvexError("One of those functions isn't part of this event.");
      }
      weights.set(a.sessionId, a.budget);
    }

    await rebalanceEventBudget(ctx, args.eventId, weights);

    await logActivity(ctx, {
      eventId: args.eventId,
      actorUserId: userId,
      type: "note",
      text: `re-split the budget across the ${partWord(event, true)}.`,
    });
    return null;
  },
});

/**
 * Move a ceremony to a day, at a position within it (the board's drag and drop).
 * Its date follows its day; a day past the last one extends the wedding by a day.
 * Every ceremony's order is renumbered so the board and every list agree.
 */
export const move = mutation({
  args: { sessionId: v.id("sessions"), dayIndex: v.number(), position: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new ConvexError("Event not found.");
    const { event } = await requireMember(ctx, session.eventId, "planner");
    const lastDay = daysBetween(event.startDate, event.endDate);
    const dayIndex = Math.max(0, Math.min(lastDay + 1, Math.floor(args.dayIndex)));
    if (dayIndex > lastDay) await ctx.db.patch(event._id, { endDate: addDays(event.startDate, dayIndex) });

    await placeInDay(ctx, session.eventId, session._id, dayIndex, addDays(event.startDate, dayIndex), args.position);
    if (dayIndex !== session.dayIndex) {
      await logActivity(ctx, {
        eventId: session.eventId,
        type: "note",
        text: `moved ${session.name} to day ${dayIndex + 1}.`,
        refs: { sessionId: session._id },
      });
    }
    return null;
  },
});

/**
 * Put one ceremony on a day at a position within it (past the end means last), then
 * renumber every ceremony's `order` as a clean 0..n-1 by day and place. Its day and date
 * are set together. Colours are stored per ceremony, so renumbering never changes them.
 */
export async function placeInDay(
  ctx: MutationCtx,
  eventId: Id<"events">,
  sessionId: Id<"sessions">,
  dayIndex: number,
  date: string,
  position: number,
): Promise<void> {
  const sessions = (
    await ctx.db
      .query("sessions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(50)
  ).sort(byDayThenOrder);
  const session = sessions.find((e) => e._id === sessionId);
  if (!session) return;
  const rest = sessions.filter((e) => e._id !== sessionId);
  const sameDay = rest.filter((e) => e.dayIndex === dayIndex);
  const at = Math.max(0, Math.min(sameDay.length, Math.floor(position)));
  const before = sameDay[at - 1];
  const insertAt = before ? rest.indexOf(before) + 1 : rest.findIndex((e) => e.dayIndex >= dayIndex);
  const ordered = [...rest];
  ordered.splice(insertAt < 0 ? ordered.length : insertAt, 0, session);
  for (const [order, e] of ordered.entries()) {
    if (e._id === sessionId) {
      if (e.order !== order || e.dayIndex !== dayIndex || e.date !== date) await ctx.db.patch(e._id, { order, dayIndex, date });
    } else if (e.order !== order) {
      await ctx.db.patch(e._id, { order });
    }
  }
}

/** Every wedding's ceremonies renumbered by (day, order). Run once per deployment by hand. */
export const renumberAll = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("events").paginate({ numItems: 20, cursor: args.cursor ?? null });
    for (const event of page.page) {
      const sessions = (
        await ctx.db
          .query("sessions")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(50)
      ).sort(byDayThenOrder);
      for (const [order, e] of sessions.entries()) {
        if (e.order !== order) await ctx.db.patch(e._id, { order });
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.sessions.renumberAll, { cursor: page.continueCursor });
    return null;
  },
});
