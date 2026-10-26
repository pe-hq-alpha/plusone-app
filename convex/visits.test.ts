/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { VISITS_KEPT_FOR } from "./lib/visits";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

afterEach(() => vi.unstubAllEnvs());

const body = (extra: object = {}) =>
  JSON.stringify({ at: Date.now(), ip: "203.0.113.7", host: "plusoneevents.site", path: "/", method: "GET", userAgent: "curl/8.7.1", ...extra });

test("POST /visit refuses without the secret configured, or with the wrong one", async () => {
  const t = setup();
  let res = await t.fetch("/visit", { method: "POST", headers: { "x-visit-secret": "x" }, body: body() });
  expect(res.status).toBe(503);
  vi.stubEnv("VISIT_LOG_SECRET", "right");
  res = await t.fetch("/visit", { method: "POST", headers: { "x-visit-secret": "wrong" }, body: body() });
  expect(res.status).toBe(401);
  res = await t.fetch("/visit", { method: "POST", body: body() });
  expect(res.status).toBe(401);
  expect(await t.query(internal.visits.recent, {})).toHaveLength(0);
});

test("POST /visit stores a valid visit, tagged as a bot, and rejects junk", async () => {
  const t = setup();
  vi.stubEnv("VISIT_LOG_SECRET", "right");
  const ok = await t.fetch("/visit", { method: "POST", headers: { "x-visit-secret": "right" }, body: body() });
  expect(ok.status).toBe(200);
  const bad = await t.fetch("/visit", { method: "POST", headers: { "x-visit-secret": "right" }, body: "{\"ip\":1}" });
  expect(bad.status).toBe(400);
  const rows = await t.query(internal.visits.recent, { limit: 10 });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ ip: "203.0.113.7", isBot: true });
  const summary = await t.query(internal.visits.byIp, { ip: "203.0.113.7" });
  expect(summary).toMatchObject({ count: 1, countCapped: false, pages: [{ path: "plusoneevents.site/", count: 1 }] });
});

test("prune deletes only visits past 180 days", async () => {
  const t = setup();
  const now = Date.now();
  await t.run(async (ctx) => {
    for (const at of [now - VISITS_KEPT_FOR - 1000, now - 1000]) {
      await ctx.db.insert("visits", { at, ip: "198.51.100.1", host: "plusoneevents.site", path: "/", method: "GET", isBot: false, likelyProxy: false });
    }
  });
  expect(await t.mutation(internal.visits.prune, {})).toEqual({ visits: 1, links: 0 });
  expect(await t.query(internal.visits.recent, { ip: "198.51.100.1" })).toHaveLength(1);
});

const VID = "0b9c2f4e-5a6d-4e7f-8a9b-0c1d2e3f4a5b";
const visit = (extra: object) => ({ at: Date.now(), ip: "203.0.113.9", host: "app.plusoneevents.site", path: "/", method: "GET", userAgent: "Mozilla/5.0 Chrome/141", ...extra });

test("a browser's visits before sign-in resolve to the account once it signs in", async () => {
  const t = setup();
  await t.run((ctx) => ctx.db.insert("users", { email: "anita@example.com", clerkId: "user_anita" }));
  // Anonymous first, from one address; then signed in, from another.
  await t.mutation(internal.visits.record, visit({ visitorId: VID, path: "/terms" }));
  let rows = await t.query(internal.visits.recent, {});
  expect(rows[0].accounts).toEqual([]);
  await t.mutation(internal.visits.record, visit({ visitorId: VID, clerkUserId: "user_anita", ip: "198.51.100.4", asn: 9009 }));
  rows = await t.query(internal.visits.recent, {});
  expect(rows.map((r) => r.accounts)).toEqual([["anita@example.com"], ["anita@example.com"]]);
  expect(rows[0].likelyProxy).toBe(true);
  expect((await t.query(internal.visits.byIp, { ip: "203.0.113.9" })).accounts).toEqual(["anita@example.com"]);

  const me = await t.query(internal.visits.byUser, { email: "Anita@Example.com" });
  expect(me).toMatchObject({ clerkUserIds: ["user_anita"], visitorIds: [VID], count: 2 });
  expect(me.ips.map((i) => i.ip).sort()).toEqual(["198.51.100.4", "203.0.113.9"]);
  expect(me.ips.find((i) => i.ip === "198.51.100.4")?.likelyProxy).toBe(true);
});

test("one link per browser and account, however many visits", async () => {
  const t = setup();
  for (let i = 0; i < 3; i++) await t.mutation(internal.visits.record, visit({ visitorId: VID, clerkUserId: "user_anita" }));
  await t.mutation(internal.visits.record, visit({ visitorId: VID, clerkUserId: "user_sam" }));
  const links = await t.run((ctx) => ctx.db.query("visitorLinks").take(10));
  expect(links.map((l) => l.clerkUserId).sort()).toEqual(["user_anita", "user_sam"]);
  // A Clerk user with no PlusOne account shows as its Clerk id.
  const rows = await t.query(internal.visits.recent, { limit: 1 });
  expect(rows[0].accounts.sort()).toEqual(["user_anita", "user_sam"]);
});

test("a visit without a browser id links nothing, and old links are pruned", async () => {
  const t = setup();
  await t.mutation(internal.visits.record, visit({ clerkUserId: "user_anita" }));
  expect(await t.run((ctx) => ctx.db.query("visitorLinks").take(10))).toHaveLength(0);
  await t.run((ctx) =>
    ctx.db.insert("visitorLinks", { visitorId: VID, clerkUserId: "user_old", firstSeen: 0, lastSeen: Date.now() - VISITS_KEPT_FOR - 1 }),
  );
  expect(await t.mutation(internal.visits.prune, {})).toEqual({ visits: 0, links: 1 });
});
