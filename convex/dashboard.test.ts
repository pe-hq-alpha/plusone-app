/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { seedBirthday } from "./demoBirthday";

const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

type QuoteSeed = { name: string; total: number; lines?: { item: string; kind: "core" | "fee" | "tax" | "extra"; amount: number }[]; taxIncluded?: boolean };

/** Amma's 60th with one need and a quote from each vendor named. */
async function seed(t: T, category: string, quotes: QuoteSeed[]) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "host@example.com", name: "Host" });
    const eventId = await ctx.db.insert("events", {
      name: "Amma's 60th", host: "Host", coHost: "", startDate: "2027-02-14", endDate: "2027-02-14",
      city: "Chennai", currency: "INR", totalBudget: 400_000, eventType: "birthday", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    const sessionId = await ctx.db.insert("sessions", { eventId, name: "Lunch", date: "2027-02-14", dayIndex: 0, budget: 200_000, guestCount: 120, color: "#74162a", order: 0 });
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [sessionId], category, title: category, budget: 50_000, status: "contacted" });
    for (const q of quotes) {
      const vendorId = await ctx.db.insert("vendors", { eventId, slotId, name: q.name, category, packages: [], highlights: [], sourceUrls: [], shortlisted: false, scrapedAt: 0, reviewHighlights: [], pagesRead: [] });
      const threadId = await ctx.db.insert("threads", { eventId, vendorId, slotId, status: "quoted", followUpCount: 0 });
      const messageId = await ctx.db.insert("messages", { eventId, threadId, direction: "in", kind: "vendor_reply", status: "received", fromAddress: "v@example.com", toAddress: "amma@plusoneevents.site", subject: "Re: decor", bodyText: "Our quote", attachments: [] });
      await ctx.db.insert("quotes", {
        eventId, slotId, vendorId, threadId, messageId, total: q.total, currency: "INR", includes: [], excludes: [], redFlags: [], summary: "Stage decor",
        lines: q.lines?.map((l) => ({ ...l, unit: "total" as const })), taxIncluded: q.taxIncluded,
      });
    }
    return { ownerId, eventId };
  });
}

describe("missing charges on the decision board", () => {
  const decorQuotes: QuoteSeed[] = [
    { name: "Mylapore Decors", total: 42_500, taxIncluded: true, lines: [{ item: "Stage decor", kind: "core", amount: 40_000 }, { item: "Transport", kind: "fee", amount: 2_500 }] },
    { name: "Kalyan Flowers", total: 38_000 },
  ];

  test("a need with a standard sheet carries its lines, so Compare can put them in rows", async () => {
    const t = setup();
    const s = await seed(t, "Decor & Florals", decorQuotes);
    const board = await as(t, s.ownerId).query(api.dashboard.board, { eventId: s.eventId });
    expect(board.needs[0].sheet?.lines.map((l) => l.key)).toEqual(["gst", "transport", "setup", "lighting"]);
    expect(board.needs[0].sheet?.lines[0]).toEqual({ key: "gst", label: "GST" });
  });

  test("each quote is read against the sheet, line by line", async () => {
    const t = setup();
    const s = await seed(t, "Decor & Florals", decorQuotes);
    const board = await as(t, s.ownerId).query(api.dashboard.board, { eventId: s.eventId });
    const mylapore = board.needs[0].vendors.find((v) => v.name === "Mylapore Decors")!;
    expect(mylapore.quote?.readings.find((r) => r.key === "transport")).toEqual({ key: "transport", status: "priced", amount: 2_500 });
    expect(mylapore.quote?.readings.find((r) => r.key === "gst")?.status).toBe("included");
  });

  test("a quote that leaves a charge unsaid is flagged against what the other quote charges", async () => {
    const t = setup();
    const s = await seed(t, "Decor & Florals", decorQuotes);
    const board = await as(t, s.ownerId).query(api.dashboard.board, { eventId: s.eventId });
    const kalyan = board.needs[0].vendors.find((v) => v.name === "Kalyan Flowers")!;
    expect(kalyan.quote?.missing.map((m) => m.message)).toEqual(
      expect.arrayContaining(["Doesn't say whether GST is included", "No transport line, and one other charges ₹2,500"]),
    );
  });

  test("Amma's 60th, the guest demo: each quote shows the gaps a host should ask about", async () => {
    const t = setup();
    const { userId, eventId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "guest@example.com", name: "Guest" });
      return { userId, eventId: await seedBirthday(ctx, userId) };
    });
    const board = await as(t, userId).query(api.dashboard.board, { eventId });
    const gapsIn = (category: string) =>
      Object.fromEntries(
        board.needs
          .find((n) => n.category === category)!
          .vendors.filter((v) => v.quote)
          .map((v) => [v.name, v.quote!.missing.map((m) => m.message)]),
      );
    expect(gapsIn("Catering")).toEqual({
      "Annam Caterers": ["No transport line, and one other charges ₹2,500"],
      "Saapadu Kitchen": [],
      "Kaveri Feast Co.": ["GST is extra, with no amount given", "No service staff line, and one other charges ₹6,000"],
    });
    expect(gapsIn("Venue")).toEqual({
      "Thamarai Hall": ["Doesn't say whether air conditioning is included", "Doesn't say what an extra hour costs"],
    });
  });

  test("a need with no sheet has no rows and flags nothing", async () => {
    const t = setup();
    const s = await seed(t, "Fireworks", [{ name: "Diwali Sparks", total: 15_000 }]);
    const board = await as(t, s.ownerId).query(api.dashboard.board, { eventId: s.eventId });
    expect(board.needs[0].sheet).toBeNull();
    expect(board.needs[0].vendors[0].quote?.missing).toEqual([]);
    expect(board.needs[0].vendors[0].quote?.readings).toEqual([]);
  });
});

describe("the market range in Compare", () => {
  const decor: QuoteSeed[] = [
    { name: "Thoranam Decor", total: 28_000 },
    { name: "Malli Poo Decor", total: 45_000 },
    { name: "Grand Mandap Co.", total: 80_000 },
  ];
  const band = { category: "Decor & Florals", unit: "total" as const, city: "chennai", currency: "INR", count: 12, p25: 30_000, p50: 40_000, p75: 50_000, p90: 70_000, sample: false, computedAt: 0 };

  test("a need whose city has a range carries it, and each quote shows where it sits in it", async () => {
    const t = setup();
    const s = await seed(t, "Decor & Florals", decor);
    await t.run((ctx) => ctx.db.insert("priceBands", band));
    const need = (await as(t, s.ownerId).query(api.dashboard.board, { eventId: s.eventId })).needs[0];
    expect(need.market).toEqual({ count: 12, p25: 30_000, p50: 40_000, p75: 50_000, p90: 70_000, currency: "INR" });
    expect(Object.fromEntries(need.vendors.map((v) => [v.name, v.quote?.tier]))).toEqual({
      "Thoranam Decor": "Value",
      "Malli Poo Decor": "Standard",
      "Grand Mandap Co.": "Luxury",
    });
  });

  test("with no range for the city yet, there is none to show and no quote is placed", async () => {
    const t = setup();
    const s = await seed(t, "Decor & Florals", decor);
    await t.run((ctx) => ctx.db.insert("priceBands", { ...band, city: "delhi" }));
    const need = (await as(t, s.ownerId).query(api.dashboard.board, { eventId: s.eventId })).needs[0];
    expect(need.market).toBeNull();
    expect(need.vendors.map((v) => v.quote?.tier)).toEqual([null, null, null]);
  });
});
