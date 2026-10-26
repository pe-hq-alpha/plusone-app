/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { holdReason } from "./lib/quoteHold";

const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function seed(t: T, sendMode: "auto" | "review" = "auto") {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "emma@example.com", name: "Emma" });
    const otherId = await ctx.db.insert("users", { email: "james@example.com", name: "James" });
    const eventId = await ctx.db.insert("events", {
      name: "Emma & James", host: "Emma", coHost: "James", startDate: "2027-07-15", endDate: "2027-07-16",
      city: "Austin", currency: "USD", totalBudget: 40000, eventType: "wedding", createdBy: ownerId, sendMode,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: otherId, role: "planner" });
    const sessionId = await ctx.db.insert("sessions", { eventId, name: "Reception", date: "2027-07-16", dayIndex: 1, budget: 20000, guestCount: 120, color: "#74162a", order: 0 });
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [sessionId], category: "Photography", title: "Photographer", budget: 4000, status: "contacted" });
    await ctx.db.insert("budgetLines", { eventId, slotId, label: "Photographer", planned: 4000, committed: 0, paid: 0 });
    const vendorId = await ctx.db.insert("vendors", { eventId, slotId, name: "Golden Hour Photo Co.", category: "Photography", packages: [], highlights: [], sourceUrls: [], shortlisted: true, scrapedAt: 0, reviewHighlights: [], pagesRead: [] });
    const threadId = await ctx.db.insert("threads", { eventId, vendorId, slotId, status: "sent", followUpCount: 0, lastInboundAt: 1000 });
    const messageId = await ctx.db.insert("messages", { eventId, threadId, direction: "in", kind: "vendor_reply", status: "received", fromAddress: "hello@goldenhour.example", toAddress: "emma.and.james@plusoneevents.site", subject: "Re: photos", bodyText: "Full day $3,900", attachments: [] });
    return { ownerId, otherId, eventId, slotId, vendorId, threadId, messageId };
  });
}

const quote = (messageId: Id<"messages">, total: number, currency?: string) => ({ messageId, total, currency, includes: [], excludes: [], redFlags: [], summary: "Full day" });
const committed = (t: T, slotId: Id<"vendorSlots">) => t.run(async (ctx) => (await ctx.db.query("budgetLines").withIndex("by_slotId", (q) => q.eq("slotId", slotId)).first())!.committed);

describe("quotes read from replies", () => {
  test("a sensible quote goes into the plan, and undo puts everything back", async () => {
    const t = setup();
    const s = await seed(t);
    const id = (await t.mutation(internal.quotes.upsertFromMessage, quote(s.messageId, 3900)))!;
    expect(await committed(t, s.slotId)).toBe(3900);
    expect(await t.run(async (ctx) => [(await ctx.db.get(s.slotId))!.status, (await ctx.db.get(s.threadId))!.status])).toEqual(["quoted", "quoted"]);
    await as(t, s.ownerId).mutation(api.quotes.undo, { quoteId: id });
    expect(await committed(t, s.slotId)).toBe(0);
    expect(await t.run(async (ctx) => [(await ctx.db.get(s.slotId))!.status, (await ctx.db.get(s.threadId))!.status, (await ctx.db.get(id))!.state])).toEqual(["contacted", "sent", "waiting"]);
  });

  test("a reading far from the budget waits, and only goes in when the couple says so", async () => {
    const t = setup();
    const s = await seed(t);
    const id = (await t.mutation(internal.quotes.upsertFromMessage, quote(s.messageId, 39000)))!;
    expect(await committed(t, s.slotId)).toBe(0);
    expect((await t.run((ctx) => ctx.db.get(id)))?.heldBecause).toMatch(/twice/);
    const rows = await as(t, s.ownerId).query(api.threads.list, { eventId: s.eventId });
    expect(rows[0].waitingQuote).toBe(true);
    expect(rows[0].latestQuote).toBeNull();
    expect(await as(t, s.ownerId).query(api.quotes.compareForSlot, { slotId: s.slotId })).toHaveLength(0);
    await as(t, s.ownerId).mutation(api.quotes.apply, { quoteId: id });
    expect(await committed(t, s.slotId)).toBe(39000);
  });

  test("a wedding that checks quotes first holds every one", async () => {
    const t = setup();
    const s = await seed(t, "review");
    const id = (await t.mutation(internal.quotes.upsertFromMessage, quote(s.messageId, 3900)))!;
    expect((await t.run((ctx) => ctx.db.get(id)))?.state).toBe("waiting");
    await as(t, s.ownerId).mutation(api.quotes.dismiss, { quoteId: id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.state).toBe("dismissed");
    expect(await committed(t, s.slotId)).toBe(0);
  });

  test("hold reasons", () => {
    const base = { total: 4000, currency: "USD", eventCurrency: "USD", budget: 4000, slotBooked: false, reviewFirst: false };
    expect(holdReason(base)).toBeNull();
    expect(holdReason({ ...base, currency: "EUR" })).toMatch(/EUR/);
    expect(holdReason({ ...base, total: 500 })).toMatch(/far below/);
    expect(holdReason({ ...base, slotBooked: true })).toMatch(/already booked/);
  });

  test("unread is per person: opening a conversation reads it only for you", async () => {
    const t = setup();
    const s = await seed(t);
    expect((await as(t, s.ownerId).query(api.threads.list, { eventId: s.eventId }))[0].unread).toBe(true);
    await as(t, s.ownerId).mutation(api.threads.markRead, { threadId: s.threadId });
    expect((await as(t, s.ownerId).query(api.threads.list, { eventId: s.eventId }))[0].unread).toBe(false);
    expect((await as(t, s.otherId).query(api.threads.list, { eventId: s.eventId }))[0].unread).toBe(true);
    await t.run((ctx) => ctx.db.patch(s.threadId, { lastInboundAt: Date.now() + 60_000 }));
    expect((await as(t, s.ownerId).query(api.threads.list, { eventId: s.eventId }))[0].unread).toBe(true);
  });
});
