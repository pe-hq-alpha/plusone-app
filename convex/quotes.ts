import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { quoteDoc } from "./lib/docs";
import { formatMoney } from "./lib/text";
import { quoteLine, threadStatus } from "./lib/validators";
import { setCommittedForSlotHelper } from "./budget";
import { holdReason, isLive } from "./lib/quoteHold";
import { trackForEvent } from "./analytics";

export const compareForSlot = query({
  args: { slotId: v.id("vendorSlots") },
  returns: v.array(
    v.object({
      quote: quoteDoc,
      vendor: v.object({
        _id: v.id("vendors"),
        name: v.string(),
        website: v.optional(v.string()),
        email: v.optional(v.string()),
        shortlisted: v.boolean(),
      }),
      threadStatus,
      deltaVsBudget: v.number(),
      isBooked: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new ConvexError("Slot not found.");
    await requireMember(ctx, slot.eventId);
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_slotId", (q) => q.eq("slotId", args.slotId))
      .order("desc")
      .take(50);
    // Keep only the latest quote per vendor.
    const seen = new Set<string>();
    const rows = [];
    for (const quote of quotes) {
      // Only quotes that have changed the plan are compared; one waiting to be checked is not.
      if (!isLive(quote) || seen.has(quote.vendorId)) continue;
      seen.add(quote.vendorId);
      const vendor = await ctx.db.get(quote.vendorId);
      const thread = await ctx.db.get(quote.threadId);
      if (!vendor || !thread) continue;
      rows.push({
        quote,
        vendor: {
          _id: vendor._id,
          name: vendor.name,
          website: vendor.website,
          email: vendor.email,
          shortlisted: vendor.shortlisted,
        },
        threadStatus: thread.status,
        deltaVsBudget: quote.total - slot.budget,
        isBooked: slot.bookedVendorId === vendor._id,
      });
    }
    return rows.sort((a, b) => a.quote.total - b.quote.total);
  },
});

// ---- applying a quote, holding it, undoing it ----------------------------------

/** What applying a quote changes: the conversation and the need move to quoted, and the budget tracks it. */
async function applyQuote(ctx: MutationCtx, quote: Doc<"quotes">): Promise<void> {
  const thread = await ctx.db.get(quote.threadId);
  const slot = await ctx.db.get(quote.slotId);
  if (!thread || !slot) return;
  const line = await ctx.db
    .query("budgetLines")
    .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
    .first();
  await ctx.db.patch(quote._id, {
    state: "applied",
    heldBecause: undefined,
    appliedAt: Date.now(),
    before: { threadStatus: thread.status, slotStatus: slot.status, committed: line?.committed ?? 0 },
  });
  if (thread.status !== "booked" && thread.status !== "declined") await ctx.db.patch(thread._id, { status: "quoted" });
  if (slot.status === "research" || slot.status === "contacted") await ctx.db.patch(slot._id, { status: "quoted" });
  // The budget bar tracks the live quote until something is booked.
  if (slot.status !== "booked") await setCommittedForSlotHelper(ctx, slot._id, quote.total);
}

/** The quote and its wedding, checked as a planner. */
async function quoteForPlanner(ctx: MutationCtx, quoteId: Id<"quotes">) {
  const quote = await ctx.db.get(quoteId);
  if (!quote) throw new ConvexError("That quote is no longer there.");
  const { userId } = await requireMember(ctx, quote.eventId, "planner");
  const vendor = await ctx.db.get(quote.vendorId);
  const slot = await ctx.db.get(quote.slotId);
  return { quote, userId, vendorName: vendor?.name ?? "The vendor", slotTitle: slot?.title ?? "this" };
}

/** The couple checked a waiting quote and it's right: it goes into the plan. */
export const apply = mutation({
  args: { quoteId: v.id("quotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { quote, userId, vendorName, slotTitle } = await quoteForPlanner(ctx, args.quoteId);
    if (isLive(quote)) return null;
    await applyQuote(ctx, quote);
    await logActivity(ctx, {
      eventId: quote.eventId,
      actorUserId: userId,
      type: "quote_received",
      text: `Checked ${vendorName}'s quote of ${formatMoney(quote.total, quote.currency)} for ${slotTitle} and put it in the plan.`,
      refs: { slotId: quote.slotId, vendorId: quote.vendorId, threadId: quote.threadId },
    });
    return null;
  },
});

/** The reading was wrong: it stays on record but never touches the plan. */
export const dismiss = mutation({
  args: { quoteId: v.id("quotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { quote } = await quoteForPlanner(ctx, args.quoteId);
    if (quote.state !== "waiting") return null;
    await ctx.db.patch(quote._id, { state: "dismissed" });
    return null;
  },
});

/**
 * Take back a quote that applied itself: the conversation, the need and the budget go
 * back to how they were, and the quote waits to be checked again. A booked vendor's
 * quote stays, since the booking was made on it.
 */
export const undo = mutation({
  args: { quoteId: v.id("quotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { quote, userId, vendorName, slotTitle } = await quoteForPlanner(ctx, args.quoteId);
    if (!isLive(quote)) return null;
    const slot = await ctx.db.get(quote.slotId);
    const thread = await ctx.db.get(quote.threadId);
    if (!slot || !thread) return null;
    if (slot.status === "booked" && slot.bookedVendorId === quote.vendorId) {
      throw new ConvexError(`${vendorName} is booked on this quote. Undo the booking first.`);
    }
    const before = quote.before;
    if (before) {
      if (thread.status === "quoted") await ctx.db.patch(thread._id, { status: before.threadStatus });
      if (slot.status === "quoted") await ctx.db.patch(slot._id, { status: before.slotStatus });
      if (slot.status !== "booked") await setCommittedForSlotHelper(ctx, slot._id, before.committed);
    }
    await ctx.db.patch(quote._id, { state: "waiting", heldBecause: "You took it back to check it.", before: undefined, appliedAt: undefined });
    await logActivity(ctx, {
      eventId: quote.eventId,
      actorUserId: userId,
      type: "note",
      text: `Took ${vendorName}'s quote for ${slotTitle} back out of the plan to check it.`,
      refs: { slotId: quote.slotId, vendorId: quote.vendorId, threadId: quote.threadId },
    });
    return null;
  },
});

// ---- internal ---------------------------------------------------------------

/**
 * Create or refresh the quote read from a vendor's reply. It changes the plan straight
 * away (with an undo) unless the wedding checks quotes first or the reading looks off,
 * in which case it waits for the couple.
 */
export const upsertFromMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    total: v.number(),
    deposit: v.optional(v.number()),
    currency: v.optional(v.string()),
    includes: v.array(v.string()),
    excludes: v.array(v.string()),
    validUntil: v.optional(v.string()),
    redFlags: v.array(v.string()),
    summary: v.string(),
    fromAttachment: v.optional(v.string()),
    lines: v.optional(v.array(quoteLine)),
    headcountAssumed: v.optional(v.number()),
    taxIncluded: v.optional(v.boolean()),
  },
  returns: v.union(v.id("quotes"), v.null()),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.total) || args.total <= 0) return null;
    const message = await ctx.db.get(args.messageId);
    if (!message || !message.threadId) return null;
    const thread = await ctx.db.get(message.threadId);
    if (!thread) return null;
    const event = await ctx.db.get(thread.eventId);
    const slot = await ctx.db.get(thread.slotId);
    const vendor = await ctx.db.get(thread.vendorId);
    if (!event || !slot || !vendor) return null;

    const fields = {
      eventId: thread.eventId,
      slotId: thread.slotId,
      vendorId: thread.vendorId,
      threadId: thread._id,
      messageId: args.messageId,
      total: args.total,
      deposit: args.deposit,
      currency: args.currency ?? event.currency,
      includes: args.includes.slice(0, 20),
      excludes: args.excludes.slice(0, 20),
      validUntil: args.validUntil,
      redFlags: args.redFlags.slice(0, 10),
      summary: args.summary,
      ...(args.fromAttachment ? { fromAttachment: args.fromAttachment } : {}),
      ...(args.lines?.length ? { lines: args.lines.slice(0, 30) } : {}),
      ...(args.headcountAssumed && args.headcountAssumed > 0 ? { headcountAssumed: Math.round(args.headcountAssumed) } : {}),
      ...(args.taxIncluded !== undefined ? { taxIncluded: args.taxIncluded } : {}),
    };
    // One quote per message: re-running extraction updates instead of duplicating.
    const existing = (
      await ctx.db
        .query("quotes")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", thread.vendorId))
        .order("desc")
        .take(20)
    ).find((q) => q.messageId === args.messageId);
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      if (isLive(existing) && slot.status !== "booked") await setCommittedForSlotHelper(ctx, slot._id, args.total);
      return existing._id;
    }

    const held = holdReason({
      total: args.total,
      currency: args.currency,
      eventCurrency: event.currency,
      budget: slot.budget,
      slotBooked: slot.status === "booked",
      reviewFirst: event.sendMode === "review",
    });
    const quoteId = await ctx.db.insert("quotes", { ...fields, ...(held ? { state: "waiting" as const, heldBecause: held } : {}) });
    if (!held) {
      const quote = await ctx.db.get(quoteId);
      if (quote) await applyQuote(ctx, quote);
    }
    await logActivity(ctx, {
      eventId: thread.eventId,
      actorLabel: vendor.name,
      actorKind: "vendor",
      type: "quote_received",
      text: held
        ? `quoted ${formatMoney(args.total, fields.currency)} for ${slot.title}. It's waiting for you to check before it changes the plan.`
        : `quoted ${formatMoney(args.total, fields.currency)} for ${slot.title}${args.redFlags.length ? ` (${args.redFlags.length} flag${args.redFlags.length > 1 ? "s" : ""})` : ""}.`,
      refs: { slotId: slot._id, vendorId: vendor._id, threadId: thread._id },
    });
    await trackForEvent(ctx, "quote.received", thread.eventId, { fromAttachment: Boolean(args.fromAttachment), held: Boolean(held) });
    return quoteId;
  },
});

