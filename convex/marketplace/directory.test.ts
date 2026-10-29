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

async function caterer(t: T, name: string, opts: { status?: "verified" | "pending"; sample?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { email: `${name.toLowerCase().replace(/\W/g, "")}@example.com` });
    const profileId = await ctx.db.insert("vendorProfiles", {
      name,
      categories: ["Catering"],
      city: "Chennai",
      cityKey: "chennai",
      source: "vendor_signup",
      // The sample vendors have no owner; one with an owner is a demo guest's own trial business.
      ...(opts.sample ? {} : { ownerUserId: owner }),
      status: opts.status ?? "verified",
      statusAt: Date.now(),
      joinedAt: Date.now(),
      completedEvents: 0,
      phone: "98400 12345",
      ...(opts.sample ? { sample: true } : {}),
    });
    await ctx.db.insert("vendorOfferings", {
      profileId,
      category: "Catering",
      title: "Banana-leaf lunch",
      unit: "per_person",
      priceUnit: "per_plate",
      price: 420,
      currency: "INR",
      includes: ["Payasam"],
    });
    return profileId;
  });
}

describe("find vendors", () => {
  test("anyone sees every listed vendor without signing in, with no contact details", async () => {
    const t = setup();
    for (const n of ["Anjali", "Bhavani", "Chitra", "Deepa"]) await caterer(t, `${n} Caterers`);
    const open = await t.query(api.marketplace.directory.search, { category: "Catering", city: "Chennai" });
    expect(open.samplesOnly).toBe(false);
    expect(open.vendors).toHaveLength(4);
    expect(open.vendors.every((v) => v.phone === undefined && v.whatsapp === undefined)).toBe(true);
  });

  test("with no real vendors in a trade, the samples show, marked as samples", async () => {
    const t = setup();
    await caterer(t, "Sample Caterers", { sample: true });
    const found = await t.query(api.marketplace.directory.search, { category: "Catering", city: "Chennai" });
    expect(found.samplesOnly).toBe(true);
    expect(found.vendors.map((v) => v.sample)).toEqual([true]);
  });

  test("a vendor's own sign-up isn't shown until verified, and its page says so", async () => {
    const t = setup();
    const id = await caterer(t, "Waiting Caterers", { status: "pending" });
    expect((await t.query(api.marketplace.directory.search, { category: "Catering", city: "Chennai" })).vendors).toEqual([]);
    expect(await t.query(api.marketplace.directory.vendor, { profileId: id })).toBeNull();
  });

  test("a listed vendor's page has every package on the sheet, and no phone", async () => {
    const t = setup();
    const id = await caterer(t, "Anjali Caterers");
    const page = await t.query(api.marketplace.directory.vendor, { profileId: id });
    expect(page?.packages).toEqual([{ category: "Catering", title: "Banana-leaf lunch", price: 420, currency: "INR", priceUnit: "per_plate", includes: ["Payasam"] }]);
    expect(page?.card.phone).toBeUndefined();
  });

  test("a web search needs a session, and an unknown kind of vendor is refused", async () => {
    const t = setup();
    await expect(t.action(api.marketplace.directory.searchWeb, { category: "Catering", city: "Chennai" })).rejects.toThrow(/sign in/);
    const guest = await t.run((ctx) => ctx.db.insert("users", { isAnonymous: true }));
    await expect(as(t, guest).action(api.marketplace.directory.searchWeb, { category: "Jugglers", city: "Chennai" })).rejects.toThrow(/kind of vendor/);
  });
});
