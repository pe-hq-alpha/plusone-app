import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, internalMutation, type MutationCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { quoteDoc, vendorDoc, vendorSlotDoc } from "./lib/docs";
import { setCommittedForSlotHelper } from "./budget";
import { rebalanceEventBudget } from "./lib/budget";
import { splitByWeights } from "./lib/templates";
import { internal } from "./_generated/api";
import { workflow } from "./workflows";
import { track } from "./analytics";
import { isLive } from "./lib/quoteHold";
import { addBookingPayments } from "./dues";
import { byDayThenOrder } from "./lib/sessionOrder";

export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      slot: vendorSlotDoc,
      vendorsCount: v.number(),
      bestQuote: v.union(quoteDoc, v.null()),
      bookedVendor: v.union(vendorDoc, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    const slots = await ctx.db
      .query("vendorSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const out = [];
    for (const slot of slots) {
      const vendors = await ctx.db
        .query("vendors")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .take(50);
      const quotes = await ctx.db
        .query("quotes")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .take(20);
      let bestQuote = null;
      for (const q of quotes) if (isLive(q) && (!bestQuote || q.total < bestQuote.total)) bestQuote = q;
      const bookedVendor = slot.bookedVendorId ? await ctx.db.get(slot.bookedVendorId) : null;
      out.push({ slot, vendorsCount: vendors.length, bestQuote, bookedVendor });
    }
    return out;
  },
});

export const add = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    category: v.string(),
    sessionIds: v.array(v.id("sessions")),
    budget: v.number(),
  },
  returns: v.id("vendorSlots"),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    return await addSlotHelper(ctx, args);
  },
});

