import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "../_generated/server";
import { requireStaff } from "../lib/auth";
import { extractJsonText, glimmerComplete } from "../lib/glimmer";
import { MetaError } from "../lib/meta";
import { glimmerCostUsd } from "../lib/modelCost";
import { MODEL_FAST, generateObject, parseAnswer } from "../lib/models";
import { keepKnownTags, photoFlags, PHOTO_INSTRUCTIONS, tagsFor, type PhotoTag } from "../lib/photoTags";
import { rateLimiter } from "../rateLimits";
import { vendorPhotoCheck } from "../schema";
import { requireVendor } from "./vendors";

/**
 * Photos of a vendor's past work. A vendor adds up to 12; each is checked in the
 * background, by Muse Glimmer where it runs and by Muse Spark otherwise, and only
 * shows to customers once checked clean or approved in Ops. Ops removes rather than
 * deletes, so a decision can always be revisited. A person decides; software flags.
 */

const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FAILED_MESSAGE = "We couldn't check this photo. Try adding it again in a while.";
/** A check still running after this has died with its action (Convex stops one at ten minutes), so it shows as failed. */
const CHECKING_MS = 12 * 60_000;

/** What the bytes are: JPEG, PNG and WebP announce themselves in their first bytes. */
function sniffPhotoType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

const status = v.union(v.literal("checking"), v.literal("checked"), v.literal("failed"));
const decision = v.union(v.literal("approved"), v.literal("removed"));

export const photoCheckSchema = z.object({
  realWork: z.boolean(),
  stock: z.boolean(),
  watermark: z.boolean(),
  faces: z.boolean(),
  unsafe: z.boolean(),
  // At least a short sentence: Glimmer once answered "..." (29 Oct). The JSON schema carries the minimum to the endpoint.
  shows: z.string().min(10).max(300),
  tags: z.array(z.string()).max(5),
  doubt: z.string().max(500).optional(),
});

/** What the photo is from and which tags to choose, in plain words. */
export function photoPrompt(profileName: string, allowed: PhotoTag[]): string {
  return (
    `The photo is from the past work of "${profileName}". Its own name on the photo is fine; another business's name is not.\n\n` +
    `Tag it with up to 5 of these, by key:\n${allowed.map((t) => `- ${t.key}: ${t.label}`).join("\n")}`
  );
}

/** A one-off upload URL for a work photo. The caller must run a listing. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireVendor(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Add one uploaded photo to the caller's listing. It is checked in the background. */
export const add = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.id("vendorPhotos"),
  handler: async (ctx, args): Promise<Id<"vendorPhotos">> => {
    const { userId, profile } = await requireVendor(ctx);
    const held = await ctx.db
      .query("vendorPhotos")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .take(MAX_PHOTOS + 1);
    if (held.length >= MAX_PHOTOS) throw new ConvexError("Twelve photos are enough for a listing. Remove one to add another.");
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file || !PHOTO_TYPES.has(file.contentType ?? "") || file.size > MAX_PHOTO_BYTES) {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        // Already gone; the refusal below still stands.
      }
      throw new ConvexError("Add a photo (JPEG, PNG or WebP), up to 5 MB.");
    }
    const user = await ctx.db.get(userId);
    const mine = await rateLimiter.limit(ctx, user?.isAnonymous ? "vendorPhotoAddDemo" : "vendorPhotoAdd", { key: userId });
    if (!mine.ok) throw new ConvexError("You've added as many photos as you can today. Try again tomorrow.");
    const all = await rateLimiter.limit(ctx, "vendorPhotoAddAll");
    if (!all.ok) throw new ConvexError("You've added as many photos as you can today. Try again tomorrow.");
    const photoId = await ctx.db.insert("vendorPhotos", {
      profileId: profile._id,
      storageId: args.storageId,
      addedBy: userId,
      addedAt: Date.now(),
      status: "checking",
    });
    await ctx.scheduler.runAfter(0, internal.marketplace.photos.run, { photoId });
    return photoId;
  },
});

