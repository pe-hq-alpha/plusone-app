/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { wonderCostUsd } from "./lib/modelCost";
import schema from "./schema";
import { vendorFacts } from "./marketplace/checks";

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
    sample?: boolean;
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
      ...(fields.sample ? { sample: true } : {}),
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
    // One band from real prices, one with the sample vendors' too.
    expect(await t.mutation(internal.marketplace.bands.recompute, {})).toEqual({ bands: 2, removed: 0 });
    const band = await t.query(internal.marketplace.listings.bandFor, { category: "Catering", unit: "per_person", city: "chennai" });
    expect(band).toMatchObject({ count: 9, p25: 500, p50: 600, p75: 700, p90: 760, currency: "INR" });

    const cards = await t.query(internal.marketplace.listings.searchProfiles, { category: "Catering", city: "Chennai" });
    expect(cards.find((c) => c.name === "Caterer 0")?.tier).toBe("Value");
    expect(cards.find((c) => c.name === "Caterer 8")?.tier).toBe("Luxury");
  });

  test("a rate per hour never sits in a range of prices for the whole event", async () => {
    const t = setup();
    for (let i = 0; i < 8; i++) {
      const profileId = await listing(t, { name: `Photographer ${i}`, categories: ["Photographer"], status: "verified" });
      await t.run(async (ctx) => {
        const base = { profileId, category: "Photographer", title: "Candid photos", unit: "total" as const, currency: "INR", includes: ["Edited photos"] };
        await ctx.db.insert("vendorOfferings", { ...base, priceUnit: i % 2 ? "for_event" : undefined, price: 20_000 + i * 2_000 });
        await ctx.db.insert("vendorOfferings", { ...base, priceUnit: "per_hour", price: 1_500 });
      });
    }
    await t.mutation(internal.marketplace.bands.recompute, {});
    const band = await t.query(internal.marketplace.listings.bandFor, { category: "Photographer", unit: "total", city: "Chennai" });
    expect(band).toMatchObject({ count: 8, p25: 23_500, p50: 27_000 });

    // The card's "from" price is for the event, not the cheaper hourly rate, and is placed in the range.
    const cards = await t.query(internal.marketplace.listings.searchProfiles, { category: "Photographer", city: "Chennai" });
    expect(cards.find((c) => c.name === "Photographer 0")).toMatchObject({ startingPrice: { price: 20_000, unit: "total" }, tier: "Value" });
    expect(cards.find((c) => c.name === "Photographer 1")?.startingPrice).toEqual({ price: 22_000, unit: "total", priceUnit: "for_event", currency: "INR" });
  });

  test("a band with too few prices left is removed, not shown on too little", async () => {
    const t = setup();
    const ids: Id<"vendorProfiles">[] = [];
    for (let i = 0; i < 8; i++) ids.push(await listing(t, { name: `Caterer ${i}`, prices: [400 + i * 50] }));
    await t.mutation(internal.marketplace.bands.recompute, {});
    await t.run(async (ctx) => await ctx.db.patch(ids[0], { status: "suspended" }));
    expect(await t.mutation(internal.marketplace.bands.recompute, {})).toEqual({ bands: 0, removed: 2 });
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

  test("a photographer prices the way photographers do, with what the price includes", async () => {
    const t = setup();
    const vendor = await user(t, "hello@thinnai.in");
    await as(t, vendor).mutation(api.marketplace.partner.register, { name: "Thinnai Photography", categories: ["Photographer", "Makeup & Hair"], city: "Chennai" });
    const save = (more: object) =>
      as(t, vendor).mutation(api.marketplace.partner.saveOffering, { category: "Photographer", title: "Candid photos", unit: "per_person", price: 2_000, includes: ["Edited photos online"], ...more });

    await save({ priceUnit: "per_hour", quantities: { photographers: 2, photos: 150.4, days: 3 } });
    await save({ priceUnit: "for_event", quantities: { hours: 8, photographers: 2, photos: 400, delivery: 3 }, price: 45_000 });
    // A rate per hour is a published price: it needn't say for how many hours.
    const offerings = (await as(t, vendor).query(api.marketplace.partner.mine, {})).offerings;
    expect(offerings.map((o) => [o.unit, o.priceUnit, o.quantities])).toEqual([
      ["total", "per_hour", { photographers: 2, photos: 150.4 }],
      ["total", "for_event", { hours: 8, photographers: 2, photos: 400, delivery: 3 }],
    ]);

    await expect(save({ priceUnit: "per_plate" })).rejects.toThrow(/ways this service is priced/);
    await expect(save({ priceUnit: "for_event", quantities: { plates: 100 } })).rejects.toThrow(/isn't something/);
    await expect(save({ priceUnit: "for_event", quantities: { hours: -1 } })).rejects.toThrow(/hours of coverage doesn't look right/);
    await expect(
      as(t, vendor).mutation(api.marketplace.partner.saveOffering, { category: "Makeup & Hair", title: "Bridal look", unit: "per_person", priceUnit: "per_look", price: 8_000, includes: [] }),
    ).rejects.toThrow(/one way only/);
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

describe("sample vendors", () => {
  test("only sample events see sample vendors and the ranges their prices make", async () => {
    const t = setup();
    for (let i = 0; i < 8; i++) await listing(t, { name: `Sample caterer ${i}`, status: "verified", prices: [400 + i * 50], sample: true, website: `https://sample${i}.example` });
    await listing(t, { name: "Real caterer", status: "verified", prices: [900] });
    await t.mutation(internal.marketplace.bands.recompute, {});

    const real = await t.query(internal.marketplace.listings.searchProfiles, { category: "Catering", city: "Chennai" });
    expect(real.map((c) => c.name)).toEqual(["Real caterer"]);
    expect(real[0].tier).toBeUndefined();
    const demo = await t.query(internal.marketplace.listings.searchProfiles, { category: "Catering", city: "Chennai", samples: true });
    expect(demo).toHaveLength(9);
    expect(demo.find((c) => c.name === "Real caterer")?.sample).toBe(false);
    expect(demo.find((c) => c.name === "Sample caterer 0")).toMatchObject({ sample: true, tier: "Value" });

    expect(await t.query(internal.marketplace.listings.bandFor, { category: "Catering", unit: "per_person", city: "Chennai" })).toBeNull();
    expect(await t.query(internal.marketplace.listings.bandFor, { category: "Catering", unit: "per_person", city: "Chennai", samples: true })).toMatchObject({ count: 9 });
    expect(await t.query(internal.marketplace.listings.profileByWebsite, { website: "https://sample0.example" })).toBeNull();
  });
});

/** A family's event in Chennai with one catering need for a 120-guest lunch. */
async function familyEvent(t: T, opts: { demo?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const familyId = await ctx.db.insert("users", { email: "family@example.com" });
    const eventId = await ctx.db.insert("events", {
      name: "Amma's 60th",
      host: "Meena",
      coHost: "",
      startDate: "2026-12-12",
      endDate: "2026-12-12",
      city: "Chennai",
      area: "Mylapore",
      currency: "INR",
      totalBudget: 300000,
      occasionLabel: "Amma's 60th",
      eventType: "birthday",
      createdBy: familyId,
      ...(opts.demo ? { demo: true } : {}),
    });
    await ctx.db.insert("members", { eventId, userId: familyId, role: "owner" });
    const sessionId = await ctx.db.insert("sessions", {
      eventId, name: "Lunch", dayIndex: 0, date: "2026-12-12", guestCount: 120, budget: 90000, color: "#000", order: 0,
    });
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [sessionId], category: "Catering", title: "Lunch for the 60th", budget: 90000, status: "research" });
    return { familyId, eventId, slotId };
  });
}

const cateringAnswers = [
  { key: "gst", status: "extra" as const },
  { key: "service_staff", status: "included" as const },
  { key: "transport", status: "priced" as const, amount: 2500 },
  { key: "crockery", status: "included" as const },
  { key: "water", status: "included" as const },
];

describe("briefs and offers", () => {
  test("a family's need reaches verified caterers in the city, and their offer comes back on the sheet's lines", async () => {
    const t = setup();
    const { familyId, eventId, slotId } = await familyEvent(t);
    const vendor = await user(t, "owner@anjalicaterers.in");
    const profileId = await listing(t, { name: "Anjali Caterers", source: "vendor_signup", status: "verified", ownerUserId: vendor, prices: [520] });
    const unverified = await user(t, "new@caterer.in");
    await listing(t, { name: "New caterer", source: "vendor_signup", status: "pending", ownerUserId: unverified });

    const briefId = await as(t, familyId).mutation(api.marketplace.briefs.ask, { eventId, slotId });
    expect(await as(t, familyId).mutation(api.marketplace.briefs.ask, { eventId, slotId })).toBe(briefId);

    const open = await as(t, vendor).query(api.marketplace.briefs.open, {});
    expect(open).toMatchObject([{ _id: briefId, title: "Lunch for the 60th", occasion: "Amma's 60th", area: "Mylapore", guests: 120, unit: "per_person", answered: false }]);
    expect(JSON.stringify(open)).not.toMatch(/Meena|300000|family@example/);
    expect(await as(t, unverified).query(api.marketplace.briefs.open, {})).toEqual([]);
    await expect(
      as(t, unverified).mutation(api.marketplace.offers.submit, { briefId, price: 500, lines: cateringAnswers }),
    ).rejects.toThrow(/once PlusOne has verified/);

    await expect(
      as(t, vendor).mutation(api.marketplace.offers.submit, { briefId, price: 550, lines: cateringAnswers.slice(1) }),
    ).rejects.toThrow(/Say whether GST/);
    await expect(
      as(t, vendor).mutation(api.marketplace.offers.submit, {
        briefId, price: 550, lines: cateringAnswers.map((l) => (l.key === "transport" ? { key: "transport", status: "priced" as const } : l)),
      }),
    ).rejects.toThrow(/amount for transport/);

    const offerId = await as(t, vendor).mutation(api.marketplace.offers.submit, { briefId, price: 550, covers: "Veg lunch on banana leaf", lines: cateringAnswers });
    expect((await as(t, vendor).query(api.marketplace.briefs.open, {}))[0].answered).toBe(true);
    expect(await as(t, familyId).query(api.marketplace.briefs.forSlot, { eventId, slotId })).toMatchObject({ status: "open", offers: 1 });

    const offers = await t.query(internal.marketplace.offers.offersFor, { eventId });
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      _id: offerId,
      slotId,
      price: 550,
      quantity: 120,
      total: 550 * 120 + 2500,
      vendor: { _id: profileId, name: "Anjali Caterers", badges: ["verified", "transparent_pricing"] },
    });
    expect(offers[0].lines.find((l) => l.key === "transport")).toEqual({ key: "transport", label: "Transport", status: "priced", amount: 2500 });
    expect(offers[0].lines.find((l) => l.key === "gst")).toEqual({ key: "gst", label: "GST", status: "extra" });

    // Answering again changes the offer rather than adding a second.
    await as(t, vendor).mutation(api.marketplace.offers.submit, { briefId, price: 530, quantity: 150, lines: cateringAnswers });
    expect((await t.query(internal.marketplace.offers.offersFor, { eventId })).map((o) => [o.price, o.quantity])).toEqual([[530, 150]]);
  });

  test("a photographer answers in their own terms, and the total is worked out from the price and the hours", async () => {
    const t = setup();
    const { familyId, eventId } = await familyEvent(t);
    const slotId = await t.run(async (ctx) => {
      const lunch = (await ctx.db.query("sessions").collect())[0];
      return await ctx.db.insert("vendorSlots", { eventId, sessionIds: [lunch._id], category: "Photographer", title: "Photos of the lunch", budget: 30000, status: "research" });
    });
    const vendor = await user(t, "hello@thinnai.in");
    await listing(t, { name: "Thinnai Photography", categories: ["Photographer"], source: "vendor_signup", status: "verified", ownerUserId: vendor });
    const briefId = await as(t, familyId).mutation(api.marketplace.briefs.ask, { eventId, slotId });
    const lines = [
      { key: "gst", status: "included" as const },
      { key: "travel", status: "priced" as const, amount: 500 },
      { key: "overtime", status: "extra" as const, amount: 2000 },
      { key: "album", status: "extra" as const },
      { key: "drone", status: "included" as const },
    ];
    const send = (more: object) => as(t, vendor).mutation(api.marketplace.offers.submit, { briefId, price: 2_000, lines, ...more });

    await expect(send({ priceUnit: "per_hour", quantities: { photographers: 2 } })).rejects.toThrow("A price per hour needs the hours of coverage.");
    await expect(send({ priceUnit: "per_kg", quantities: { hours: 6 } })).rejects.toThrow(/ways this service is priced/);
    await expect(send({ priceUnit: "per_hour", quantities: { hours: 6, plates: 120 } })).rejects.toThrow(/isn't something/);
    await expect(send({ priceUnit: "per_hour", quantities: { hours: Number.POSITIVE_INFINITY } })).rejects.toThrow(/doesn't look right/);

    // A total sent from the form is never trusted: there is no such field, and it's worked out here.
    await send({ priceUnit: "per_hour", quantities: { hours: 6, photographers: 2, photos: 300, delivery: 2, days: 2 } });
    let [offer] = await t.query(internal.marketplace.offers.offersFor, { eventId });
    expect(offer).toMatchObject({ unit: "total", priceUnit: "per_hour", quantities: { hours: 6, photographers: 2, photos: 300, delivery: 2 }, quantity: 6, total: 2_000 * 6 + 500 });

    await send({ price: 14_000, priceUnit: "for_event", quantities: { hours: 4 } });
    [offer] = await t.query(internal.marketplace.offers.offersFor, { eventId });
    expect(offer).toMatchObject({ priceUnit: "for_event", quantities: { hours: 4 }, quantity: 1, total: 14_500 });
  });

  test("a caterer's plates come from 'For how many', or from the quantities, or from the brief's guests", async () => {
    const t = setup();
    const { familyId, eventId, slotId } = await familyEvent(t);
    const vendor = await user(t, "owner@anjalicaterers.in");
    await listing(t, { name: "Anjali Caterers", source: "vendor_signup", status: "verified", ownerUserId: vendor });
    const briefId = await as(t, familyId).mutation(api.marketplace.briefs.ask, { eventId, slotId });
    const send = (more: object) => as(t, vendor).mutation(api.marketplace.offers.submit, { briefId, price: 400, lines: cateringAnswers, ...more });
    const sent = async () => (await t.query(internal.marketplace.offers.offersFor, { eventId }))[0];

    await send({ priceUnit: "per_person_buffet", quantities: { dishes: 12, staff: 6 } });
    expect(await sent()).toMatchObject({ unit: "per_person", priceUnit: "per_person_buffet", quantities: { count: 120, dishes: 12, staff: 6 }, quantity: 120, total: 400 * 120 + 2500 });
    await send({ quantity: 150 });
    expect(await sent()).toMatchObject({ priceUnit: "per_plate", quantities: { count: 150 }, quantity: 150 });
    await send({ quantities: { count: 90 } });
    expect(await sent()).toMatchObject({ quantity: 90, total: 400 * 90 + 2500 });
  });

  test("a withdrawn offer, or one from a vendor since suspended, leaves Compare", async () => {
    const t = setup();
    const { familyId, eventId, slotId } = await familyEvent(t);
    const vendor = await user(t, "owner@anjalicaterers.in");
    const profileId = await listing(t, { name: "Anjali Caterers", source: "vendor_signup", status: "verified", ownerUserId: vendor });
    const briefId = await as(t, familyId).mutation(api.marketplace.briefs.ask, { eventId, slotId });
    const offerId = await as(t, vendor).mutation(api.marketplace.offers.submit, { briefId, price: 550, lines: cateringAnswers });

    await t.run(async (ctx) => await ctx.db.patch(profileId, { status: "suspended" }));
    expect(await t.query(internal.marketplace.offers.offersFor, { eventId })).toEqual([]);
    await t.run(async (ctx) => await ctx.db.patch(profileId, { status: "verified" }));
    await as(t, vendor).mutation(api.marketplace.offers.withdraw, { offerId });
    expect(await t.query(internal.marketplace.offers.offersFor, { eventId })).toEqual([]);
    expect((await as(t, vendor).query(api.marketplace.offers.mine, {}))[0]).toMatchObject({ status: "withdrawn", briefOpen: true });

    await as(t, familyId).mutation(api.marketplace.briefs.close, { briefId });
    await expect(as(t, vendor).mutation(api.marketplace.offers.submit, { briefId, price: 550, lines: cateringAnswers })).rejects.toThrow(/no longer taking offers/);
  });

  test("a need that's already booked isn't sent to vendors", async () => {
    const t = setup();
    const { familyId, eventId, slotId } = await familyEvent(t);
    await t.run(async (ctx) => await ctx.db.patch(slotId, { status: "booked" }));
    await expect(as(t, familyId).mutation(api.marketplace.briefs.ask, { eventId, slotId })).rejects.toThrow(/already booked/);
    expect(await as(t, familyId).query(api.marketplace.briefs.forSlot, { eventId, slotId })).toBeNull();
  });

  test("a sample event's brief never reaches a real vendor, and a viewer can't send one", async () => {
    const t = setup();
    const { familyId, eventId, slotId } = await familyEvent(t, { demo: true });
    const real = await user(t, "owner@anjalicaterers.in");
    await listing(t, { name: "Anjali Caterers", source: "vendor_signup", status: "verified", ownerUserId: real });
    const sampleOwner = await user(t, "sample@plusoneevents.site");
    await listing(t, { name: "Sample caterer", source: "vendor_signup", status: "verified", ownerUserId: sampleOwner, sample: true });

    const briefId = await t.mutation(internal.marketplace.briefs.openForSlot, { eventId, slotId });
    expect(await as(t, real).query(api.marketplace.briefs.open, {})).toEqual([]);
    await expect(as(t, real).mutation(api.marketplace.offers.submit, { briefId, price: 550, lines: cateringAnswers })).rejects.toThrow(/isn't for your kind/);
    // An owned sample business is a demo guest's own trial: it sees only that guest's event.
    expect(await as(t, sampleOwner).query(api.marketplace.briefs.open, {})).toEqual([]);

    const viewer = await user(t, "aunt@example.com");
    await t.run(async (ctx) => await ctx.db.insert("members", { eventId, userId: viewer, role: "viewer" }));
    await expect(as(t, viewer).mutation(api.marketplace.briefs.ask, { eventId, slotId })).rejects.toThrow(/planner/);
    expect(familyId).toBeDefined();
  });
});

describe("the guest demo's Partner side", () => {
  test("a sample event gets complete offers from sample vendors, with sample ranges beside them", async () => {
    const t = setup();
    const { eventId } = await familyEvent(t, { demo: true });
    await t.run(async (ctx) => {
      const lunch = (await ctx.db.query("sessions").collect())[0];
      for (const category of ["Decor & Florals", "Photographer"]) {
        await ctx.db.insert("vendorSlots", { eventId, sessionIds: [lunch._id], category, title: category, budget: 30000, status: "research" });
      }
    });
    expect(await t.mutation(internal.marketplace.samples.seedForEvent, { eventId })).toBe(4);

    const offers = await t.query(internal.marketplace.offers.offersFor, { eventId });
    const byVendor = Object.fromEntries(offers.map((o) => [o.vendor.name, o]));
    expect(byVendor["Kalyana Saapadu Co."]).toMatchObject({ quantity: 120, total: 340 * 120 + 2040 + 1500 });
    expect(byVendor["Komalam Caterers"].total).toBe(450 * 120);
    expect(byVendor["Jasmine Arch Decorators"].total).toBe(24_500 + 1200);
    expect(byVendor["Thinnai Photography"].total).toBe(12_500);
    expect(byVendor["Thinnai Photography"]).toMatchObject({ priceUnit: "for_event", quantity: 1, quantities: { hours: 3, photographers: 1, photos: 150, delivery: 1 } });
    expect(byVendor["Kalyana Saapadu Co."]).toMatchObject({ priceUnit: "per_plate", quantities: { count: 120, dishes: 9, sweets: 2, staff: 6 } });
    for (const o of offers) {
      expect(o.vendor.sample).toBe(true);
      expect(o.lines.every((l) => l.status !== "unstated")).toBe(true);
    }

    const band = await t.query(internal.marketplace.listings.bandFor, { category: "Catering", unit: "per_person", city: "Chennai", samples: true });
    expect(band).toMatchObject({ count: 10, p50: 360 });
    expect(await t.query(internal.marketplace.listings.bandFor, { category: "Catering", unit: "per_person", city: "Chennai" })).toBeNull();
    expect(await t.query(internal.marketplace.listings.searchProfiles, { category: "Catering", city: "Chennai" })).toEqual([]);

    // Seeding the vendors again adds nobody twice.
    expect(await t.mutation(internal.marketplace.samples.ensureVendors, {})).toBe(26);
    expect((await t.run(async (ctx) => await ctx.db.query("vendorProfiles").collect())).length).toBe(26);
  });

  test("sample offers never go on a real family's event, and deleting an event takes its briefs and offers", async () => {
    const t = setup();
    const real = await familyEvent(t);
    await expect(t.mutation(internal.marketplace.samples.seedForEvent, { eventId: real.eventId })).rejects.toThrow(/sample events only/);

    const demo = await familyEvent(t, { demo: true });
    await t.mutation(internal.marketplace.samples.seedForEvent, { eventId: demo.eventId });
    expect(await t.query(internal.marketplace.offers.offersFor, { eventId: demo.eventId })).toHaveLength(2);
    let done = false;
    while (!done) done = (await t.mutation(internal.maintenance.deleteEvent, { eventId: demo.eventId })).done;
    const left = await t.run(async (ctx) => [(await ctx.db.query("vendorBriefs").collect()).length, (await ctx.db.query("vendorOffers").collect()).length]);
    expect(left).toEqual([0, 0]);
  });
});

describe("a demo guest trying Partner", () => {
  test("answers their own sample event as a sample caterer, and sees the offer land in their Compare", async () => {
    const t = setup();
    const mine = await familyEvent(t, { demo: true });
    const someoneElse = await familyEvent(t, { demo: true });
    await t.run(async (ctx) => {
      await ctx.db.patch(mine.familyId, { isAnonymous: true });
      await ctx.db.patch(someoneElse.familyId, { isAnonymous: true });
    });
    const guest = as(t, mine.familyId);
    const myBrief = await t.mutation(internal.marketplace.briefs.openForSlot, { eventId: mine.eventId, slotId: mine.slotId });
    await t.mutation(internal.marketplace.briefs.openForSlot, { eventId: someoneElse.eventId, slotId: someoneElse.slotId });

    await expect(guest.mutation(api.marketplace.partner.register, { name: "X", categories: ["Catering"], city: "Chennai" })).rejects.toThrow(/account/);
    const profileId = await guest.mutation(api.marketplace.partner.trySample, {});
    expect(await guest.mutation(api.marketplace.partner.trySample, {})).toBe(profileId);

    const open = await guest.query(api.marketplace.briefs.open, {});
    expect(open.map((b) => b._id)).toEqual([myBrief]);
    await guest.mutation(api.marketplace.offers.submit, { briefId: myBrief, price: 360, lines: cateringAnswers });
    const offers = await t.query(internal.marketplace.offers.offersFor, { eventId: mine.eventId });
    expect(offers.map((o) => [o.vendor.name, o.vendor.sample, o.total])).toEqual([["Your catering business", true, 360 * 120 + 2500]]);

    // Nobody else's sample event, search or range ever sees it.
    const otherBrief = (await t.run(async (ctx) => await ctx.db.query("vendorBriefs").collect())).find((b) => b.eventId === someoneElse.eventId)!;
    await expect(guest.mutation(api.marketplace.offers.submit, { briefId: otherBrief._id, price: 360, lines: cateringAnswers })).rejects.toThrow(/your own sample event/);
    expect(await t.query(internal.marketplace.listings.searchProfiles, { category: "Catering", city: "Chennai", samples: true })).toEqual([]);

    // A real account can't take a sample business.
    const real = await user(t, "owner@anjalicaterers.in");
    await expect(as(t, real).mutation(api.marketplace.partner.trySample, {})).rejects.toThrow(/for the demo/);
  });

  test("clearing a guest away, or deleting a vendor's account, takes their business with it", async () => {
    const t = setup();
    const { familyId, eventId, slotId } = await familyEvent(t, { demo: true });
    await t.run(async (ctx) => await ctx.db.patch(familyId, { isAnonymous: true }));
    const briefId = await t.mutation(internal.marketplace.briefs.openForSlot, { eventId, slotId });
    await as(t, familyId).mutation(api.marketplace.partner.trySample, {});
    await as(t, familyId).mutation(api.marketplace.offers.submit, { briefId, price: 360, lines: cateringAnswers });

    const vendor = await user(t, "owner@anjalicaterers.in");
    const added = await listing(t, { name: "Anjali Caterers", website: "https://anjalicaterers.in", prices: [500] });
    await as(t, vendor).mutation(api.marketplace.partner.claim, { profileId: added });

    await t.run(async (ctx) => {
      const { deleteUserRecords } = await import("./lib/accounts");
      await deleteUserRecords(ctx, familyId);
      await deleteUserRecords(ctx, vendor);
    });
    const left = await t.run(async (ctx) => ({
      profiles: (await ctx.db.query("vendorProfiles").collect()).map((p) => [p.name, p.ownerUserId ?? null, p.status]),
      offerings: (await ctx.db.query("vendorOfferings").collect()).length,
      offers: (await ctx.db.query("vendorOffers").collect()).length,
      claims: (await ctx.db.query("vendorClaims").collect()).length,
    }));
    expect(left).toEqual({ profiles: [["Anjali Caterers", null, "pending"]], offerings: 0, offers: 0, claims: 0 });
  });
});

function checkResponseJson(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

function checkReportJson(url: string) {
  return JSON.stringify({
    checks: [
      { key: "identity", label: "The business exists", finding: "supports", note: "Found", sources: [{ title: "Lakshmi", url }] },
      { key: "website", label: "The website is theirs", finding: "supports", note: "Matches", sources: [{ title: "Lakshmi", url }] },
      { key: "contact", label: "Their contact details", finding: "supports", note: "Seen", sources: [{ title: "Lakshmi", url }] },
      { key: "location", label: "Where they work", finding: "supports", note: "Chennai", sources: [{ title: "Lakshmi", url }] },
      { key: "prices", label: "Their prices", finding: "supports", note: "Match", sources: [{ title: "Lakshmi", url }] },
      { key: "complaints", label: "Complaints", finding: "not_found", note: "None", sources: [] },
    ],
    summary: "All six checks look reasonable.",
  });
}

async function checkListing(t: T, fields: { name?: string; website?: string } = {}) {
  return await t.run(async (ctx) => {
    const city = "Chennai";
    return await ctx.db.insert("vendorProfiles", {
      name: fields.name ?? "Lakshmi Caterers",
      categories: ["Catering"],
      city,
      cityKey: city.toLowerCase(),
      website: fields.website,
      source: "vendor_signup",
      status: "pending",
      statusAt: 0,
      joinedAt: 0,
      completedEvents: 0,
    });
  });
}

describe("starting a vendor check", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("a non-staff user, and a demo guest, can't start; staff can, and a second while running is refused", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const t = setup();
    const profileId = await checkListing(t);
    const stranger = await user(t, "stranger@example.com");
    await expect(as(t, stranger).mutation(api.marketplace.checks.start, { profileId })).rejects.toThrow(/PlusOne team/);
    const guest = await t.run(async (ctx) => await ctx.db.insert("users", { isAnonymous: true }));
    await expect(as(t, guest).mutation(api.marketplace.checks.start, { profileId })).rejects.toThrow(/PlusOne team/);
    const reviewer = await user(t, "ops-check@example.com", "reviewer");
    const checkId = await as(t, reviewer).mutation(api.marketplace.checks.start, { profileId });
    expect(checkId).toBeDefined();
    await expect(as(t, reviewer).mutation(api.marketplace.checks.start, { profileId })).rejects.toThrow(/already running/);
  });

  test("starting refuses without MODEL_PROVIDER=meta", async () => {
    vi.stubEnv("MODEL_PROVIDER", "claude");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const t = setup();
    const profileId = await checkListing(t);
    const reviewer = await user(t, "ops-check2@example.com", "reviewer");
    await expect(as(t, reviewer).mutation(api.marketplace.checks.start, { profileId })).rejects.toThrow(/Checks aren't available/);
  });

  test("the staff limit refuses after 5 starts in a row", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const t = setup();
    const reviewer = await user(t, "ops-limit@example.com", "reviewer");
    for (let i = 0; i < 5; i++) {
      const id = await checkListing(t, { name: `Vendor ${i}` });
      await as(t, reviewer).mutation(api.marketplace.checks.start, { profileId: id });
    }
    const sixth = await checkListing(t, { name: "Vendor 5" });
    await expect(as(t, reviewer).mutation(api.marketplace.checks.start, { profileId: sixth })).rejects.toThrow(/as many checks as we run today/);
  });
});

describe("vendorFacts", () => {
  test("maps a profile and its offerings, in the vendor's own price unit", async () => {
    const facts = vendorFacts(
      { name: "Lakshmi", categories: ["Catering"], city: "Chennai", website: "https://lakshmi.example", phone: "98", about: "Family caterers" },
      [
        { title: "Lunch", price: 400, unit: "per_person", priceUnit: "per_plate", currency: "INR" },
        { title: "Dinner", price: 500, unit: "total", priceUnit: undefined, currency: "INR" },
      ] as never,
    );
    expect(facts).toMatchObject({
      name: "Lakshmi",
      city: "Chennai",
      website: "https://lakshmi.example",
      offerings: [
        { title: "Lunch", price: 400, unit: "per_plate", currency: "INR" },
        { title: "Dinner", price: 500, unit: "total", currency: "INR" },
      ],
    });
  });
});

describe("running a vendor check", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("a single reply with a search result and the final report becomes done with a cost row", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    const url = "https://lakshmi.example/menu";
    const reply = {
      id: "resp_1",
      output: [
        { type: "web_search_call", id: "ws_1", status: "completed", results: [{ type: "text_result", title: "Lakshmi", url, snippet: "caterers" }] },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: checkReportJson(url), annotations: [] }] },
      ],
      usage: { input_tokens: 1000, output_tokens: 500 },
    };
    vi.stubGlobal("fetch", vi.fn(async () => checkResponseJson(reply)));

    const t = setup();
    const profileId = await checkListing(t, { website: "https://lakshmi.example" });
    await t.run(async (ctx) => {
      await ctx.db.insert("vendorOfferings", {
        profileId,
        category: "Catering",
        title: "Lunch",
        unit: "per_person",
        price: 400,
        currency: "INR",
        includes: [],
      });
    });
    const reviewer = await user(t, "ops-run@example.com", "reviewer");
    const checkId = await as(t, reviewer).mutation(api.marketplace.checks.start, { profileId });
    await t.action(internal.marketplace.checks.run, { checkId });

    const latest = await as(t, reviewer).query(api.marketplace.checks.latest, { profileId });
    expect(latest?.status).toBe("done");
    expect(latest?.report?.checks).toHaveLength(6);
    expect(latest?.report?.summary).toMatch(/reasonable/);
    expect(latest?.searches).toBe(1);
    expect(latest?.pagesRead).toBe(0);

    const rows = await t.run(async (ctx) => await ctx.db.query("modelCalls").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: "vendorCheck", provider: "meta", inputTokens: 1000, outputTokens: 500, fellBack: false });
    expect(rows[0].costUsd).toBeCloseTo(wonderCostUsd({ inputTokens: 1000, outputTokens: 500 }, 1));
  });

  test("a Meta 400 makes the check failed with the plain error", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));

    const t = setup();
    const profileId = await checkListing(t);
    const reviewer = await user(t, "ops-fail@example.com", "reviewer");
    const checkId = await as(t, reviewer).mutation(api.marketplace.checks.start, { profileId });
    await t.action(internal.marketplace.checks.run, { checkId });

    const latest = await as(t, reviewer).query(api.marketplace.checks.latest, { profileId });
    expect(latest?.status).toBe("failed");
    expect(latest?.error).toBe("The check couldn't finish. Try again in a while.");
    const rows = await t.run(async (ctx) => await ctx.db.query("modelCalls").collect());
    expect(rows).toHaveLength(0);
  });

  test("a check that fails after a turn came back still writes what it spent", async () => {
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "test-key");
    // Turn one answers in prose, not the report; the repair turn is then refused.
    const prose = {
      id: "resp_1",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Looks fine to me.", annotations: [] }] }],
      usage: { input_tokens: 1200, output_tokens: 300 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(checkResponseJson(prose)).mockResolvedValueOnce(new Response("bad", { status: 400 })),
    );

    const t = setup();
    const profileId = await checkListing(t);
    const reviewer = await user(t, "ops-spent@example.com", "reviewer");
    const checkId = await as(t, reviewer).mutation(api.marketplace.checks.start, { profileId });
    await t.action(internal.marketplace.checks.run, { checkId });

    const latest = await as(t, reviewer).query(api.marketplace.checks.latest, { profileId });
    expect(latest).toMatchObject({ status: "failed", inputTokens: 1200, outputTokens: 300, turns: 1 });
    const rows = await t.run(async (ctx) => await ctx.db.query("modelCalls").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: "vendorCheck", inputTokens: 1200, outputTokens: 300 });
    expect(rows[0].costUsd).toBeCloseTo(wonderCostUsd({ inputTokens: 1200, outputTokens: 300 }, 0));
  });
});
