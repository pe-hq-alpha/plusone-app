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

const eventRow = (createdBy: Id<"users">, name = "Priya & Arjun") => ({
  name,
  host: "Priya",
  coHost: "Arjun",
  startDate: "2027-02-12",
  endDate: "2027-02-14",
  city: "Edison",
  currency: "USD",
  totalBudget: 60000,
 
  eventType: "wedding" as const,
  createdBy,
});

/** An owner, a planner, two would-be joiners, a demo guest, and two weddings. */
async function seed(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "priya@example.com", name: "Priya" });
    const plannerId = await ctx.db.insert("users", { email: "meera@example.com", name: "Meera" });
    const auntId = await ctx.db.insert("users", { email: "aunt@example.com", name: "Aunt" });
    const strangerId = await ctx.db.insert("users", { email: "stranger@example.com" });
    const guestId = await ctx.db.insert("users", { isAnonymous: true });
    const eventId = await ctx.db.insert("events", eventRow(ownerId));
    const otherEventId = await ctx.db.insert("events", eventRow(strangerId, "Someone else"));
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: plannerId, role: "planner" });
    await ctx.db.insert("members", { eventId: otherEventId, userId: strangerId, role: "owner" });
    const sessionId = await ctx.db.insert("sessions", { eventId, name: "Sangeet", date: "2027-02-12", dayIndex: 0, budget: 10000, guestCount: 200, color: "#74162a", order: 0 });
    const otherSessionId = await ctx.db.insert("sessions", { eventId: otherEventId, name: "Reception", date: "2027-02-14", dayIndex: 2, budget: 10000, guestCount: 200, color: "#74162a", order: 0 });
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [sessionId], category: "Photography", title: "Photographer", budget: 4000, status: "research" });
    return { ownerId, plannerId, auntId, strangerId, guestId, eventId, otherEventId, sessionId, otherSessionId, slotId };
  });
}

const minimalCreate = {
  name: "Our wedding",
  host: "A",
  coHost: "B",
  startDate: "2027-05-01",
  endDate: "2027-05-01",
  city: "Mumbai",
  currency: "INR",
  totalBudget: 1000000,
 
};

describe("demo guests (security plan 1.1)", () => {
  test("a guest cannot create a wedding, upload pictures or join one", async () => {
    const t = setup();
    const s = await seed(t);
    const asGuest = signedInAs(t, s.guestId);
    await expect(asGuest.mutation(api.events.create, minimalCreate as never)).rejects.toThrow(/Create an account/);
    await expect(asGuest.mutation(api.events.generateInspirationUploadUrl, {})).rejects.toThrow(/Create an account/);
    const { token } = await signedInAs(t, s.ownerId).mutation(api.invites.create, { eventId: s.eventId, role: "viewer" });
    await expect(asGuest.mutation(api.invites.accept, { token })).rejects.toThrow(/Create an account/);
  });

  test("the client is told who is a guest", async () => {
    const t = setup();
    const s = await seed(t);
    expect((await signedInAs(t, s.guestId).query(api.users.me, {}))?.isGuest).toBe(true);
    expect((await signedInAs(t, s.ownerId).query(api.users.me, {}))?.isGuest).toBeUndefined();
  });
});

