/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { insertEvent } from "./events";
import { LEAD_TITLE, TYPE_SLOTS, slotsFor } from "./lib/templates";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const signedInAs = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

/** An owner, a planner and a viewer on one Kochi wedding with an Officiant need and its budget line. */
async function seed(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "priya@example.com", name: "Priya" });
    const plannerId = await ctx.db.insert("users", { email: "meera@example.com", name: "Meera" });
    const viewerId = await ctx.db.insert("users", { email: "nani@example.com", name: "Nani" });
    const eventId = await ctx.db.insert("events", {
      name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2027-02-12", endDate: "2027-02-13", city: "Kochi",
      currency: "INR", totalBudget: 2500000, eventType: "wedding", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: plannerId, role: "planner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    const sessionId = await ctx.db.insert("sessions", {
      eventId, name: "Ceremony", date: "2027-02-13", dayIndex: 1, budget: 1000000, guestCount: 200, color: "#000", order: 0,
    });
    const slotId = await ctx.db.insert("vendorSlots", {
      eventId, sessionIds: [sessionId], category: "Officiant", title: "Officiant", budget: 25000, status: "research",
    });
    const lineId = await ctx.db.insert("budgetLines", {
      eventId, slotId, sessionId, label: "Officiant", planned: 25000, committed: 0, paid: 0,
    });
    return { ownerId, plannerId, viewerId, eventId, sessionId, slotId, lineId };
  });
}

describe("renaming a vendor need", () => {
  test("the need and its budget line take the new name, the category stays, and History says so", async () => {
    const t = setup();
    const s = await seed(t);
    await signedInAs(t, s.plannerId).mutation(api.slots.update, { slotId: s.slotId, patch: { title: "  Iyer " } });

    const slot = await t.run((ctx) => ctx.db.get(s.slotId));
    expect(slot).toMatchObject({ title: "Iyer", category: "Officiant", budget: 25000 });
    expect((await t.run((ctx) => ctx.db.get(s.lineId)))?.label).toBe("Iyer");

    const history = await t.run((ctx) =>
      ctx.db.query("activity").withIndex("by_eventId", (q) => q.eq("eventId", s.eventId)).take(10),
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ type: "note", text: "renamed Officiant to Iyer.", actorUserId: s.plannerId, refs: { slotId: s.slotId } });
  });

  test("the same name again changes nothing and logs nothing", async () => {
    const t = setup();
    const s = await seed(t);
    await signedInAs(t, s.ownerId).mutation(api.slots.update, { slotId: s.slotId, patch: { title: "Officiant " } });
    const history = await t.run((ctx) =>
      ctx.db.query("activity").withIndex("by_eventId", (q) => q.eq("eventId", s.eventId)).take(10),
    );
    expect(history).toHaveLength(0);
  });

  test("a blank or over-long name is refused", async () => {
    const t = setup();
    const s = await seed(t);
    const as = signedInAs(t, s.ownerId);
    await expect(as.mutation(api.slots.update, { slotId: s.slotId, patch: { title: "   " } })).rejects.toThrow(/Give this need a name/);
    await expect(as.mutation(api.slots.update, { slotId: s.slotId, patch: { title: "x".repeat(61) } })).rejects.toThrow(/60 characters/);
    // Sixty is fine.
    await as.mutation(api.slots.update, { slotId: s.slotId, patch: { title: "y".repeat(60) } });
    expect((await t.run((ctx) => ctx.db.get(s.slotId)))?.title).toBe("y".repeat(60));
  });

  test("a viewer can't rename", async () => {
    const t = setup();
    const s = await seed(t);
    await expect(
      signedInAs(t, s.viewerId).mutation(api.slots.update, { slotId: s.slotId, patch: { title: "Iyer" } }),
    ).rejects.toThrow(/planner role/);
    const slot = await t.run((ctx) => ctx.db.get(s.slotId));
    expect(slot?.title).toBe("Officiant");
    expect((await t.run((ctx) => ctx.db.get(s.lineId)))?.label).toBe("Officiant");
  });
});

