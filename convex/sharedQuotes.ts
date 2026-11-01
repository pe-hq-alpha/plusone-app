import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { spend } from "./rateLimits";
import { claimUpload } from "./lib/uploads";
import { formatMoney } from "./lib/text";
import { givenTotal, type Given } from "./lib/given";

/**
 * A quote the host was sent outside the event's inbox: a WhatsApp photo of a price list,
 * a screenshot, a PDF or a pasted message. It is kept as the vendor's reply on their
 * thread and read exactly as an emailed one, into the same lines, so it lands in Compare
 * beside the rest. Each one is a model call, so it counts against the assistant's allowance.
 */

export const READABLE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;
export const MAX_BYTES = 10 * 1024 * 1024;

/** A one-off upload URL for the photo or PDF. */
export const generateUploadUrl = mutation({
  args: { eventId: v.id("events") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    return await ctx.storage.generateUploadUrl();
  },
});

export const add = mutation({
  args: {
    vendorId: v.id("vendors"),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    filename: v.optional(v.string()),
    /** The browser's type for the file, used when storage didn't record one. */
    contentType: v.optional(v.string()),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError("That vendor is no longer on this event.");
    const slotId = vendor.slotId;
    if (!slotId) throw new ConvexError("Add this vendor to a need first, so the quote has somewhere to go.");
    const { userId, event } = await requireMember(ctx, vendor.eventId, "planner");
    const text = args.text?.trim().slice(0, 20_000) ?? "";
    if (args.storageId) await claimUpload(ctx, args.storageId, userId);
    const file = args.storageId ? await ctx.db.system.get(args.storageId) : null;
    if (args.storageId && !file) throw new ConvexError("That upload didn't arrive. Try adding it again.");
    const contentType = file?.contentType ?? args.contentType ?? "";
    if (file && (!READABLE.test(contentType) || file.size > MAX_BYTES)) {
      throw new ConvexError("Add a photo (JPEG, PNG or WebP) or a PDF, up to 10 MB.");
    }
    if (!text && !file) throw new ConvexError("Paste their message or add a photo of it.");
    await spend(ctx, "assistant", event, userId);

    return await fileSharedQuote(ctx, { vendor, slotId, text, storageId: args.storageId, filename: args.filename, contentType, size: file?.size });
  },
});

/**
 * A quote the host adds on a need's page: one a vendor told them in person or on the phone,
 * typed or spoken, or a photo or PDF they were sent. For a vendor already on the need or a
 * new one by name. With a typed price it becomes a quote straight away, no reading needed;
 * words, a photo or a PDF are read like an emailed reply.
 */
