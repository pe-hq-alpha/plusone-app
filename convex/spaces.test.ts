/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { adopt, isPrivateHost } from "./spaces";
import { deleteEventBatch } from "./maintenance";

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
    const viewerId = await ctx.db.insert("users", { email: "mum@example.com", name: "Mum" });
    const strangerId = await ctx.db.insert("users", { email: "stranger@example.com" });
    const eventId = await ctx.db.insert("events", {
      name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2027-02-12", endDate: "2027-02-14",
      city: "Ahmedabad", currency: "INR", totalBudget: 2500000, eventType: "wedding", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    const sangeet = await ctx.db.insert("sessions", { eventId, name: "Sangeet", date: "2027-02-12", dayIndex: 0, budget: 500000, guestCount: 200, color: "#74162a", order: 0 });
    const mehndi = await ctx.db.insert("sessions", { eventId, name: "Mehndi", date: "2027-02-13", dayIndex: 1, budget: 200000, guestCount: 80, color: "#a3b18a", order: 1 });
    return { ownerId, viewerId, strangerId, eventId, sangeet, mehndi };
  });
}

const picture = (t: T) => t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));

describe("Spaces", () => {
  test("a link goes into a Space once, waiting for its preview", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const id = await owner.mutation(api.spaces.addLink, { eventId: s.eventId, sessionId: s.sangeet, text: "Love this! https://www.tiktok.com/@riya/video/7351, for the sangeet" });
    const again = await owner.mutation(api.spaces.addLink, { eventId: s.eventId, sessionId: s.sangeet, text: "https://www.tiktok.com/@riya/video/7351" });
    expect(again).toBe(id);
    const items = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "link", source: "tiktok", previewStatus: "pending", sessionId: s.sangeet, url: "https://www.tiktok.com/@riya/video/7351" });
  });

  test("a kept palette replaces the part's old one and leaves anything else stored there", async () => {
    const t = setup();
    const s = await seed(t);
    await t.run((ctx) => ctx.db.patch(s.sangeet, { choices: [{ label: "Dress code", value: "Bright" }, { label: "Palette", value: "Old", colors: [{ name: "Red", hex: "#C0262D" }] }] }));
    const colors = [{ name: "Sage", hex: "#A9B89C" }, { name: "Not a colour", hex: "sage" }];
    await expect(as(t, s.viewerId).mutation(api.spaces.keepPalette, { sessionId: s.sangeet, description: "Sage", colors })).rejects.toThrow();
    await as(t, s.ownerId).mutation(api.spaces.keepPalette, { sessionId: s.sangeet, description: "  Sage and cream ", colors });
    const kept = await t.run((ctx) => ctx.db.get(s.sangeet));
    expect(kept?.choices).toEqual([{ label: "Dress code", value: "Bright" }, { label: "Palette", value: "Sage and cream", colors: [{ name: "Sage", hex: "#A9B89C" }] }]);
  });

  test("refuses things that aren't public web links", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    await expect(owner.mutation(api.spaces.addLink, { eventId: s.eventId, text: "just words" })).rejects.toThrow(/web link/);
    await expect(owner.mutation(api.spaces.addLink, { eventId: s.eventId, text: "http://192.168.1.4/admin" })).rejects.toThrow(/web link/);
    expect(isPrivateHost("http://10.0.0.1/")).toBe(true);
    expect(isPrivateHost("https://www.pinterest.com/pin/1/")).toBe(false);
  });

  test("viewers look, only planners add, and strangers see nothing", async () => {
    const t = setup();
    const s = await seed(t);
    await as(t, s.ownerId).mutation(api.spaces.addLink, { eventId: s.eventId, text: "https://example.com/garden" });
    expect(await as(t, s.viewerId).query(api.spaces.list, { eventId: s.eventId })).toHaveLength(1);
    await expect(as(t, s.viewerId).mutation(api.spaces.addLink, { eventId: s.eventId, text: "https://example.com/x" })).rejects.toThrow(/planner/);
    await expect(as(t, s.strangerId).query(api.spaces.list, { eventId: s.eventId })).rejects.toThrow(/not a member/);
  });

  test("a Space can't take a ceremony from another wedding", async () => {
    const t = setup();
    const s = await seed(t);
    const other = await t.run(async (ctx) => {
      const w = await ctx.db.insert("events", { name: "Else", host: "A", coHost: "B", startDate: "2027-01-01", endDate: "2027-01-01", city: "X", currency: "USD", totalBudget: 1, eventType: "wedding", createdBy: s.strangerId });
      return await ctx.db.insert("sessions", { eventId: w, name: "Reception", date: "2027-01-01", dayIndex: 0, budget: 1, guestCount: 1, color: "#74162a", order: 0 });
    });
    await expect(as(t, s.ownerId).mutation(api.spaces.addLink, { eventId: s.eventId, sessionId: other, text: "https://example.com/" })).rejects.toThrow(/isn't part of this event/);
  });

  test("pictures go first in the order chosen, and reorder sticks", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const link = await owner.mutation(api.spaces.addLink, { eventId: s.eventId, sessionId: s.mehndi, text: "https://example.com/henna" });
    const [a, b] = [await picture(t), await picture(t)];
    const [pa, pb] = await owner.mutation(api.spaces.addPictures, { eventId: s.eventId, sessionId: s.mehndi, storageIds: [a, b] });
    const order = (await owner.query(api.spaces.list, { eventId: s.eventId })).map((i) => i._id);
    expect(order).toEqual([pa, pb, link]);
    expect((await owner.query(api.spaces.list, { eventId: s.eventId }))[0].imageUrl).toBeTruthy();
    await owner.mutation(api.spaces.reorder, { eventId: s.eventId, sessionId: s.mehndi, ids: [link, pb, pa] });
    expect((await owner.query(api.spaces.list, { eventId: s.eventId })).map((i) => i._id)).toEqual([link, pb, pa]);
  });

  test("removing a picture deletes the file, from the wedding's onboarding pictures too", async () => {
    const t = setup();
    const s = await seed(t);
    const file = await picture(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(s.eventId, { inspirationImages: [file] });
      const event = (await ctx.db.get(s.eventId))!;
      expect(await adopt(ctx, event)).toBe(1);
      expect(await adopt(ctx, event)).toBe(0); // already in the Space
    });
    const [item] = await as(t, s.ownerId).query(api.spaces.list, { eventId: s.eventId });
    expect(item.sessionId).toBeUndefined();
    await as(t, s.ownerId).mutation(api.spaces.remove, { itemId: item._id });
    await t.run(async (ctx) => {
      expect(await ctx.storage.get(file)).toBeNull();
      expect((await ctx.db.get(s.eventId))?.inspirationImages).toBeUndefined();
    });
  });

  test("a removed ceremony's Space moves into the wedding's own Space", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const wide = await owner.mutation(api.spaces.addLink, { eventId: s.eventId, text: "https://example.com/wide" });
    const moved = await owner.mutation(api.spaces.addLink, { eventId: s.eventId, sessionId: s.sangeet, text: "https://example.com/sangeet" });
    await owner.mutation(api.sessions.remove, { sessionId: s.sangeet });
    const items = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(items.map((i) => [i._id, i.sessionId])).toEqual([[wide, undefined], [moved, undefined]]);
  });

  test("captions save, and an item can move to another Space", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const id = await owner.mutation(api.spaces.addLink, { eventId: s.eventId, text: "https://example.com/a" });
    await owner.mutation(api.spaces.update, { itemId: id, caption: "  The marigold arch  ", moveTo: s.mehndi });
    const [item] = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(item).toMatchObject({ caption: "The marigold arch", sessionId: s.mehndi });
  });

  test("deleting the wedding deletes its Spaces", async () => {
    const t = setup();
    const s = await seed(t);
    const [file, copy] = [await picture(t), await picture(t)];
    await as(t, s.ownerId).mutation(api.spaces.addPictures, { eventId: s.eventId, storageIds: [file] });
    await t.run((ctx) => ctx.db.insert("spaceItems", { eventId: s.eventId, kind: "link", url: "https://example.com/a", previewStorageId: copy, previewStatus: "ready", order: 5 }));
    await t.run(async (ctx) => {
      while (!(await deleteEventBatch(ctx, s.eventId)).done);
      expect(await ctx.db.query("spaceItems").take(10)).toHaveLength(0);
      expect(await ctx.storage.get(file)).toBeNull();
      expect(await ctx.storage.get(copy)).toBeNull();
    });
  });

  test("our copy of a link's picture shows first, is replaced on refresh, and is deleted with its item", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const [first, second] = [await picture(t), await picture(t)];
    const itemId = await t.run((ctx) =>
      ctx.db.insert("spaceItems", { eventId: s.eventId, kind: "link", url: "https://www.instagram.com/p/C9abc/", source: "instagram", previewStatus: "pending", order: 0 }),
    );
    await t.mutation(internal.spaces.savePreview, { itemId, ok: true, preview: { title: "Mehndi", image: "https://cdn.example/expires.jpg" }, previewStorageId: first });
    const [shown] = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(shown).toMatchObject({ previewStatus: "ready", preview: { title: "Mehndi" } });
    expect(shown.imageUrl).toBeTruthy();
    expect(shown.imageUrl).not.toBe("https://cdn.example/expires.jpg");

    // A refresh that fails keeps the copy; one that succeeds swaps it for the new one.
    await t.mutation(internal.spaces.savePreview, { itemId, ok: false });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(itemId)).toMatchObject({ previewStatus: "failed", previewStorageId: first });
    });
    await t.mutation(internal.spaces.savePreview, { itemId, ok: true, preview: { title: "Mehndi", image: "https://cdn.example/new.jpg" }, previewStorageId: second });
    await t.run(async (ctx) => {
      expect(await ctx.storage.get(first)).toBeNull();
      expect((await ctx.db.get(itemId))?.previewStorageId).toBe(second);
    });

    await owner.mutation(api.spaces.remove, { itemId });
    await t.run(async (ctx) => {
      expect(await ctx.storage.get(second)).toBeNull();
    });
  });

  test("a copy that arrives after its item was taken off is deleted", async () => {
    const t = setup();
    const s = await seed(t);
    const copy = await picture(t);
    const itemId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("spaceItems", { eventId: s.eventId, kind: "link", url: "https://example.com/gone", previewStatus: "pending", order: 0 });
      await ctx.db.delete(id);
      return id;
    });
    await t.mutation(internal.spaces.savePreview, { itemId, ok: true, preview: { image: "https://cdn.example/x.jpg" }, previewStorageId: copy });
    await t.run(async (ctx) => {
      expect(await ctx.storage.get(copy)).toBeNull();
    });
  });

  test("retrying previews asks again only for links that failed or have no picture", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const s = await seed(t);
      const ids = await t.run(async (ctx) => {
        const link = (n: number, fields: Partial<Doc<"spaceItems">>) =>
          ctx.db.insert("spaceItems", { eventId: s.eventId, kind: "link", url: `https://example.com/${n}`, order: n, ...fields });
        return {
          failed: await link(0, { previewStatus: "failed" }),
          wordsOnly: await link(1, { previewStatus: "ready", preview: { title: "Words only" } }),
          pictured: await link(2, { previewStatus: "ready", preview: { image: "https://cdn.example/a.jpg" } }),
          picture: await ctx.db.insert("spaceItems", { eventId: s.eventId, kind: "image", src: "/demo-spaces/p0.jpg", order: 3 }),
        };
      });
      expect(await t.mutation(internal.spaces.retryFailedPreviews, {})).toEqual({ done: true, queued: 2 });
      await t.run(async (ctx) => {
        expect((await ctx.db.get(ids.failed))?.previewStatus).toBe("pending");
        expect((await ctx.db.get(ids.wordsOnly))?.previewStatus).toBe("pending");
        expect((await ctx.db.get(ids.pictured))?.previewStatus).toBe("ready");
        const jobs = await ctx.db.system.query("_scheduled_functions").take(10);
        expect(jobs.map((j) => (j.args[0] as { itemId: string }).itemId).sort()).toEqual([ids.failed, ids.wordsOnly].sort());
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("reading a Space for a palette is for planners, and takes at most eight pictures", async () => {
    const t = setup();
    const s = await seed(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) await ctx.db.insert("spaceItems", { eventId: s.eventId, sessionId: s.sangeet, kind: "image", src: `/demo-spaces/p${i}.jpg`, order: i });
    });
    const space = await as(t, s.ownerId).query(internal.spaces.paletteContext, { eventId: s.eventId, sessionId: s.sangeet });
    expect(space.ceremony).toBe("Sangeet");
    expect(space.pictures).toHaveLength(8);
    expect(space.pictures[0].url).toMatch(/^https:\/\/.+\/demo-spaces\/p0\.jpg$/);
    await expect(as(t, s.viewerId).query(internal.spaces.paletteContext, { eventId: s.eventId })).rejects.toThrow(/planner/);
  });
});

