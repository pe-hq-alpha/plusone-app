/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import workpoolTest from "@convex-dev/workpool/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { answersOf, matchCeremonies, settle } from "./lib/rsvp";
import { dayDate, dayRange } from "./lib/text";

const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  workpoolTest.register(t, "emailPool");
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

/** A four-ceremony wedding, Ravi invited to all four with a party of two. */
async function seed(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "priya@example.com", name: "Priya" });
    const plannerId = await ctx.db.insert("users", { email: "aunt@example.com", name: "Aunt" });
    const viewerId = await ctx.db.insert("users", { email: "uncle@example.com", name: "Uncle" });
    const eventId = await ctx.db.insert("events", {
      name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2026-12-04", endDate: "2026-12-06",
      city: "Chennai", currency: "INR", totalBudget: 2500000, eventType: "wedding", createdBy: ownerId,
      inboxAddress: "priya-arjun@inbox.example",
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: plannerId, role: "planner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    const ev = (name: string, date: string, dayIndex: number, order: number) =>
      ctx.db.insert("sessions", { eventId, name, date, dayIndex, order, budget: 1, guestCount: 100, color: "#74162a" });
    // Inserted out of order: the invitation must still list them by day, then by the couple's order.
    const event = await ev("Wedding", "2026-12-05", 1, 0);
    const mehndi = await ev("Mehndi", "2026-12-04", 0, 1);
    const nalangu = await ev("Nalangu", "2026-12-04", 0, 0);
    const reception = await ev("Reception", "2026-12-06", 2, 0);
    const all = [nalangu, mehndi, event, reception];
    const ravi = await ctx.db.insert("guests", {
      eventId, name: "Ravi Kumar", email: "ravi@example.com", partySize: 2, rsvp: "pending", attendingCount: 0, sessionIds: all,
    });
    const meera = await ctx.db.insert("guests", {
      eventId, name: "Meera", email: "meera@example.com", partySize: 1, rsvp: "pending", attendingCount: 0, sessionIds: [mehndi],
    });
    return { ownerId, plannerId, viewerId, eventId, nalangu, mehndi, event, reception, all, ravi, meera };
  });
}
type S = Awaited<ReturnType<typeof seed>>;