export const addFromHost = mutation({
  args: {
    slotId: v.id("vendorSlots"),
    vendorId: v.optional(v.id("vendors")),
    vendorName: v.optional(v.string()),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    filename: v.optional(v.string()),
    contentType: v.optional(v.string()),
    amount: v.optional(v.number()),
    unit: v.optional(v.union(v.literal("total"), v.literal("per_person"))),
    headcount: v.optional(v.number()),
  },
  returns: v.object({ messageId: v.id("messages"), vendorId: v.id("vendors"), reading: v.boolean() }),
  handler: async (ctx, args) => {
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new ConvexError("That need isn't in the plan any more.");
    const { userId, event } = await requireMember(ctx, slot.eventId, "planner");
    if (slot.status === "booked") throw new ConvexError(`${slot.title} is already booked.`);

    // The vendor: the one picked, or one on this need with that name, or a new one.
    let vendor = args.vendorId ? await ctx.db.get(args.vendorId) : null;
    if (vendor && vendor.slotId !== slot._id) throw new ConvexError("That vendor isn't on this need.");
    if (!vendor) {
      const name = args.vendorName?.trim().slice(0, 120) ?? "";
      if (!name) throw new ConvexError("Say who quoted it.");
      const onNeed = await ctx.db.query("vendors").withIndex("by_slotId", (q) => q.eq("slotId", slot._id)).take(200);
      vendor = onNeed.find((x) => x.name.trim().toLowerCase() === name.toLowerCase()) ?? null;
      if (!vendor) {
        const vendorId = await ctx.db.insert("vendors", {
          eventId: slot.eventId, slotId: slot._id, name, category: slot.category,
          packages: [], highlights: [], sourceUrls: [], reviewHighlights: [], pagesRead: [],
          shortlisted: false, scrapedAt: Date.now(),
        });
        vendor = (await ctx.db.get(vendorId))!;
      }
    }

    const text = args.text?.trim().slice(0, 20_000) ?? "";
    if (args.storageId) await claimUpload(ctx, args.storageId, userId);
    const file = args.storageId ? await ctx.db.system.get(args.storageId) : null;
    if (args.storageId && !file) throw new ConvexError("That upload didn't arrive. Try adding it again.");
    const contentType = file?.contentType ?? args.contentType ?? "";
    if (file && (!READABLE.test(contentType) || file.size > MAX_BYTES)) throw new ConvexError("Add a photo (JPEG, PNG or WebP) or a PDF, up to 10 MB.");

    // A typed price, per plate counted for the need's busiest day unless they said how many.
    let given: Given | undefined;
    if (args.amount !== undefined) {
      if (!Number.isFinite(args.amount) || args.amount <= 0) throw new ConvexError("The price must be more than zero.");
      const sessions = await Promise.all(slot.sessionIds.map((id) => ctx.db.get(id)));
      const busiest = Math.max(0, ...sessions.map((x) => x?.guestCount ?? 0));
      const headcount = args.headcount && args.headcount > 0 ? Math.round(args.headcount) : busiest || undefined;
      given = { amount: args.amount, unit: args.unit ?? "total", ...(headcount ? { headcount } : {}) };
      if (given.unit === "per_person" && !given.headcount) throw new ConvexError("Say for how many people the per-plate price is.");
    }
    if (!text && !file && !given) throw new ConvexError("Type what they quoted, say it, or add a photo.");

    // The vendor's card shows the price they told the host, when it had none of its own.
    if (given && vendor.startingPrice === undefined) {
      await ctx.db.patch(vendor._id, { startingPrice: given.amount, priceUnit: given.unit, priceCurrency: event.currency });
    }

    // Words or a file are read by the model, which spends the allowance; a typed price alone doesn't.
    const reading = Boolean(text || file);
    if (reading) await spend(ctx, "assistant", event, userId);
    const messageId = await fileSharedQuote(ctx, {
      vendor, slotId: slot._id, text, storageId: args.storageId, filename: args.filename, contentType, size: file?.size,
      given, spoken: !file, read: reading,
    });
    if (!reading && given) {
      const total = givenTotal(given)!;
      await ctx.scheduler.runAfter(0, internal.quotes.upsertFromMessage, {
        messageId, total, includes: [], excludes: [], redFlags: [],
        summary: given.unit === "per_person" ? `${slot.title}: ${formatMoney(given.amount, event.currency)} a plate for ${given.headcount}.` : `${slot.title}: ${formatMoney(total, event.currency)} in all.`,
        lines: [{ item: slot.title, kind: "core" as const, unit: given.unit, quantity: given.unit === "per_person" ? given.headcount : 1, unitPrice: given.amount, amount: total }],
        ...(given.unit === "per_person" && given.headcount ? { headcountAssumed: given.headcount } : {}),
      });
    }
    return { messageId, vendorId: vendor._id, reading };
  },
});

/**
 * Keep a quote as the vendor's reply on their thread and have it read like an emailed one.
 * Shared by "add a quote" on a need's page, a quote dropped on the event and the older add.
 * A vendor who was never emailed gets a conversation that counts as replied, so the quote
 * is compared like any other instead of hiding behind a draft. It isn't marked unread: the
 * host added it themselves.
 */
export async function fileSharedQuote(
  ctx: MutationCtx,
  args: {
    vendor: Doc<"vendors">; slotId: Id<"vendorSlots">; text: string; storageId?: Id<"_storage">; filename?: string; contentType: string; size?: number;
    given?: Given; spoken?: boolean; read?: boolean;
  },
): Promise<Id<"messages">> {
  const { vendor, slotId, text } = args;
  const hasFile = Boolean(args.storageId && args.size !== undefined);
  const existing = await ctx.db.query("threads").withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id)).first();
  let threadId = existing?._id;
  if (!existing) threadId = await ctx.db.insert("threads", { eventId: vendor.eventId, vendorId: vendor._id, slotId, status: "replied", followUpCount: 0 });
  else if (existing.status === "draft") await ctx.db.patch(existing._id, { status: "replied" });
  const subject = hasFile ? "Shared by you: their quote" : args.spoken && args.given && !text ? "Told to you: their price" : args.spoken ? "Told to you: their quote" : "Shared by you: their message";
  const messageId = await ctx.db.insert("messages", {
    eventId: vendor.eventId,
    threadId: threadId!,
    direction: "in",
    kind: "vendor_reply",
    status: "received",
    fromAddress: vendor.name,
    toAddress: "",
    subject,
    bodyText: text || (hasFile ? "(The quote is in the attached file.)" : "(The price was typed in.)"),
    attachments:
      hasFile && args.storageId
        ? [{ storageId: args.storageId, filename: args.filename?.slice(0, 120) || "quote", contentType: args.contentType, size: args.size ?? 0 }]
        : [],
    receivedAt: Date.now(),
    fromHost: true,
    ...(args.given ? { given: args.given } : {}),
  });
  if (args.read !== false) await ctx.scheduler.runAfter(0, internal.modelTasks.extractReply, { messageId });
  return messageId;
}
