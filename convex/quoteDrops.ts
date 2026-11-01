import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { spend } from "./rateLimits";
import { claimUpload } from "./lib/uploads";
import { MODEL_FAST, generateObject } from "./lib/models";
import { anOccasion } from "./lib/occasion";
import { matchByName, truncate } from "./lib/text";
import { VENDOR_NEEDS, VENDOR_NEED_KEYS } from "./lib/vocab";
import { MAX_BYTES, READABLE, fileSharedQuote } from "./sharedQuotes";
import { addPlainSlot } from "./slots";

/**
 * A quote dropped on the event itself: a WhatsApp screenshot or a pasted message, with no
 * vendor or need chosen. Muse Spark reads who sent it and which of the event's needs it is
 * for (or which kind of need to add); the vendor is found on that need or added to it, and
 * the quote is then read like any other, into the same lines in Compare. Each drop is one
 * read to file it and one to read the quote, so it counts once against the assistant's
 * allowance, as "add a quote" does.
 */

const dropStatus = v.union(v.literal("reading"), v.literal("filed"), v.literal("failed"));


export const generateUploadUrl = mutation({
  args: { eventId: v.id("events") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    return await ctx.storage.generateUploadUrl();
  },
});

export const drop = mutation({
  args: {
    eventId: v.id("events"),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    filename: v.optional(v.string()),
    contentType: v.optional(v.string()),
  },
  returns: v.id("quoteDrops"),
  handler: async (ctx, args) => {
    const { userId, event } = await requireMember(ctx, args.eventId, "planner");
    const text = args.text?.trim().slice(0, 20_000) ?? "";
    if (args.storageId) await claimUpload(ctx, args.storageId, userId);
    const file = args.storageId ? await ctx.db.system.get(args.storageId) : null;
    if (args.storageId && !file) throw new ConvexError("That upload didn't arrive. Try adding it again.");
    const contentType = file?.contentType ?? args.contentType ?? "";
    if (file && (!READABLE.test(contentType) || file.size > MAX_BYTES)) {
      throw new ConvexError("Add a photo (JPEG, PNG or WebP) or a PDF, up to 10 MB.");
    }
    if (!text && !file) throw new ConvexError("Paste their message or add a screenshot of it.");
    await spend(ctx, "assistant", event, userId);
    const dropId = await ctx.db.insert("quoteDrops", {
      eventId: args.eventId,
      userId,
      status: "reading",
      text,
      ...(file && args.storageId ? { storageId: args.storageId, filename: args.filename?.slice(0, 120) || "quote", contentType, size: file.size } : {}),
    });
    await ctx.scheduler.runAfter(0, internal.quoteDrops.route, { dropId });
    return dropId;
  },
});

/** The last few drops on the event, so the box can say where each one went. */
export const recent = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      _id: v.id("quoteDrops"),
      _creationTime: v.number(),
      status: dropStatus,
      vendorName: v.optional(v.string()),
      slotTitle: v.optional(v.string()),
      slotId: v.optional(v.id("vendorSlots")),
      newNeed: v.optional(v.boolean()),
      error: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "viewer");
    const since = Date.now() - 6 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("quoteDrops")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId).gt("_creationTime", since))
      .order("desc")
      .take(4);
    return rows.map((d) => ({
      _id: d._id,
      _creationTime: d._creationTime,
      status: d.status,
      vendorName: d.vendorName,
      slotTitle: d.slotTitle,
      slotId: d.slotId,
      newNeed: d.newNeed,
      error: d.error,
    }));
  },
});

// ---- internal ---------------------------------------------------------------

export const context = internalQuery({
  args: { dropId: v.id("quoteDrops") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const drop = await ctx.db.get(args.dropId);
    if (!drop) return null;
    const event = await ctx.db.get(drop.eventId);
    if (!event) return null;
    const slots = await ctx.db
      .query("vendorSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", drop.eventId))
      .take(60);
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_eventId", (q) => q.eq("eventId", drop.eventId))
      .take(300);
    return {
      drop,
      event,
      slots: slots.map((s) => ({ _id: s._id, title: s.title, category: s.category })),
      vendors: vendors.map((x) => ({ name: x.name, slotId: x.slotId })),
    };
  },
});

const routeSchema = z.object({
  vendorName: z.string().describe("The business that sent the quote, as it names itself; empty if it doesn't say"),
  need: z.string().describe("The title of the event's need this quote is for, copied exactly from the list; empty if none fits"),
  newNeed: z.string().describe("When no listed need fits: the key of the kind of vendor from the second list; else empty"),
});

/** Pure: which existing need a reading names, or which kind of need to add. */
export function placeDrop(
  reading: { need: string; newNeed: string },
  slots: Array<{ _id: Id<"vendorSlots">; title: string; category: string }>,
): { slotId: Id<"vendorSlots"> } | { add: { title: string; category: string } } | null {
  const found = matchByName(slots, reading.need, (s) => s.title);
  if (found) return { slotId: found._id };
  const key = VENDOR_NEED_KEYS.find((k) => k === reading.newNeed.trim());
  if (!key) return null;
  const need = VENDOR_NEEDS[key];
  // The kind may already be on the event under another title.
  const sameKind = slots.find((s) => s.category === need.category);
  if (sameKind) return { slotId: sameKind._id };
  return { add: { title: need.title, category: need.category } };
}

