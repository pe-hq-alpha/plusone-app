/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { calendarFile } from "../src/lib/calendar";

const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function seed(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "emma@example.com", name: "Emma" });
    const viewerId = await ctx.db.insert("users", { email: "mum@example.com", name: "Mum" });
    const eventId = await ctx.db.insert("events", {
      name: "Emma & James", host: "Emma", coHost: "James", startDate: "2030-07-15", endDate: "2030-07-16",
      city: "Austin", currency: "USD", totalBudget: 40000, eventType: "wedding", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    const sessionId = await ctx.db.insert("sessions", { eventId, name: "Reception", date: "2030-07-16", dayIndex: 1, budget: 20000, guestCount: 120, color: "#74162a", order: 0 });
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [sessionId], category: "Venue", title: "Venue", budget: 13000, status: "quoted" });
    await ctx.db.insert("budgetLines", { eventId, slotId, label: "Venue", planned: 13000, committed: 0, paid: 0 });
    const vendorId = await ctx.db.insert("vendors", { eventId, slotId, name: "The Oak Barn", category: "Venue", packages: [], highlights: [], sourceUrls: [], shortlisted: true, scrapedAt: 0, reviewHighlights: [], pagesRead: [] });
    const threadId = await ctx.db.insert("threads", { eventId, vendorId, slotId, status: "quoted", followUpCount: 0 });
    const messageId = await ctx.db.insert("messages", { eventId, threadId, direction: "in", kind: "vendor_reply", status: "received", fromAddress: "maria@oakbarn.example", toAddress: "emma.and.james@plusoneevents.site", subject: "Re: venue", bodyText: "$12,000, $3,000 deposit", attachments: [] });
    await ctx.db.insert("quotes", { eventId, slotId, vendorId, threadId, messageId, total: 12000, deposit: 3000, currency: "USD", includes: [], excludes: [], redFlags: [], summary: "Evening package" });
    return { ownerId, viewerId, eventId, sessionId, slotId, vendorId };
  });
}
const paid = (t: T, slotId: Id<"vendorSlots">) => t.run(async (ctx) => (await ctx.db.query("budgetLines").withIndex("by_slotId", (q) => q.eq("slotId", slotId)).first())!.paid);

describe("what's due", () => {
  test("booking on a quote adds its deposit and balance, once", async () => {
    const t = setup();
    const s = await seed(t);
    await as(t, s.ownerId).mutation(api.slots.markBooked, { slotId: s.slotId, vendorId: s.vendorId });
    const dues = await as(t, s.ownerId).query(api.dues.list, { eventId: s.eventId });
    expect(dues.map((d) => [d.label, d.amount, d.vendorName])).toEqual([
      ["Deposit", 3000, "The Oak Barn"],
      ["Balance", 9000, "The Oak Barn"],
    ]);
    expect(dues[1].dueDate).toBe("2030-06-15");
    await as(t, s.ownerId).mutation(api.slots.markBooked, { slotId: s.slotId, vendorId: s.vendorId });
    expect(await as(t, s.ownerId).query(api.dues.list, { eventId: s.eventId })).toHaveLength(2);
  });

  test("paying counts towards the budget, and un-paying takes it back", async () => {
    const t = setup();
    const s = await seed(t);
    await as(t, s.ownerId).mutation(api.slots.markBooked, { slotId: s.slotId, vendorId: s.vendorId });
    const [deposit] = await as(t, s.ownerId).query(api.dues.list, { eventId: s.eventId });
    await as(t, s.ownerId).mutation(api.dues.setDone, { dueId: deposit._id, done: true });
    expect(await paid(t, s.slotId)).toBe(3000);
    await as(t, s.ownerId).mutation(api.dues.setDone, { dueId: deposit._id, done: false });
    expect(await paid(t, s.slotId)).toBe(0);
  });

  test("viewers see the list but can't change it; dates and labels are checked", async () => {
    const t = setup();
    const s = await seed(t);
    await expect(as(t, s.viewerId).mutation(api.dues.add, { eventId: s.eventId, kind: "deadline", label: "Final menu", dueDate: "2030-05-01" })).rejects.toThrow(/planner/);
    await expect(as(t, s.ownerId).mutation(api.dues.add, { eventId: s.eventId, kind: "deadline", label: "Final menu", dueDate: "May 1" })).rejects.toThrow(/day it's due/);
    await as(t, s.ownerId).mutation(api.dues.add, { eventId: s.eventId, kind: "deadline", label: "Final menu", dueDate: "2030-05-01", vendorId: s.vendorId });
    expect(await as(t, s.viewerId).query(api.dues.list, { eventId: s.eventId })).toHaveLength(1);
  });

  test("the calendar file has every ceremony and what's still due, with a reminder", () => {
    const ics = calendarFile(
      "Emma & James",
      [{ _id: "e1", name: "Reception", date: "2030-07-16", startTime: "18:30", endTime: "23:00", location: "The Oak Barn, Driftwood" }],
      [
        { _id: "d1", label: "Balance", dueDate: "2030-06-15", kind: "payment", amount: 9000, vendorName: "The Oak Barn" },
        { _id: "d2", label: "Deposit", dueDate: "2030-01-01", kind: "payment", doneAt: 1 },
      ],
    );
    expect(ics).toContain("DTSTART:20300716T183000");
    expect(ics).toContain("LOCATION:The Oak Barn\\, Driftwood");
    expect(ics).toContain("SUMMARY:Pay: Balance (The Oak Barn)");
    expect(ics).toContain("TRIGGER:-P3D");
    expect(ics).not.toContain("Deposit");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });

  test("only the owner can download everything", async () => {
    const t = setup();
    const s = await seed(t);
    const data = await as(t, s.ownerId).query(api.exports.event, { eventId: s.eventId });
    expect(data.ceremonies).toHaveLength(1);
    expect(data.quotes).toHaveLength(1);
    expect(data.people.map((p: { role: string }) => p.role).sort()).toEqual(["owner", "viewer"]);
    await expect(as(t, s.viewerId).query(api.exports.event, { eventId: s.eventId })).rejects.toThrow(/owner/);
  });
});
