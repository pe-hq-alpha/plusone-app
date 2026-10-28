/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { callRecord, costUsd } from "./lib/modelCost";
import { generateText } from "./lib/models";
import { RECORDED_RUN } from "./lib/recordedRun";
import { seedBirthday } from "./demoBirthday";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Meta on, with fetch answering every call with `content`. Nothing reaches the network. */
function metaAnswers(content: string) {
  vi.stubEnv("MODEL_PROVIDER", "meta");
  vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
  const fetchFn = vi.fn(async () =>
    Response.json({
      model: "muse-spark-1.3",
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 2_000, completion_tokens: 500 },
    }),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

describe("what a call costs", () => {
  it("prices Muse Spark and Muse Wonder at Meta's list rates", () => {
    expect(costUsd("muse-spark-1.3", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(5.5);
    expect(costUsd("muse-wonder-1.0", { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(4);
  });

  it("prices a long Haiku prompt at the higher rate", () => {
    expect(costUsd("claude-haiku-5-5", { inputTokens: 100_000, outputTokens: 0 })).toBeCloseTo(0.01);
    expect(costUsd("claude-haiku-5-5", { inputTokens: 200_000, outputTokens: 0 })).toBeCloseTo(0.1);
  });

  it("leaves the cost out for a model with no price", () => {
    const row = callRecord("planSearch", "claude", {
      text: "",
      provider: "claude",
      model: "claude-mystery-9",
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    expect(row).not.toHaveProperty("costUsd");
  });

  it("marks a call Claude answered after Meta was chosen", () => {
    const served = { text: "", provider: "claude" as const, model: "claude-haiku-5-5", usage: { inputTokens: 1, outputTokens: 1 } };
    expect(callRecord("readRsvp", "meta", served).fellBack).toBe(true);
    expect(callRecord("readRsvp", "claude", served).fellBack).toBe(false);
  });
});

describe("the cost record", () => {
  it("writes one row for a model call, with its feature, model, tokens and cost", async () => {
    const fetchFn = metaAnswers(
      JSON.stringify({ rsvp: "yes", attendingCount: 2, dietary: null, allergies: [], note: null, ceremonies: [], namedCeremonies: false }),
    );
    const t = convexTest(schema, modules);
    const reading = await t.action(internal.claude.readRsvpReply, {
      guestName: "Asha",
      partySize: 2,
      subject: "Re: invitation",
      body: "Both of us will be there.",
    });
    expect(reading.rsvp).toBe("yes");
    expect(fetchFn).toHaveBeenCalledOnce();

    const rows = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feature: "readRsvp",
      provider: "meta",
      model: "muse-spark-1.3",
      inputTokens: 2_000,
      outputTokens: 500,
      fellBack: false,
    });
    expect(rows[0].costUsd).toBeCloseTo((2_000 * 1.25 + 500 * 4.25) / 1_000_000);
  });

  it("still returns the answer when the row can't be written", async () => {
    metaAnswers("Warm and simple.");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = { runMutation: vi.fn(async () => Promise.reject(new Error("write failed"))) };
    const { text } = await generateText({ ctx, feature: "summariseStyle", model: "fast", prompt: "Describe the style." });
    expect(text).toBe("Warm and simple.");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("summariseStyle"));
    warn.mockRestore();
  });
});

describe("under the hood", () => {
  it("lists an event's calls, newest first, with the model, time and cost, to people on the event only", async () => {
    const t = convexTest(schema, modules);
    const { eventId, memberId, strangerId } = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("users", { email: "meera@example.com", name: "Meera" });
      const strangerId = await ctx.db.insert("users", { email: "someone@example.com", name: "Someone" });
      const eventId = await ctx.db.insert("events", {
        name: "Aarav's 1st birthday", host: "Meera", coHost: "", startDate: "2027-01-24", endDate: "2027-01-24", city: "Mumbai",
        currency: "INR", totalBudget: 300000, eventType: "birthday", createdBy: memberId,
      });
      await ctx.db.insert("members", { eventId, userId: memberId, role: "viewer" });
      return { eventId, memberId, strangerId };
    });
    const ctx = { runMutation: (_ref: unknown, row: Record<string, unknown>) => t.mutation(internal.modelCalls.record, row as never) };
    metaAnswers("Planned.");
    await generateText({ ctx: ctx as never, feature: "draftFirstPlan", eventId, model: "fast", prompt: "Plan it." });
    metaAnswers("Answered.");
    await generateText({ ctx: ctx as never, feature: "answerQuestion", eventId, model: "smart", prompt: "What next?" });

    const calls = await t.withIdentity({ subject: `${memberId}|s` }).query(api.modelCalls.forEvent, { eventId });
    expect(calls.map((c) => c.feature)).toEqual(["answerQuestion", "draftFirstPlan"]);
    expect(calls[0]).toMatchObject({ provider: "meta", model: "muse-spark-1.3", inputTokens: 2_000, outputTokens: 500, fellBack: false });
    expect(calls[0].durationMs).toBeGreaterThanOrEqual(0);
    await expect(t.withIdentity({ subject: `${strangerId}|s` }).query(api.modelCalls.forEvent, { eventId })).rejects.toThrow();
  });
});

const QUOTE_READING = JSON.stringify({
  classification: "quote", total: 66150, deposit: 15000, currency: "INR", availability: "free on the date", availableOnDates: "yes",
  includes: [], excludes: [], lines: [], headcountAssumed: 150, taxIncluded: true, deadline: null, summary: "₹66,150.",
  redFlags: [], attachmentKind: "none", pricesFromAttachment: false, optOut: false,
});

describe("the demo's recorded run", () => {
  it("reads each of a sample event's catering replies on Muse Spark, one recorded call each", async () => {
    const fetchFn = metaAnswers(QUOTE_READING);
    const t = convexTest(schema, modules);
    const eventId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "guest@example.com", name: "Guest" });
      return await seedBirthday(ctx, userId);
    });
    const readings = await t.action(internal.claude.readDemoQuotes, { eventId });
    expect(readings.map((r) => r.vendorName).sort()).toEqual(["Annam Caterers", "Kaveri Feast Co.", "Saapadu Kitchen"]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(readings.map((r) => r.call?.feature)).toEqual(Array(3).fill("readVendorReply"));
    const rows = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(rows.map((r) => [r.feature, r.eventId])).toEqual(Array(3).fill(["readVendorReply", eventId]));
  });

  it("shows on sample events only, as recorded steps with their date", async () => {
    const t = convexTest(schema, modules);
    const { userId, demoId, realId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "guest@example.com", name: "Guest" });
      const demoId = await seedBirthday(ctx, userId);
      const realId = await ctx.db.insert("events", {
        name: "Aarav's 1st birthday", host: "Meera", coHost: "", startDate: "2027-01-24", endDate: "2027-01-24", city: "Mumbai",
        currency: "INR", totalBudget: 300000, eventType: "birthday", createdBy: userId,
      });
      await ctx.db.insert("members", { eventId: realId, userId, role: "owner" });
      return { userId, demoId, realId };
    });
    const as = t.withIdentity({ subject: `${userId}|s` });
    const recorded = await as.query(api.modelCalls.recorded, { eventId: demoId });
    expect(recorded.length).toBe(RECORDED_RUN.calls.length);
    expect(recorded.map((r) => r.note)).toEqual(["Annam Caterers", "Saapadu Kitchen", "Kaveri Feast Co."]);
    for (const row of recorded) expect(row).toMatchObject({ provider: "meta", recordedOn: RECORDED_RUN.on });
    expect(await as.query(api.modelCalls.recorded, { eventId: realId })).toEqual([]);
  });
});
