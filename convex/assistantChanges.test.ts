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

/** A birthday with a pooja and a lunch, and one assistant reply holding the cards to press. */
async function seed(t: T, cards: Record<string, unknown>[]) {
  return await t.run(async (ctx) => {
    const plannerId = await ctx.db.insert("users", { email: "meera@example.com", name: "Meera" });
    const eventId = await ctx.db.insert("events", {
      name: "Amma's 60th", host: "Meera", coHost: "", startDate: "2027-01-30", endDate: "2027-01-30", city: "Chennai",
      currency: "INR", totalBudget: 450000, eventType: "birthday", createdBy: plannerId,
    });
    await ctx.db.insert("members", { eventId, userId: plannerId, role: "owner" });
    const poojaId = await ctx.db.insert("sessions", {
      eventId, name: "Pooja", date: "2027-01-30", dayIndex: 0, budget: 150000, guestCount: 60, color: "#000", order: 0, startTime: "09:00",
    });
    const lunchId = await ctx.db.insert("sessions", {
      eventId, name: "Lunch", date: "2027-01-30", dayIndex: 0, budget: 300000, guestCount: 120, color: "#000", order: 1, startTime: "12:30",
    });
    const replyId = await ctx.db.insert("chatMessages", {
      eventId, role: "assistant", content: "Here is the change.",
      toolCalls: cards.map((args) => ({ name: "propose", args, status: "proposed" })),
    });
    return { plannerId, eventId, poojaId, lunchId, replyId };
  });
}

