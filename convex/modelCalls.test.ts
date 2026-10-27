/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { callRecord, costUsd } from "./lib/modelCost";
import { generateText } from "./lib/models";
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
