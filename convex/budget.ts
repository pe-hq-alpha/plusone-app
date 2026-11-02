import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { budgetLineDoc } from "./lib/docs";
import { slotStatus } from "./lib/validators";
import { formatMoney } from "./lib/text";
import { byDayThenOrder } from "./lib/sessionOrder";
import { tally, tallyLine } from "./lib/tally";
import { recountPaid } from "./dues";

const OVER_COMMIT_RATIO = 1.15;

export const summary = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    currency: v.string(),
    totalBudget: v.number(),
    plannedTotal: v.number(),
    committedTotal: v.number(),
    paidTotal: v.number(),
    /** Agreed: booked needs and costs that aren't vendors. */
    agreedTotal: v.number(),
    /** Quotes on needs not booked yet. */
    weighingTotal: v.number(),
    /** Agreed and not yet paid, line by line. */
    toPayTotal: v.number(),
    /** Paid on needs that aren't marked booked. */
    paidNotBookedTotal: v.number(),
    sessions: v.array(
      v.object({
        sessionId: v.id("sessions"),
        name: v.string(),
        color: v.string(),
        budget: v.number(),
        planned: v.number(),
        committed: v.number(),
        paid: v.number(),
      }),
    ),
    lines: v.array(
      v.object({
        line: budgetLineDoc,
        slot: v.union(
          v.object({ _id: v.id("vendorSlots"), title: v.string(), category: v.string(), status: slotStatus }),
          v.null(),
        ),
        sessionName: v.union(v.string(), v.null()),
        overCommitted: v.boolean(),
        state: v.union(v.literal("booked"), v.literal("weighing"), v.literal("cost")),
        toPay: v.number(),
        overpaid: v.number(),
      }),
    ),
    warnings: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId);
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(50)
    ).sort(byDayThenOrder);
    const slots = await ctx.db
      .query("vendorSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const lines = await ctx.db
      .query("budgetLines")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);

    const slotById = new Map(slots.map((s) => [s._id, s]));
    const sessionById = new Map(sessions.map((e) => [e._id, e]));

    // Per-event roll-up: a slot line is attributed evenly across its events.
    const perSession = new Map<Id<"sessions">, { planned: number; committed: number; paid: number }>();
    for (const e of sessions) perSession.set(e._id, { planned: 0, committed: 0, paid: 0 });
    const warnings: string[] = [];
    const outLines = [];
    for (const line of lines) {
      const slot = line.slotId ? slotById.get(line.slotId) : undefined;
      const targets: Id<"sessions">[] = line.sessionId
        ? [line.sessionId]
        : slot && slot.sessionIds.length > 0
          ? slot.sessionIds
          : [];
      const share = targets.length > 0 ? 1 / targets.length : 0;
      for (const eid of targets) {
        const acc = perSession.get(eid);
        if (!acc) continue;
        acc.planned += line.planned * share;
        acc.committed += line.committed * share;
        acc.paid += line.paid * share;
      }
      const overCommitted = line.planned > 0 && line.committed > line.planned * OVER_COMMIT_RATIO;
      if (overCommitted) {
        warnings.push(
          `${line.label}: ${formatMoney(Math.round(line.committed), event.currency)} is more than 15% over the ` +
            `${formatMoney(Math.round(line.planned), event.currency)} planned.`,
        );
      }
      const t = tallyLine({ committed: line.committed, paid: line.paid, slotStatus: slot?.status });
      outLines.push({
        line,
        slot: slot ? { _id: slot._id, title: slot.title, category: slot.category, status: slot.status } : null,
        sessionName: line.sessionId ? (sessionById.get(line.sessionId)?.name ?? null) : null,
        overCommitted,
        state: t.state,
        toPay: t.toPay,
        overpaid: t.overpaid,
      });
    }
    const plannedTotal = lines.reduce((a, l) => a + l.planned, 0);
    const committedTotal = lines.reduce((a, l) => a + l.committed, 0);
    const paidTotal = lines.reduce((a, l) => a + l.paid, 0);
    const sums = tally(lines.map((l) => ({ committed: l.committed, paid: l.paid, slotStatus: l.slotId ? slotById.get(l.slotId)?.status : undefined })));
    if (event.totalBudget > 0 && committedTotal > event.totalBudget) {
      warnings.push(
        `Booked and quoted together come to ${formatMoney(Math.round(committedTotal - event.totalBudget), event.currency)} over your total budget.`,
      );
    }
    return {
      currency: event.currency,
      totalBudget: event.totalBudget,
      plannedTotal,
      committedTotal,
      paidTotal,
      agreedTotal: sums.agreed,
      weighingTotal: sums.weighing,
      toPayTotal: sums.toPay,
      paidNotBookedTotal: sums.paidNotBooked,
      sessions: sessions.map((e) => {
        const acc = perSession.get(e._id)!;
        return {
          sessionId: e._id,
          name: e.name,
          color: e.color,
          budget: e.budget,
          planned: Math.round(acc.planned),
          committed: Math.round(acc.committed),
          paid: Math.round(acc.paid),
        };
      }),
      lines: outLines,
      warnings,
    };
  },
});

