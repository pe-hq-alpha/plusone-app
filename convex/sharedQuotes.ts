import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { spend } from "./rateLimits";

/**
 * A quote the host was sent outside the event's inbox: a WhatsApp photo of a price list,
 * a screenshot, a PDF or a pasted message. It is kept as the vendor's reply on their
 * thread and read exactly as an emailed one, into the same lines, so it lands in Compare
 * beside the rest. Each one is a model call, so it counts against the assistant's allowance.
 */

const READABLE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;
const MAX_BYTES = 10 * 1024 * 1024;

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
    const file = args.storageId ? await ctx.db.system.get(args.storageId) : null;
    if (args.storageId && !file) throw new ConvexError("That upload didn't arrive. Try adding it again.");
    const contentType = file?.contentType ?? args.contentType ?? "";
    if (file && (!READABLE.test(contentType) || file.size > MAX_BYTES)) {
      throw new ConvexError("Add a photo (JPEG, PNG or WebP) or a PDF, up to 10 MB.");
    }
    if (!text && !file) throw new ConvexError("Paste their message or add a photo of it.");
    await spend(ctx, "assistant", event, userId);

    const existing = await ctx.db.query("threads").withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id)).first();
    const threadId =
      existing?._id ??
      (await ctx.db.insert("threads", { eventId: vendor.eventId, vendorId: vendor._id, slotId, status: "draft", followUpCount: 0 }));
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      eventId: vendor.eventId,
      threadId,
      direction: "in",
      kind: "vendor_reply",
      status: "received",
      fromAddress: vendor.name,
      toAddress: "",
      subject: file ? "Shared by you: their quote" : "Shared by you: their message",
      bodyText: text || "(The quote is in the attached file.)",
      attachments:
        file && args.storageId
          ? [{ storageId: args.storageId, filename: args.filename?.slice(0, 120) || "quote", contentType, size: file.size }]
          : [],
      receivedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.claude.extractReply, { messageId });
    return messageId;
  },
});
