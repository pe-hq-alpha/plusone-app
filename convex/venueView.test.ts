/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MetaError } from "./lib/meta";
import type { SamSegment } from "./lib/sam";
import schema from "./schema";

// SAM's wire format is the parser's business (sam.test.ts); here only what comes back matters.
const samSegment = vi.hoisted(() => vi.fn());
vi.mock("./lib/sam", async (original) => ({ ...(await original<typeof import("./lib/sam")>()), samSegment }));

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function seed(t: T, opts: { guest?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", opts.guest ? { isAnonymous: true } : { email: "priya@example.com", name: "Priya" });
    const viewerId = await ctx.db.insert("users", { email: "dad@example.com", name: "Dad" });
    const strangerId = await ctx.db.insert("users", { email: "x@example.com", name: "X" });
    const eventId = await ctx.db.insert("events", {
      name: "Amma's 60th", host: "Priya", coHost: "", startDate: "2027-02-12", endDate: "2027-02-12",
      city: "Chennai", currency: "INR", totalBudget: 400000, eventType: "birthday", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    return { ownerId, viewerId, strangerId, eventId };
  });
}

const segment = (id: string, confidence: number, x1 = 400): SamSegment => ({
  id,
  box: { x1, y1: 300, x2: 1200, y2: 700 },
  size: { w: 1600, h: 1200 },
  confidence,
  mask: { size: [1200, 1600], counts: `rle-${id}-${confidence}` },
  path: `M${x1} 300h800v400h-800z`,
  maskBox: { x1, y1: 300, x2: 1200, y2: 700 },
});

/** Muse Spark answering with boxes on its 0–1000 grid; SAM is mocked above. */
function sparkFinds(finding: unknown) {
  vi.stubEnv("MODEL_PROVIDER", "meta");
  vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        model: "muse-spark-1.3",
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(finding) } }],
        usage: { prompt_tokens: 900, completion_tokens: 300 },
      }),
    ),
  );
}

const STAGE_AND_WALL = { stage: { x1: 200, y1: 540, x2: 900, y2: 660 }, backdrop: { x1: 260, y1: 220, x2: 820, y2: 560 } };

