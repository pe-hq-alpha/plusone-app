/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siteSlug } from "./site";

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
    const ownerId = await ctx.db.insert("users", { email: "priya@example.com", name: "Priya" });
    const plannerId = await ctx.db.insert("users", { email: "aunt@example.com", name: "Aunt" });
    const eventId = await ctx.db.insert("events", {
      name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2027-02-12", endDate: "2027-02-14",
      city: "Ahmedabad", currency: "INR", totalBudget: 2500000, eventType: "wedding", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: plannerId, role: "planner" });
    const mehndi = await ctx.db.insert("sessions", { eventId, name: "Mehndi", key: "mehndi", date: "2027-02-12", dayIndex: 0, budget: 1, guestCount: 80, color: "#74162a", order: 0 });
    const pithi = await ctx.db.insert("sessions", { eventId, name: "Pithi", key: "pithi", date: "2027-02-13", dayIndex: 1, budget: 1, guestCount: 30, color: "#74162a", order: 0 });
    const event = await ctx.db.insert("sessions", { eventId, name: "Wedding", date: "2027-02-14", dayIndex: 2, budget: 1, guestCount: 200, color: "#74162a", order: 0 });
    const guestId = await ctx.db.insert("guests", { eventId, name: "Olivia Carter", email: "olivia@example.com", partySize: 2, rsvp: "pending", attendingCount: 0, sessionIds: [mehndi, event] });
    return { ownerId, plannerId, eventId, mehndi, pithi, event, guestId };
  });
}

describe("wedding website", () => {
  test("addresses are readable and can't be guessed", () => {
    const a = siteSlug("Priya Shah", "Arjun"), b = siteSlug("Priya Shah", "Arjun");
    expect(a).toMatch(/^priya-and-arjun-[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
  });

  test("nothing shows until an owner publishes, and then only what's turned on", async () => {
    const t = setup();
    const s = await seed(t);
    await as(t, s.plannerId).mutation(api.site.save, { eventId: s.eventId, patch: { travel: "Fly into Ahmedabad", hiddenSessionIds: [s.pithi] } });
    const site = (await as(t, s.ownerId).query(api.site.get, { eventId: s.eventId }))!;
    expect(await t.query(api.site.bySlug, { slug: site.slug })).toBeNull();
    await expect(as(t, s.plannerId).mutation(api.site.setPublished, { eventId: s.eventId, published: true })).rejects.toThrow(/owner/);
    await as(t, s.ownerId).mutation(api.site.setPublished, { eventId: s.eventId, published: true });
    const pub = (await t.query(api.site.bySlug, { slug: site.slug }))!;
    expect(pub.sessions.map((e) => e.name)).toEqual(["Mehndi", "Wedding"]);
    expect(pub.travel).toBe("Fly into Ahmedabad");
    expect(Object.keys(pub)).not.toContain("totalBudget");
    await as(t, s.ownerId).mutation(api.site.save, { eventId: s.eventId, patch: { showTravel: false } });
    const less = (await t.query(api.site.bySlug, { slug: site.slug }))!;
    expect(less.travel).toBeUndefined();
    expect(await t.query(api.site.bySlug, { slug: "priya-and-arjun" })).toBeNull();
  });
});

describe("personal RSVP links", () => {
  test("a guest sees only their own invitation and answers each ceremony", async () => {
    const t = setup();
    const s = await seed(t);
    const token = await as(t, s.plannerId).mutation(api.site.rsvpLink, { guestId: s.guestId });
    expect(await as(t, s.plannerId).mutation(api.site.rsvpLink, { guestId: s.guestId })).toBe(token);
    const inv = (await t.query(api.site.invitation, { token }))!;
    expect(inv.firstName).toBe("Olivia");
    expect(inv.sessions.map((e) => e.name)).toEqual(["Mehndi", "Wedding"]);
    await t.mutation(api.site.answer, {
      token,
      answers: [
        { sessionId: s.mehndi, coming: false, count: 0 },
        { sessionId: s.event, coming: true, count: 9 },
        { sessionId: s.pithi, coming: true, count: 2 },
      ],
      dietary: "Vegetarian",
      allergies: "Peanuts, severe",
    });
    const g = (await t.run((ctx) => ctx.db.get(s.guestId)))!;
    expect(g.rsvp).toBe("yes");
    expect(g.attendingCount).toBe(2);
    expect(g.sessionRsvps?.map((a) => [a.coming, a.count])).toEqual([[false, 0], [true, 2]]);
    expect(g.allergies).toEqual(["Peanuts, severe"]);
    expect((await t.query(api.site.invitation, { token }))!.responded).toBe(true);
  });

  test("a made-up or short token gets nothing", async () => {
    const t = setup();
    await seed(t);
    expect(await t.query(api.site.invitation, { token: "abc" })).toBeNull();
    expect(await t.query(api.site.invitation, { token: "0".repeat(32) })).toBeNull();
    await expect(t.mutation(api.site.answer, { token: "0".repeat(32), answers: [] })).rejects.toThrow(/isn't valid/);
  });
});