export const updateLine = mutation({
  args: {
    lineId: v.id("budgetLines"),
    planned: v.optional(v.number()),
    paid: v.optional(v.number()),
    /** Only for a cost that isn't a vendor need: a vendor's committed amount comes from its booking. */
    committed: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Budget line not found.");
    await requireMember(ctx, line.eventId, "planner");
    const patch: { planned?: number; paid?: number; committed?: number; label?: string } = {};
    if (!line.slotId) {
      if (args.committed !== undefined) {
        if (!Number.isFinite(args.committed) || args.committed < 0) throw new ConvexError("Committed must be a non-negative number.");
        patch.committed = args.committed;
      }
      if (args.label?.trim()) patch.label = args.label.trim().slice(0, 80);
    }
    if (args.planned !== undefined) {
      if (!Number.isFinite(args.planned) || args.planned < 0) throw new ConvexError("Planned must be a non-negative number.");
      patch.planned = args.planned;
    }
    if (args.paid !== undefined) {
      if (!Number.isFinite(args.paid) || args.paid < 0) throw new ConvexError("Paid must be a non-negative number.");
      patch.paid = args.paid;
    }
    await ctx.db.patch(args.lineId, patch);
    return null;
  },
});

/** Shared helper: set the committed amount on the slot's budget line (creating it if missing). */
export async function setCommittedForSlotHelper(
  ctx: MutationCtx,
  slotId: Id<"vendorSlots">,
  committed: number,
): Promise<void> {
  const slot = await ctx.db.get(slotId);
  if (!slot) return;
  const line = await ctx.db
    .query("budgetLines")
    .withIndex("by_slotId", (q) => q.eq("slotId", slotId))
    .first();
  if (line) {
    await ctx.db.patch(line._id, { committed });
  } else {
    await ctx.db.insert("budgetLines", {
      eventId: slot.eventId,
      slotId,
      label: slot.title,
      planned: slot.budget,
      committed,
      paid: 0,
    });
  }
}

export const setCommittedForSlot = internalMutation({
  args: { slotId: v.id("vendorSlots"), committed: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.committed) || args.committed < 0) return null;
    await setCommittedForSlotHelper(ctx, args.slotId, args.committed);
    return null;
  },
});

/**
 * "Mark paid" on a line that still has money owing: the vendor's payments due are ticked
 * off, and the line's paid figure becomes what was agreed.
 */
export const markPaid = mutation({
  args: { lineId: v.id("budgetLines") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.lineId);
    if (!line) throw new ConvexError("Budget line not found.");
    const { userId } = await requireMember(ctx, line.eventId, "planner");
    if (line.slotId) {
      const slot = await ctx.db.get(line.slotId);
      if (slot && slot.status !== "booked") throw new ConvexError("Mark the vendor booked first, then what's paid.");
      const dues = await ctx.db
        .query("dues")
        .withIndex("by_slotId", (q) => q.eq("slotId", line.slotId!))
        .take(100);
      const now = Date.now();
      for (const d of dues) if (d.kind === "payment" && d.doneAt === undefined) await ctx.db.patch(d._id, { doneAt: now });
      await recountPaid(ctx, line.slotId);
    }
    const after = await ctx.db.get(args.lineId);
    if (after && after.paid < after.committed) await ctx.db.patch(args.lineId, { paid: after.committed });
    await logActivity(ctx, { eventId: line.eventId, actorUserId: userId, type: "note", text: `marked ${line.label} paid.` });
    return null;
  },
});

/**
 * A cost that isn't a vendor: the outfits bought from a
 * shop, the gifts for the families, the hotel block deposit. Planned is what they
 * expect; committed is what they've agreed to; paid is what has gone out.
 */
export const addCost = mutation({
  args: { eventId: v.id("events"), label: v.string(), planned: v.number(), sessionId: v.optional(v.id("sessions")) },
  returns: v.id("budgetLines"),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    const label = args.label.trim().slice(0, 80);
    if (!label) throw new ConvexError("Say what the cost is for.");
    if (!Number.isFinite(args.planned) || args.planned < 0) throw new ConvexError("Planned must be a non-negative number.");
    if (args.sessionId) {
      const session = await ctx.db.get(args.sessionId);
      if (!session || session.eventId !== args.eventId) throw new ConvexError("That function isn't part of this event.");
    }
    const id = await ctx.db.insert("budgetLines", { eventId: args.eventId, sessionId: args.sessionId, label, planned: args.planned, committed: 0, paid: 0 });
    await logActivity(ctx, { eventId: args.eventId, actorUserId: userId, type: "note", text: `added ${label} to the budget.` });
    return id;
  },
});

/** Remove a cost they added. A vendor need's line goes only with the need. */
export const removeCost = mutation({
  args: { lineId: v.id("budgetLines") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.lineId);
    if (!line) return null;
    await requireMember(ctx, line.eventId, "planner");
    if (line.slotId) throw new ConvexError("That cost belongs to a vendor need; remove the need instead.");
    await ctx.db.delete(args.lineId);
    return null;
  },
});

