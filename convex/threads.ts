import { agentSentText } from "./agent";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { clampLimit, logActivity, requireMember } from "./lib/auth";
import { isLive } from "./lib/quoteHold";
import { sessionDoc, messageDoc, quoteDoc, threadDoc, vendorDoc, vendorSlotDoc, eventDoc } from "./lib/docs";
import { FOLLOW_UP_DELAY_MS } from "./lib/text";
import { threadStatus } from "./lib/validators";
import { byDayThenOrder } from "./lib/sessionOrder";
import { APP_ACTOR } from "./lib/brand";

export const list = query({
  args: { eventId: v.id("events"), status: v.optional(threadStatus) },
  returns: v.array(
    v.object({
      thread: threadDoc,
      vendor: vendorDoc,
      slot: vendorSlotDoc,
      lastMessage: v.union(
        v.object({
          _id: v.id("messages"),
          direction: v.union(v.literal("in"), v.literal("out")),
          subject: v.string(),
          preview: v.string(),
          at: v.number(),
        }),
        v.null(),
      ),
      latestQuote: v.union(quoteDoc, v.null()),
      /** A quote read from their reply that is waiting for the couple to check. */
      waitingQuote: v.boolean(),
      /** The vendor has written since this person last opened the conversation. */
      unread: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId);
    const threads = (
      await ctx.db
        .query("threads")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .order("desc")
        .take(100)
    ).filter((t) => !args.status || t.status === args.status);
    const out = [];
    for (const thread of threads) {
      const vendor = await ctx.db.get(thread.vendorId);
      const slot = await ctx.db.get(thread.slotId);
      if (!vendor || !slot) continue;
      const last = await ctx.db
        .query("messages")
        .withIndex("by_threadId", (q) => q.eq("threadId", thread._id))
        .order("desc")
        .take(1);
      const quotes = await ctx.db
        .query("quotes")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", thread.vendorId))
        .order("desc")
        .take(5);
      const read = await ctx.db
        .query("threadReads")
        .withIndex("by_threadId_and_userId", (q) => q.eq("threadId", thread._id).eq("userId", userId))
        .unique();
      const m = last[0];
      out.push({
        thread,
        vendor,
        slot,
        lastMessage: m
          ? {
              _id: m._id,
              direction: m.direction,
              subject: m.subject,
              preview: m.bodyText.slice(0, 160),
              at: m.receivedAt ?? m.sentAt ?? m._creationTime,
            }
          : null,
        latestQuote: quotes.find(isLive) ?? null,
        waitingQuote: quotes.some((q) => q.state === "waiting"),
        unread: thread.lastInboundAt !== undefined && (!read || read.readAt < thread.lastInboundAt),
      });
    }
    return out;
  },
});

export const get = query({
  args: { threadId: v.id("threads") },
  returns: v.union(
    v.object({
      thread: threadDoc,
      vendor: vendorDoc,
      slot: vendorSlotDoc,
      messages: v.array(messageDoc),
      quotes: v.array(quoteDoc),
      /** Signed links for every attachment on the thread, so a PDF opens in one click. */
      files: v.array(v.object({ storageId: v.id("_storage"), url: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    await requireMember(ctx, thread.eventId);
    const vendor = await ctx.db.get(thread.vendorId);
    const slot = await ctx.db.get(thread.slotId);
    if (!vendor || !slot) return null;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .take(100);
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", thread.vendorId))
      .order("desc")
      .take(20);
    const files: { storageId: Id<"_storage">; url: string }[] = [];
    for (const m of messages) {
      for (const a of m.attachments) {
        const url = await ctx.storage.getUrl(a.storageId);
        if (url) files.push({ storageId: a.storageId, url });
      }
    }
    return { thread, vendor, slot, messages, quotes, files };
  },
});

export const setStatus = mutation({
  args: { threadId: v.id("threads"), status: threadStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new ConvexError("Thread not found.");
    await requireMember(ctx, thread.eventId, "planner");
    await ctx.db.patch(args.threadId, {
      status: args.status,
      ...(args.status === "booked" || args.status === "declined" ? { nextFollowUpAt: undefined } : {}),
      ...(args.status !== "needs_attention" ? { attentionReason: undefined } : {}),
    });
    return null;
  },
});

export const resolveAttention = mutation({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new ConvexError("Thread not found.");
    await requireMember(ctx, thread.eventId, "planner");
    if (thread.status !== "needs_attention") return null;
    // Back to the most sensible prior state.
    const status = thread.lastInboundAt ? "replied" : thread.lastOutboundAt ? "sent" : "draft";
    await ctx.db.patch(args.threadId, { status, attentionReason: undefined });
    return null;
  },
});

// ---- internal ---------------------------------------------------------------

export const getInternal = internalQuery({
  args: { threadId: v.id("threads") },
  returns: v.union(threadDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const findByAgentmailThreadId = internalQuery({
  args: { agentmailThreadId: v.string() },
  returns: v.union(threadDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("threads")
      .withIndex("by_agentmailThreadId", (q) => q.eq("agentmailThreadId", args.agentmailThreadId))
      .first();
  },
});

/** One thread per vendor; created in `draft` when the first inquiry is drafted. */
export const getOrCreateForVendor = internalMutation({
  args: { eventId: v.id("events"), vendorId: v.id("vendors"), slotId: v.id("vendorSlots") },
  returns: v.id("threads"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", args.vendorId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("threads", {
      eventId: args.eventId,
      vendorId: args.vendorId,
      slotId: args.slotId,
      status: "draft",
      followUpCount: 0,
    });
  },
});

export const markSent = internalMutation({
  args: { threadId: v.id("threads"), agentmailThreadId: v.optional(v.string()), sentAt: v.number(), kind: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const keep = thread.status === "booked" || thread.status === "declined";
    await ctx.db.patch(args.threadId, {
      agentmailThreadId: args.agentmailThreadId ?? thread.agentmailThreadId,
      lastOutboundAt: args.sentAt,
      ...(keep ? {} : { status: "sent" as const, nextFollowUpAt: args.sentAt + FOLLOW_UP_DELAY_MS, attentionReason: undefined }),
    });
    const slot = await ctx.db.get(thread.slotId);
    if (slot && slot.status === "research") await ctx.db.patch(slot._id, { status: "contacted" });
    const agentText = agentSentText(args.kind, (await ctx.db.get(thread.vendorId))?.name ?? "a vendor");
    if (agentText) {
      await logActivity(ctx, {
        eventId: thread.eventId,
        actorLabel: APP_ACTOR,
        actorKind: "app",
        type: "note",
        text: agentText,
        refs: { threadId: thread._id, vendorId: thread.vendorId, slotId: thread.slotId },
      });
    }
    if (args.kind === "inquiry") {
      const vendor = await ctx.db.get(thread.vendorId);
      await logActivity(ctx, {
        eventId: thread.eventId,
        type: "inquiry_sent",
        text: `Inquiry sent to ${vendor?.name ?? "a vendor"}${slot ? ` for ${slot.title}` : ""}.`,
        refs: { threadId: thread._id, vendorId: thread.vendorId, slotId: thread.slotId },
      });
    }
    return null;
  },
});

/** Called when a vendor reply lands: pauses follow-ups and flips to `replied`. */
export const applyInbound = internalMutation({
  args: { threadId: v.id("threads"), agentmailMessageId: v.string(), agentmailThreadId: v.optional(v.string()), receivedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const keep = thread.status === "booked" || thread.status === "declined" || thread.status === "quoted";
    await ctx.db.patch(args.threadId, {
      lastInboundMessageId: args.agentmailMessageId,
      lastInboundAt: args.receivedAt,
      agentmailThreadId: args.agentmailThreadId ?? thread.agentmailThreadId,
      nextFollowUpAt: undefined,
      ...(keep ? {} : { status: "replied" as const, attentionReason: undefined }),
    });
    const vendor = await ctx.db.get(thread.vendorId);
    await logActivity(ctx, {
      eventId: thread.eventId,
      actorLabel: vendor?.name ?? "Vendor",
      actorKind: "vendor",
      type: "vendor_replied",
      text: "replied to your inquiry.",
      refs: { threadId: thread._id, vendorId: thread.vendorId, slotId: thread.slotId },
    });
    return null;
  },
});

/** Outcome of OpenAI classification on an inbound reply. */
export const applyClassification = internalMutation({
  args: { threadId: v.id("threads"), classification: v.union(v.literal("quote"), v.literal("question"), v.literal("declined"), v.literal("available"), v.literal("other")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.status === "booked") return null;
    if (args.classification === "declined") {
      await ctx.db.patch(args.threadId, { status: "declined", nextFollowUpAt: undefined, attentionReason: undefined });
    }
    // A question is left to the inbound workflow: PlusOne answers it, or asks the couple.
    return null;
  },
});

export const setAttention = internalMutation({
  args: { threadId: v.id("threads"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    await ctx.db.patch(args.threadId, { status: "needs_attention", attentionReason: args.reason, nextFollowUpAt: undefined });
    return null;
  },
});

export const afterFollowUpSent = internalMutation({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const followUpCount = thread.followUpCount + 1;
    await ctx.db.patch(args.threadId, { followUpCount });
    const vendor = await ctx.db.get(thread.vendorId);
    await logActivity(ctx, {
      eventId: thread.eventId,
      type: "follow_up_sent",
      text: `Follow-up #${followUpCount} sent to ${vendor?.name ?? "a vendor"}.`,
      refs: { threadId: thread._id, vendorId: thread.vendorId, slotId: thread.slotId },
    });
    return null;
  },
});

/** Threads in `sent` whose follow-up time has passed. Both range ends are bounded. */
export const listDueForFollowUp = internalQuery({
  args: { now: v.number(), limit: v.optional(v.number()) },
  returns: v.array(threadDoc),
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit, 20, 50);
    return await ctx.db
      .query("threads")
      .withIndex("by_status_and_nextFollowUpAt", (q) =>
        q.eq("status", "sent").gte("nextFollowUpAt", 1).lte("nextFollowUpAt", args.now),
      )
      .take(limit);
  },
});

/** Everything an action needs to write about this thread. */
export const getContext = internalQuery({
  args: { threadId: v.id("threads") },
  returns: v.union(
    v.object({
      thread: threadDoc,
      vendor: vendorDoc,
      slot: vendorSlotDoc,
      event: eventDoc,
      sessions: v.array(sessionDoc),
      lastOutbound: v.union(messageDoc, v.null()),
      lastInbound: v.union(messageDoc, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const vendor = await ctx.db.get(thread.vendorId);
    const slot = await ctx.db.get(thread.slotId);
    const event = await ctx.db.get(thread.eventId);
    if (!vendor || !slot || !event) return null;
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_eventId", (q) => q.eq("eventId", thread.eventId))
        .take(50)
    )
      .filter((e) => slot.sessionIds.includes(e._id))
      .sort(byDayThenOrder);
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(20);
    const lastOutbound = recent.find((m) => m.direction === "out" && m.status === "sent") ?? null;
    const lastInbound = recent.find((m) => m.direction === "in") ?? null;
    return { thread, vendor, slot, event, sessions, lastOutbound, lastInbound };
  },
});

/** How many conversations are waiting on the couple, for the badge beside Inbox. */
export const attentionCount = query({
  args: { eventId: v.id("events") },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    return threads.filter((t) => t.status === "needs_attention" || t.pendingQuestion).length;
  },
});

/** This person has opened the conversation: its replies so far are read. */
export const markRead = mutation({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    const { userId } = await requireMember(ctx, thread.eventId);
    const read = await ctx.db
      .query("threadReads")
      .withIndex("by_threadId_and_userId", (q) => q.eq("threadId", args.threadId).eq("userId", userId))
      .unique();
    const now = Date.now();
    if (!read) await ctx.db.insert("threadReads", { eventId: thread.eventId, threadId: args.threadId, userId, readAt: now });
    // Opening it again only matters once something new has come in.
    else if (thread.lastInboundAt !== undefined && read.readAt < thread.lastInboundAt) await ctx.db.patch(read._id, { readAt: now });
    return null;
  },
});
