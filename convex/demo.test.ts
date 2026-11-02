/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { birthdayFor } from "./lib/regions";
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

describe("the American sample", () => {
  async function everything(t: ReturnType<typeof setup>, eventId: Id<"events">) {
    return await t.run(async (ctx) => ({
      slots: await ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      lines: await ctx.db.query("budgetLines").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      quotes: await ctx.db.query("quotes").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      threads: await ctx.db.query("threads").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      vendors: await ctx.db.query("vendors").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      sessions: await ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      guests: await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      offers: await ctx.db.query("vendorOffers").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      tasks: await ctx.db.query("tasks").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      bands: await ctx.db.query("priceBands").collect(),
      profiles: await ctx.db.query("vendorProfiles").collect(),
    }));
  }

  test("region routing: India keeps Amma's 60th, everyone else gets Dad's 60th", () => {
    expect(birthdayFor("IN")).toBe("birthday");
    expect(birthdayFor("IN-TN")).toBe("birthday");
    expect(birthdayFor("in-dl")).toBe("birthday");
    expect(birthdayFor("US")).toBe("birthday-us");
    expect(birthdayFor("US-TX")).toBe("birthday-us");
    expect(birthdayFor("GB")).toBe("birthday-us");
    expect(birthdayFor("unknown")).toBe("birthday-us");
    // An older page that sends no region still opens Chennai.
    expect(birthdayFor(undefined)).toBe("birthday");
  });

  test("a visitor outside India opens Dad's 60th in Austin, in dollars", async () => {
    const t = setup();
    const eventId = await (await guest(t)).mutation(api.demo.start, { region: "US" });
    const event = await eventOf(t, eventId);
    expect(event).toMatchObject({
      eventType: "birthday",
      occasionLabel: "Dad's 60th",
      host: "Sam",
      coHost: "Priya",
      city: "Austin",
      area: "Travis Heights",
      currency: "USD",
      totalBudget: 20_000,
      demo: true,
    });
    expect(new Date(`${event.startDate}T12:00:00Z`).getUTCDay()).toBe(6);
  });

  test("a visitor in India still opens Amma's 60th, and a link can pick either", async () => {
    const t = setup();
    expect((await eventOf(t, await (await guest(t)).mutation(api.demo.start, { region: "IN-TN" }))).city).toBe("Chennai");
    expect((await eventOf(t, await (await guest(t)).mutation(api.demo.start, { region: "IN", kind: "birthday-us" }))).city).toBe("Austin");
    expect((await eventOf(t, await (await guest(t)).mutation(api.demo.start, { region: "US", kind: "birthday" }))).city).toBe("Chennai");
    expect((await eventOf(t, await (await guest(t)).mutation(api.demo.start, { region: "US", kind: "office" }))).eventType).toBe("office_party");
  });

  test("Dad's 60th has its two parts, needs, quotes, offers and Austin price bands", async () => {
    const t = setup();
    const eventId = await (await guest(t)).mutation(api.demo.start, { kind: "birthday-us" });
    const { slots, lines, quotes, threads, vendors, sessions, guests, offers, tasks, bands, profiles } = await everything(t, eventId);

    expect(sessions.map((s) => [s.name, s.guestCount]).sort()).toEqual([["Backyard afternoon", 40], ["Birthday dinner", 120]]);
    expect(slots.map((s) => s.category).sort()).toEqual(["Bar", "Cake", "Catering", "Decor & Florals", "Music/DJ", "Photographer", "Rentals", "Venue"]);
    expect(slots.reduce((a, s) => a + s.budget, 0)).toBe(20_000);
    expect(vendors.every((v) => v.priceCurrency === "USD" && /Austin$/.test(v.city ?? ""))).toBe(true);

    for (const q of quotes) {
      expect(q.currency).toBe("USD");
      expect(q.lines!.reduce((a, l) => a + l.amount, 0)).toBe(q.total);
    }
    const catering = slots.find((s) => s.title === "Catering")!;
    const cateringQuotes = quotes.filter((q) => q.slotId === catering._id);
    // Per person with tax extra, all in, and for a 150-guest minimum.
    expect(cateringQuotes.map((q) => q.total).sort()).toEqual([4_760, 5_400, 6_294]);
    expect(cateringQuotes.map((q) => q.headcountAssumed).sort()).toEqual([120, 120, 150]);
    expect(cateringQuotes.filter((q) => q.taxIncluded === false)).toHaveLength(1);

    const room = slots.find((s) => s.title === "Event room")!;
    expect(room.status).toBe("booked");
    expect(lines.find((l) => l.slotId === room._id)).toMatchObject({ committed: 4_200, paid: 1_000 });

    expect(threads).toHaveLength(6);
    expect(threads.filter((th) => th.followUpCount === 1 && th.nextFollowUpAt)).toHaveLength(2);
    expect(threads.filter((th) => th.pendingQuestion)).toHaveLength(1);

    expect(guests.filter((g) => g.rsvp === "pending").length).toBeGreaterThan(0);
    expect(guests.map((g) => g.dietary).filter(Boolean).join(" ")).toMatch(/Vegetarian.*|Gluten-free|Nut allergy/);
    expect(tasks.filter((x) => x.done)).toHaveLength(1);

    // Verified Austin sample vendors answer catering (twice), decor and photography, in dollars.
    expect(offers).toHaveLength(4);
    expect(offers.every((o) => o.currency === "USD")).toBe(true);
    expect(offers.filter((o) => o.slotId === catering._id).map((o) => o.price).sort()).toEqual([34, 46]);
    const austin = profiles.filter((p) => p.cityKey === "austin" && p.sample);
    expect(austin.length).toBeGreaterThanOrEqual(26);
    const band = bands.find((b) => b.city === "austin" && b.category === "Catering" && b.sample);
    expect(band).toMatchObject({ currency: "USD", unit: "per_person", count: 10 });
    expect(band!.p50).toBe(40);
    expect(bands.filter((b) => b.city === "austin").every((b) => b.currency === "USD")).toBe(true);
  });

  test("Compare reads the American quotes per person, with sales tax, in dollars", async () => {
    const t = setup();
    const visitor = await guest(t);
    const eventId = await visitor.mutation(api.demo.start, { region: "US" });
    const board = await visitor.query(api.dashboard.board, { eventId });
    expect(board.currency).toBe("USD");
    const catering = board.needs.find((n) => n.title === "Catering")!;
    expect(catering.basisLabel).toBe("Per person");
    expect(catering.market).toMatchObject({ currency: "USD", p50: 40 });
    expect(catering.offers).toHaveLength(2);
    expect(catering.sheet!.lines.find((l) => l.key === "gst")!.label).toBe("Sales tax");
    const words = JSON.stringify(board);
    // "Plates, glassware and linens" is how an American quote says it; per plate is not.
    // The sheet's key for the tax stays "gst" everywhere; only what is shown changes.
    expect(words).not.toMatch(/GST/);
    expect(words).not.toMatch(/₹|per plate|lakh|crore|Chennai|car parking/i);
    expect(words).not.toContain("Leaves out sales tax");
    const juniper = catering.vendors.find((v) => v.name === "Juniper & Sage Catering")!;
    expect(juniper.quote!.flags).toContain("Sales tax extra");
    expect(juniper.quote!.missing.map((m) => m.key)).toContain("service_staff");
  });

  test("the recorded runs on Dad's 60th name nothing Indian", async () => {
    const t = setup();
    const visitor = await guest(t);
    const eventId = await visitor.mutation(api.demo.start, { region: "US" });
    const runs = JSON.stringify(await visitor.query(api.modelCalls.recorded, { eventId }));
    expect(runs).toContain("muse-spark-1.3");
    expect(runs).not.toMatch(/Chennai|Vanakkam|Kaveri|Annam|Saapadu|Rs\.|GST/);
  });
});