describe("who leads a ceremony is an ordinary need", () => {
  test("every kind of event that needs someone to lead a part starts with the same plain label, category Officiant", () => {
    for (const type of Object.keys(TYPE_SLOTS) as (keyof typeof TYPE_SLOTS)[]) {
      for (const slot of slotsFor(type).filter((s) => s.category === "Officiant")) {
        expect(slot.title).toBe(LEAD_TITLE);
      }
    }
    expect(LEAD_TITLE).toBe("Who leads the ceremony");
  });

  test("a new wedding's need for someone to lead the ceremony is plainly labelled and serves only the ceremony", async () => {
    const t = setup();
    const eventId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "priya@example.com" });
      return await insertEvent(ctx, userId, {
        name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2027-02-10", endDate: "2027-02-14", city: "Kochi",
        currency: "INR", totalBudget: 2500000, eventType: "wedding",
      });
    });
    const { slots, lines, sessions } = await t.run(async (ctx) => ({
      slots: await ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(50),
      lines: await ctx.db.query("budgetLines").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(50),
      sessions: await ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(50),
    }));
    const lead = slots.find((s) => s.category === "Officiant");
    expect(lead?.title).toBe("Who leads the ceremony");
    const ceremony = sessions.find((e) => e.name === "Ceremony");
    expect(lead?.sessionIds).toEqual([ceremony?._id]);
    expect(lines.find((l) => l.slotId === lead?._id)?.label).toBe("Who leads the ceremony");
    const event = await t.run((ctx) => ctx.db.get(eventId));
    expect(event && "template" in event).toBe(false);
  });

  test("the family's own word for that person is kept as the need's title", async () => {
    const t = setup();
    const eventId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "meena@example.com" });
      return await insertEvent(ctx, userId, {
        name: "Meena & Karthik", host: "Meena", coHost: "Karthik", startDate: "2027-02-10", endDate: "2027-02-10", city: "Chennai",
        currency: "INR", totalBudget: 1500000, eventType: "wedding",
        sessions: [
          { name: "Muhurtham", date: "2027-02-10", guestCount: 300, budget: 2 },
          { name: "Reception", date: "2027-02-10", guestCount: 400, budget: 3 },
        ],
        needs: [
          { category: "Officiant", title: "Vadhyar", booked: false, sessionNames: ["Muhurtham"] },
          { category: "Live band", title: "Nadaswaram", booked: false, sessionNames: ["Muhurtham"] },
        ],
      });
    });
    const slots = await t.run((ctx) => ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(10));
    expect(slots.map((s) => s.title).sort()).toEqual(["Nadaswaram", "Vadhyar"]);
  });
});

describe("the venue at setup", () => {
  test("is an ordinary need: booked with a name, it carries that vendor and nothing is written to the old venue fields", async () => {
    const t = setup();
    const eventId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "anita@example.com" });
      return await insertEvent(ctx, userId, {
        name: "Anita's party", host: "Anita", coHost: "", startDate: "2027-03-06", endDate: "2027-03-06", city: "Pune",
        currency: "INR", totalBudget: 400000, eventType: "party",
        sessions: [{ name: "Party", date: "2027-03-06", guestCount: 80, budget: 1 }],
        needs: [
          { category: "Venue", title: "Venue", booked: true, vendorName: "  The Garden Room  ", committed: 50000 },
          { category: "Catering", title: "Catering", booked: false, vendorName: "Ignored while looking" },
          { category: "Photography", title: "Photographer", booked: true },
        ],
      });
    });
    const { event, slots, vendors } = await t.run(async (ctx) => ({
      event: await ctx.db.get(eventId),
      slots: await ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(10),
      vendors: await ctx.db.query("vendors").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(10),
    }));
    expect(event?.venueStatus).toBeUndefined();
    expect(event?.venueName).toBeUndefined();

    const venueSlot = slots.find((s) => s.category === "Venue");
    expect(venueSlot?.status).toBe("booked");
    expect(vendors).toHaveLength(1);
    expect(vendors[0]).toMatchObject({ name: "The Garden Room", category: "Venue", slotId: venueSlot?._id });
    expect(venueSlot?.bookedVendorId).toBe(vendors[0]._id);

    // Looking means looking: no vendor is made from a name typed on an unbooked need.
    expect(slots.find((s) => s.category === "Catering")?.status).toBe("research");
    // Booked without a name is still booked, just with nobody on it yet.
    const photo = slots.find((s) => s.category === "Photography");
    expect(photo?.status).toBe("booked");
    expect(photo?.bookedVendorId).toBeUndefined();

    expect(await t.query(internal.events.venueNeed, { eventId })).toEqual({ booked: true, name: "The Garden Room" });
  });

  test("the planning brief reads the venue need: looking for one is not booked, and no venue need is null", async () => {
    const t = setup();
    const make = (needs: { category: string; title: string; booked: boolean }[]) =>
      t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", { email: `${needs.length}@example.com` });
        return await insertEvent(ctx, userId, {
          name: "Ravi's 60th", host: "Ravi", coHost: "", startDate: "2027-04-01", endDate: "2027-04-01", city: "Madurai",
          currency: "INR", totalBudget: 300000, eventType: "party",
          sessions: [{ name: "Lunch", date: "2027-04-01", guestCount: 60, budget: 1 }],
          needs,
        });
      });
    const looking = await make([{ category: "Venue", title: "Venue", booked: false }]);
    expect(await t.query(internal.events.venueNeed, { eventId: looking })).toEqual({ booked: false });
    const none = await make([{ category: "Catering", title: "Catering", booked: false }, { category: "Décor", title: "Décor", booked: false }]);
    expect(await t.query(internal.events.venueNeed, { eventId: none })).toBeNull();
  });
});
