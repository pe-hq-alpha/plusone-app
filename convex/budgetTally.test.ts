/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const signedInAs = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

/** A Diwali party: sound booked outside PlusOne with ₹500 left to pay, and ₹2,000 paid on a sweets quote never marked booked. */
async function seed(t: T) {
  return await t.run(async (ctx) => {
    const plannerId = await ctx.db.insert("users", { email: "host@example.com", name: "Host" });
    const eventId = await ctx.db.insert("events", {
      name: "Diwali party", host: "Host", coHost: "", startDate: "2027-11-08", endDate: "2027-11-08", city: "Chennai",
      currency: "INR", totalBudget: 40000, eventType: "birthday", createdBy: plannerId,
    });
    await ctx.db.insert("members", { eventId, userId: plannerId, role: "owner" });
    const galaId = await ctx.db.insert("sessions", {
      eventId, name: "Evening Diwali Gala", date: "2027-11-08", dayIndex: 0, budget: 40000, guestCount: 25, color: "#000", order: 0, startTime: "19:30",
    });
    const soundId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [galaId], category: "AV & sound", title: "Sound & lighting", budget: 8000, status: "research" });
    const sweetsId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [galaId], category: "Catering", title: "Sweets", budget: 3000, status: "quoted" });
    const sweetsLine = await ctx.db.insert("budgetLines", { eventId, slotId: sweetsId, label: "Sweets", planned: 3000, committed: 2500, paid: 2000 });
    return { plannerId, eventId, soundId, sweetsId, sweetsLine };
  });
}

describe("the budget adds up line by line", () => {
  test("still to pay is owed on what's booked; money paid on an unbooked quote is flagged, not owed", async () => {
    const t = setup();
    const s = await seed(t);
    const as = signedInAs(t, s.plannerId);
    await as.mutation(api.slots.bookedElsewhere, { slotId: s.soundId, name: "Ganesh Sounds", total: 8000, paid: 7500 });

    const summary = await as.query(api.budget.summary, { eventId: s.eventId });
    expect(summary).toMatchObject({ agreedTotal: 8000, weighingTotal: 2500, paidTotal: 9500, toPayTotal: 500, paidNotBookedTotal: 2000 });
    const sound = summary.lines.find((l) => l.line.label === "Sound & lighting")!;
    const sweets = summary.lines.find((l) => l.line.label === "Sweets")!;
    expect([sound.state, sound.toPay]).toEqual(["booked", 500]);
    expect([sweets.state, sweets.toPay]).toEqual(["weighing", 0]);

    // The Overview says the same.
    const got = await as.query(api.events.get, { eventId: s.eventId });
    expect(got?.stats).toMatchObject({ bookedTotal: 8000, paidTotal: 9500, toPayTotal: 500 });

    // Mark paid ticks off the balance due and settles the line.
    await as.mutation(api.budget.markPaid, { lineId: sound.line._id });
    const after = await as.query(api.budget.summary, { eventId: s.eventId });
    expect(after.toPayTotal).toBe(0);
    expect(after.lines.find((l) => l.line.label === "Sound & lighting")?.line.paid).toBe(8000);
    const dues = await t.run((ctx) => ctx.db.query("dues").withIndex("by_slotId", (q) => q.eq("slotId", s.soundId)).take(10));
    expect(dues.every((d) => d.doneAt !== undefined)).toBe(true);

    // A quote never booked can't be marked paid; it has to be booked first.
    await expect(as.mutation(api.budget.markPaid, { lineId: s.sweetsLine })).rejects.toThrow(/booked first/);
  });
});
