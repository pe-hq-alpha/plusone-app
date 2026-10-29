import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalQuery, mutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { requireActionUserId, requireUserId } from "./lib/auth";
import { MetaError } from "./lib/meta";
import { voiceCostUsd } from "./lib/modelCost";
import { transcribe as voiceTranscribe, type VoiceOptions, type VoiceResult } from "./lib/voice";
import { VOICE_WORDS } from "./lib/voiceWords";
import { wavInfo } from "./lib/wav";
import { rateLimiter } from "./rateLimits";

/**
 * Speaking the plan: the browser records a voice note, uploads it as a WAV, and `transcribe`
 * turns it into words for the person to check and send. The recording is deleted once it has
 * been read, whatever happens, and the words go back to the browser only.
 */

const UNAVAILABLE = "Speaking the plan isn't available right now. Type it instead.";
const NOT_HEARD = "We couldn't hear that. Try again, or type it.";
// Two minutes of 16 kHz mono WAV is 3.84 MB; anything much bigger didn't come from our recorder.
const MAX_BYTES = 5 * 1024 * 1024;
/** A call with a vendor runs longer: up to 10 minutes of 16 kHz mono is about 19 MB. */
const MAX_CALL_BYTES = 20 * 1024 * 1024;

/**
 * Each voice note spends one from the person's allowance (a guest's is small, per day) and one
 * from everyone's daily total when it's transcribed, since that's the paid call. The upload only
 * checks there's some left, so a note is never counted twice.
 */
async function allowance(ctx: ActionCtx | MutationCtx, userId: Id<"users">, isGuest: boolean, spend: boolean) {
  const own = isGuest ? "voiceDemo" : "voice";
  const mine = spend ? await rateLimiter.limit(ctx, own, { key: userId }) : await rateLimiter.check(ctx, own, { key: userId });
  if (!mine.ok) {
    throw new ConvexError(
      isGuest
        ? "That's as many voice notes as the demo allows today. Type it instead."
        : "That's a lot of voice notes in a short time. Type it instead, or try again in a little while.",
    );
  }
  const all = spend ? await rateLimiter.limit(ctx, "voiceAll") : await rateLimiter.check(ctx, "voiceAll");
  if (!all.ok) throw new ConvexError(UNAVAILABLE);
}

/** A one-off upload URL for a voice note. Anyone signed in may ask, demo guests included. */
export const uploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    await allowance(ctx, userId, Boolean(user?.isAnonymous), false);
    return await ctx.storage.generateUploadUrl();
  },
});

/** For `transcribe`, which has no db: who's speaking, whether they may plan the event, and what the file is. */
export const prepare = internalQuery({
  args: { userId: v.id("users"), storageId: v.id("_storage"), eventId: v.optional(v.id("events")), call: v.optional(v.boolean()) },
  returns: v.object({ isGuest: v.boolean(), canPlan: v.boolean(), isVoiceNote: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    let canPlan = true;
    if (args.eventId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_eventId_and_userId", (q) => q.eq("eventId", args.eventId!).eq("userId", args.userId))
        .unique();
      canPlan = member?.role === "planner" || member?.role === "owner";
    }
    const file = await ctx.db.system.get("_storage", args.storageId);
    return {
      isGuest: Boolean(user?.isAnonymous),
      canPlan,
      // A file stored without a type is judged by its header once it's read.
      isVoiceNote: Boolean(file) && (file?.contentType ?? "audio/wav") === "audio/wav" && (file?.size ?? 0) <= (args.call ? MAX_CALL_BYTES : MAX_BYTES),
    };
  },
});

function isWav(bytes: Uint8Array): boolean {
  try {
    wavInfo(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Muse Voice Transcribe, tried once more when Meta says it's busy. There is no other provider
 * for voice. A call is heard with diarization, so each turn says which speaker said it.
 */
async function listen(bytes: Uint8Array, call: boolean): Promise<VoiceResult> {
  const options: VoiceOptions = { mode: call ? "DIARIZATION" : "PUSH_TO_TALK", languageBias: ["Tamil", "English"], keywords: VOICE_WORDS };
  try {
    return await voiceTranscribe(bytes, options);
  } catch (error) {
    if (!(error instanceof MetaError && error.retryable)) throw error;
    const wait = Math.min(error.retryAfterMs ?? 0, 5000);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return await voiceTranscribe(bytes, options);
  }
}

/**
 * A voice note, or with `call`, the recording of a call with a vendor: heard with who said
 * what, so the vendor's spoken quote can be read into the sheet like a pasted message.
 */
export const transcribe = action({
  args: { storageId: v.id("_storage"), eventId: v.optional(v.id("events")), call: v.optional(v.boolean()) },
  returns: v.object({ text: v.string(), seconds: v.number(), turns: v.array(v.object({ speaker: v.optional(v.string()), text: v.string() })) }),
  handler: async (ctx, args): Promise<{ text: string; seconds: number; turns: { speaker?: string; text: string }[] }> => {
    const userId = await requireActionUserId(ctx);
    const call = args.call === true;
    const file = await ctx.runQuery(internal.voiceBrief.prepare, { userId, storageId: args.storageId, eventId: args.eventId, call });
    // Only a voice note is read or deleted here; any other file someone names is left alone.
    if (!file.isVoiceNote) throw new ConvexError(NOT_HEARD);
    const blob = await ctx.storage.get(args.storageId);
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    if (!bytes || !isWav(bytes)) throw new ConvexError(NOT_HEARD);
    try {
      if (!file.canPlan) throw new ConvexError("You are not a member of this event.");
      if (process.env.MODEL_PROVIDER !== "meta" || !process.env.MODEL_API_KEY) throw new ConvexError(UNAVAILABLE);
      await allowance(ctx, userId, file.isGuest, true);

      const started = Date.now();
      const result = await listen(bytes, call).catch(() => {
        throw new ConvexError(NOT_HEARD);
      });
      try {
        await ctx.runMutation(internal.modelCalls.record, {
          feature: call ? "vendorCall" : "voiceBrief",
          provider: "meta",
          model: result.model,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: voiceCostUsd(result.seconds),
          fellBack: false,
          ...(args.eventId ? { eventId: args.eventId } : {}),
          durationMs: Date.now() - started,
        });
      } catch (error) {
        console.warn(`Could not record the voiceBrief model call: ${error instanceof Error ? error.message : String(error)}`);
      }
      return {
        text: result.text,
        seconds: result.seconds,
        turns: result.turns.map((t) => ({ ...(t.speaker ? { speaker: t.speaker } : {}), text: t.text })),
      };
    } finally {
      // We never keep a recording, whatever happened above.
      await ctx.storage.delete(args.storageId).catch(() => undefined);
    }
  },
});