export const update = mutation({
  args: {
    slotId: v.id("vendorSlots"),
    patch: v.object({
      title: v.optional(v.string()),
      category: v.optional(v.string()),
      sessionIds: v.optional(v.array(v.id("sessions"))),
      budget: v.optional(v.number()),
      notes: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new ConvexError("Slot not found.");
    const { userId } = await requireMember(ctx, slot.eventId, "planner");
    await updateSlotHelper(ctx, slot, args.patch, { actorUserId: userId });
    return null;
  },
});

/** The longest name a need can have: long enough for "Nadaswaram & thavil players". */
export const MAX_SLOT_TITLE = 60;

/** A need's name, trimmed, or a reason it can't be used. */
export function cleanSlotTitle(raw: string): string {
  const title = raw.trim();
  if (!title) throw new ConvexError("Give this need a name, such as Iyer or Photographer.");
  if (title.length > MAX_SLOT_TITLE) throw new ConvexError(`Keep the name to ${MAX_SLOT_TITLE} characters or fewer.`);
  return title;
}

/** A need and its budget line. Shared by the vendors form and the assistant. */
export async function addSlotHelper(
  ctx: MutationCtx,
  args: { eventId: Id<"events">; title: string; category: string; sessionIds: Id<"sessions">[]; budget: number },
): Promise<Id<"vendorSlots">> {
  if (!Number.isFinite(args.budget) || args.budget < 0) throw new ConvexError("Budget must be a non-negative number.");
  for (const sessionId of args.sessionIds.slice(0, 20)) {
    const session = await ctx.db.get(sessionId);
    if (!session || session.eventId !== args.eventId) throw new ConvexError("That day isn't part of this event.");
  }
  const slotId = await ctx.db.insert("vendorSlots", {
    eventId: args.eventId,
    sessionIds: args.sessionIds.slice(0, 20),
    category: args.category.trim(),
    title: args.title.trim(),
    budget: args.budget,
    status: "research",
  });
  await ctx.db.insert("budgetLines", {
    eventId: args.eventId,
    slotId,
    label: args.title.trim(),
    planned: args.budget,
    committed: 0,
    paid: 0,
  });
  return slotId;
}

/**
 * Edit a need, keeping its budget line's label, amount and day in step.
 *
 * A rename changes only what the couple calls it ("Officiant" becomes "Iyer"). The
 * category stays as it was, so filters, budget shares and templates keep working.
 */
export async function updateSlotHelper(
  ctx: MutationCtx,
  slot: Doc<"vendorSlots">,
  input: { title?: string; category?: string; sessionIds?: Id<"sessions">[]; budget?: number; notes?: string },
  actor: { actorUserId?: Id<"users"> } = {},
): Promise<void> {
  const patch = { ...input };
  if (patch.title !== undefined) {
    patch.title = cleanSlotTitle(patch.title);
    // Same name as now: nothing to rename.
    if (patch.title === slot.title) delete patch.title;
  }
  const renamedTo = patch.title;
  if (patch.budget !== undefined && (!Number.isFinite(patch.budget) || patch.budget < 0)) {
    throw new ConvexError("Budget must be a non-negative number.");
  }
  if (patch.sessionIds) {
    if (patch.sessionIds.length === 0) throw new ConvexError("A vendor need has to cover at least one day.");
    for (const sessionId of patch.sessionIds.slice(0, 20)) {
      const session = await ctx.db.get(sessionId);
      if (!session || session.eventId !== slot.eventId) throw new ConvexError("That day isn't part of this event.");
    }
  }
  await ctx.db.patch(slot._id, patch);
  if (renamedTo !== undefined) {
    await logActivity(ctx, {
      eventId: slot.eventId,
      actorUserId: actor.actorUserId,
      type: "note",
      text: `renamed ${slot.title} to ${renamedTo}.`,
      refs: { slotId: slot._id },
    });
  }
  if (patch.budget !== undefined || patch.title !== undefined || patch.sessionIds !== undefined) {
    const line = await ctx.db
      .query("budgetLines")
      .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
      .first();
    if (line) {
      await ctx.db.patch(line._id, {
        ...(patch.budget !== undefined ? { planned: patch.budget } : {}),
        ...(patch.title !== undefined ? { label: patch.title } : {}),
        // A need that now serves one day belongs to that day; one that serves several
        // belongs to none of them in particular.
        ...(patch.sessionIds !== undefined
          ? { sessionId: patch.sessionIds.length === 1 ? patch.sessionIds[0] : undefined }
          : {}),
      });
    }
  }
}

/**
 * One need becomes one per day: two venues for two days, a different florist for the
 * ceremony and the reception. The original keeps the first day and whatever research
 * and conversations it already has; the rest start fresh with their share of the budget,
 * split by guest count so the bigger day gets the bigger share.
 */
export const splitBySession = mutation({
  args: { slotId: v.id("vendorSlots") },
  returns: v.array(v.id("vendorSlots")),
  handler: async (ctx, args): Promise<Id<"vendorSlots">[]> => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new ConvexError("That need is no longer part of your plan.");
    const { userId } = await requireMember(ctx, slot.eventId, "planner");
    if (slot.status === "booked") throw new ConvexError("This one is already booked. Un-book it first if you want to split it.");
    if (slot.sessionIds.length < 2) throw new ConvexError("This need is already for a single day.");

    const sessions = [];
    for (const sessionId of slot.sessionIds) {
      const session = await ctx.db.get(sessionId);
      if (session) sessions.push(session);
    }
    if (sessions.length < 2) throw new ConvexError("This need is already for a single day.");
    sessions.sort(byDayThenOrder);
    const shares = splitByWeights(slot.budget, sessions.map((e) => Math.max(1, e.guestCount)));

    const ids: Id<"vendorSlots">[] = [];
    for (const [i, session] of sessions.entries()) {
      const title = `${slot.title} — ${session.name}`.slice(0, 80);
      if (i === 0) {
        // The original carries its vendors, quotes and threads, so nothing is lost.
        await ctx.db.patch(slot._id, { title, sessionIds: [session._id], budget: shares[0] });
        const line = await ctx.db
          .query("budgetLines")
          .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
          .first();
        if (line) await ctx.db.patch(line._id, { label: title, planned: shares[0], sessionId: session._id });
        ids.push(slot._id);
        continue;
      }
      const slotId = await ctx.db.insert("vendorSlots", {
        eventId: slot.eventId,
        sessionIds: [session._id],
        category: slot.category,
        title,
        budget: shares[i],
        status: "research",
      });
      await ctx.db.insert("budgetLines", {
        eventId: slot.eventId,
        slotId,
        sessionId: session._id,
        label: title,
        planned: shares[i],
        committed: 0,
        paid: 0,
      });
      ids.push(slotId);
    }
    await logActivity(ctx, {
      eventId: slot.eventId,
      actorUserId: userId,
      type: "note",
      text: `split ${slot.category.toLowerCase()} into ${sessions.length} separate needs, one per day.`,
      refs: { slotId: slot._id },
    });
    return ids;
  },
});

export const markBooked = mutation({
  args: {
    slotId: v.id("vendorSlots"),
    vendorId: v.id("vendors"),
    /**
     * Let PlusOne tell the chosen vendor and thank the others. Off when they booked
     * outside PlusOne and there is nobody to tell.
     */
    notify: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new ConvexError("Slot not found.");
    const { userId } = await requireMember(ctx, slot.eventId, "planner");
    await track(ctx, "vendor.booked", userId, { category: slot.category, notify: Boolean(args.notify) });
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.eventId !== slot.eventId) throw new ConvexError("That vendor isn't part of this event.");

    await ctx.db.patch(args.slotId, { status: "booked", bookedVendorId: args.vendorId });

    const thread = await ctx.db
      .query("threads")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
      .first();
    if (thread) {
      await ctx.db.patch(thread._id, { status: "booked", nextFollowUpAt: undefined, attentionReason: undefined });
    }

    // Commit the latest quote that is in the plan; booking on one still waiting to be
    // checked counts as checking it.
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
      .order("desc")
      .take(10);
    const quote = quotes.find(isLive) ?? quotes.find((q) => q.state === "waiting");
    if (quote) {
      if (!isLive(quote)) await ctx.db.patch(quote._id, { state: "applied", heldBecause: undefined, appliedAt: Date.now() });
      await setCommittedForSlotHelper(ctx, args.slotId, quote.total);
      // Its deposit and balance go on the list of what's due.
      const event = await ctx.db.get(slot.eventId);
      if (event) await addBookingPayments(ctx, { event, slotId: args.slotId, vendorId: args.vendorId, total: quote.total, deposit: quote.deposit });
    }

    await logActivity(ctx, {
      eventId: slot.eventId,
      actorUserId: userId,
      type: "booked",
      text: `booked ${vendor.name} for ${slot.title}.`,
      refs: { slotId: args.slotId, vendorId: args.vendorId, threadId: thread?._id },
    });
    if (args.notify) {
      await workflow.start(ctx, internal.workflows.bookingWorkflow, { slotId: args.slotId, vendorId: args.vendorId });
    }
    return null;
  },
});

