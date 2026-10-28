/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof setup>;

const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function user(t: T, email: string, staffRole?: "admin" | "reviewer") {
  return await t.run(async (ctx) => await ctx.db.insert("users", { email, ...(staffRole ? { staffRole } : {}) }));
}

/** A listing as the seeding script or a sign-up leaves it. */
async function listing(
  t: T,
  fields: {
    name: string;
    categories?: string[];
    city?: string;
    website?: string;
    status?: "pending" | "verified" | "rejected" | "suspended";
    source?: "plusone_added" | "vendor_signup";
    ownerUserId?: Id<"users">;
    prices?: number[];
  },
) {
  return await t.run(async (ctx) => {
    const city = fields.city ?? "Chennai";
    const profileId = await ctx.db.insert("vendorProfiles", {
      name: fields.name,
      categories: fields.categories ?? ["Catering"],
      city,
      cityKey: city.toLowerCase(),
      website: fields.website,
      source: fields.source ?? "plusone_added",
      ownerUserId: fields.ownerUserId,
      status: fields.status ?? "pending",
      statusAt: 0,
      joinedAt: 0,
      completedEvents: 0,
    });
    for (const price of fields.prices ?? []) {
      await ctx.db.insert("vendorOfferings", {
        profileId,
        category: (fields.categories ?? ["Catering"])[0],
        title: "South Indian lunch",
        unit: "per_person",
        price,
        currency: "INR",
        includes: ["Banana leaf service"],
      });
    }
    return profileId;
  });
}

describe("what Events reads", () => {
  test("search lists verified vendors first, then PlusOne's own listings, and nothing unchecked", async () => {
    const t = setup();
    const owner = await user(t, "a@a.in");
    await listing(t, { name: "Added caterer", source: "plusone_added" });
    await listing(t, { name: "Verified caterer", source: "vendor_signup", status: "verified", ownerUserId: owner, prices: [520, 480] });
    await listing(t, { name: "Unchecked sign-up", source: "vendor_signup", status: "pending" });
    await listing(t, { name: "Suspended caterer", status: "suspended" });
    await listing(t, { name: "Rejected caterer", status: "rejected" });
    await listing(t, { name: "A decorator", categories: ["Decor & Florals"], status: "verified" });
    await listing(t, { name: "In Mumbai", city: "Mumbai", status: "verified" });

    const cards = await t.query(internal.marketplace.listings.searchProfiles, { category: "Catering", city: "Madras" });
    expect(cards.map((c) => c.name)).toEqual(["Verified caterer", "Added caterer"]);
    expect(cards[0]).toMatchObject({
      badges: ["verified", "transparent_pricing"],
      level: "New",
      startingPrice: { price: 480, unit: "per_person", currency: "INR" },
    });
    expect(cards[1].badges).toEqual(["plusone_added"]);
    expect(cards[1].startingPrice).toBeUndefined();
  });

  test("a band shows only once eight prices sit behind it, and places each vendor in it", async () => {
    const t = setup();
    for (let i = 0; i < 7; i++) await listing(t, { name: `Caterer ${i}`, prices: [400 + i * 50] });
    await t.mutation(internal.marketplace.bands.recompute, {});
    expect(await t.query(internal.marketplace.listings.bandFor, { category: "Catering", unit: "per_person", city: "Chennai" })).toBeNull();

    await listing(t, { name: "Caterer 7", prices: [750] });
    await listing(t, { name: "Caterer 8", prices: [800] });
    expect(await t.mutation(internal.marketplace.bands.recompute, {})).toEqual({ bands: 1, removed: 0 });
    const band = await t.query(internal.marketplace.listings.bandFor, { category: "Catering", unit: "per_person", city: "chennai" });
    expect(band).toMatchObject({ count: 9, p25: 500, p50: 600, p75: 700, p90: 760, currency: "INR" });

    const cards = await t.query(internal.marketplace.listings.searchProfiles, { category: "Catering", city: "Chennai" });
    expect(cards.find((c) => c.name === "Caterer 0")?.tier).toBe("Value");
    expect(cards.find((c) => c.name === "Caterer 8")?.tier).toBe("Luxury");
  });

  test("a band with too few prices left is removed, not shown on too little", async () => {
    const t = setup();
    const ids: Id<"vendorProfiles">[] = [];
    for (let i = 0; i < 8; i++) ids.push(await listing(t, { name: `Caterer ${i}`, prices: [400 + i * 50] }));
    await t.mutation(internal.marketplace.bands.recompute, {});
    await t.run(async (ctx) => await ctx.db.patch(ids[0], { status: "suspended" }));
    expect(await t.mutation(internal.marketplace.bands.recompute, {})).toEqual({ bands: 0, removed: 1 });
  });

  test("a website a search found links to its listing, however it was written", async () => {
    const t = setup();
    const profileId = await listing(t, { name: "Anjali Caterers", website: "https://anjalicaterers.in" });
    await listing(t, { name: "Gone", website: "https://gone.in", status: "suspended" });
    expect(await t.query(internal.marketplace.listings.profileByWebsite, { website: "www.AnjaliCaterers.in/menu" })).toBe(profileId);
    expect(await t.query(internal.marketplace.listings.profileByWebsite, { website: "https://gone.in" })).toBeNull();
  });
});

