import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx, query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { SAM_USD_PER_IMAGE } from "./lib/modelCost";
import { generateObject, MODEL_FAST } from "./lib/models";
import { samSegment, type SamObject } from "./lib/sam";
import {
  FIND_STAGE_INSTRUCTIONS,
  MAX_VENUE_PHOTO_BYTES,
  MAX_VENUE_SIDE,
  objectsFor,
  partsFrom,
  SAMPLE_HALL,
  stageFinding,
  tapKey,
  tapObject,
  VENUE_PHOTO_TYPES,
  type VenuePart,
} from "./lib/venue";
import { rateLimiter } from "./rateLimits";
import { venueParts } from "./schema";

/**
 * "See it on your venue". A family adds a photo of their hall, or tries the sample hall;
 * Muse Spark finds the stage and the wall behind it, SAM 3.1 cuts both out, and the page
 * dresses them in a look. A tap on the photo re-cuts one part. Masks are cached by image
 * and prompt, so the sample hall is paid for once for every guest who tries it.
 */

const part = v.union(v.literal("backdrop"), v.literal("stage"));
const LIMIT_MESSAGE = "That's as many tries on the photo as we can do today. Try again tomorrow.";

/** A view's run of SAM (and Muse Spark) counts against the person's limit and everyone's. */
async function spend(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  const mine = await rateLimiter.limit(ctx, user?.isAnonymous ? "venueSamDemo" : "venueSam", { key: userId });
  if (!mine.ok) throw new ConvexError(LIMIT_MESSAGE);
  const all = await rateLimiter.limit(ctx, "venueSamAll");
  if (!all.ok) throw new ConvexError(LIMIT_MESSAGE);
}

async function viewOf(ctx: MutationCtx, eventId: Id<"events">): Promise<Doc<"venueViews"> | null> {
  return await ctx.db.query("venueViews").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).first();
}

/** Put a photo in place of the event's last one, and start finding its stage. */
async function replacePhoto(
  ctx: MutationCtx,
  eventId: Id<"events">,
  photo: { storageId?: Id<"_storage">; imageKey: string; width: number; height: number },
) {
  const old = await viewOf(ctx, eventId);
  if (old) {
    await ctx.db.delete(old._id);
    if (old.storageId && old.storageId !== photo.storageId) await ctx.storage.delete(old.storageId);
  }
  const viewId = await ctx.db.insert("venueViews", { eventId, ...photo, status: "finding", parts: {}, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.venueView.find, { viewId });
  return viewId;
}

/** The event's hall photo and what was cut out of it, or null before one is added. */
export const get = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("venueViews"),
      url: v.union(v.string(), v.null()),
      sample: v.boolean(),
      width: v.number(),
      height: v.number(),
      status: v.union(v.literal("finding"), v.literal("ready"), v.literal("none"), v.literal("failed")),
      parts: venueParts,
      source: v.optional(v.union(v.literal("found"), v.literal("tapped"))),
    }),
  ),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    const view = await ctx.db.query("venueViews").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).first();
    if (!view) return null;
    return {
      _id: view._id,
      url: view.storageId ? await ctx.storage.getUrl(view.storageId) : SAMPLE_HALL.url,
      sample: !view.storageId,
      width: view.width,
      height: view.height,
      status: view.status,
      parts: view.parts,
      ...(view.source ? { source: view.source } : {}),
    };
  },
});