describe("the assistant's plan changes", () => {
  test("a new headcount lands on the parts the card names, and History says so", async () => {
    const t = setup();
    const s = await seed(t, []);
    await t.run((ctx) =>
      ctx.db.patch(s.replyId, {
        toolCalls: [{ name: "propose", status: "proposed", args: { kind: "set_guests", label: "Plan lunch for 140", guestCount: 140, sessionIds: [s.lunchId], sessionNames: ["Lunch"] } }],
      }),
    );
    const res = await signedInAs(t, s.plannerId).mutation(api.assistant.runProposal, { eventId: s.eventId, replyId: s.replyId, index: 0 });
    expect(res.done).toBe("Lunch is now planned for 140 people. Quotes compare at the new number.");
    expect((await t.run((ctx) => ctx.db.get(s.lunchId)))?.guestCount).toBe(140);
    expect((await t.run((ctx) => ctx.db.get(s.poojaId)))?.guestCount).toBe(60);
    const history = await t.run((ctx) => ctx.db.query("activity").withIndex("by_eventId", (q) => q.eq("eventId", s.eventId)).take(5));
    expect(history.map((h) => h.text)).toContain("planned Lunch for 140 people.");
  });

  test("the planner can widen the card to every part before pressing it", async () => {
    const t = setup();
    const s = await seed(t, []);
    await t.run((ctx) =>
      ctx.db.patch(s.replyId, {
        toolCalls: [{ name: "propose", status: "proposed", args: { kind: "set_guests", label: "Plan for 140", guestCount: 140, sessionIds: [s.lunchId] } }],
      }),
    );
    const res = await signedInAs(t, s.plannerId).mutation(api.assistant.runProposal, {
      eventId: s.eventId, replyId: s.replyId, index: 0, overrides: { sessionIds: [s.poojaId, s.lunchId], guestCount: 150 },
    });
    expect(res.done).toBe("Pooja and Lunch are now planned for 150 people. Quotes compare at the new number.");
    expect((await t.run((ctx) => ctx.db.get(s.poojaId)))?.guestCount).toBe(150);
  });

  test("a new start time moves only that part, and a time that isn't HH:MM is refused", async () => {
    const t = setup();
    const s = await seed(t, [{ kind: "set_time", label: "Move lunch to 1 pm", startTime: "13:00", sessionIds: [], sessionNames: ["Lunch"] }]);
    await t.run((ctx) =>
      ctx.db.patch(s.replyId, {
        toolCalls: [
          { name: "propose", status: "proposed", args: { kind: "set_time", label: "Move lunch to 1 pm", startTime: "13:00", sessionIds: [s.lunchId], sessionNames: ["Lunch"] } },
          { name: "propose", status: "proposed", args: { kind: "set_time", label: "Move the pooja", startTime: "9am", sessionIds: [s.poojaId] } },
        ],
      }),
    );
    const res = await signedInAs(t, s.plannerId).mutation(api.assistant.runProposal, { eventId: s.eventId, replyId: s.replyId, index: 0 });
    expect(res.done).toBe("Lunch now starts at 13:00.");
    expect((await t.run((ctx) => ctx.db.get(s.lunchId)))?.startTime).toBe("13:00");
    expect((await t.run((ctx) => ctx.db.get(s.poojaId)))?.startTime).toBe("09:00");
    await expect(
      signedInAs(t, s.plannerId).mutation(api.assistant.runProposal, { eventId: s.eventId, replyId: s.replyId, index: 1 }),
    ).rejects.toThrow("Times are written as HH:MM.");
  });

  test("a vendor booked outside PlusOne: booked, in the budget, and paid, from one card", async () => {
    const t = setup();
    const s = await seed(t, []);
    const slotId = await t.run((ctx) => ctx.db.insert("vendorSlots", { eventId: s.eventId, sessionIds: [s.lunchId], category: "Catering", title: "Biryani place", budget: 5000, status: "research" }));
    await t.run((ctx) =>
      ctx.db.patch(s.replyId, {
        toolCalls: [{ name: "propose", status: "proposed", args: { kind: "book_elsewhere", label: "Record the biryani booking", slotId, slotTitle: "Biryani place", vendorName: "Star Biryani", amount: 3800, paid: 3800 } }],
      }),
    );
    const res = await signedInAs(t, s.plannerId).mutation(api.assistant.runProposal, { eventId: s.eventId, replyId: s.replyId, index: 0 });
    expect(res.done).toMatch(/^Biryani place is booked with Star Biryani at .*3,800.*paid\. The budget and payments are updated\.$/);
    const slot = await t.run((ctx) => ctx.db.get(slotId));
    expect(slot?.status).toBe("booked");
    const line = await t.run((ctx) => ctx.db.query("budgetLines").withIndex("by_slotId", (q) => q.eq("slotId", slotId)).first());
    expect(line?.committed).toBe(3800);
    expect(line?.paid).toBe(3800);
    const dues = await t.run((ctx) => ctx.db.query("dues").withIndex("by_slotId", (q) => q.eq("slotId", slotId)).take(10));
    expect(dues.map((d) => [d.label, d.amount, Boolean(d.doneAt)])).toEqual([["Advance", 3800, true]]);
  });

  test("booked elsewhere with part paid leaves the balance on what's due", async () => {
    const t = setup();
    const s = await seed(t, []);
    const slotId = await t.run((ctx) => ctx.db.insert("vendorSlots", { eventId: s.eventId, sessionIds: [s.lunchId], category: "Catering", title: "Catering", budget: 60000, status: "research" }));
    await signedInAs(t, s.plannerId).mutation(api.slots.bookedElsewhere, { slotId, name: "Annam Caterers", total: 56000, paid: 20000 });
    const dues = await t.run((ctx) => ctx.db.query("dues").withIndex("by_slotId", (q) => q.eq("slotId", slotId)).take(10));
    expect(dues.map((d) => [d.label, d.amount, Boolean(d.doneAt)]).sort()).toEqual([["Advance", 20000, true], ["Balance", 36000, false]]);
    await expect(signedInAs(t, s.plannerId).mutation(api.slots.bookedElsewhere, { slotId, name: "Someone else", total: 1000 })).rejects.toThrow(/already booked/);
  });
});