/** Remove a photo from the caller's own listing, with its file. */
export const remove = mutation({
  args: { photoId: v.id("vendorPhotos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireVendor(ctx);
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.profileId !== profile._id) throw new ConvexError("That photo isn't yours to remove.");
    await ctx.db.delete(photo._id);
    try {
      await ctx.storage.delete(photo.storageId);
    } catch {
      // The file is already gone; the row is what mattered.
    }
    return null;
  },
});

const tagView = v.object({ key: v.string(), label: v.string() });
const flagView = v.object({ key: v.string(), text: v.string() });

const photoView = v.object({
  _id: v.id("vendorPhotos"),
  url: v.union(v.string(), v.null()),
  status,
  tags: v.array(tagView),
  flags: v.array(flagView),
  review: v.union(decision, v.null()),
});

const opsPhotoView = v.object({
  ...photoView.fields,
  shows: v.optional(v.string()),
  doubt: v.optional(v.string()),
  provider: v.optional(v.union(v.literal("glimmer"), v.literal("spark"))),
});

async function photosFor(ctx: QueryCtx, profileId: Id<"vendorProfiles">) {
  const profile = await ctx.db.get(profileId);
  if (!profile) throw new ConvexError("That listing is no longer there.");
  const allowed = tagsFor(profile.categories);
  const labelOf = new Map(allowed.map((t) => [t.key, t.label] as const));
  const photos = await ctx.db.query("vendorPhotos").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).order("desc").take(50);
  return await Promise.all(
    photos.map(async (photo) => ({
      _id: photo._id,
      url: await ctx.storage.getUrl(photo.storageId),
      status: photo.status === "checking" && Date.now() - photo.addedAt > CHECKING_MS ? ("failed" as const) : photo.status,
      tags: (photo.check?.tags ?? []).map((key) => ({ key, label: labelOf.get(key) ?? key })),
      flags: photo.check ? photoFlags(photo.check) : [],
      review: photo.review?.decision ?? null,
      shows: photo.check?.shows,
      doubt: photo.check?.doubt,
      provider: photo.check?.provider,
    })),
  );
}

/** The caller's listing's photos, newest first, with what the check found on each. */
export const mine = query({
  args: {},
  returns: v.array(photoView),
  handler: async (ctx) => {
    const { profile } = await requireVendor(ctx);
    return (await photosFor(ctx, profile._id)).map(({ _id, url, status, tags, flags, review }) => ({ _id, url, status, tags, flags, review }));
  },
});

/** Any listing's photos for Ops, with what each shows and which check read it. */
export const forOps = query({
  args: { profileId: v.id("vendorProfiles") },
  returns: v.array(opsPhotoView),
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await photosFor(ctx, args.profileId);
  },
});

/** Approve a photo or remove it from what customers see. Removing keeps the file. */
export const review = mutation({
  args: { photoId: v.id("vendorPhotos"), decision },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const photo = await ctx.db.get(args.photoId);
    if (!photo) throw new ConvexError("That photo is no longer there.");
    await ctx.db.patch(photo._id, { review: { decision: args.decision, reviewedBy: userId, reviewedAt: Date.now() } });
    return null;
  },
});