/**
 * Remove a vendor need from the plan, with everything that was only ever a
 * research step for it. Anything that means a real person was contacted — a
 * booking, or an email thread that actually went out — stops the removal.
 */
export const remove = mutation({
  args: { slotId: v.id("vendorSlots") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new ConvexError("That need is no longer part of your plan.");
    const { userId } = await requireMember(ctx, slot.eventId, "planner");

    // Only a real booking blocks removal. A need the couple simply ticked as "already
    // booked" when they signed up has no vendor behind it and can be dropped freely.
    if (slot.status === "booked" && slot.bookedVendorId) {
      const booked = await ctx.db.get(slot.bookedVendorId);
      throw new ConvexError(
        `${booked?.name ?? "A vendor"} is already booked for ${slot.title}. Un-book it first, then you can remove it.`,
      );
    }

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_slotId", (q) => q.eq("slotId", args.slotId))
      .take(100);
    const live = threads.find((t) => t.status !== "draft");
    if (live) {
      const vendor = await ctx.db.get(live.vendorId);
      throw new ConvexError(
        `You've already emailed ${vendor?.name ?? "a vendor"} about ${slot.title}, so this need can't be removed. Mark it booked or leave it as is.`,
      );
    }

    // Vendors found only for this need go with it, unless a draft thread still
    // points at one — those are left alone along with their threads.
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_slotId", (q) => q.eq("slotId", args.slotId))
      .take(200);
    const vendorIdsWithThreads = new Set(threads.map((t) => t.vendorId));
    let removedVendors = 0;
    for (const vendor of vendors) {
      if (vendorIdsWithThreads.has(vendor._id)) continue;
      await ctx.db.delete(vendor._id);
      removedVendors += 1;
    }

    for (const run of await ctx.db
      .query("researchRuns")
      .withIndex("by_slotId", (q) => q.eq("slotId", args.slotId))
      .take(100)) {
      await ctx.db.delete(run._id);
    }

    const line = await ctx.db
      .query("budgetLines")
      .withIndex("by_slotId", (q) => q.eq("slotId", args.slotId))
      .first();
    if (line) await ctx.db.delete(line._id);

    await ctx.db.delete(args.slotId);

    // Its budget goes back to the needs that remain.
    await rebalanceEventBudget(ctx, slot.eventId);

    await logActivity(ctx, {
      eventId: slot.eventId,
      actorUserId: userId,
      type: "note",
      text:
        `removed ${slot.title} from the plan` +
        (removedVendors > 0 ? `, along with ${removedVendors} vendor${removedVendors === 1 ? "" : "s"} found for it` : "") +
        ".",
    });
    return null;
  },
});

// ---- internal ---------------------------------------------------------------

export const getInternal = internalQuery({
  args: { slotId: v.id("vendorSlots") },
  returns: v.union(vendorSlotDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.slotId);
  },
});

/** Add a vendor need without a session, for the assistant acting on the couple's behalf. */
export const addInternal = internalMutation({
  args: { eventId: v.id("events"), title: v.string(), category: v.string() },
  returns: v.id("vendorSlots"),
  handler: async (ctx, args) => await addPlainSlot(ctx, args),
});

/** A need with no budget yet, across every part of the event, with its budget line. */
export async function addPlainSlot(ctx: MutationCtx, args: { eventId: Id<"events">; title: string; category: string }): Promise<Id<"vendorSlots">> {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
    .take(50);
  const slotId = await ctx.db.insert("vendorSlots", {
    eventId: args.eventId,
    sessionIds: sessions.map((e) => e._id),
    category: args.category,
    title: args.title,
    budget: 0,
    status: "research",
  });
  await ctx.db.insert("budgetLines", {
    eventId: args.eventId,
    slotId,
    label: args.title,
    planned: 0,
    committed: 0,
    paid: 0,
  });
  await rebalanceEventBudget(ctx, args.eventId);
  return slotId;
}
