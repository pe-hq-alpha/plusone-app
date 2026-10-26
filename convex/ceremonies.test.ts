/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { insertEvent } from "./events";
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

async function seed(t: T) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "priya@example.com" });
    const viewerId = await ctx.db.insert("users", { email: "nani@example.com" });
    const eventId = await ctx.db.insert("events", {
      name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2027-02-12", endDate: "2027-02-14", city: "Edison",
      currency: "USD", totalBudget: 40000, eventType: "wedding", createdBy: userId,
    });
    await ctx.db.insert("members", { eventId, userId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    const ceremony = (name: string, dayIndex: number, order: number) =>
      ctx.db.insert("sessions", {
        eventId, name, dayIndex, order, date: `2027-02-${12 + dayIndex}`, guestCount: 100, budget: 1000, color: "#000",
        significance: `What ${name} means`, location: "Home",
      });
    const mehndi = await ceremony("Mehndi", 0, 0);
    const sangeet = await ceremony("Sangeet", 1, 1);
    const event = await ceremony("Wedding", 2, 2);
    return { userId, viewerId, eventId, mehndi, sangeet, event };
  });
}

describe("editing a ceremony", () => {
  test("saving one field leaves the others alone", async () => {
    const t = setup();
    const s = await seed(t);
    await signedInAs(t, s.userId).mutation(api.sessions.update, { sessionId: s.mehndi, patch: { startTime: "16:00" } });
    const after = await t.run((ctx) => ctx.db.get(s.mehndi));
    expect(after).toMatchObject({ startTime: "16:00", significance: "What Mehndi means", location: "Home" });
  });

  test("an emptied field is removed, and a bad time is refused", async () => {
    const t = setup();
    const s = await seed(t);
    const as = signedInAs(t, s.userId);
    await as.mutation(api.sessions.update, { sessionId: s.mehndi, patch: { location: "" } });
    expect((await t.run((ctx) => ctx.db.get(s.mehndi)))?.location).toBeUndefined();
    await expect(as.mutation(api.sessions.update, { sessionId: s.mehndi, patch: { startTime: "4pm" } })).rejects.toThrow("HH:MM");
  });

  test("a viewer can't edit", async () => {
    const t = setup();
    const s = await seed(t);
    await expect(signedInAs(t, s.viewerId).mutation(api.sessions.update, { sessionId: s.mehndi, patch: { name: "Mine" } })).rejects.toThrow();
  });
});

describe("moving a ceremony on the board", () => {
  test("to another day, before a ceremony there, with its date following", async () => {
    const t = setup();
    const s = await seed(t);
    await signedInAs(t, s.userId).mutation(api.sessions.move, { sessionId: s.sangeet, dayIndex: 0, position: 0 });
    const sessions = await t.run(async (ctx) => (await ctx.db.query("sessions").collect()).sort((a, b) => a.order - b.order));
    expect(sessions.map((e) => [e.name, e.dayIndex, e.date])).toEqual([
      ["Sangeet", 0, "2027-02-12"],
      ["Mehndi", 0, "2027-02-12"],
      ["Wedding", 2, "2027-02-14"],
    ]);
  });

  test("past the last day adds a day to the wedding", async () => {
    const t = setup();
    const s = await seed(t);
    await signedInAs(t, s.userId).mutation(api.sessions.move, { sessionId: s.sangeet, dayIndex: 3, position: 0 });
    const event = await t.run((ctx) => ctx.db.get(s.eventId));
    expect(event?.endDate).toBe("2027-02-15");
  });
});