/**
 * A sample event's catering replies that carry a quote, for the demo's recorded run
 * (`claude.readDemoQuotes`): the given sample event, or the newest one. Real events never.
 */
export const demoReplies = internalQuery({
  args: { eventId: v.optional(v.id("events")) },
  returns: v.array(v.object({ eventId: v.id("events"), slotId: v.id("vendorSlots"), vendorName: v.string(), subject: v.string(), body: v.string() })),
  handler: async (ctx, args) => {
    const event = args.eventId
      ? await ctx.db.get(args.eventId)
      : await ctx.db.query("events").withIndex("by_demo", (q) => q.eq("demo", true)).order("desc").first();
    if (!event || event.demo !== true) return [];
    const out = [];
    for (const quote of await ctx.db.query("quotes").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(50)) {
      const slot = quote.slotId ? await ctx.db.get(quote.slotId) : null;
      if (slot?.category !== "Catering" || !quote.messageId) continue;
      const message = await ctx.db.get(quote.messageId);
      const vendor = quote.vendorId ? await ctx.db.get(quote.vendorId) : null;
      if (!message || !vendor) continue;
      out.push({ eventId: event._id, slotId: slot._id, vendorName: vendor.name, subject: message.subject, body: message.bodyText });
    }
    return out;
  },
});