export const route = internalAction({
  args: { dropId: v.id("quoteDrops") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await ctx.runQuery(internal.quoteDrops.context, { dropId: args.dropId });
    if (!c) return null;
    const { drop, event, slots } = c as {
      drop: { _id: Id<"quoteDrops">; text: string; storageId?: Id<"_storage">; filename?: string; contentType?: string };
      event: Parameters<typeof anOccasion>[0] & { _id: Id<"events"> };
      slots: Array<{ _id: Id<"vendorSlots">; title: string; category: string }>;
    };
    try {
      const blob = drop.storageId ? await ctx.storage.get(drop.storageId) : null;
      const kinds = VENDOR_NEED_KEYS.map((k) => `${k}: ${VENDOR_NEEDS[k].title}`).join("\n");
      const text =
        `The hosts of ${anOccasion(event)} were sent a vendor's quote outside the app (a WhatsApp message or a ` +
        `screenshot of one). Say who sent it and which of the event's needs it is for.\n\n` +
        `The event's needs:\n${slots.map((s) => `- ${s.title} (${s.category})`).join("\n") || "(none yet)"}\n\n` +
        `Kinds of vendor, for when none of the needs fits:\n${kinds}\n\n` +
        (blob ? `The quote is in the attached ${drop.contentType?.startsWith("image/") ? "screenshot" : "file"}.\n` : "") +
        (drop.text ? `What they sent:\n${truncate(drop.text, 8000)}` : "");
      const { object } = await generateObject({
        ctx,
        feature: "quoteDrop",
        eventId: event._id,
        model: MODEL_FAST,
        effort: "low",
        maxOutputTokens: 4000,
        schema: routeSchema,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text },
              ...(blob && drop.storageId
                ? [
                    {
                      type: "file" as const,
                      data: await blob.arrayBuffer(),
                      mediaType: drop.contentType || "application/pdf",
                      filename: drop.filename ?? "quote",
                    },
                  ]
                : []),
            ],
          },
        ],
      });
      const place = placeDrop(object, slots);
      if (!place) {
        await ctx.runMutation(internal.quoteDrops.fail, { dropId: drop._id, error: "We couldn't tell which need this quote is for. Add it from that need's Vendors page." });
        return null;
      }
      await ctx.runMutation(internal.quoteDrops.file, {
        dropId: drop._id,
        vendorName: object.vendorName.trim().slice(0, 80),
        ...("slotId" in place ? { slotId: place.slotId } : { add: place.add }),
      });
    } catch (e) {
      console.error("quoteDrop failed", e);
      await ctx.runMutation(internal.quoteDrops.fail, { dropId: drop._id, error: "That quote couldn't be read just now. Try again in a moment." });
    }
    return null;
  },
});

export const fail = internalMutation({
  args: { dropId: v.id("quoteDrops"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.dropId, { status: "failed", error: args.error });
    return null;
  },
});

/** Find the vendor on the need (or add both), then keep and read the quote as theirs. */
export const file = internalMutation({
  args: {
    dropId: v.id("quoteDrops"),
    vendorName: v.string(),
    slotId: v.optional(v.id("vendorSlots")),
    add: v.optional(v.object({ title: v.string(), category: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const drop = await ctx.db.get(args.dropId);
    if (!drop || drop.status !== "reading") return null;
    let slotId = args.slotId;
    if (slotId) {
      const slot = await ctx.db.get(slotId);
      if (!slot || slot.eventId !== drop.eventId) slotId = undefined;
    }
    let added = false;
    if (!slotId && args.add) {
      slotId = await addPlainSlot(ctx, { eventId: drop.eventId, ...args.add });
      added = true;
    }
    const slot = slotId ? await ctx.db.get(slotId) : null;
    if (!slot) {
      await ctx.db.patch(drop._id, { status: "failed", error: "We couldn't tell which need this quote is for. Add it from that need's Vendors page." });
      return null;
    }
    const name = args.vendorName || `A ${slot.title.toLowerCase()} vendor`;
    const onSlot = await ctx.db
      .query("vendors")
      .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
      .take(200);
    let vendor = matchByName(onSlot, args.vendorName, (x) => x.name) ?? null;
    if (!vendor) {
      const vendorId = await ctx.db.insert("vendors", {
        eventId: drop.eventId,
        slotId: slot._id,
        name,
        category: slot.category,
        packages: [],
        highlights: [],
        sourceUrls: [],
        reviewHighlights: [],
        pagesRead: [],
        shortlisted: false,
        scrapedAt: Date.now(),
      });
      vendor = await ctx.db.get(vendorId);
      await logActivity(ctx, {
        eventId: drop.eventId,
        actorUserId: drop.userId,
        type: "vendor_found",
        text: `added ${name} to ${slot.title} from a quote they sent.`,
        refs: { slotId: slot._id, vendorId },
      });
    }
    if (!vendor) return null;
    await fileSharedQuote(ctx, {
      vendor,
      slotId: slot._id,
      text: drop.text,
      storageId: drop.storageId,
      filename: drop.filename,
      contentType: drop.contentType ?? "",
      size: drop.size,
    });
    await ctx.db.patch(drop._id, {
      status: "filed",
      vendorName: vendor.name,
      vendorId: vendor._id,
      slotId: slot._id,
      slotTitle: slot.title,
      newNeed: added,
    });
    return null;
  },
});
