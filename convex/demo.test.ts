/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { rateLimiter } from "./rateLimits";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

async function guest(t: ReturnType<typeof setup>) {
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return t.withIdentity({ subject: `${userId}|test-session` });
}

async function eventOf(t: ReturnType<typeof setup>, eventId: Id<"events">) {
  return await t.run(async (ctx) => (await ctx.db.get(eventId))!);
}

describe("the demo", () => {
  test("opens Amma's 60th in Chennai by default", async () => {
    const t = setup();
    const eventId = await (await guest(t)).mutation(api.demo.start, {});
    const event = await eventOf(t, eventId);
    expect(event).toMatchObject({
      eventType: "birthday",
      occasionLabel: "Amma's 60th",
      host: "Divya",
      coHost: "Karthik",
      city: "Chennai",
      currency: "INR",
      totalBudget: 450_000,
      demo: true,
    });
    expect(event.startDate).toBe(event.endDate);
    expect(new Date(`${event.startDate}T12:00:00Z`).getUTCDay()).toBe(6);
  });

  test("the birthday's numbers add up", async () => {
    const t = setup();
    const eventId = await (await guest(t)).mutation(api.demo.start, {});
    const data = await t.run(async (ctx) => {
      const slots = await ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect();
      const lines = await ctx.db.query("budgetLines").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect();
      const quotes = await ctx.db.query("quotes").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect();
      const threads = await ctx.db.query("threads").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect();
      const vendors = await ctx.db.query("vendors").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect();
      const site = await ctx.db.query("eventSites").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).unique();
      const gifts = await ctx.db.query("gifts").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect();
      return { slots, lines, quotes, threads, vendors, site, gifts };
    });
    const { slots, lines, quotes, threads, vendors, site, gifts } = data;
    expect(slots.reduce((a, s) => a + s.budget, 0)).toBe(450_000);
    expect(vendors.every((v) => v.priceUnit && v.priceCurrency === "INR")).toBe(true);
    expect(vendors.filter((v) => v.category === "Catering").every((v) => v.priceUnit === "per_person")).toBe(true);

    for (const q of quotes) expect(q.lines!.reduce((a, l) => a + l.amount, 0)).toBe(q.total);
    const catering = slots.find((s) => s.title === "Catering")!;
    const cateringQuotes = quotes.filter((q) => q.slotId === catering._id);
    expect(cateringQuotes.map((q) => q.total).sort()).toEqual([56_500, 62_000, 66_150]);
    expect(cateringQuotes.every((q) => q.state === "applied")).toBe(true);
    expect(catering.status).toBe("quoted");

    const hall = slots.find((s) => s.title === "Hall")!;
    expect(hall.status).toBe("booked");
    expect(lines.find((l) => l.slotId === hall._id)).toMatchObject({ committed: 80_000, paid: 25_000 });
    expect(slots.filter((s) => s.status === "booked")).toHaveLength(1);

    expect(threads).toHaveLength(6);
    expect(threads.filter((th) => th.followUpCount === 1 && th.nextFollowUpAt)).toHaveLength(2);
    expect(threads.filter((th) => th.pendingQuestion)).toHaveLength(1);
    expect(site).toMatchObject({ published: false, cashGiftNote: expect.any(String) });
    expect(gifts).toHaveLength(0);
  });

  test("a housewarming visitor gets the housewarming", async () => {
    const t = setup();
    const eventId = await (await guest(t)).mutation(api.demo.start, { kind: "housewarming" });
    expect((await eventOf(t, eventId)).eventType).toBe("housewarming");
  });

  test("an office visitor gets the office party", async () => {
    const t = setup();
    const eventId = await (await guest(t)).mutation(api.demo.start, { kind: "office" });
    expect((await eventOf(t, eventId)).eventType).toBe("office_party");
  });

  test("someone who already has an event gets their own back", async () => {
    const t = setup();
    const visitor = await guest(t);
    const first = await visitor.mutation(api.demo.start, {});
    expect(await visitor.mutation(api.demo.start, { kind: "office" })).toBe(first);
    const count = await t.run(async (ctx) => (await ctx.db.query("events").withIndex("by_demo", (q) => q.eq("demo", true)).collect()).length);
    expect(count).toBe(1);
  });

  test("a busy day turns new visitors away politely", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await rateLimiter.limit(ctx, "demoStarts", { count: 2000 });
    });
    await expect((await guest(t)).mutation(api.demo.start, {})).rejects.toThrow("The demo is very busy right now.");
  });
});

describe("the vendors' demo", () => {
  async function visitor(t: ReturnType<typeof setup>, fields: { isAnonymous?: boolean; email?: string } = { isAnonymous: true }) {
    const userId = await t.run((ctx) => ctx.db.insert("users", fields));
    return { userId, as: t.withIdentity({ subject: `${userId}|test-session` }) };
  }

  test("makes a sample caterer with a customer's catering request to answer, once", async () => {
    const t = setup();
    const { userId, as } = await visitor(t);
    const profileId = await as.mutation(api.demo.startVendor, {});
    expect(await as.mutation(api.demo.startVendor, {})).toBe(profileId);

    const open = await as.query(api.marketplace.briefs.open, {});
    expect(open.map((b) => [b.category, b.occasion, b.answered])).toEqual([["Catering", "Amma's 60th", false]]);
    const memberships = await t.run(async (ctx) => await ctx.db.query("members").withIndex("by_userId", (q) => q.eq("userId", userId)).collect());
    expect(memberships).toHaveLength(1);
  });

  test("is only for visitors without an account", async () => {
    const t = setup();
    const { as } = await visitor(t, { email: "owner@anjalicaterers.example" });
    await expect(as.mutation(api.demo.startVendor, {})).rejects.toThrow("without an account");
  });
});