const guestOf = (t: T, id: Id<"guests">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const marks = (g: { sessionRsvps?: { sessionId: string; coming: boolean }[] }, ids: string[]) =>
  ids.map((id) => g.sessionRsvps?.find((a) => a.sessionId === id)?.coming ?? null);

/** Ravi answers on his link: coming to three of the four, not the Mehndi. */
async function linkThreeOfFour(t: T, s: S) {
  const token = await as(t, s.plannerId).mutation(api.site.rsvpLink, { guestId: s.ravi });
  await t.mutation(api.site.answer, {
    token,
    answers: s.all.map((sessionId) => ({ sessionId, coming: sessionId !== s.mehndi, count: 2 })),
  });
  return token;
}

/** What `rsvpWorkflow` hands over after reading an email, minus the model. */
const emailed = (s: S, reply: { rsvp: "yes" | "no" | "maybe" | "pending"; named?: boolean; coming?: (id: Id<"sessions">) => boolean | null; count?: number }) => ({
  guestId: s.ravi,
  rsvp: reply.rsvp,
  attendingCount: reply.count ?? 2,
  ceremonies: s.all.map((sessionId) => ({ sessionId, coming: reply.coming ? reply.coming(sessionId) : reply.rsvp === "yes", count: reply.count ?? 2 })),
  namedCeremonies: reply.named ?? false,
});

afterEach(() => vi.unstubAllEnvs());

describe("one invitation email", () => {
  test("one email per guest, with their ceremonies by day and their own RSVP link", async () => {
    vi.stubEnv("SITE_URL", "https://app.example.com/");
    const t = setup();
    const s = await seed(t);
    const sent = await as(t, s.plannerId).mutation(api.guests.sendInvites, { eventId: s.eventId, guestIds: [s.ravi, s.meera] });
    expect(sent).toEqual({ queued: 2, skipped: 0 });
    const messages = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(messages).toHaveLength(2);
    const toRavi = messages.filter((m) => m.guestId === s.ravi);
    expect(toRavi).toHaveLength(1);
    const body = toRavi[0].bodyText;
    const token = (await guestOf(t, s.ravi)).rsvpToken!;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(body).toContain(`https://app.example.com/r/${token}`);
    expect(body).toContain("Fri 4 Dec to Sun 6 Dec 2026");
    const lines = ["Nalangu, Fri 4 Dec 2026", "Mehndi, Fri 4 Dec 2026", "Wedding, Sat 5 Dec 2026", "Reception, Sun 6 Dec 2026"];
    for (const line of lines) expect(body).toContain(line);
    expect(lines.map((l) => body.indexOf(l))).toEqual([...lines.map((l) => body.indexOf(l))].sort((a, b) => a - b));
    expect(body).toContain("which of these you can make");
    expect(body).toContain("how many of your party of 2 are coming");
    expect(body).not.toMatch(/—|\d{4}-\d{2}-\d{2}/);
    // The copy-link button hands out the same link the email carried.
    expect(await as(t, s.plannerId).mutation(api.site.rsvpLink, { guestId: s.ravi })).toBe(token);
    const toMeera = messages.find((m) => m.guestId === s.meera)!.bodyText;
    expect(toMeera).toContain("Mehndi, Fri 4 Dec 2026");
    expect(toMeera).not.toContain("Wedding, Sat");
    expect(toMeera).toContain("if you can make it");
  });

  test("without SITE_URL the email still goes, just without a link", async () => {
    vi.stubEnv("SITE_URL", "");
    const t = setup();
    const s = await seed(t);
    await as(t, s.plannerId).mutation(api.guests.sendInvites, { eventId: s.eventId, guestIds: [s.ravi] });
    const [message] = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(message.bodyText).not.toContain("/r/");
    expect(message.bodyText).toContain("Just reply to this email");
    expect((await guestOf(t, s.ravi)).rsvpToken).toBeUndefined();
  });

  test("dates read the way a guest says them", () => {
    expect(dayDate("2026-12-04")).toBe("Fri 4 Dec 2026");
    expect(dayRange("2026-12-04", "2026-12-04")).toBe("Fri 4 Dec 2026");
    expect(dayRange("2026-12-31", "2027-01-01")).toBe("Thu 31 Dec 2026 to Fri 1 Jan 2027");
    expect(dayDate("sometime")).toBe("sometime");
  });
});

describe("the link and the email kept in step", () => {
  test("the link's 3 of 4, then a plain emailed yes, stays 3 of 4", async () => {
    const t = setup();
    const s = await seed(t);
    await linkThreeOfFour(t, s);
    await t.mutation(internal.guests.applyRsvp, emailed(s, { rsvp: "yes" }));
    const g = await guestOf(t, s.ravi);
    expect(marks(g, s.all)).toEqual([true, false, true, true]);
    expect(g.rsvp).toBe("yes");
    expect(g.attendingCount).toBe(2);
    expect(g.sessionRsvps?.find((a) => a.sessionId === s.mehndi)?.source).toBe("link");
    expect(g.respondedAt).toBeTypeOf("number");
    const log = await t.run((ctx) => ctx.db.query("activity").order("desc").first());
    expect(log?.text).toBe("replied by email with a yes; their earlier answers stand: coming to 3 of 4 (2 people).");
  });

  test("an emailed 'can't come after all' turns every ceremony to no", async () => {
    const t = setup();
    const s = await seed(t);
    await linkThreeOfFour(t, s);
    await t.mutation(internal.guests.applyRsvp, emailed(s, { rsvp: "no", count: 0 }));
    const g = await guestOf(t, s.ravi);
    expect(marks(g, s.all)).toEqual([false, false, false, false]);
    expect(g.sessionRsvps?.every((a) => a.source === "email" && a.count === 0)).toBe(true);
    expect(g.rsvp).toBe("no");
    expect(g.attendingCount).toBe(0);
  });

  test("an email that names ceremonies replaces those answers only", async () => {
    const t = setup();
    const s = await seed(t);
    await linkThreeOfFour(t, s);
    // "We can make the Mehndi after all, but not the Reception."
    await t.mutation(
      internal.guests.applyRsvp,
      emailed(s, { rsvp: "yes", named: true, coming: (id) => (id === s.mehndi ? true : id === s.reception ? false : null) }),
    );
    const g = await guestOf(t, s.ravi);
    expect(marks(g, s.all)).toEqual([true, true, true, false]);
    expect(g.sessionRsvps?.map((a) => a.source)).toEqual(["link", "email", "link", "email"]);
    // The link page shows the guest the same answers.
    const inv = (await t.query(api.site.invitation, { token: g.rsvpToken! }))!;
    expect(inv.sessions.map((e) => [e.name, e.coming])).toEqual([["Nalangu", true], ["Mehndi", true], ["Wedding", true], ["Reception", false]]);
  });

  test("a plain yes with nothing before means every ceremony; a food-only note changes no answer", async () => {
    const t = setup();
    const s = await seed(t);
    await t.mutation(internal.guests.applyRsvp, { ...emailed(s, { rsvp: "maybe" }), rsvp: undefined, dietary: "Vegetarian", allergies: ["Peanuts, severe"] });
    let g = await guestOf(t, s.ravi);
    expect(g.rsvp).toBe("pending");
    expect(g.sessionRsvps).toBeUndefined();
    expect(g.respondedAt).toBeUndefined();
    await t.mutation(internal.guests.applyRsvp, { ...emailed(s, { rsvp: "yes", count: 1 }), allergies: ["Shellfish"] });
    g = await guestOf(t, s.ravi);
    expect(marks(g, s.all)).toEqual([true, true, true, true]);
    expect(g.attendingCount).toBe(1);
    expect(g.allergies).toEqual(["Peanuts, severe", "Shellfish"]);
    expect(g.dietary).toBe("Vegetarian");
  });

  test("a yes after saying no to everything is a change of mind", async () => {
    const t = setup();
    const s = await seed(t);
    await t.mutation(internal.guests.applyRsvp, emailed(s, { rsvp: "no", count: 0 }));
    await t.mutation(internal.guests.applyRsvp, emailed(s, { rsvp: "yes" }));
    const g = await guestOf(t, s.ravi);
    expect(marks(g, s.all)).toEqual([true, true, true, true]);
    expect(g.rsvp).toBe("yes");
  });

  test("the overall answer and count always follow from the ceremonies", () => {
    const E = ["a", "b", "c"];
    const base = { sessionIds: E, rsvp: "pending" as const, attendingCount: 0, partySize: 4 };
    const at = 1;
    // Some answered no, none yes: still to come, not a no.
    expect(settle(base, { kind: "each", answers: [{ sessionId: "a", coming: false, count: 0 }] }, "couple", at)).toMatchObject({ rsvp: "pending", attendingCount: 0 });
    // Every one a no: no.
    expect(settle(base, { kind: "all", coming: false, count: 0 }, "email", at)).toMatchObject({ rsvp: "no", attendingCount: 0 });
    // Any yes: yes, with the largest party coming to any one of them, capped at their party.
    const mixed = settle(base, { kind: "each", answers: [{ sessionId: "a", coming: true, count: 2 }, { sessionId: "b", coming: true, count: 9 }] }, "link", at);
    expect(mixed).toMatchObject({ rsvp: "yes", attendingCount: 4 });
    // Taking the yeses back leaves them undecided again, or maybe when they said so.
    const cleared = settle({ ...base, sessionRsvps: mixed.sessionRsvps }, { kind: "clear", sessionIds: ["a", "b"] }, "couple", at, "maybe");
    expect(cleared).toMatchObject({ rsvp: "maybe", attendingCount: 0, sessionRsvps: [] });
    // An answer for a ceremony they aren't invited to counts for nothing.
    expect(settle(base, { kind: "each", answers: [{ sessionId: "z", coming: true, count: 2 }] }, "link", at)).toMatchObject({ rsvp: "pending", sessionRsvps: [] });
    // Someone who answered before ceremonies had their own answers: the one answer stands for each.
    expect(answersOf({ ...base, rsvp: "yes", attendingCount: 3 }).map((a) => [a.sessionId, a.coming, a.count])).toEqual([["a", true, 3], ["b", true, 3], ["c", true, 3]]);
    // A guest invited to no ceremony in particular keeps a plain yes.
    expect(settle({ ...base, sessionIds: [] }, { kind: "vagueYes", count: 2 }, "email", at)).toMatchObject({ rsvp: "yes", attendingCount: 2 });
  });

  test("ceremony names in a reply only ever match the guest's own ceremonies", () => {
    const invited = [
      { _id: "n", name: "Nalangu", date: "2026-12-04" },
      { _id: "m", name: "Mehndi", date: "2026-12-04" },
      { _id: "w", name: "Wedding", date: "2026-12-05" },
      { _id: "w2", name: "Wedding Lunch", date: "2026-12-05" },
    ];
    const said = (ceremony: string) => ({ ceremony, coming: true as const, count: 2 });
    expect(matchCeremonies(invited, [said("Nalangu, Fri 4 Dec 2026"), said("the mehndi"), said("Sangeet"), said("Lunch")]).map((c) => c.sessionId)).toEqual(["n", "m", "w2"]);
    // "Wedding" is one ceremony's exact name, even though another contains it.
    expect(matchCeremonies(invited, [said("Wedding")]).map((c) => c.sessionId)).toEqual(["w"]);
    // "Wed" could be either: left out rather than guessed.
    expect(matchCeremonies(invited, [said("Wed")])).toEqual([]);
  });

  test("the guest's link still checks its token and slows down a flood of changes", async () => {
    const t = setup();
    const s = await seed(t);
    await expect(t.mutation(api.site.answer, { token: "f".repeat(32), answers: [{ sessionId: s.mehndi, coming: true, count: 1 }] })).rejects.toThrow(/isn't valid/);
    const token = await linkThreeOfFour(t, s);
    for (let i = 0; i < 4; i++) {
      await t.mutation(api.site.answer, { token, answers: [{ sessionId: s.mehndi, coming: i % 2 === 0, count: 1 }] });
    }
    await expect(t.mutation(api.site.answer, { token, answers: [{ sessionId: s.mehndi, coming: true, count: 1 }] })).rejects.toThrow(/a lot of changes/);
    const g = await guestOf(t, s.ravi);
    expect(marks(g, s.all)).toEqual([true, false, true, true]);
    const log = await t.run((ctx) => ctx.db.query("activity").order("desc").first());
    expect(log?.text).toBe("replied on their RSVP link: coming to 3 of 4 (2 people).");
  });
});

describe("the couple's own view", () => {
  test("a planner can set one ceremony's answer by hand; a viewer can't", async () => {
    const t = setup();
    const s = await seed(t);
    await linkThreeOfFour(t, s);
    await as(t, s.plannerId).mutation(api.guests.setAnswer, { guestId: s.ravi, sessionId: s.mehndi, coming: true, count: 1 });
    let g = await guestOf(t, s.ravi);
    const mehndi = g.sessionRsvps?.find((a) => a.sessionId === s.mehndi);
    expect(mehndi).toMatchObject({ coming: true, count: 1, source: "couple" });
    expect(marks(g, s.all)).toEqual([true, true, true, true]);
    await expect(
      as(t, s.viewerId).mutation(api.guests.setAnswer, { guestId: s.ravi, sessionId: s.mehndi, coming: false }),
    ).rejects.toThrow(/planner/);
    await expect(
      as(t, s.plannerId).mutation(api.guests.setAnswer, { guestId: s.meera, sessionId: s.event, coming: true }),
    ).rejects.toThrow(/isn't invited/);
    // Taking every answer back leaves them with no answer at all.
    await as(t, s.ownerId).mutation(api.guests.setAnswer, { guestId: s.ravi, coming: null });
    g = await guestOf(t, s.ravi);
    expect(g.rsvp).toBe("pending");
    expect(g.sessionRsvps).toEqual([]);
    const log = await t.run((ctx) => ctx.db.query("activity").order("desc").first());
    expect(log?.text).toBe("cleared Ravi Kumar's answer for all 4 ceremonies.");
  });

  test("the caterer's notes for a ceremony leave out whoever said no to it", async () => {
    const t = setup();
    const s = await seed(t);
    await t.run((ctx) => ctx.db.patch(s.ravi, { allergies: ["Peanuts, severe"], dietary: "Vegetarian" }));
    await linkThreeOfFour(t, s);
    expect(await t.query(internal.guests.dietarySummary, { eventId: s.eventId, sessionId: s.mehndi })).toBeNull();
    expect(await t.query(internal.guests.dietarySummary, { eventId: s.eventId, sessionId: s.event })).toBe(
      "Allergies: peanuts (1 guest, 1 severe). Other food needs: vegetarian (1).",
    );
    expect(await t.query(internal.guests.dietarySummary, { eventId: s.eventId })).toContain("peanuts (1 guest, 1 severe)");
  });
});