describe("invite links (security plan 1.2)", () => {
  test("a link works once", async () => {
    const t = setup();
    const s = await seed(t);
    const { token } = await signedInAs(t, s.ownerId).mutation(api.invites.create, { eventId: s.eventId, role: "planner" });
    await signedInAs(t, s.auntId).mutation(api.invites.accept, { token });
    await expect(signedInAs(t, s.strangerId).mutation(api.invites.accept, { token })).rejects.toThrow(/already been used/);
    // Opening it again as the person who used it is harmless.
    expect(await signedInAs(t, s.auntId).mutation(api.invites.accept, { token })).toBe(s.eventId);
  });

  test("a removed member cannot walk back in with their link", async () => {
    const t = setup();
    const s = await seed(t);
    const { token } = await signedInAs(t, s.ownerId).mutation(api.invites.create, { eventId: s.eventId, role: "planner" });
    await signedInAs(t, s.auntId).mutation(api.invites.accept, { token });
    const member = await t.run((ctx) =>
      ctx.db.query("members").withIndex("by_eventId_and_userId", (q) => q.eq("eventId", s.eventId).eq("userId", s.auntId)).unique(),
    );
    await signedInAs(t, s.ownerId).mutation(api.members.remove, { memberId: member!._id });
    await expect(signedInAs(t, s.auntId).mutation(api.invites.accept, { token })).rejects.toThrow(/cancelled/);
  });

  test("an emailed invite only works for that address", async () => {
    const t = setup();
    const s = await seed(t);
    const { token } = await signedInAs(t, s.ownerId).mutation(api.invites.create, { eventId: s.eventId, role: "viewer", email: "Aunt@Example.com" });
    await expect(signedInAs(t, s.strangerId).mutation(api.invites.accept, { token })).rejects.toThrow(/a•••@example.com/);
    expect(await signedInAs(t, s.auntId).mutation(api.invites.accept, { token })).toBe(s.eventId);
  });

  test("a link runs out after 7 days, and a cancelled one stops working", async () => {
    const t = setup();
    const s = await seed(t);
    const expired = await t.run((ctx) =>
      ctx.db.insert("invites", { eventId: s.eventId, token: "old", role: "planner", createdBy: s.ownerId, expiresAt: Date.now() - 1 }),
    );
    expect(expired).toBeTruthy();
    await expect(signedInAs(t, s.auntId).mutation(api.invites.accept, { token: "old" })).rejects.toThrow(/run out/);

    const { token, inviteId } = await signedInAs(t, s.ownerId).mutation(api.invites.create, { eventId: s.eventId, role: "planner" });
    await signedInAs(t, s.ownerId).mutation(api.invites.revoke, { inviteId });
    await expect(signedInAs(t, s.auntId).mutation(api.invites.accept, { token })).rejects.toThrow(/cancelled/);
  });

  test("a closed link says nothing about the wedding", async () => {
    const t = setup();
    const s = await seed(t);
    const { token, inviteId } = await signedInAs(t, s.ownerId).mutation(api.invites.create, { eventId: s.eventId, role: "planner" });
    expect((await t.query(api.invites.preview, { token }))?.eventName).toBe("Priya & Arjun");
    await signedInAs(t, s.ownerId).mutation(api.invites.revoke, { inviteId });
    const after = await t.query(api.invites.preview, { token });
    expect(after?.state).toBe("cancelled");
    expect(after?.eventName).toBe("");
  });

  test("open links are listed, and only an owner or their maker can cancel one", async () => {
    const t = setup();
    const s = await seed(t);
    const mine = await signedInAs(t, s.ownerId).mutation(api.invites.create, { eventId: s.eventId, role: "viewer" });
    const theirs = await signedInAs(t, s.plannerId).mutation(api.invites.create, { eventId: s.eventId, role: "viewer" });
    const seenByPlanner = await signedInAs(t, s.plannerId).query(api.invites.listOpen, { eventId: s.eventId });
    expect(seenByPlanner.map((i) => [i._id, i.canCancel])).toEqual(
      expect.arrayContaining([[mine.inviteId, false], [theirs.inviteId, true]]),
    );
    await expect(signedInAs(t, s.plannerId).mutation(api.invites.revoke, { inviteId: mine.inviteId })).rejects.toThrow(/Only an owner/);
    await signedInAs(t, s.ownerId).mutation(api.invites.revoke, { inviteId: theirs.inviteId });
    const left = await signedInAs(t, s.ownerId).query(api.invites.listOpen, { eventId: s.eventId });
    expect(left.map((i) => i._id)).toEqual([mine.inviteId]);
  });

  test("a viewer cannot make or see invite links", async () => {
    const t = setup();
    const s = await seed(t);
    await t.run((ctx) => ctx.db.insert("members", { eventId: s.eventId, userId: s.auntId, role: "viewer" }));
    await expect(signedInAs(t, s.auntId).mutation(api.invites.create, { eventId: s.eventId, role: "viewer" })).rejects.toThrow();
    await expect(signedInAs(t, s.auntId).query(api.invites.listOpen, { eventId: s.eventId })).rejects.toThrow();
  });
});