describe("a vendor joining", () => {
  const signUp = {
    name: "Lakshmi Decor",
    categories: ["Decor & Florals", "Not a category"],
    city: "Chennai",
    website: "lakshmidecor.in",
    phone: "98400 12345",
  };

  test("a sign-up is saved cleanly and hidden from families until verified", async () => {
    const t = setup();
    const vendor = await user(t, "lakshmi@lakshmidecor.in");
    const result = await as(t, vendor).mutation(api.marketplace.partner.register, signUp);
    expect(result.kind).toBe("created");

    const mine = await as(t, vendor).query(api.marketplace.partner.mine, {});
    expect(mine.profile).toMatchObject({
      categories: ["Decor & Florals"],
      website: "https://lakshmidecor.in",
      phone: "+919840012345",
      cityKey: "chennai",
      source: "vendor_signup",
      status: "pending",
    });
    expect(mine.listed).toBe(false);
    expect(await t.query(internal.marketplace.listings.searchProfiles, { category: "Decor & Florals", city: "Chennai" })).toEqual([]);
    await expect(as(t, vendor).mutation(api.marketplace.partner.register, signUp)).rejects.toThrow(/already runs a business/);
  });

  test("a business PlusOne already lists is pointed to its listing, not listed twice", async () => {
    const t = setup();
    const added = await listing(t, { name: "Lakshmi Decor", website: "https://lakshmidecor.in", categories: ["Decor & Florals"] });
    const vendor = await user(t, "lakshmi@gmail.com");
    expect(await as(t, vendor).mutation(api.marketplace.partner.register, signUp)).toEqual({ kind: "already_listed", profileId: added });
    expect(await t.query(api.marketplace.partner.findByWebsite, { website: "https://www.lakshmidecor.in" })).toMatchObject({ _id: added, claimed: false });
  });

  test("an email at the listing's own website claims it at once", async () => {
    const t = setup();
    const added = await listing(t, { name: "Anjali Caterers", website: "https://anjalicaterers.in" });
    const vendor = await user(t, "owner@anjalicaterers.in");
    expect((await as(t, vendor).mutation(api.marketplace.partner.claim, { profileId: added })).status).toBe("approved");
    expect((await as(t, vendor).query(api.marketplace.partner.mine, {})).profile?._id).toBe(added);
    const other = await user(t, "other@anjalicaterers.in");
    await expect(as(t, other).mutation(api.marketplace.partner.claim, { profileId: added })).rejects.toThrow(/already been claimed/);
  });

  test("any other claim waits for a person, and only the PlusOne team can decide it", async () => {
    const t = setup();
    const added = await listing(t, { name: "Anjali Caterers", website: "https://anjalicaterers.in" });
    const vendor = await user(t, "anjali.caterers@gmail.com");
    const rival = await user(t, "rival@gmail.com");
    const reviewer = await user(t, "ops@plusoneevents.site", "reviewer");
    const { claimId, status } = await as(t, vendor).mutation(api.marketplace.partner.claim, { profileId: added, note: "Our GST number is on the site" });
    expect(status).toBe("pending");
    const rivalClaim = await as(t, rival).mutation(api.marketplace.partner.claim, { profileId: added });

    await expect(as(t, vendor).query(api.marketplace.ops.queue, {})).rejects.toThrow(/PlusOne team/);
    const queue = await as(t, reviewer).query(api.marketplace.ops.queue, {});
    expect(queue.claims.map((c) => c.claimantEmail).sort()).toEqual(["anjali.caterers@gmail.com", "rival@gmail.com"]);

    await as(t, reviewer).mutation(api.marketplace.ops.decideClaim, { claimId, approve: true });
    expect((await as(t, vendor).query(api.marketplace.partner.mine, {})).profile?._id).toBe(added);
    const rivalRow = await t.run(async (ctx) => await ctx.db.get(rivalClaim.claimId));
    expect(rivalRow?.status).toBe("rejected");
  });
});

