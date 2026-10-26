import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { formatMoney } from "./lib/text";
import { dueFields } from "./schema";

/**
 * What's due, when (payments and vendor deadlines, as one list):
 * payments to vendors, which count towards the budget once paid, and the deadlines they
 * set. Booking a vendor on a quote adds its deposit and balance automatically.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

const dueView = v.object({
  _id: v.id("dues"),
  kind: dueFields.kind,
  label: v.string(),
  amount: v.optional(v.number()),
  dueDate: v.string(),
  doneAt: v.optional(v.number()),
  fromBooking: v.optional(v.boolean()),
  vendorId: v.optional(v.id("vendors")),
  vendorName: v.optional(v.string()),
  slotTitle: v.optional(v.string()),
});

/** Everything due in the wedding, soonest first. */
export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(dueView),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "viewer");
    const rows = await ctx.db
      .query("dues")
      .withIndex("by_eventId_and_dueDate", (q) => q.eq("eventId", args.eventId))
      .take(300);
    return await Promise.all(
      rows.map(async (d) => {
        const vendor = d.vendorId ? await ctx.db.get(d.vendorId) : null;
        const slot = d.slotId ? await ctx.db.get(d.slotId) : null;
        return {
          _id: d._id,
          kind: d.kind,
          label: d.label,
          amount: d.amount,
          dueDate: d.dueDate,
          doneAt: d.doneAt,
          fromBooking: d.fromBooking,
          vendorId: d.vendorId,
          vendorName: vendor?.name,
          slotTitle: slot?.title,
        };
      }),
    );
  },
});

/** A payment or a deadline, added by hand. */
export const add = mutation({
  args: {
    eventId: v.id("events"),
    kind: dueFields.kind,
    label: v.string(),
    dueDate: v.string(),
    amount: v.optional(v.number()),
    vendorId: v.optional(v.id("vendors")),
  },
  returns: v.id("dues"),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    const label = args.label.trim().slice(0, 120);
    if (!label) throw new ConvexError("Say what it is, for example \"Deposit\" or \"Final menu\".");
    if (!ISO_DAY.test(args.dueDate)) throw new ConvexError("Pick the day it's due.");
    if (args.amount !== undefined && (!Number.isFinite(args.amount) || args.amount < 0)) throw new ConvexError("The amount must be a positive number.");
    let slotId: Id<"vendorSlots"> | undefined;
    if (args.vendorId) {
      const vendor = await ctx.db.get(args.vendorId);
      if (!vendor || vendor.eventId !== args.eventId) throw new ConvexError("That vendor isn't part of this event.");
      slotId = vendor.slotId;
    }
    const id = await ctx.db.insert("dues", {
      eventId: args.eventId,
      kind: args.kind,
      label,
      dueDate: args.dueDate,
      ...(args.kind === "payment" && args.amount !== undefined ? { amount: Math.round(args.amount) } : {}),
      ...(args.vendorId ? { vendorId: args.vendorId, slotId } : {}),
    });
    await logActivity(ctx, {
      eventId: args.eventId,
      actorUserId: userId,
      type: "note",
      text: `Added ${args.kind === "payment" ? "a payment" : "a deadline"}: ${label}, due ${args.dueDate}.`,
      refs: args.vendorId ? { vendorId: args.vendorId } : undefined,
    });
    return id;
  },
});