describe("who someone is to the couple", () => {
  test("the invite's label comes across, and only they or an owner can change it", async () => {
    const t = setup();
    const s = await seed(t);
    const { token } = await signedInAs(t, s.ownerId).mutation(api.invites.create, { eventId: s.eventId, role: "viewer", relationship: "  Priya's   aunt " });
    await signedInAs(t, s.auntId).mutation(api.invites.accept, { token });
    const list = await signedInAs(t, s.ownerId).query(api.members.list, { eventId: s.eventId });
    const aunt = list.find((m) => m.member.userId === s.auntId)!.member;
    expect(aunt.relationship).toBe("Priya's aunt");

    await signedInAs(t, s.auntId).mutation(api.members.setRelationship, { memberId: aunt._id, relationship: "Priya's favourite aunt" });
    const planner = list.find((m) => m.member.userId === s.plannerId)!.member;
    await expect(
      signedInAs(t, s.auntId).mutation(api.members.setRelationship, { memberId: planner._id, relationship: "Nobody" }),
    ).rejects.toThrow(/Only an owner/);
    await signedInAs(t, s.ownerId).mutation(api.members.setRelationship, { memberId: planner._id, relationship: "Our planner" });
    const after = await signedInAs(t, s.ownerId).query(api.members.list, { eventId: s.eventId });
    expect(after.map((m) => m.member.relationship).sort()).toEqual(["Our planner", "Priya's favourite aunt", undefined].sort());
  });
});

describe("assistant cards (security plan 1.3)", () => {
  async function seedCard(t: T, s: Awaited<ReturnType<typeof seed>>) {
    return await t.run((ctx) =>
      ctx.db.insert("chatMessages", {
        eventId: s.eventId,
        role: "assistant",
        content: "Shall I add her?",
        toolCalls: [{ name: "propose", args: { kind: "add_guest", guestName: "Nani", guestPartySize: 1, sessionIds: [s.sessionId] }, status: "proposed" }],
      }),
    );
  }

  test("an edit can't be the wrong shape or change what kind of card it is", async () => {
    const t = setup();
    const s = await seed(t);
    const replyId = await seedCard(t, s);
    const asOwner = signedInAs(t, s.ownerId);
    await expect(asOwner.mutation(api.assistant.runProposal, { eventId: s.eventId, replyId, index: 0, overrides: "drop tables" as never })).rejects.toThrow();
    await expect(asOwner.mutation(api.assistant.runProposal, { eventId: s.eventId, replyId, index: 0, overrides: ["x"] as never })).rejects.toThrow();
    await expect(asOwner.mutation(api.assistant.runProposal, { eventId: s.eventId, replyId, index: 0, overrides: { kind: "add_need" } as never })).rejects.toThrow();
    const done = await asOwner.mutation(api.assistant.runProposal, { eventId: s.eventId, replyId, index: 0, overrides: { guestName: "Nani ji" } });
    expect(done.done).toMatch(/Nani ji/);
  });

  test("a card can't point at another wedding's day", async () => {
    const t = setup();
    const s = await seed(t);
    const replyId = await seedCard(t, s);
    await expect(
      signedInAs(t, s.ownerId).mutation(api.assistant.runProposal, { eventId: s.eventId, replyId, index: 0, overrides: { sessionIds: [s.otherSessionId] } }),
    ).rejects.toThrow(/isn't part of your plan/);
    const guests = await t.run((ctx) => ctx.db.query("guests").take(10));
    expect(guests).toHaveLength(0);
  });
});

describe("vendor addresses (security plan 1.4)", () => {
  test("a javascript: website is never stored", async () => {
    const t = setup();
    const s = await seed(t);
    const vendorId = await signedInAs(t, s.ownerId).mutation(api.vendors.addManual, {
      eventId: s.eventId,
      slotId: s.slotId,
      name: "Sneaky Studio",
      website: "javascript:alert(document.domain)",
    });
    const row = await t.run((ctx) => ctx.db.get(vendorId));
    expect(JSON.stringify(row)).not.toMatch(/javascript/i);
  });

  test("a normal website is cleaned and kept", async () => {
    const t = setup();
    const s = await seed(t);
    const vendorId = await signedInAs(t, s.ownerId).mutation(api.vendors.addManual, {
      eventId: s.eventId,
      slotId: s.slotId,
      name: "Golden Hour",
      website: "www.GoldenHour.example/events",
    });
    const row = await t.run((ctx) => ctx.db.get(vendorId));
    expect(row?.website).toBe("https://goldenhour.example");
    expect(row?.sourceUrls).toEqual(["https://goldenhour.example"]);
  });
});

describe("pasted lists (security plan 1.5)", () => {
  test("a huge paste is refused with a readable message", async () => {
    const t = setup();
    const s = await seed(t);
    const huge = "Guest name\n".repeat(30_000);
    await expect(signedInAs(t, s.ownerId).mutation(api.guests.startImport, { eventId: s.eventId, rawText: huge })).rejects.toThrow(/very long list/);
  });
});