describe("a vendor's prices", () => {
  test("offerings are priced in the units families compare, by their owner only", async () => {
    const t = setup();
    const vendor = await user(t, "owner@anjalicaterers.in");
    const stranger = await user(t, "stranger@example.com");
    await as(t, vendor).mutation(api.marketplace.partner.register, { name: "Anjali Caterers", categories: ["Catering"], city: "Chennai" });
    const offeringId = await as(t, vendor).mutation(api.marketplace.partner.saveOffering, {
      category: "Catering",
      title: "  South Indian lunch, banana leaf  ",
      unit: "per_person",
      price: 549.6,
      includes: ["Banana leaf service", " ", "Water"],
      taxIncluded: false,
    });
    const mine = await as(t, vendor).query(api.marketplace.partner.mine, {});
    expect(mine.offerings).toMatchObject([{ _id: offeringId, title: "South Indian lunch, banana leaf", price: 550, currency: "INR", includes: ["Banana leaf service", "Water"] }]);

    await expect(
      as(t, vendor).mutation(api.marketplace.partner.saveOffering, { category: "Cake", title: "Cake", unit: "total", price: 2000, includes: [] }),
    ).rejects.toThrow(/Add that kind of service/);
    await expect(as(t, vendor).mutation(api.marketplace.partner.saveOffering, { category: "Catering", title: "Free", unit: "per_person", price: 0, includes: [] })).rejects.toThrow(
      /price/,
    );
    await expect(as(t, stranger).mutation(api.marketplace.partner.removeOffering, { offeringId })).rejects.toThrow(/Set up your business/);
  });
});

describe("Ops verifying", () => {
  test("a person verifies with checks and evidence, the record is kept, and the vendor appears to families", async () => {
    const t = setup();
    const vendor = await user(t, "owner@anjalicaterers.in");
    const reviewer = await user(t, "ops@plusoneevents.site", "reviewer");
    const { profileId } = (await as(t, vendor).mutation(api.marketplace.partner.register, {
      name: "Anjali Caterers",
      categories: ["Catering"],
      city: "Chennai",
      website: "anjalicaterers.in",
    })) as { profileId: Id<"vendorProfiles"> };

    const queue = await as(t, reviewer).query(api.marketplace.ops.queue, {});
    expect(queue.profiles.map((p) => p._id)).toEqual([profileId]);
    await expect(
      as(t, reviewer).mutation(api.marketplace.ops.review, { profileId, outcome: "verified", checks: [{ label: "Website is theirs", passed: false }], evidence: [] }),
    ).rejects.toThrow(/at least one check/);
    await as(t, reviewer).mutation(api.marketplace.ops.review, {
      profileId,
      outcome: "verified",
      checks: [{ label: "Website is theirs", passed: true }],
      evidence: [
        { label: "Contact page", url: "https://anjalicaterers.in/contact" },
        { label: "Not a link", url: "javascript:alert(1)" },
      ],
    });

    const detail = await as(t, reviewer).query(api.marketplace.ops.profile, { profileId });
    expect(detail?.profile.status).toBe("verified");
    expect(detail?.reviews).toHaveLength(1);
    expect(detail?.reviews[0].evidence).toEqual([{ label: "Contact page", url: "https://anjalicaterers.in/contact" }]);
    expect((await t.query(internal.marketplace.listings.searchProfiles, { category: "Catering", city: "Chennai" })).map((c) => c._id)).toEqual([profileId]);
  });

  test("a verified vendor who changes name goes back for a fresh check", async () => {
    const t = setup();
    const vendor = await user(t, "owner@anjalicaterers.in");
    await listing(t, { name: "Anjali Caterers", source: "vendor_signup", status: "verified", ownerUserId: vendor });
    await as(t, vendor).mutation(api.marketplace.partner.update, { name: "Anjali Caterers", categories: ["Catering"], city: "Chennai", about: "Since 1998" });
    expect((await as(t, vendor).query(api.marketplace.partner.mine, {})).profile?.status).toBe("verified");
    await as(t, vendor).mutation(api.marketplace.partner.update, { name: "Anjali Grand Caterers", categories: ["Catering"], city: "Chennai" });
    expect((await as(t, vendor).query(api.marketplace.partner.mine, {})).profile?.status).toBe("pending");
  });

  test("an unclaimed listing can't be verified, and staff roles are set by hand", async () => {
    const t = setup();
    const added = await listing(t, { name: "Anjali Caterers" });
    const someone = await user(t, "ops@plusoneevents.site");
    await t.mutation(internal.marketplace.ops.setStaffRole, { email: "OPS@plusoneevents.site", role: "reviewer" });
    await expect(
      as(t, someone).mutation(api.marketplace.ops.review, { profileId: added, outcome: "verified", checks: [{ label: "Seen", passed: true }], evidence: [] }),
    ).rejects.toThrow(/hasn't been claimed/);
    await t.mutation(internal.marketplace.ops.setStaffRole, { email: "ops@plusoneevents.site", role: null });
    await expect(as(t, someone).query(api.marketplace.ops.queue, {})).rejects.toThrow(/PlusOne team/);
  });
});