describe("to-dos", () => {
  test("stay on the wedding when their ceremony is removed", async () => {
    const t = setup();
    const s = await seed(t);
    const as = signedInAs(t, s.userId);
    const taskId = await as.mutation(api.tasks.add, { eventId: s.eventId, sessionId: s.sangeet, title: "Book the DJ" });
    await as.mutation(api.sessions.remove, { sessionId: s.sangeet });
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task).toMatchObject({ title: "Book the DJ" });
    expect(task?.sessionId).toBeUndefined();
  });

  test("can't be pinned to another wedding's ceremony", async () => {
    const t = setup();
    const s = await seed(t);
    const other = await t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        name: "Someone else", host: "A", coHost: "B", startDate: "2027-05-01", endDate: "2027-05-01", city: "Leeds",
        currency: "GBP", totalBudget: 1, eventType: "wedding", createdBy: s.userId,
      });
      return await ctx.db.insert("sessions", { eventId, name: "Theirs", dayIndex: 0, order: 0, date: "2027-05-01", guestCount: 1, budget: 1, color: "#000" });
    });
    await expect(signedInAs(t, s.userId).mutation(api.tasks.add, { eventId: s.eventId, sessionId: other, title: "x" })).rejects.toThrow();
  });
});

describe("ceremonies in date order", () => {
  const names = (list: { name: string }[]) => list.map((e) => e.name);

  test("a wedding saved with a day-2 rite before Nalangu lists Nalangu first", async () => {
    const t = setup();
    const { userId, eventId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "priya@example.com" });
      const eventId = await insertEvent(ctx, userId, {
        name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2027-02-12", endDate: "2027-02-13", city: "Kochi",
        currency: "INR", totalBudget: 2500000, eventType: "wedding",
        sessions: [
          { name: "Muhurtham", date: "2027-02-13", guestCount: 200, budget: 100 },
          { name: "Nalangu", date: "2027-02-12", guestCount: 60, budget: 100 },
          { name: "Haldi", date: "2027-02-12", guestCount: 60, budget: 100 },
        ],
      });
      return { userId, eventId };
    });
    const list = await signedInAs(t, userId).query(api.sessions.list, { eventId });
    expect(names(list)).toEqual(["Nalangu", "Haldi", "Muhurtham"]);
    expect(list.map((e) => e.order)).toEqual([0, 1, 2]);
  });

  test("moving a ceremony to another day renumbers, to the end of that day", async () => {
    const t = setup();
    const s = await seed(t);
    const as = signedInAs(t, s.userId);
    await as.mutation(api.sessions.update, { sessionId: s.mehndi, patch: { dayIndex: 2 } });
    const list = await as.query(api.sessions.list, { eventId: s.eventId });
    expect(list.map((e) => [e.name, e.dayIndex, e.date, e.order])).toEqual([
      ["Sangeet", 1, "2027-02-13", 0],
      ["Wedding", 2, "2027-02-14", 1],
      ["Mehndi", 2, "2027-02-14", 2],
    ]);
  });

  test("changing the date moves the day with it", async () => {
    const t = setup();
    const s = await seed(t);
    const as = signedInAs(t, s.userId);
    await as.mutation(api.sessions.update, { sessionId: s.event, patch: { date: "2027-02-12" } });
    const list = await as.query(api.sessions.list, { eventId: s.eventId });
    expect(list.map((e) => [e.name, e.dayIndex, e.order])).toEqual([["Mehndi", 0, 0], ["Wedding", 0, 1], ["Sangeet", 1, 2]]);
  });

  test("a ceremony added on day 1 lands within day 1", async () => {
    const t = setup();
    const s = await seed(t);
    const as = signedInAs(t, s.userId);
    await as.mutation(api.sessions.add, { eventId: s.eventId, name: "Nalangu", date: "2027-02-12", dayIndex: 0, budget: 100, guestCount: 20 });
    const list = await as.query(api.sessions.list, { eventId: s.eventId });
    expect(names(list)).toEqual(["Mehndi", "Nalangu", "Sangeet", "Wedding"]);
    expect(list.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });

  test("renumberAll fixes a wedding saved out of order", async () => {
    const t = setup();
    const s = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(s.mehndi, { order: 2 });
      await ctx.db.patch(s.event, { order: 0 });
    });
    await t.mutation(internal.sessions.renumberAll, {});
    const list = await signedInAs(t, s.userId).query(api.sessions.list, { eventId: s.eventId });
    expect(list.map((e) => [e.name, e.order])).toEqual([["Mehndi", 0], ["Sangeet", 1], ["Wedding", 2]]);
  });
});
