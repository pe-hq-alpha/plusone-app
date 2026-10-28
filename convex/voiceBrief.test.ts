/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { voiceCostUsd } from "./lib/modelCost";
import { encodeWav } from "./lib/wav";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

function wav(seconds = 0.5, sampleRate: 16_000 | 24_000 = 16_000): Uint8Array {
  const ch = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < ch.length; i++) ch[i] = Math.sin((2 * Math.PI * 200 * i) / sampleRate) * 0.3;
  return encodeWav([ch], sampleRate, sampleRate);
}

async function storeWav(t: T, bytes: Uint8Array): Promise<Id<"_storage">> {
  return await t.run((ctx) => ctx.storage.store(new Blob([bytes as unknown as BlobPart], { type: "audio/wav" })));
}

function voiceReply(transcript = "Hello from Tamil") {
  return {
    transcript,
    audioDurationMs: 500,
    turns: [{ turnId: 1, startMs: 0, endMs: 500, transcript }],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("voiceBrief transcribe", () => {
  test("refuses without MODEL_PROVIDER=meta", async () => {
    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "a@example.com", name: "A" }));
    const bytes = wav();
    const storageId = await storeWav(t, bytes);
    const as = t.withIdentity({ subject: `${userId}|s` });
    await expect(as.action(api.voiceBrief.transcribe, { storageId })).rejects.toThrow("Speaking the plan isn't available");
    // File should be deleted even when provider is not set.
    const still = await t.run((ctx) => ctx.db.system.get("_storage", storageId));
    expect(still).toBeNull();
  });

  test("with meta set and fetch stubbed, returns text and seconds, writes modelCalls row and deletes file", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const transcript = "We need a mandapam for griha pravesam";
    const fetchFn = vi.fn(async () => Response.json(voiceReply(transcript)));
    vi.stubGlobal("fetch", fetchFn);

    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "a@example.com", name: "A" }));
    const bytes = wav(0.5, 16_000);
    const storageId = await storeWav(t, bytes);
    const as = t.withIdentity({ subject: `${userId}|s` });
    const result = await as.action(api.voiceBrief.transcribe, { storageId });
    expect(result.text).toBe(transcript);
    expect(result.seconds).toBeCloseTo(0.5, 2);

    // One modelCalls row
    const rows = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feature: "voiceBrief",
      provider: "meta",
      model: "muse-voice-transcribe-1.0",
      inputTokens: 0,
      outputTokens: 0,
      fellBack: false,
    });
    expect(rows[0].costUsd).toBeCloseTo(voiceCostUsd(0.5));

    const gone = await t.run((ctx) => ctx.db.system.get("_storage", storageId));
    expect(gone).toBeNull();
    expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  });

  test("deletes the file even when Meta returns 400", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => new Response("bad request", { status: 400 }));

    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "a@example.com" }));
    const storageId = await storeWav(t, wav(0.2));
    const as = t.withIdentity({ subject: `${userId}|s` });
    await expect(as.action(api.voiceBrief.transcribe, { storageId })).rejects.toThrow("We couldn't hear that");
    expect(await t.run((ctx) => ctx.db.system.get("_storage", storageId))).toBeNull();
  });

  test("retries once on retryable error", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
        return Response.json(voiceReply("retried"));
      }),
    );

    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "a@example.com" }));
    const storageId = await storeWav(t, wav(0.2));
    const result = await t.withIdentity({ subject: `${userId}|s` }).action(api.voiceBrief.transcribe, { storageId });
    expect(result.text).toBe("retried");
    expect(calls).toBe(2);
  });

  test("a demo guest is refused after 6 in a day", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => Response.json(voiceReply("hi")));

    const t = setup();
    const guestId = await t.run((ctx) => ctx.db.insert("users", { isAnonymous: true }));
    const as = t.withIdentity({ subject: `${guestId}|s` });

    for (let i = 0; i < 6; i++) {
      const id = await storeWav(t, wav(0.1));
      await as.action(api.voiceBrief.transcribe, { storageId: id });
    }
    const seventh = await storeWav(t, wav(0.1));
    await expect(as.action(api.voiceBrief.transcribe, { storageId: seventh })).rejects.toThrow(/demo allows/);
    // Rate-limited file should also be deleted
    expect(await t.run((ctx) => ctx.db.system.get("_storage", seventh))).toBeNull();
  });

  test("each note counts once: a guest gets all 6 through the upload, then the upload is refused", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => Response.json(voiceReply("hi")));

    const t = setup();
    const guestId = await t.run((ctx) => ctx.db.insert("users", { isAnonymous: true }));
    const as = t.withIdentity({ subject: `${guestId}|s` });

    for (let i = 0; i < 6; i++) {
      await as.mutation(api.voiceBrief.uploadUrl, {});
      const id = await storeWav(t, wav(0.1));
      expect((await as.action(api.voiceBrief.transcribe, { storageId: id })).text).toBe("hi");
    }
    await expect(as.mutation(api.voiceBrief.uploadUrl, {})).rejects.toThrow(/demo allows/);
  });

  test("a file that isn't a voice note is neither read nor deleted", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const fetchFn = vi.fn(async () => Response.json(voiceReply("hi")));
    vi.stubGlobal("fetch", fetchFn);

    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "a@example.com" }));
    const photo = await t.run((ctx) => ctx.storage.store(new Blob(["not audio"], { type: "image/png" })));
    await expect(t.withIdentity({ subject: `${userId}|s` }).action(api.voiceBrief.transcribe, { storageId: photo })).rejects.toThrow(
      "We couldn't hear that",
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.system.get("_storage", photo))).not.toBeNull();
  });

  test("a user who isn't a member can't transcribe for someone else's event", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => Response.json(voiceReply("hi")));

    const t = setup();
    const { ownerId, strangerId, eventId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { email: "owner@example.com" });
      const strangerId = await ctx.db.insert("users", { email: "stranger@example.com" });
      const eventId = await ctx.db.insert("events", {
        name: "Test",
        host: "Owner",
        coHost: "",
        startDate: "2027-01-01",
        endDate: "2027-01-01",
        city: "Chennai",
        currency: "INR",
        totalBudget: 100000,
        eventType: "birthday",
        createdBy: ownerId,
      });
      await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
      return { ownerId, strangerId, eventId };
    });
    const storageId = await storeWav(t, wav(0.1));
    await expect(
      t.withIdentity({ subject: `${strangerId}|s` }).action(api.voiceBrief.transcribe, { storageId, eventId }),
    ).rejects.toThrow(/not a member/);
    // Also gone after auth failure
    expect(await t.run((ctx) => ctx.db.system.get("_storage", storageId))).toBeNull();
  });

  test("transcribe for own event succeeds and records eventId", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => Response.json(voiceReply("for my event")));

    const t = setup();
    const { userId, eventId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const eventId = await ctx.db.insert("events", {
        name: "Test",
        host: "Owner",
        coHost: "",
        startDate: "2027-01-01",
        endDate: "2027-01-01",
        city: "Chennai",
        currency: "INR",
        totalBudget: 100000,
        eventType: "birthday",
        createdBy: userId,
      });
      await ctx.db.insert("members", { eventId, userId, role: "owner" });
      return { userId, eventId };
    });
    const storageId = await storeWav(t, wav(0.3));
    const result = await t.withIdentity({ subject: `${userId}|s` }).action(api.voiceBrief.transcribe, { storageId, eventId });
    expect(result.text).toBe("for my event");
    const rows = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(rows[0].eventId).toBe(eventId);
  });
});

describe("voiceCostUsd", () => {
  test("rounds up to whole seconds", () => {
    expect(voiceCostUsd(0)).toBe(0);
    expect(voiceCostUsd(0.1)).toBeCloseTo(0.18 / 3600);
    expect(voiceCostUsd(1)).toBeCloseTo(0.18 / 3600);
    expect(voiceCostUsd(1.1)).toBeCloseTo((2 * 0.18) / 3600);
    expect(voiceCostUsd(61)).toBeCloseTo((61 * 0.18) / 3600);
  });
});