export const generateUploadUrl = mutation({
  args: { eventId: v.id("events") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Use the family's own hall photo. Its size is measured in the browser, and checked here. */
export const setPhoto = mutation({
  args: { eventId: v.id("events"), storageId: v.id("_storage"), width: v.number(), height: v.number() },
  returns: v.id("venueViews"),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    const file = await ctx.db.system.get("_storage", args.storageId);
    const sized = [args.width, args.height].every((n) => Number.isInteger(n) && n >= 200 && n <= MAX_VENUE_SIDE);
    if (!file || !VENUE_PHOTO_TYPES.has(file.contentType ?? "") || file.size > MAX_VENUE_PHOTO_BYTES || !sized) {
      if (file) await ctx.storage.delete(args.storageId);
      throw new ConvexError("Add a photo of the hall (JPEG, PNG or WebP), up to 8 MB.");
    }
    await spend(ctx, userId);
    return await replacePhoto(ctx, args.eventId, { storageId: args.storageId, imageKey: file.sha256, width: args.width, height: args.height });
  },
});

/** Try it on the sample hall: our own photo of an empty hall with a bare stage. */
export const useSample = mutation({
  args: { eventId: v.id("events") },
  returns: v.id("venueViews"),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    await spend(ctx, userId);
    return await replacePhoto(ctx, args.eventId, { imageKey: SAMPLE_HALL.key, width: SAMPLE_HALL.width, height: SAMPLE_HALL.height });
  },
});

/** A tap on the photo, in the image's own pixels, re-cuts one part around that point. */
export const tap = mutation({
  args: { eventId: v.id("events"), part, x: v.number(), y: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    const view = await viewOf(ctx, args.eventId);
    if (!view) throw new ConvexError("Add a photo of the hall first.");
    if (view.status === "finding") throw new ConvexError("Still working on the last one. Give it a moment.");
    if (!(args.x >= 0 && args.x <= view.width && args.y >= 0 && args.y <= view.height)) throw new ConvexError("Tap inside the photo.");
    await spend(ctx, userId);
    await ctx.db.patch(view._id, { status: "finding", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.venueView.segmentAt, { viewId: view._id, part: args.part, x: args.x, y: args.y });
    return null;
  },
});

// ---------------------------------------------------------------- the background runs

const loaded = v.object({
  eventId: v.id("events"),
  imageKey: v.string(),
  url: v.string(),
  width: v.number(),
  height: v.number(),
  parts: venueParts,
});

export const load = internalQuery({
  args: { viewId: v.id("venueViews") },
  returns: v.union(v.null(), loaded),
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.viewId);
    if (!view) return null;
    const url = view.storageId ? await ctx.storage.getUrl(view.storageId) : SAMPLE_HALL.url;
    if (!url) return null;
    return { eventId: view.eventId, imageKey: view.imageKey, url, width: view.width, height: view.height, parts: view.parts };
  },
});

export const cached = internalQuery({
  args: { imageKey: v.string(), promptKey: v.string() },
  returns: v.union(v.null(), venueParts),
  handler: async (ctx, args) => {
    const hit = await ctx.db
      .query("segmentCache")
      .withIndex("by_imageKey_and_promptKey", (q) => q.eq("imageKey", args.imageKey).eq("promptKey", args.promptKey))
      .first();
    return hit?.parts ?? null;
  },
});