/** Change what's due, when, or how much. */
export const update = mutation({
  args: {
    dueId: v.id("dues"),
    patch: v.object({ label: v.optional(v.string()), dueDate: v.optional(v.string()), amount: v.optional(v.union(v.number(), v.null())) }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const due = await ctx.db.get(args.dueId);
    if (!due) throw new ConvexError("That's no longer on the list.");
    await requireMember(ctx, due.eventId, "planner");
    const patch: Partial<Doc<"dues">> = {};
    if (args.patch.label !== undefined) {
      const label = args.patch.label.trim().slice(0, 120);
      if (!label) throw new ConvexError("Say what it is.");
      patch.label = label;
    }
    if (args.patch.dueDate !== undefined) {
      if (!ISO_DAY.test(args.patch.dueDate)) throw new ConvexError("Pick the day it's due.");
      patch.dueDate = args.patch.dueDate;
    }
    if (args.patch.amount !== undefined) {
      if (args.patch.amount !== null && (!Number.isFinite(args.patch.amount) || args.patch.amount < 0)) throw new ConvexError("The amount must be a positive number.");
      patch.amount = args.patch.amount === null ? undefined : Math.round(args.patch.amount);
    }
    await ctx.db.patch(args.dueId, patch);
    if (due.slotId && patch.amount !== undefined) await recountPaid(ctx, due.slotId);
    return null;
  },
});

/** Paid, or done; or not after all. A paid payment counts towards the budget. */
export const setDone = mutation({
  args: { dueId: v.id("dues"), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const due = await ctx.db.get(args.dueId);
    if (!due) throw new ConvexError("That's no longer on the list.");
    const { userId } = await requireMember(ctx, due.eventId, "planner");
    await ctx.db.patch(args.dueId, { doneAt: args.done ? Date.now() : undefined });
    if (due.kind === "payment" && due.slotId) await recountPaid(ctx, due.slotId);
    if (args.done) {
      const vendor = due.vendorId ? await ctx.db.get(due.vendorId) : null;
      const event = await ctx.db.get(due.eventId);
      await logActivity(ctx, {
        eventId: due.eventId,
        actorUserId: userId,
        type: "task_done",
        text:
          due.kind === "payment"
            ? `Paid ${vendor ? `${vendor.name}'s ` : ""}${due.label.toLowerCase()}${due.amount ? ` of ${formatMoney(due.amount, event?.currency ?? "USD")}` : ""}.`
            : `Done: ${due.label}${vendor ? ` for ${vendor.name}` : ""}.`,
        refs: due.vendorId ? { vendorId: due.vendorId } : undefined,
      });
    }
    return null;
  },
});

export const remove = mutation({
  args: { dueId: v.id("dues") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const due = await ctx.db.get(args.dueId);
    if (!due) return null;
    await requireMember(ctx, due.eventId, "planner");
    await ctx.db.delete(args.dueId);
    if (due.slotId) await recountPaid(ctx, due.slotId);
    return null;
  },
});

/** The need's paid figure is what its paid payments add up to. */
export async function recountPaid(ctx: MutationCtx, slotId: Id<"vendorSlots">): Promise<void> {
  const rows = await ctx.db
    .query("dues")
    .withIndex("by_slotId", (q) => q.eq("slotId", slotId))
    .take(100);
  const paid = rows.filter((d) => d.kind === "payment" && d.doneAt !== undefined).reduce((a, d) => a + (d.amount ?? 0), 0);
  const line = await ctx.db
    .query("budgetLines")
    .withIndex("by_slotId", (q) => q.eq("slotId", slotId))
    .first();
  if (line && line.paid !== paid) await ctx.db.patch(line._id, { paid });
}

/**
 * Booking a vendor on a quote: its deposit (due within a week) and the balance (due a
 * month before the first day) go on the list, unless that vendor's payments are already
 * there. Dates never land in the past.
 */
export async function addBookingPayments(
  ctx: MutationCtx,
  args: { event: Doc<"events">; slotId: Id<"vendorSlots">; vendorId: Id<"vendors">; total: number; deposit?: number },
): Promise<number> {
  const existing = await ctx.db
    .query("dues")
    .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
    .take(20);
  if (existing.some((d) => d.kind === "payment")) return 0;
  const now = today();
  const notBefore = (iso: string) => (iso < now ? addDays(now, 7) : iso);
  const deposit = args.deposit && args.deposit > 0 && args.deposit < args.total ? Math.round(args.deposit) : 0;
  const rows: { label: string; amount: number; dueDate: string }[] = [];
  if (deposit) rows.push({ label: "Deposit", amount: deposit, dueDate: addDays(now, 7) });
  rows.push({ label: deposit ? "Balance" : "Payment", amount: Math.round(args.total - deposit), dueDate: notBefore(addDays(args.event.startDate, -30)) });
  for (const r of rows) {
    await ctx.db.insert("dues", { eventId: args.event._id, slotId: args.slotId, vendorId: args.vendorId, kind: "payment", fromBooking: true, ...r });
  }
  return rows.length;
}