/** The photo, its listing's name and categories, and the tags it may carry. Null when either is gone. */
export const load = internalQuery({
  args: { photoId: v.id("vendorPhotos") },
  returns: v.union(
    v.null(),
    v.object({
      storageId: v.id("_storage"),
      profileName: v.string(),
      categories: v.array(v.string()),
      prompt: v.string(),
      allowed: v.array(v.object({ key: v.string(), label: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return null;
    const profile = await ctx.db.get(photo.profileId);
    if (!profile) return null;
    const allowed = tagsFor(profile.categories);
    return {
      storageId: photo.storageId,
      profileName: profile.name,
      categories: profile.categories,
      prompt: photoPrompt(profile.name, allowed),
      allowed,
    };
  },
});

const glimmerCost = v.object({
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
  durationMs: v.number(),
});

/** Write the check's result, with one cost row when Glimmer read it. */
export const checked = internalMutation({
  args: { photoId: v.id("vendorPhotos"), check: vendorPhotoCheck, glimmer: v.optional(glimmerCost) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return null;
    await ctx.db.patch(photo._id, { status: "checked", check: args.check, failure: undefined });
    if (args.glimmer) {
      await ctx.db.insert("modelCalls", {
        feature: "vendorPhotoCheck",
        provider: "glimmer",
        model: "muse-glimmer-30b",
        inputTokens: args.glimmer.inputTokens,
        outputTokens: args.glimmer.outputTokens,
        costUsd: args.glimmer.costUsd,
        fellBack: false,
        durationMs: args.glimmer.durationMs,
      });
    }
    return null;
  },
});

/** Mark the photo failed, in words the vendor reads. */
export const failed = internalMutation({
  args: { photoId: v.id("vendorPhotos"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return null;
    await ctx.db.patch(photo._id, { status: "failed", failure: args.error });
    return null;
  },
});

/**
 * The background run: read the file into bytes, check it on Glimmer where the endpoint
 * runs, and on Muse Spark when there is no endpoint or Glimmer's failure says to fall
 * back. A photo deleted while it runs is skipped quietly.
 */
export const run = internalAction({
  args: { photoId: v.id("vendorPhotos") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const loaded = await ctx.runQuery(internal.marketplace.photos.load, { photoId: args.photoId });
    // A photo deleted while it runs leaves nothing to check, so it is skipped quietly.
    if (!loaded) return null;
    const blob = await ctx.storage.get(loaded.storageId);
    if (!blob) {
      await ctx.runMutation(internal.marketplace.photos.failed, { photoId: args.photoId, error: FAILED_MESSAGE });
      return null;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mediaType = blob.type || sniffPhotoType(bytes) || "";
    if (process.env.GLIMMER_BASE_URL) {
      try {
        const result = await glimmerComplete(
          { images: [{ data: bytes, mediaType }], prompt: loaded.prompt, schema: photoCheckSchema },
          process.env,
          fetch,
        );
        const object = parseAnswer(extractJsonText(result.text), photoCheckSchema);
        const tags = keepKnownTags(object.tags, loaded.allowed);
        await ctx.runMutation(internal.marketplace.photos.checked, {
          photoId: args.photoId,
          check: { ...object, tags, provider: "glimmer", model: result.model, checkedAt: Date.now() },
          glimmer: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            costUsd: glimmerCostUsd(result.ms / 1000),
            durationMs: Math.round(result.ms),
          },
        });
        return null;
      } catch (error) {
        // Muse Spark takes over from an outage, a cold start that ran out of time or an
        // answer it couldn't read; only a request Glimmer found malformed fails the photo.
        console.warn(`Photo check ${args.photoId} moved to Muse Spark: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof MetaError && !error.fallback) {
          console.error(`Photo check ${args.photoId} failed: ${error instanceof Error ? error.message : String(error)}`);
          await ctx.runMutation(internal.marketplace.photos.failed, { photoId: args.photoId, error: FAILED_MESSAGE });
          return null;
        }
      }
    }
    try {
      const { object, model } = await generateObject({
        ctx,
        feature: "vendorPhotoCheck",
        model: MODEL_FAST,
        effort: "low",
        system: PHOTO_INSTRUCTIONS,
        messages: [
          {
            role: "user",
            content: [
              { type: "file", data: bytes, mediaType: mediaType || "image/jpeg" },
              { type: "text", text: loaded.prompt },
            ],
          },
        ],
        schema: photoCheckSchema,
      });
      const tags = keepKnownTags(object.tags, loaded.allowed);
      await ctx.runMutation(internal.marketplace.photos.checked, {
        photoId: args.photoId,
        check: { ...object, tags, provider: "spark", model, checkedAt: Date.now() },
      });
    } catch (error) {
      console.error(`Photo check ${args.photoId} failed: ${error instanceof Error ? error.message : String(error)}`);
      await ctx.runMutation(internal.marketplace.photos.failed, { photoId: args.photoId, error: FAILED_MESSAGE });
    }
    return null;
  },
});
