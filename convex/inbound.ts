import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { contractCheckDoc, guestDoc, eventDoc } from "./lib/docs";
import { contractStatus, flagSeverity, routedAs } from "./lib/validators";
import { trackForEvent } from "./analytics";

/**
 * First touch for every webhook delivery. Idempotent on the AgentMail message
 * id so redelivered webhooks (Svix retries) become no-ops.
 */
export const claim = internalMutation({
  args: {
    agentmailMessageId: v.string(),
    webhookEventId: v.string(),
    inboxId: v.string(),
    threadId: v.optional(v.string()),
    fromAddress: v.string(),
  },
  returns: v.object({
    status: v.union(v.literal("new"), v.literal("duplicate")),
    inboundEventId: v.id("inboundEvents"),
    eventId: v.union(v.id("events"), v.null()),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inboundEvents")
      .withIndex("by_agentmailMessageId", (q) => q.eq("agentmailMessageId", args.agentmailMessageId))
      .first();
    if (existing) return { status: "duplicate" as const, inboundEventId: existing._id, eventId: existing.eventId ?? null };
    const byWebhookSession = await ctx.db
      .query("inboundEvents")
      .withIndex("by_webhookEventId", (q) => q.eq("webhookEventId", args.webhookEventId))
      .first();
    if (byWebhookSession) return { status: "duplicate" as const, inboundEventId: byWebhookSession._id, eventId: byWebhookSession.eventId ?? null };

    const event = await eventForInbound(ctx, args.inboxId, args.fromAddress);
    const inboundEventId = await ctx.db.insert("inboundEvents", {
      agentmailMessageId: args.agentmailMessageId,
      webhookEventId: args.webhookEventId,
      inboxId: args.inboxId,
      threadId: args.threadId,
      fromAddress: args.fromAddress,
      routedAs: "pending",
      eventId: event?._id,
    });
    return { status: "new" as const, inboundEventId, eventId: event?._id ?? null };
  },
});

/**
 * Which wedding an email belongs to.
 *
 * One inbox usually means one wedding. When several share the fallback inbox, guessing
 * would file a couple's forwarded contract under someone else's wedding, so the sender
 * has to prove which one: their own address on the guest list, on a vendor, or on the
 * people planning it. No match means no wedding, and the email is logged as being from
 * a sender we do not know.
 */
async function eventForInbound(
  ctx: QueryCtx | MutationCtx,
  inboxId: string,
  fromAddress: string,
): Promise<Doc<"events"> | null> {
  const events = await ctx.db
    .query("events")
    .withIndex("by_inboxId", (q) => q.eq("inboxId", inboxId))
    .take(20);
  if (events.length <= 1) return events[0] ?? null;

  const email = fromAddress.trim().toLowerCase();
  if (!email) return null;
  for (const event of events) {
    const guest = await ctx.db
      .query("guests")
      .withIndex("by_eventId_and_email", (q) => q.eq("eventId", event._id).eq("email", email))
      .first();
    if (guest) return event;
  }
  for (const event of events) {
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(200);
    if (vendors.some((v) => v.email?.toLowerCase() === email)) return event;
  }
  for (const event of events) {
    const members = await ctx.db
      .query("members")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(20);
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      if (user?.email?.toLowerCase() === email) return event;
    }
  }
  return null;
}

export const finish = internalMutation({
  args: {
    inboundEventId: v.id("inboundEvents"),
    routedAs,
    eventId: v.optional(v.id("events")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inboundEventId);
    if (!row) return null;
    await ctx.db.patch(args.inboundEventId, {
      routedAs: args.routedAs,
      eventId: args.eventId ?? row.eventId,
      error: args.error?.slice(0, 1000),
      processedAt: Date.now(),
    });
    return null;
  },
});

export const findEventByInbox = internalQuery({
  args: { inboxId: v.string() },
  returns: v.union(eventDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      .withIndex("by_inboxId", (q) => q.eq("inboxId", args.inboxId))
      .first();
  },
});

/**
 * Guest lookup by sender. A shared fallback inbox can serve several weddings,
 * so we check every wedding bound to this inbox (bounded to 20).
 */
export const findGuestByEmail = internalQuery({
  args: { inboxId: v.string(), email: v.string() },
  returns: v.union(guestDoc, v.null()),
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();
    const events = await ctx.db
      .query("events")
      .withIndex("by_inboxId", (q) => q.eq("inboxId", args.inboxId))
      .take(20);
    for (const event of events) {
      const guest = await ctx.db
        .query("guests")
        .withIndex("by_eventId_and_email", (q) => q.eq("eventId", event._id).eq("email", email))
        .first();
      if (guest) return guest;
    }
    return null;
  },
});

export const createContractCheck = internalMutation({
  args: { eventId: v.id("events"), storageId: v.id("_storage"), filename: v.string(), vendorId: v.optional(v.id("vendors")) },
  returns: v.id("contractChecks"),
  handler: async (ctx, args) => {
    const contractCheckId = await ctx.db.insert("contractChecks", {
      eventId: args.eventId,
      storageId: args.storageId,
      filename: args.filename,
      vendorId: args.vendorId,
      status: "pending",
      flags: [],
    });
    // Read it straight away; the couple forwarded it because they want an answer.
    await ctx.scheduler.runAfter(0, internal.modelTasks.checkContract, { contractCheckId });
    await trackForEvent(ctx, "contract.checked", args.eventId);
    return contractCheckId;
  },
});

export const getContractCheck = internalQuery({
  args: { contractCheckId: v.id("contractChecks") },
  returns: v.union(contractCheckDoc, v.null()),
  handler: async (ctx, args) => await ctx.db.get(args.contractCheckId),
});

export const finishContractCheck = internalMutation({
  args: {
    contractCheckId: v.id("contractChecks"),
    status: contractStatus,
    summary: v.string(),
    flags: v.array(v.object({ severity: flagSeverity, clause: v.string(), why: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.contractCheckId);
    if (!check) return null;
    await ctx.db.patch(args.contractCheckId, { status: args.status, summary: args.summary, flags: args.flags });
    const high = args.flags.filter((f) => f.severity === "high").length;
    await logActivity(ctx, {
      eventId: check.eventId,
      type: "note",
      text:
        `read the contract "${check.filename}"` +
        (args.status === "failed"
          ? ", but it could not be opened."
          : high > 0
            ? `, and found ${high} thing${high === 1 ? "" : "s"} worth a second look.`
            : ", and found nothing alarming."),
    });
    return null;
  },
});

/** Everything the couple has forwarded, newest first. */
export const listContractChecks = query({
  args: { eventId: v.id("events") },
  returns: v.array(contractCheckDoc),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    return (
      await ctx.db
        .query("contractChecks")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .order("desc")
        .take(30)
    );
  },
});