describe("the board", () => {
  test("moving things records where they sit and which part's zone they were dropped in", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const note = await owner.mutation(api.spaces.addNote, { eventId: s.eventId, text: "  Jasmine, not roses  ", x: 10.4, y: 20.6 });
    let [item] = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(item).toMatchObject({ kind: "note", text: "Jasmine, not roses", x: 10, y: 21 });
    expect(item.sessionId).toBeUndefined();

    await owner.mutation(api.spaces.place, { eventId: s.eventId, moves: [{ itemId: note, x: 900, y: 120, w: 5000, sessionId: s.mehndi }] });
    [item] = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(item).toMatchObject({ x: 900, y: 120, w: 1200, sessionId: s.mehndi });

    // Dropped outside every zone, it is for the whole event again.
    await owner.mutation(api.spaces.place, { eventId: s.eventId, moves: [{ itemId: note, x: -900, y: -900, sessionId: null }] });
    [item] = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(item.sessionId).toBeUndefined();
  });

  test("an emptied note comes off the board", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const note = await owner.mutation(api.spaces.addNote, { eventId: s.eventId, sessionId: s.sangeet, text: "Dhol at 8", x: 0, y: 0 });
    await owner.mutation(api.spaces.editNote, { itemId: note, text: "Dhol at 8:30" });
    expect((await owner.query(api.spaces.list, { eventId: s.eventId }))[0].text).toBe("Dhol at 8:30");
    await owner.mutation(api.spaces.editNote, { itemId: note, text: "   " });
    expect(await owner.query(api.spaces.list, { eventId: s.eventId })).toEqual([]);
  });

  test("swatches keep only real colours, laid in a row", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    await expect(owner.mutation(api.spaces.addSwatches, { eventId: s.eventId, colors: [{ hex: "red", name: "Red" }], x: 0, y: 0 })).rejects.toThrow(/colour/);
    await owner.mutation(api.spaces.addSwatches, { eventId: s.eventId, sessionId: s.sangeet, colors: [{ hex: "#F2A10F", name: "Marigold" }, { hex: "#7A1F2B", name: "Maroon" }], x: 100, y: 50 });
    const items = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(items.map((i) => [i.hex, i.colorName, i.x, i.y])).toEqual(expect.arrayContaining([["#f2a10f", "Marigold", 100, 50], ["#7a1f2b", "Maroon", 212, 50]]));
  });

  test("a vendor pins once; pinning again moves its card", async () => {
    const t = setup();
    const s = await seed(t);
    const owner = as(t, s.ownerId);
    const vendorId = await t.run((ctx) => ctx.db.insert("vendors", { eventId: s.eventId, name: "Annam Caterers", category: "Catering", startingPrice: 380, priceUnit: "per_person", priceCurrency: "INR", packages: [], highlights: [], sourceUrls: [], shortlisted: false, scrapedAt: 0, reviewHighlights: [], pagesRead: [] }));
    const first = await owner.mutation(api.spaces.pinVendor, { eventId: s.eventId, vendorId, x: 0, y: 0 });
    const again = await owner.mutation(api.spaces.pinVendor, { eventId: s.eventId, sessionId: s.sangeet, vendorId, x: 300, y: 40 });
    expect(again).toBe(first);
    const items = await owner.query(api.spaces.list, { eventId: s.eventId });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "vendor", x: 300, y: 40, sessionId: s.sangeet, vendor: { name: "Annam Caterers", price: 380, priceUnit: "per_person" } });
    expect((await owner.query(api.spaces.pinnable, { eventId: s.eventId })).map((v) => v.name)).toEqual(["Annam Caterers"]);
  });

  test("a part's zone moves and resizes within sane bounds; viewers can't move anything", async () => {
    const t = setup();
    const s = await seed(t);
    await as(t, s.ownerId).mutation(api.spaces.placeZone, { sessionId: s.sangeet, x: 40.2, y: -20, w: 10, h: 99_999 });
    expect((await t.run((ctx) => ctx.db.get(s.sangeet)))!.zone).toEqual({ x: 40, y: -20, w: 320, h: 6000 });
    await expect(as(t, s.viewerId).mutation(api.spaces.placeZone, { sessionId: s.sangeet, x: 0, y: 0, w: 400, h: 400 })).rejects.toThrow();
    const note = await as(t, s.ownerId).mutation(api.spaces.addNote, { eventId: s.eventId, text: "Hi", x: 0, y: 0 });
    await expect(as(t, s.viewerId).mutation(api.spaces.place, { eventId: s.eventId, moves: [{ itemId: note, x: 5, y: 5 }] })).rejects.toThrow();
  });
});