describe("the Chennai sample is unchanged", () => {
  test("Compare still reads it per plate, with GST, in rupees, with Chennai's bands", async () => {
    const t = setup();
    const visitor = await guest(t);
    const eventId = await visitor.mutation(api.demo.start, { region: "IN-TN" });
    const board = await visitor.query(api.dashboard.board, { eventId });
    expect(board.currency).toBe("INR");
    const catering = board.needs.find((n) => n.title === "Catering")!;
    expect(catering.basisLabel).toBe("Per plate");
    expect(catering.sheet!.lines.find((l) => l.key === "gst")!.label).toBe("GST");
    expect(catering.market).toMatchObject({ currency: "INR" });
    expect(catering.offers.map((o) => o.name).sort()).toEqual(["Kalyana Saapadu Co.", "Komalam Caterers"]);
    const kaveri = catering.vendors.find((v) => v.name === "Kaveri Feast Co.")!;
    expect(kaveri.quote!.flags).toContain("GST extra");
    const runs = JSON.stringify(await visitor.query(api.modelCalls.recorded, { eventId }));
    expect(runs).toContain("Kaveri Feast Co.");
    const austin = await t.run(async (ctx) => (await ctx.db.query("vendorProfiles").collect()).filter((p) => p.cityKey === "austin"));
    expect(austin).toHaveLength(0);
  });
});

describe("the vendors' demo outside India", () => {
  test("makes a sample caterer in Austin answering Dad's 60th, priced in dollars", async () => {
    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { isAnonymous: true }));
    const as = t.withIdentity({ subject: `${userId}|test-session` });
    const profileId = await as.mutation(api.demo.startVendor, { region: "US" });
    const { profile, offering } = await t.run(async (ctx) => ({
      profile: (await ctx.db.get(profileId))!,
      offering: (await ctx.db.query("vendorOfferings").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).first())!,
    }));
    expect(profile).toMatchObject({ city: "Austin", cityKey: "austin", sample: true });
    expect(offering).toMatchObject({ currency: "USD", unit: "per_person" });
    const open = await as.query(api.marketplace.briefs.open, {});
    expect(open.map((b) => [b.category, b.occasion, b.city, b.currency])).toEqual([["Catering", "Dad's 60th", "Austin", "USD"]]);
    expect(open[0].range).toMatchObject({ currency: "USD", p50: 40 });
  });
});