beforeEach(() => {
  vi.useFakeTimers();
  samSegment.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("see it on your venue", () => {
  test("the sample hall: Muse Spark boxes the stage and wall, SAM cuts both out, and each call is costed", async () => {
    sparkFinds(STAGE_AND_WALL);
    samSegment.mockResolvedValue([segment("1", 0.9), segment("1", 0.6, 500), segment("2", 0.8)]);
    const t = setup();
    const { ownerId, eventId } = await seed(t);

    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const view = await as(t, ownerId).query(api.venueView.get, { eventId });
    expect(view).toMatchObject({ status: "ready", sample: true, width: 1600, height: 1200, source: "found" });
    expect(view?.parts.backdrop?.confidence).toBe(0.9);
    expect(view?.parts.stage?.path).toBe("M400 300h800v400h-800z");

    // Boxes go to SAM in the photo's pixels, under their parts' ids.
    const [request] = samSegment.mock.calls[0];
    expect(request.prompt.objects).toEqual([
      { id: 1, box: { x1: 416, y1: 264, x2: 1312, y2: 672 } },
      { id: 2, box: { x1: 320, y1: 648, x2: 1440, y2: 792 } },
    ]);

    const calls = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(calls.map((c) => c.feature).sort()).toEqual(["findStage", "venueCutOut"]);
    expect(calls.find((c) => c.feature === "venueCutOut")).toMatchObject({ model: "sam-3.1", costUsd: 0.0025, eventId });
  });

  test("a second family trying the sample hall reuses its masks: nothing is paid for twice", async () => {
    sparkFinds(STAGE_AND_WALL);
    samSegment.mockResolvedValue([segment("1", 0.9), segment("2", 0.8)]);
    const t = setup();
    const first = await seed(t);
    const second = await seed(t);

    await as(t, first.ownerId).mutation(api.venueView.useSample, { eventId: first.eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await as(t, second.ownerId).mutation(api.venueView.useSample, { eventId: second.eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(samSegment).toHaveBeenCalledOnce();
    expect((await as(t, second.ownerId).query(api.venueView.get, { eventId: second.eventId }))?.status).toBe("ready");
  });

  test("a tap re-cuts only the part chosen, and the same tap again comes from the cache", async () => {
    sparkFinds(STAGE_AND_WALL);
    samSegment.mockResolvedValueOnce([segment("1", 0.9), segment("2", 0.8)]).mockResolvedValue([segment("1", 0.95, 300)]);
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await as(t, ownerId).mutation(api.venueView.tap, { eventId, part: "backdrop", x: 800, y: 400 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const view = await as(t, ownerId).query(api.venueView.get, { eventId });
    expect(view).toMatchObject({ status: "ready", source: "tapped" });
    expect(view?.parts.backdrop?.box.x1).toBe(300);
    expect(view?.parts.stage?.confidence).toBe(0.8);
    expect(samSegment.mock.calls[1][0].prompt.objects).toEqual([{ id: 1, points: [{ x: 800, y: 400 }] }]);

    await as(t, ownerId).mutation(api.venueView.tap, { eventId, part: "backdrop", x: 803, y: 402 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(samSegment).toHaveBeenCalledTimes(2);
  });

  test("a photo with no stage says so, and SAM is never asked", async () => {
    sparkFinds({ stage: null, backdrop: null });
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await as(t, ownerId).query(api.venueView.get, { eventId }))?.status).toBe("none");
    expect(samSegment).not.toHaveBeenCalled();
  });

  test("SAM failing leaves the view marked failed, not finding for ever", async () => {
    sparkFinds(STAGE_AND_WALL);
    samSegment.mockRejectedValue(new Error("SAM returned 500"));
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await as(t, ownerId).query(api.venueView.get, { eventId }))?.status).toBe("failed");
  });

  test("SAM failing for good leaves empty parts, costs only the Spark call, and the next try starts clean", async () => {
    sparkFinds(STAGE_AND_WALL);
    samSegment.mockRejectedValue(new MetaError("SAM returned 500", 500, true, true));
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const view = await as(t, ownerId).query(api.venueView.get, { eventId });
    expect(view).toMatchObject({ status: "failed", parts: {} });
    // Muse Spark answered and is costed; the SAM call that never answered keeps no cost row.
    expect(await t.run((ctx) => ctx.db.query("modelCalls").collect())).toMatchObject([{ feature: "findStage" }]);
    expect(await t.run((ctx) => ctx.db.query("segmentCache").collect())).toEqual([]);

    samSegment.mockResolvedValue([segment("1", 0.9), segment("2", 0.8)]);
    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await as(t, ownerId).query(api.venueView.get, { eventId }))?.status).toBe("ready");
  });

  test("SAM answering with no objects leaves the view with nothing found and asks SAM only once", async () => {
    sparkFinds(STAGE_AND_WALL);
    samSegment.mockResolvedValue([]);
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await as(t, ownerId).query(api.venueView.get, { eventId })).toMatchObject({ status: "none", parts: {} });
    expect(samSegment).toHaveBeenCalledOnce();
    // The call answered, so it is costed; finding nothing is not kept for the next person.
    const calls = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(calls.map((c) => c.feature).sort()).toEqual(["findStage", "venueCutOut"]);
    expect(await t.run((ctx) => ctx.db.query("segmentCache").collect())).toEqual([]);
  });

  test("finding no stage is not kept, so the next person's try asks again", async () => {
    sparkFinds({ stage: null, backdrop: null });
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("segmentCache").collect())).toEqual([]);
  });

  test("SAM busy once is asked again, and the view is ready", async () => {
    sparkFinds(STAGE_AND_WALL);
    samSegment.mockRejectedValueOnce(new MetaError("SAM returned 429", 429, true, true, 10)).mockResolvedValueOnce([segment("1", 0.9), segment("2", 0.8)]);
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await as(t, ownerId).query(api.venueView.get, { eventId }))?.status).toBe("ready");
    expect(samSegment).toHaveBeenCalledTimes(2);
  });

  test("only the event's planners add a photo, and only its members see it", async () => {
    const t = setup();
    const { viewerId, strangerId, eventId } = await seed(t);
    await expect(as(t, viewerId).mutation(api.venueView.useSample, { eventId })).rejects.toThrow(/planner/);
    await expect(as(t, strangerId).query(api.venueView.get, { eventId })).rejects.toThrow(/not a member/);
  });

  test("a hall photo that isn't an image is refused and deleted", async () => {
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["not a photo"], { type: "text/plain" })));
    await expect(as(t, ownerId).mutation(api.venueView.setPhoto, { eventId, storageId, width: 1600, height: 1200 })).rejects.toThrow(/photo of the hall/);
    expect(await t.run((ctx) => ctx.db.query("venueViews").collect())).toHaveLength(0);
  });

  test("a demo guest gets fifteen tries a day", async () => {
    sparkFinds(STAGE_AND_WALL);
    samSegment.mockResolvedValue([segment("1", 0.9), segment("2", 0.8)]);
    const t = setup();
    const { ownerId, eventId } = await seed(t, { guest: true });
    for (let i = 0; i < 15; i++) await as(t, ownerId).mutation(api.venueView.useSample, { eventId });
    await expect(as(t, ownerId).mutation(api.venueView.useSample, { eventId })).rejects.toThrow(/as many tries/);
  });
});
