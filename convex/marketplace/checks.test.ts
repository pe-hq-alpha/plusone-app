/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Keys come out mixed ("../schema" beside "./checks"); make them relative to convex/,
// which is what convex-test looks up.
const raw = import.meta.glob("../**/*.ts");
const modules: Record<string, () => Promise<unknown>> = Object.fromEntries(
  Object.entries(raw).map(([key, load]) => [
    key.startsWith("../") ? key.slice(3) : key.startsWith("./") ? `marketplace/${key.slice(2)}` : key,
    load as () => Promise<unknown>,
  ]),
);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function user(t: T, email: string, staffRole?: "admin" | "reviewer") {
  return await t.run(async (ctx) => await ctx.db.insert("users", { email, ...(staffRole ? { staffRole } : {}) }));
}

async function checkListing(t: T) {
  return await t.run(async (ctx) => {
    const city = "Chennai";
    return await ctx.db.insert("vendorProfiles", {
      name: "Lakshmi Caterers",
      categories: ["Catering"],
      city,
      cityKey: city.toLowerCase(),
      source: "vendor_signup",
      status: "pending",
      statusAt: 0,
      joinedAt: 0,
      completedEvents: 0,
    });
  });
}

function responseJson(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

function reportJson(url: string) {
  return JSON.stringify({
    checks: [
      { key: "identity", label: "The business exists", finding: "supports", note: "Found", sources: [{ title: "Lakshmi", url }] },
      { key: "website", label: "The website is theirs", finding: "supports", note: "Matches", sources: [{ title: "Lakshmi", url }] },
      { key: "contact", label: "Their contact details", finding: "supports", note: "Seen", sources: [{ title: "Lakshmi", url }] },
      { key: "location", label: "Where they work", finding: "supports", note: "Chennai", sources: [{ title: "Lakshmi", url }] },
      { key: "prices", label: "Their prices", finding: "supports", note: "Match", sources: [{ title: "Lakshmi", url }] },
      { key: "complaints", label: "Complaints", finding: "not_found", note: "None", sources: [] },
    ],
    summary: "All six checks look reasonable.",
  });
}

describe("running a vendor check", () => {
  test("a retryable error and then a refusal fails the check with the plain message and no spend", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValue(new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchFn);

    const t = setup();
    const profileId = await checkListing(t);
    const reviewer = await user(t, "ops-retry@example.com", "reviewer");
    // Inserted directly so no scheduled run fires beside the one under test.
    const checkId = await t.run(async (ctx) =>
      ctx.db.insert("vendorChecks", { profileId, requestedBy: reviewer, status: "running", startedAt: Date.now() }),
    );
    await t.action(internal.marketplace.checks.run, { checkId });

    // The 429 is retried once; the 400 refusal is not.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const latest = await as(t, reviewer).query(api.marketplace.checks.latest, { profileId });
    expect(latest).toMatchObject({ status: "failed", error: "The check couldn't finish. Try again in a while." });
    // No turn came back, so nothing was spent and no cost row was kept.
    expect(latest?.inputTokens).toBeUndefined();
    expect(await t.run(async (ctx) => await ctx.db.query("modelCalls").collect())).toHaveLength(0);
  });

  test("a run for a check that is gone does nothing and never calls the model", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const fetchFn = vi.fn(async () => responseJson({ id: "resp_1", output: [], usage: {} }));
    vi.stubGlobal("fetch", fetchFn);

    const t = setup();
    const profileId = await checkListing(t);
    const reviewer = await user(t, "ops-gone@example.com", "reviewer");
    const checkId = await as(t, reviewer).mutation(api.marketplace.checks.start, { profileId });
    await t.run(async (ctx) => await ctx.db.delete(checkId));

    await expect(t.action(internal.marketplace.checks.run, { checkId })).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => await ctx.db.query("modelCalls").collect())).toHaveLength(0);
  });

  test("a run for a check that is already done leaves it alone and never calls the model", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const url = "https://lakshmi.example/menu";
    const reply = {
      id: "resp_1",
      output: [
        { type: "web_search_call", id: "ws_1", status: "completed", results: [{ type: "text_result", title: "Lakshmi", url, snippet: "caterers" }] },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: reportJson(url), annotations: [] }] },
      ],
      usage: { input_tokens: 1000, output_tokens: 500 },
    };
    const fetchFn = vi.fn(async () => responseJson(reply));
    vi.stubGlobal("fetch", fetchFn);

    const t = setup();
    const profileId = await checkListing(t);
    const reviewer = await user(t, "ops-redo@example.com", "reviewer");
    const checkId = await as(t, reviewer).mutation(api.marketplace.checks.start, { profileId });
    await t.action(internal.marketplace.checks.run, { checkId });
    expect((await as(t, reviewer).query(api.marketplace.checks.latest, { profileId }))?.status).toBe("done");

    fetchFn.mockClear();
    await t.action(internal.marketplace.checks.run, { checkId });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