/** Write what was found, and keep it for the next person with the same photo and prompt. */
export const save = internalMutation({
  args: {
    viewId: v.id("venueViews"),
    status: v.union(v.literal("ready"), v.literal("none"), v.literal("failed")),
    parts: venueParts,
    source: v.optional(v.union(v.literal("found"), v.literal("tapped"))),
    cache: v.optional(v.object({ imageKey: v.string(), promptKey: v.string(), parts: venueParts })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.cache) {
      const { imageKey, promptKey } = args.cache;
      const old = await ctx.db
        .query("segmentCache")
        .withIndex("by_imageKey_and_promptKey", (q) => q.eq("imageKey", imageKey).eq("promptKey", promptKey))
        .first();
      if (!old) await ctx.db.insert("segmentCache", { ...args.cache, at: Date.now() });
    }
    // A photo replaced while this ran leaves nothing to write to.
    const view = await ctx.db.get(args.viewId);
    if (!view) return null;
    await ctx.db.patch(view._id, {
      status: args.status,
      parts: args.parts,
      ...(args.source ? { source: args.source } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Run SAM 3.1 on the photo with these objects and write its cost row against the event. */
async function cutOut(
  ctx: { runMutation: Parameters<typeof generateObject>[0]["ctx"]["runMutation"] },
  view: { eventId: Id<"events">; url: string; width: number; height: number },
  objects: SamObject[],
) {
  const started = Date.now();
  const segments = await samSegment({ prompt: { objects }, image: { url: view.url, width: view.width, height: view.height } });
  await ctx.runMutation(internal.modelCalls.record, {
    feature: "venueCutOut",
    provider: "meta",
    model: "sam-3.1",
    inputTokens: 0,
    outputTokens: 0,
    costUsd: SAM_USD_PER_IMAGE,
    fellBack: false,
    eventId: view.eventId,
    durationMs: Date.now() - started,
  });
  return partsFrom(segments);
}

/** Find the stage and the wall behind it: Muse Spark boxes them, SAM 3.1 cuts them out. */
export const find = internalAction({
  args: { viewId: v.id("venueViews") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const view = await ctx.runQuery(internal.venueView.load, { viewId: args.viewId });
    if (!view) return null;
    const hit = await ctx.runQuery(internal.venueView.cached, { imageKey: view.imageKey, promptKey: "find" });
    if (hit) {
      const found = Object.keys(hit).length > 0;
      await ctx.runMutation(internal.venueView.save, { viewId: args.viewId, status: found ? "ready" : "none", parts: hit, source: "found" });
      return null;
    }
    try {
      const { object } = await generateObject({
        ctx,
        feature: "findStage",
        eventId: view.eventId,
        model: MODEL_FAST,
        effort: "low",
        system: FIND_STAGE_INSTRUCTIONS,
        messages: [
          {
            role: "user",
            content: [
              { type: "file", data: new URL(view.url), mediaType: "image/jpeg" },
              { type: "text", text: "Find the stage and the backdrop in this hall." },
            ],
          },
        ],
        schema: stageFinding,
      });
      const objects = objectsFor(object, view.width, view.height);
      const parts = objects.length > 0 ? await cutOut(ctx, view, objects) : {};
      const found = Object.keys(parts).length > 0;
      await ctx.runMutation(internal.venueView.save, {
        viewId: args.viewId,
        status: found ? "ready" : "none",
        parts,
        source: "found",
        cache: { imageKey: view.imageKey, promptKey: "find", parts },
      });
    } catch (error) {
      console.error(`Finding the stage in ${args.viewId} failed: ${error instanceof Error ? error.message : String(error)}`);
      await ctx.runMutation(internal.venueView.save, { viewId: args.viewId, status: "failed", parts: view.parts });
    }
    return null;
  },
});

/** Re-cut one part around a tap, keeping the other part as it was. */
export const segmentAt = internalAction({
  args: { viewId: v.id("venueViews"), part, x: v.number(), y: v.number() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const view = await ctx.runQuery(internal.venueView.load, { viewId: args.viewId });
    if (!view) return null;
    const which = args.part as VenuePart;
    const promptKey = tapKey(which, args.x, args.y, view.width, view.height);
    try {
      let cut = await ctx.runQuery(internal.venueView.cached, { imageKey: view.imageKey, promptKey });
      const fresh = !cut;
      if (!cut) cut = await cutOut(ctx, view, [tapObject(which, args.x, args.y, view.width, view.height)]);
      const mask = cut[which];
      // A tap SAM found nothing at keeps what was there.
      const parts = mask ? { ...view.parts, [which]: mask } : view.parts;
      await ctx.runMutation(internal.venueView.save, {
        viewId: args.viewId,
        status: Object.keys(parts).length > 0 ? "ready" : "none",
        parts,
        source: "tapped",
        ...(fresh ? { cache: { imageKey: view.imageKey, promptKey, parts: cut } } : {}),
      });
    } catch (error) {
      console.error(`Cutting out the ${which} in ${args.viewId} failed: ${error instanceof Error ? error.message : String(error)}`);
      await ctx.runMutation(internal.venueView.save, { viewId: args.viewId, status: Object.keys(view.parts).length > 0 ? "ready" : "failed", parts: view.parts });
    }
    return null;
  },
});
