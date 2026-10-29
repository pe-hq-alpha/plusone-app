/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// convex-test keys modules from the convex folder; a test one folder down sees them as "../" and "./".
const raw = import.meta.glob("../**/*.ts");
const modules: Record<string, () => Promise<unknown>> = Object.fromEntries(
  Object.entries(raw).map(([key, load]) => [
    key.startsWith("../") ? key.slice(3) : key.startsWith("./") ? `marketplace/${key.slice(2)}` : key,
    load as () => Promise<unknown>,
  ]),
);

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

/** A verified caterer with one package at ₹420, and a reviewer. */
async function seed(t: T, opts: { trial?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const vendor = await ctx.db.insert("users", opts.trial ? { isAnonymous: true } : { email: "anjali@caterers.in" });
    const reviewer = await ctx.db.insert("users", { email: "ops@plusone.test", staffRole: "reviewer" });
    const profileId = await ctx.db.insert("vendorProfiles", {
      name: "Anjali Caterers",
      categories: ["Catering"],
      city: "Chennai",
      cityKey: "chennai",
      about: "Traditional meals.",
      source: "vendor_signup",
      ownerUserId: vendor,
      status: "verified",
      statusAt: Date.now(),
      joinedAt: Date.now(),
      completedEvents: 0,
      ...(opts.trial ? { sample: true } : {}),
    });
    const offeringId = await ctx.db.insert("vendorOfferings", {
      profileId,
      category: "Catering",
      title: "Banana-leaf lunch",
      unit: "per_person",
      priceUnit: "per_plate",
      price: 420,
      currency: "INR",
      includes: ["Payasam"],
    });
    return { vendor, reviewer, profileId, offeringId };
  });
}

const newPrice = { category: "Catering", title: "Banana-leaf lunch", unit: "per_person" as const, priceUnit: "per_plate", price: 480, includes: ["Payasam"] };
const prices = async (t: T, profileId: Id<"vendorProfiles">) =>
  (await t.run((ctx) => ctx.db.query("vendorOfferings").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).take(10))).map((o) => o.price);

describe("changes to a verified listing wait for a person", () => {
  test("a new price waits, customers keep the approved one, and Ops approving puts it live", async () => {
    const t = setup();
    const { vendor, reviewer, profileId, offeringId } = await seed(t);
    expect(await as(t, vendor).mutation(api.marketplace.partner.saveOffering, { ...newPrice, offeringId })).toBeNull();
    expect(await prices(t, profileId)).toEqual([420]);

    const mine = await as(t, vendor).query(api.marketplace.changes.mine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: "offering" });
    expect(mine[0].before).toContain("420");
    expect(mine[0].after).toContain("480");

    const waiting = await as(t, reviewer).query(api.marketplace.changes.waiting, {});
    await as(t, reviewer).mutation(api.marketplace.changes.decide, { changeId: waiting[0]._id, decision: "approved" });
    expect(await prices(t, profileId)).toEqual([480]);
    expect(await as(t, vendor).query(api.marketplace.changes.mine, {})).toEqual([]);
  });

  test("a rejected change leaves the listing as it was, and a second edit replaces the first while waiting", async () => {
    const t = setup();
    const { vendor, reviewer, profileId, offeringId } = await seed(t);
    await as(t, vendor).mutation(api.marketplace.partner.saveOffering, { ...newPrice, offeringId });
    await as(t, vendor).mutation(api.marketplace.partner.saveOffering, { ...newPrice, offeringId, price: 500 });
    const waiting = await as(t, reviewer).query(api.marketplace.changes.waiting, {});
    expect(waiting).toHaveLength(1);
    expect(waiting[0].after).toContain("500");
    await as(t, reviewer).mutation(api.marketplace.changes.decide, { changeId: waiting[0]._id, decision: "rejected" });
    expect(await prices(t, profileId)).toEqual([420]);
    await expect(as(t, reviewer).mutation(api.marketplace.changes.decide, { changeId: waiting[0]._id, decision: "approved" })).rejects.toThrow(/already been decided/);
  });

  test("a new package and a removal wait too", async () => {
    const t = setup();
    const { vendor, reviewer, profileId, offeringId } = await seed(t);
    await as(t, vendor).mutation(api.marketplace.partner.saveOffering, { ...newPrice, title: "Evening tiffin", price: 180 });
    await as(t, vendor).mutation(api.marketplace.partner.removeOffering, { offeringId });
    expect(await prices(t, profileId)).toEqual([420]);
    for (const c of await as(t, reviewer).query(api.marketplace.changes.waiting, {})) {
      await as(t, reviewer).mutation(api.marketplace.changes.decide, { changeId: c._id, decision: "approved" });
    }
    expect(await prices(t, profileId)).toEqual([180]);
  });

  test("new details and contact numbers wait, while a new name still sends the listing back for a check", async () => {
    const t = setup();
    const { vendor, reviewer, profileId } = await seed(t);
    const details = { name: "Anjali Caterers", categories: ["Catering"], city: "Chennai", about: "Banana-leaf meals since 1998.", phone: "98400 12345" };
    await as(t, vendor).mutation(api.marketplace.partner.update, details);
    let profile = await t.run((ctx) => ctx.db.get(profileId));
    expect(profile).toMatchObject({ about: "Traditional meals.", status: "verified" });
    const [change] = await as(t, reviewer).query(api.marketplace.changes.waiting, {});
    expect(change.after).toContain("Banana-leaf meals since 1998.");
    await as(t, reviewer).mutation(api.marketplace.changes.decide, { changeId: change._id, decision: "approved" });
    profile = await t.run((ctx) => ctx.db.get(profileId));
    expect(profile?.about).toBe("Banana-leaf meals since 1998.");

    await as(t, vendor).mutation(api.marketplace.partner.update, { ...details, name: "Anjali Caterers & Events" });
    expect((await t.run((ctx) => ctx.db.get(profileId)))?.status).toBe("pending");
  });

  test("the vendors' demo saves at once, and only staff decide", async () => {
    const t = setup();
    const { vendor, profileId, offeringId } = await seed(t, { trial: true });
    expect(await as(t, vendor).mutation(api.marketplace.partner.saveOffering, { ...newPrice, offeringId })).toBe(offeringId);
    expect(await prices(t, profileId)).toEqual([480]);
    await expect(as(t, vendor).query(api.marketplace.changes.waiting, {})).rejects.toThrow(/PlusOne team/);
  });
});
