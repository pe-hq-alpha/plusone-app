import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { requireActionUserId } from "../lib/auth";
import { isTrial } from "../lib/marketplace";
import { currentBusiness } from "./vendors";
import { generateObject, MODEL_FAST, type Part } from "../lib/models";
import { keepPackages, type PackageDraft, priceListInstructions, priceListSchema } from "../lib/priceList";
import { sheetFor } from "../lib/standardSheet";
import { rateLimiter } from "../rateLimits";

/**
 * "Bring your price list": a vendor pastes the price list they already hand out, or adds
 * a photo of it, and Muse Spark Open, Meta's open-weights model on Baseten, drafts their
 * packages on the trade's standard sheet. Nothing is saved here: the vendor checks each
 * draft in the usual form and saves it themselves. A photo is deleted once it is read.
 */

const MAX_TEXT = 6000;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

/** The caller's listing and whether they are a demo guest; null without a listing they may use. */
export const caller = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), v.object({ categories: v.array(v.string()), isGuest: v.boolean() })),
  handler: async (ctx, args) => {
    const profile = await currentBusiness(ctx, args.userId);
    if (!profile) return null;
    const user = await ctx.db.get(args.userId);
    const isGuest = Boolean(user?.isAnonymous);
    if (isGuest && !isTrial(profile)) return null;
    return { categories: profile.categories, isGuest };
  },
});

/** The photo's type and size, from storage's own record of it. */
export const photoInfo = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.null(), v.object({ contentType: v.optional(v.string()), size: v.number() })),
  handler: async (ctx, args) => {
    const file = await ctx.db.system.get("_storage", args.storageId);
    return file ? { ...(file.contentType ? { contentType: file.contentType } : {}), size: file.size } : null;
  },
});

export const forget = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.system.get("_storage", args.storageId)) await ctx.storage.delete(args.storageId);
    return null;
  },
});

const draft = v.object({
  title: v.string(),
  priceUnit: v.string(),
  price: v.number(),
  quantities: v.record(v.string(), v.number()),
  includes: v.array(v.string()),
  taxIncluded: v.union(v.boolean(), v.null()),
});

export const read = action({
  args: { category: v.string(), text: v.optional(v.string()), storageId: v.optional(v.id("_storage")) },
  returns: v.object({ packages: v.array(draft), fromPhoto: v.boolean() }),
  handler: async (ctx, args): Promise<{ packages: PackageDraft[]; fromPhoto: boolean }> => {
    const userId = await requireActionUserId(ctx);
    // Someone else's upload is refused here, before it can be read or deleted.
    if (args.storageId) await ctx.runMutation(internal.uploads.claim, { storageId: args.storageId, userId });
    // A photo is never kept, whatever happens below.
    const forgetPhoto = async (): Promise<void> => {
      if (args.storageId) await ctx.runMutation(internal.marketplace.priceList.forget, { storageId: args.storageId });
    };
    try {
      const who: { categories: string[]; isGuest: boolean } | null = await ctx.runQuery(internal.marketplace.priceList.caller, { userId });
      if (!who) throw new ConvexError("Set up your business on PlusOne Partner first.");
      if (!who.categories.includes(args.category)) throw new ConvexError("Add that kind of service to your profile first.");
      const sheet = sheetFor(args.category);
      if (!sheet) throw new ConvexError("This kind of service is priced one way only, so add its price below.");
      const text = args.text?.trim() ?? "";
      if (!text && !args.storageId) throw new ConvexError("Paste your price list, or add a photo of it.");
      if (text.length > MAX_TEXT) throw new ConvexError("That's longer than a price list. Paste up to 6,000 characters.");

      const parts: Part[] = [];
      if (args.storageId) {
        const info: { contentType?: string; size: number } | null = await ctx.runQuery(internal.marketplace.priceList.photoInfo, { storageId: args.storageId });
        if (!info || !PHOTO_TYPES.has(info.contentType ?? "") || info.size > MAX_PHOTO_BYTES) {
          throw new ConvexError("Add a photo of the price list (JPEG, PNG or WebP), up to 6 MB.");
        }
        const blob = await ctx.storage.get(args.storageId);
        if (!blob) throw new ConvexError("That photo didn't arrive. Try adding it again.");
        parts.push({ type: "file", data: new Uint8Array(await blob.arrayBuffer()), mediaType: info.contentType as string });
      }

      const mine = await rateLimiter.limit(ctx, who.isGuest ? "priceListReadDemo" : "priceListRead", { key: userId });
      if (!mine.ok) throw new ConvexError("That's as many price lists as we can read today. Add your prices by hand, or try tomorrow.");
      const all = await rateLimiter.limit(ctx, "priceListReadAll");
      if (!all.ok) throw new ConvexError("That's as many price lists as we can read today. Add your prices by hand, or try tomorrow.");

      parts.push({ type: "text", text: text ? `The price list:\n${text}` : "The price list is in the photo." });
      const { object } = await generateObject({
        ctx,
        feature: "priceListRead",
        model: MODEL_FAST,
        provider: "spark_open",
        effort: "low",
        maxOutputTokens: 8000,
        system: priceListInstructions(args.category, sheet),
        messages: [{ role: "user", content: parts }],
        schema: priceListSchema,
      });
      // A typed list is checked against its own numbers; a photo's prices are left for the vendor to check.
      return { packages: keepPackages(object, sheet, text && !args.storageId ? text : null), fromPhoto: Boolean(args.storageId) };
    } finally {
      await forgetPhoto();
    }
  },
});
