/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { cleanLink } from "./gifts";

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
    const viewerId = await ctx.db.insert("users", { email: "dad@example.com", name: "Dad" });
    const eventId = await ctx.db.insert("events", {
      name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2027-02-12", endDate: "2027-02-14",
      city: "Ahmedabad", currency: "INR", totalBudget: 2500000, eventType: "wedding", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    const olivia = await ctx.db.insert("guests", { eventId, name: "Olivia Carter", partySize: 2, rsvp: "pending", attendingCount: 0, sessionIds: [], rsvpToken: "a".repeat(32) });
    const noah = await ctx.db.insert("guests", { eventId, name: "Noah Bennett", partySize: 1, rsvp: "pending", attendingCount: 0, sessionIds: [], rsvpToken: "b".repeat(32) });
    // A guest of another wedding, whose link must not reach this list.
    const otherOwner = await ctx.db.insert("users", { email: "x@example.com", name: "X" });
    const otherEvent = await ctx.db.insert("events", {
      name: "X & Y", host: "X", coHost: "Y", startDate: "2027-03-01", endDate: "2027-03-01",
      city: "Pune", currency: "INR", totalBudget: 1, eventType: "wedding", createdBy: otherOwner,
    });
    await ctx.db.insert("guests", { eventId: otherEvent, name: "Stranger", partySize: 1, rsvp: "pending", attendingCount: 0, sessionIds: [], rsvpToken: "c".repeat(32) });
    return { ownerId, viewerId, eventId, olivia, noah };
  });
}

async function publishedSite(t: T, s: Awaited<ReturnType<typeof seed>>) {
  await as(t, s.ownerId).mutation(api.site.save, { eventId: s.eventId, patch: {} });
  await as(t, s.ownerId).mutation(api.site.setPublished, { eventId: s.eventId, published: true });
  return (await as(t, s.ownerId).query(api.site.get, { eventId: s.eventId }))!.slug;
}

