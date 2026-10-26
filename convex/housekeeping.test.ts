/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2027-01-10T12:00:00Z").getTime();

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Insert rows as if it were `daysAgo` days before NOW. */
async function at<R>(t: T, daysAgo: number, fn: Parameters<T["run"]>[0]): Promise<R> {
  vi.setSystemTime(NOW - daysAgo * DAY);
  const out = (await t.run(fn)) as R;
  vi.setSystemTime(NOW);
  return out;
}

const session = (createdBy: Id<"users">, demo: boolean) => ({
  name: "Maya's 40th birthday", host: "Maya", coHost: "Sam", startDate: "2027-06-30", endDate: "2027-06-30",
  city: "Austin", currency: "USD", totalBudget: 10000, eventType: "birthday" as const, createdBy,
  ...(demo ? { demo: true } : {}),
});

async function runSweep(t: T) {
  const result = await t.mutation(internal.housekeeping.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return result;
}

test("an old demo and the anonymous visitor who opened it are removed; a recent demo and a real event are not", async () => {
  const t = setup();
  const old = await at<{ userId: Id<"users">; eventId: Id<"events">; authSessionId: Id<"authSessions"> }>(t, 5, async (ctx) => {
    const userId = await ctx.db.insert("users", { isAnonymous: true });
    const eventId = await ctx.db.insert("events", session(userId, true));
    await ctx.db.insert("members", { eventId, userId, role: "owner" });
    await ctx.db.insert("vendorSlots", { eventId, sessionIds: [], category: "Venue", title: "Venue", budget: 3000, status: "research" });
    const authSessionId = await ctx.db.insert("authSessions", { userId, expirationTime: NOW + DAY });
    return { userId, eventId, authSessionId };
  });
  const recent = await at<Id<"events">>(t, 1, async (ctx) => {
    const userId = await ctx.db.insert("users", { isAnonymous: true });
    return await ctx.db.insert("events", session(userId, true));
  });
  const real = await at<Id<"events">>(t, 30, async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "host@example.com" });
    return await ctx.db.insert("events", session(userId, false));
  });

  expect((await runSweep(t)).demos).toBe(1);

  const after = await t.run(async (ctx) => ({
    oldSession: await ctx.db.get(old.eventId),
    visitor: await ctx.db.get(old.userId),
    authSession: await ctx.db.get(old.authSessionId),
    slots: await ctx.db.query("vendorSlots").collect(),
    recent: await ctx.db.get(recent),
    real: await ctx.db.get(real),
  }));
  expect(after.oldSession).toBeNull();
  expect(after.visitor).toBeNull();
  expect(after.authSession).toBeNull();
  expect(after.slots).toHaveLength(0);
  expect(after.recent).not.toBeNull();
  expect(after.real).not.toBeNull();
});

test("a demo opened by someone with a real account is removed, but their account is kept", async () => {
  const t = setup();
  const { userId, eventId } = await at<{ userId: Id<"users">; eventId: Id<"events"> }>(t, 5, async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "host@example.com" });
    return { userId, eventId: await ctx.db.insert("events", session(userId, true)) };
  });
  await runSweep(t);
  const after = await t.run(async (ctx) => ({ session: await ctx.db.get(eventId), user: await ctx.db.get(userId) }));
  expect(after.session).toBeNull();
  expect(after.user).not.toBeNull();
});

test("a search that has been running for an hour is marked failed; one that just started is left", async () => {
  const t = setup();
  const ids = await at<{ dead: Id<"researchRuns">; live: Id<"researchRuns"> }>(t, 0, async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "host@example.com" });
    const eventId = await ctx.db.insert("events", session(userId, false));
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [], category: "Venue", title: "Venue", budget: 3000, status: "research" });
    const run = (startedAt: number) =>
      ctx.db.insert("researchRuns", { eventId, slotId, query: "venue", status: "running", step: "Searching the web", foundCount: 0, startedAt });
    return { dead: await run(NOW - 60 * 60_000), live: await run(NOW - 2 * 60_000) };
  });
  expect((await runSweep(t)).searches).toBe(1);
  const after = await t.run(async (ctx) => ({ dead: await ctx.db.get(ids.dead), live: await ctx.db.get(ids.live) }));
  expect(after.dead).toMatchObject({ status: "failed", error: "This search stopped before it finished. Start it again." });
  expect(after.live).toMatchObject({ status: "running" });
});

test("inbound-email records older than ninety days are removed; newer ones are kept", async () => {
  const t = setup();
  const record = (id: string) => ({ agentmailMessageId: id, webhookEventId: `evt_${id}`, inboxId: "inbox", fromAddress: "v@example.com", routedAs: "vendor_reply" as const });
  await at(t, 120, async (ctx) => { await ctx.db.insert("inboundEvents", record("old")); });
  await at(t, 10, async (ctx) => { await ctx.db.insert("inboundEvents", record("new")); });
  expect((await runSweep(t)).inboundRecords).toBe(1);
  const left = await t.run((ctx) => ctx.db.query("inboundEvents").collect());
  expect(left.map((r) => r.agentmailMessageId)).toEqual(["new"]);
});
