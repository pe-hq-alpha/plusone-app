/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function demo(sample?: "birthday" | "housewarming" | "office") {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const visitor = t.withIdentity({ subject: `${userId}|test-session` });
  const eventId = await visitor.mutation(api.demo.start, sample ? { kind: sample } : {});
  const event = await t.run(async (ctx) => (await ctx.db.get(eventId))!);
  return { t, visitor, eventId, event };
}

/** A day a fortnight before the event, as the client would pass it. */
function fortnightBefore(startDate: string) {
  const d = new Date(`${startDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 14);
  return d.toISOString().slice(0, 10);
}

describe("the co-pilot's route", () => {
  test("the birthday shows work done, a choice waiting, and the count of needs booked", async () => {
    const { visitor, eventId, event } = await demo();
    const route = await visitor.query(api.copilot.route, { eventId, today: fortnightBefore(event.startDate) });
    expect(route.needs).toBeGreaterThan(0);
    expect(route.booked).toBeGreaterThanOrEqual(1);
    expect(route.booked).toBeLessThanOrEqual(route.needs);
    expect(route.yours.some((y) => y.kind === "choose" && /cater/i.test(y.title))).toBe(true);
    expect(route.done.length).toBeGreaterThan(0);
    for (const stop of [...route.done, ...route.now, ...route.next]) {
      expect(stop.title).not.toMatch(/wedding|couple|undefined/i);
      if (stop.href) expect(stop.href).toMatch(/^(vendors|inbox)\//);
    }
  });

  test("every sample reads without a wedding word", async () => {
    for (const sample of ["housewarming", "office"] as const) {
      const { visitor, eventId, event } = await demo(sample);
      const route = await visitor.query(api.copilot.route, { eventId, today: fortnightBefore(event.startDate) });
      const words = JSON.stringify(route);
      expect(words, sample).not.toMatch(/wedding|couple|bride|groom/i);
    }
  });

  test("only members can read it", async () => {
    const { t, eventId, event } = await demo();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const stranger = t.withIdentity({ subject: `${userId}|other-session` });
    await expect(stranger.query(api.copilot.route, { eventId, today: event.startDate })).rejects.toThrow();
  });
});