describe("the gift list", () => {
  test("shop links are web addresses only", () => {
    expect(cleanLink("amazon.in/dp/123")).toBe("https://amazon.in/dp/123");
    expect(cleanLink("  ")).toBeUndefined();
    expect(() => cleanLink("javascript:alert(1)")).toThrow();
    expect(() => cleanLink("ftp://example.com/x")).toThrow();
  });

  test("the couple adds, edits, orders and removes gifts; viewers can only look", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const lamp = await owner.mutation(api.gifts.add, { eventId: s.eventId, title: "  Brass lamp  ", price: 6500, link: "shop.example/lamp" });
    const set = await owner.mutation(api.gifts.add, { eventId: s.eventId, title: "Dinner set" });
    await expect(as(t, s.viewerId).mutation(api.gifts.add, { eventId: s.eventId, title: "Kettle" })).rejects.toThrow();
    await expect(owner.mutation(api.gifts.add, { eventId: s.eventId, title: "Bad", link: "javascript:alert(1)" })).rejects.toThrow();

    let list = await as(t, s.viewerId).query(api.gifts.list, { eventId: s.eventId });
    expect(list.map((g) => g.title)).toEqual(["Brass lamp", "Dinner set"]);
    expect(list[0].link).toBe("https://shop.example/lamp");

    await owner.mutation(api.gifts.move, { giftId: set, direction: "up" });
    await owner.mutation(api.gifts.update, { giftId: lamp, patch: { price: null, note: "A pair" } });
    list = await owner.query(api.gifts.list, { eventId: s.eventId });
    expect(list.map((g) => g.title)).toEqual(["Dinner set", "Brass lamp"]);
    expect(list[1].note).toBe("A pair");
    expect(list[1].price).toBeUndefined();

    await owner.mutation(api.gifts.remove, { giftId: set });
    expect((await owner.query(api.gifts.list, { eventId: s.eventId })).length).toBe(1);
  });

  test("the website shows what's taken but never who took it", async () => {
    const t = setup();
    const s = await seed(t);
    const slug = await publishedSite(t, s);
    const lamp = await as(t, s.ownerId).mutation(api.gifts.add, { eventId: s.eventId, title: "Brass lamp" });
    await as(t, s.ownerId).mutation(api.gifts.add, { eventId: s.eventId, title: "Dinner set" });
    await t.mutation(api.gifts.reserve, { token: "a".repeat(32), giftId: lamp });

    const pub = (await t.query(api.site.bySlug, { slug }))!;
    expect(pub.gifts!.items.map((g) => [g.title, g.taken])).toEqual([["Brass lamp", true], ["Dinner set", false]]);
    expect(JSON.stringify(pub.gifts)).not.toContain("Olivia");
    expect(pub.gifts!.currency).toBe("INR");

    // The couple sees who.
    const list = await as(t, s.ownerId).query(api.gifts.list, { eventId: s.eventId });
    expect(list[0].reservedBy?.name).toBe("Olivia Carter");

    await as(t, s.ownerId).mutation(api.site.save, { eventId: s.eventId, patch: { showGifts: false } });
    expect((await t.query(api.site.bySlug, { slug }))!.gifts).toBeUndefined();

    await as(t, s.ownerId).mutation(api.site.save, { eventId: s.eventId, patch: { showGifts: true, noGifts: true, cashGiftNote: "Moi is welcome" } });
    const none = (await t.query(api.site.bySlug, { slug }))!.gifts!;
    expect(none).toMatchObject({ noGifts: true, items: [] });
    expect(none.cashNote).toBeUndefined();
  });

  test("a guest chooses a gift from their link, and only they can let it go", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const lamp = await owner.mutation(api.gifts.add, { eventId: s.eventId, title: "Brass lamp" });
    await owner.mutation(api.site.save, { eventId: s.eventId, patch: { cashGiftNote: "Moi is welcome" } });
    const olivia = "a".repeat(32), noah = "b".repeat(32), stranger = "c".repeat(32);

    await t.mutation(api.gifts.reserve, { token: olivia, giftId: lamp });
    await expect(t.mutation(api.gifts.reserve, { token: noah, giftId: lamp })).rejects.toThrow(/already/);
    await expect(t.mutation(api.gifts.unreserve, { token: noah, giftId: lamp })).rejects.toThrow(/isn't one you chose/);
    await expect(t.mutation(api.gifts.reserve, { token: stranger, giftId: lamp })).rejects.toThrow(/no longer on the list/);
    await expect(t.mutation(api.gifts.reserve, { token: "short", giftId: lamp })).rejects.toThrow(/isn't valid/);

    const mine = (await t.query(api.site.invitation, { token: olivia }))!.gifts!;
    expect(mine.items[0]).toMatchObject({ taken: true, mine: true });
    expect(mine.cashNote).toBe("Moi is welcome");
    const theirs = (await t.query(api.site.invitation, { token: noah }))!.gifts!;
    expect(theirs.items[0]).toMatchObject({ taken: true, mine: false });

    await t.mutation(api.gifts.unreserve, { token: olivia, giftId: lamp });
    await t.mutation(api.gifts.reserve, { token: noah, giftId: lamp });
    await expect(as(t, s.viewerId).mutation(api.gifts.clearReservation, { giftId: lamp })).rejects.toThrow();
    await owner.mutation(api.gifts.clearReservation, { giftId: lamp });
    expect((await owner.query(api.gifts.list, { eventId: s.eventId }))[0].reservedBy).toBeUndefined();
  });

  test("one guest can hold only a few gifts, and the list can't be chosen when it's off", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const ids = [];
    for (const title of ["One", "Two", "Three", "Four"]) ids.push(await owner.mutation(api.gifts.add, { eventId: s.eventId, title }));
    const olivia = "a".repeat(32);
    for (const id of ids.slice(0, 3)) await t.mutation(api.gifts.reserve, { token: olivia, giftId: id });
    await expect(t.mutation(api.gifts.reserve, { token: olivia, giftId: ids[3] })).rejects.toThrow(/up to 3/);

    await owner.mutation(api.site.save, { eventId: s.eventId, patch: { noGifts: true } });
    await expect(t.mutation(api.gifts.reserve, { token: "b".repeat(32), giftId: ids[3] })).rejects.toThrow(/isn't sharing/);
  });

  test("choosing again and again from one link is slowed down", async () => {
    const t = setup();
    const s = await seed(t);
    const lamp = await as(t, s.ownerId).mutation(api.gifts.add, { eventId: s.eventId, title: "Brass lamp" });
    const olivia = "a".repeat(32);
    let stopped = false;
    for (let i = 0; i < 20 && !stopped; i++) {
      try {
        await t.mutation(i % 2 ? api.gifts.unreserve : api.gifts.reserve, { token: olivia, giftId: lamp });
      } catch (e) {
        stopped = /a lot of changes/.test(String(e));
      }
    }
    expect(stopped).toBe(true);
  });
});
