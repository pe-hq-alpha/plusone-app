import { ConvexError, v, type ObjectType } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { currentUserId, requireAccount, requireUserId } from "../lib/auth";
import { checkPriceTerms, cityKey, e164, emailMatchesWebsite, isListed, isTrial } from "../lib/marketplace";
import { sheetFor } from "../lib/standardSheet";
import { canonicalWebsite } from "../lib/text";
import { VENDOR_CATEGORIES } from "../lib/vendorNeeds";
import { rateLimiter } from "../rateLimits";
import { offeringUnit, packageCharge, placeValidator, vendorOfferingFields, vendorProfileFields } from "../schema";
import { badge, cardFor, level, offeringsOf, tier } from "./listings";
import { businessesOf, currentBusiness, letGoOf, requireVendor, roomForAnother } from "./vendors";
import { needsReview, proposeDetails, proposeOffering, proposeRemoval } from "./changes";

/**
 * PlusOne Partner, for vendors: sign up or claim the listing PlusOne added from your
 * public pages, keep your details right, and price what you offer in the same units
 * families compare. A sign-up stays hidden from families until Ops verifies it.
 */

const MAX_CATEGORIES = 5;
const MAX_INCLUDES = 30;

const text = (s: string | undefined, max: number) => (s === undefined ? undefined : s.trim().slice(0, max) || undefined);

function cleanCategories(categories: string[]): string[] {
  const known = [...new Set(categories)].filter((c) => VENDOR_CATEGORIES.includes(c));
  if (!known.length) throw new ConvexError("Choose at least one kind of service you offer.");
  if (known.length > MAX_CATEGORIES) throw new ConvexError(`Choose up to ${MAX_CATEGORIES} kinds of service.`);
  return known;
}

function cleanWebsite(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const website = canonicalWebsite(raw.trim());
  if (!website) throw new ConvexError("That doesn't look like a web address.");
  return website;
}

function cleanPhone(raw: string | undefined, what: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const number = e164(raw);
  if (!number) throw new ConvexError(`Give the ${what} number with its country code, like +91 98400 12345.`);
  return number;
}

function cleanList(items: string[] | undefined, max: number, each: number): string[] | undefined {
  if (!items) return undefined;
  return items.map((s) => s.trim().slice(0, each)).filter(Boolean).slice(0, max);
}

async function editAllowance(ctx: MutationCtx, userId: Id<"users">) {
  const room = await rateLimiter.limit(ctx, "partnerEdits", { key: userId });
  if (!room.ok) throw new ConvexError("That's a lot of changes at once. Try again in a few minutes.");
}

const profileArgs = {
  name: v.string(),
  categories: v.array(v.string()),
  city: v.string(),
  website: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  whatsapp: v.optional(v.string()),
  serviceArea: v.optional(v.array(v.string())),
  place: v.optional(placeValidator),
  languages: v.optional(v.array(v.string())),
  about: v.optional(v.string()),
};

/** A pin on the map, kept only when it is a real place; its label is the vendor's own words, shortened. */
function cleanPlace(place: ObjectType<typeof profileArgs>["place"]) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng) || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return undefined;
  return { lat: place.lat, lng: place.lng, label: place.label.trim().slice(0, 80) || "Where you work from", precision: place.precision };
}

function cleanProfile(args: ObjectType<typeof profileArgs>) {
  const name = text(args.name, 120);
  const city = text(args.city, 80);
  if (!name) throw new ConvexError("Give your business's name.");
  if (!city) throw new ConvexError("Say which city you work in.");
  return {
    name,
    city,
    cityKey: cityKey(city),
    categories: cleanCategories(args.categories),
    website: cleanWebsite(args.website),
    email: text(args.email, 200)?.toLowerCase(),
    phone: cleanPhone(args.phone, "phone"),
    whatsapp: cleanPhone(args.whatsapp, "WhatsApp"),
    serviceArea: cleanList(args.serviceArea, 20, 80),
    place: cleanPlace(args.place),
    languages: cleanList(args.languages, 10, 40),
    about: text(args.about, 1500),
  };
}

// ---------------------------------------------------------------- reading

const claimSummary = v.object({
  _id: v.id("vendorClaims"),
  profileId: v.id("vendorProfiles"),
  profileName: v.string(),
  status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
  createdAt: v.number(),
});

const businessSummary = v.object({
  _id: v.id("vendorProfiles"),
  name: v.string(),
  status: vendorProfileFields.status,
  categories: v.array(v.string()),
});

/** The signed-in vendor's own listing, as they manage it, with the badges families see. */
export const mine = query({
  args: {},
  returns: v.object({
    profile: v.union(v.null(), v.object({ _id: v.id("vendorProfiles"), _creationTime: v.number(), ...vendorProfileFields })),
    offerings: v.array(v.object({ _id: v.id("vendorOfferings"), _creationTime: v.number(), ...vendorOfferingFields })),
    badges: v.array(badge),
    tier: v.optional(tier),
    level: v.optional(level),
    listed: v.boolean(),
    claims: v.array(claimSummary),
    businesses: v.array(businessSummary),
  }),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    const empty = { profile: null, offerings: [], badges: [], listed: false, claims: [], businesses: [] };
    if (!userId) return empty;
    const claims = await ctx.db
      .query("vendorClaims")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);
    const claimRows = await Promise.all(
      claims.map(async (c) => ({
        _id: c._id,
        profileId: c.profileId,
        profileName: (await ctx.db.get(c.profileId))?.name ?? "A listing",
        status: c.status,
        createdAt: c.createdAt,
      })),
    );
    const profile = await currentBusiness(ctx, userId);
    if (!profile) return { ...empty, claims: claimRows };
    const businesses = (await businessesOf(ctx, userId)).map((b) => ({ _id: b._id, name: b.name, status: b.status, categories: b.categories }));
    const card = await cardFor(ctx, profile, profile.categories[0] ?? "");
    return {
      profile,
      offerings: await offeringsOf(ctx, profile),
      badges: card.badges,
      tier: card.tier,
      level: card.level,
      listed: isListed(profile),
      claims: claimRows,
      businesses,
    };
  },
});

/**
 * A listing PlusOne already holds for a website, so a vendor claims it instead of
 * making a second one. Public facts only.
 */
export const findByWebsite = query({
  args: { website: v.string() },
  returns: v.union(
    v.null(),
    v.object({ _id: v.id("vendorProfiles"), name: v.string(), city: v.string(), categories: v.array(v.string()), claimed: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const website = canonicalWebsite(args.website.trim());
    if (!website) return null;
    const profile = await ctx.db
      .query("vendorProfiles")
      .withIndex("by_website", (q) => q.eq("website", website))
      .first();
    if (!profile || profile.status === "rejected") return null;
    return { _id: profile._id, name: profile.name, city: profile.city, categories: profile.categories, claimed: Boolean(profile.ownerUserId) };
  },
});

// ---------------------------------------------------------------- joining

/**
 * A vendor's own sign-up. If PlusOne already lists their website, nothing is made and
 * they're pointed to claim that listing, so a business is never listed twice.
 */
export const register = mutation({
  args: profileArgs,
  returns: v.union(
    v.object({ kind: v.literal("created"), profileId: v.id("vendorProfiles") }),
    v.object({ kind: v.literal("already_listed"), profileId: v.id("vendorProfiles") }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireAccount(ctx);
    await roomForAnother(ctx, userId);
    const fields = cleanProfile(args);
    if (fields.website) {
      const existing = await ctx.db
        .query("vendorProfiles")
        .withIndex("by_website", (q) => q.eq("website", fields.website))
        .first();
      if (existing && existing.status !== "rejected") return { kind: "already_listed" as const, profileId: existing._id };
    }
    const room = await rateLimiter.limit(ctx, "partnerSignUps");
    if (!room.ok) throw new ConvexError("A lot of vendors are joining right now. Try again in a few minutes.");
    const now = Date.now();
    const profileId = await ctx.db.insert("vendorProfiles", {
      ...fields,
      source: "vendor_signup",
      ownerUserId: userId,
      status: "pending",
      statusAt: now,
      joinedAt: now,
      completedEvents: 0,
    });
    // A new business is the one they're working on next.
    await ctx.db.patch(userId, { activeVendorId: profileId });
    return { kind: "created" as const, profileId };
  },
});

/**
 * Claim a listing PlusOne added. An account email at the listing's own website is
 * proof enough and the claim is approved at once; otherwise a person checks it.
 */
export const claim = mutation({
  args: { profileId: v.id("vendorProfiles"), note: v.optional(v.string()) },
  returns: v.object({ claimId: v.id("vendorClaims"), status: v.union(v.literal("pending"), v.literal("approved")) }),
  handler: async (ctx, args) => {
    const userId = await requireAccount(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.status === "rejected") throw new ConvexError("That listing is no longer on PlusOne.");
    if (profile.ownerUserId) throw new ConvexError("This listing has already been claimed. If it's yours, write to us.");
    await roomForAnother(ctx, userId);
    const mine = await ctx.db
      .query("vendorClaims")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(20);
    const open = mine.find((c) => c.profileId === profile._id && c.status === "pending");
    if (open) return { claimId: open._id, status: "pending" as const };
    const room = await rateLimiter.limit(ctx, "partnerSignUps");
    if (!room.ok) throw new ConvexError("A lot of vendors are joining right now. Try again in a few minutes.");

    const user = await ctx.db.get(userId);
    const now = Date.now();
    const byEmail = emailMatchesWebsite(user?.email, profile.website);
    const claimId = await ctx.db.insert("vendorClaims", {
      profileId: profile._id,
      userId,
      method: byEmail ? "domain_email" : "manual",
      status: byEmail ? "approved" : "pending",
      note: text(args.note, 1000),
      createdAt: now,
      ...(byEmail ? { decidedAt: now } : {}),
    });
    if (byEmail) {
      await ctx.db.patch(profile._id, { ownerUserId: userId });
      await ctx.db.patch(userId, { activeVendorId: profile._id });
    }
    return { claimId, status: byEmail ? ("approved" as const) : ("pending" as const) };
  },
});

/**
 * The guest demo, from the vendor's side: a sample catering business of the guest's
 * own, verified at once, that sees only the guest's own sample event. Gone when the
 * demo is cleared away.
 */
export const trySample = mutation({
  args: {},
  returns: v.id("vendorProfiles"),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user?.isAnonymous) throw new ConvexError("A sample business is for the demo. Set up your own business instead.");
    return await ensureSampleBusiness(ctx, userId);
  },
});

/** The guest's sample catering business, made once; the vendors' demo (demo.startVendor) starts here too. */
export async function ensureSampleBusiness(ctx: MutationCtx, userId: Id<"users">): Promise<Id<"vendorProfiles">> {
  const owned = await ctx.db
    .query("vendorProfiles")
    .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
    .first();
  if (owned) return owned._id;
  const room = await rateLimiter.limit(ctx, "partnerSignUps");
  if (!room.ok) throw new ConvexError("A lot of people are trying this right now. Try again in a few minutes.");
  const now = Date.now();
  // The business is in the same city as the guest's sample event: Austin for the American one, Chennai otherwise.
  const membership = await ctx.db
    .query("members")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  const event = membership ? await ctx.db.get(membership.eventId) : null;
  const sample = event?.demo === true && event.currency === "USD" ? SAMPLE_BUSINESS_US : SAMPLE_BUSINESS_IN;
  const profileId = await ctx.db.insert("vendorProfiles", {
    name: "Your catering business",
    categories: ["Catering"],
    city: sample.city,
    cityKey: sample.cityKey,
    serviceArea: [sample.area],
    languages: sample.languages,
    about: "A sample business for trying PlusOne Partner.",
    source: "vendor_signup",
    ownerUserId: userId,
    status: "verified",
    statusAt: now,
    joinedAt: now,
    completedEvents: 0,
    sample: true,
  });
  await ctx.db.insert("vendorOfferings", { profileId, category: "Catering", unit: "per_person", priceUnit: "per_plate", ...sample.offering });
  // One photo of past work, so the sample business looks like a working one: a sample caterer's checked photo in the
  // same city. It shares that photo's file and is marked as a sample, so clearing the demo never deletes the file.
  const caterers = await ctx.db
    .query("vendorProfiles")
    .withIndex("by_cityKey_and_status", (q) => q.eq("cityKey", sample.cityKey).eq("status", "verified"))
    .take(200);
  for (const p of caterers) {
    if (p.sample !== true || p.ownerUserId || !p.categories.includes("Catering")) continue;
    const photos = await ctx.db.query("vendorPhotos").withIndex("by_profileId", (q) => q.eq("profileId", p._id)).take(12);
    const photo = photos.find((ph) => ph.sampleKey && ph.status === "checked" && ph.review?.decision !== "removed");
    if (!photo) continue;
    await ctx.db.insert("vendorPhotos", {
      profileId,
      storageId: photo.storageId,
      sampleKey: `guest-copy:${photo.sampleKey}`,
      addedAt: now,
      status: "checked",
      ...(photo.check ? { check: photo.check } : {}),
      ...(photo.review ? { review: photo.review } : {}),
    });
    break;
  }
  return profileId;
}

/** The guest's sample caterer in Chennai, for the Indian sample event. */
const SAMPLE_BUSINESS_IN = {
  city: "Chennai",
  cityKey: "chennai",
  area: "Mylapore",
  languages: ["Tamil", "English"],
  offering: {
    title: "Veg lunch on banana leaf",
    quantities: { dishes: 8, sweets: 2 },
    price: 360,
    currency: "INR",
    includes: ["Sweet, two curries, kootu, sambar, rasam, payasam, appalam", "Banana leaf", "Serving staff"],
  },
};

/** The guest's sample caterer in Austin, for the American sample event: a buffet near the middle of the city's sample range. */
const SAMPLE_BUSINESS_US = {
  city: "Austin",
  cityKey: "austin",
  area: "South Congress",
  languages: ["English", "Spanish"],
  offering: {
    title: "Dinner buffet",
    quantities: { dishes: 8, sweets: 1 },
    price: 40,
    currency: "USD",
    includes: ["Two mains, three sides, salad, rolls and dessert", "Serving staff", "Delivery and setup"],
  },
};

/** Work on another of the account's own businesses. */
export const switchBusiness = mutation({
  args: { profileId: v.id("vendorProfiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.ownerUserId !== userId) throw new ConvexError("That business isn't one of yours.");
    await ctx.db.patch(userId, { activeVendorId: profile._id });
    return null;
  },
});

/**
 * A vendor takes one of their businesses off PlusOne: its listing, prices, photos and the
 * offers it sent. Customers no longer see it. Their other businesses stay as they are.
 */
export const removeBusiness = mutation({
  args: { profileId: v.id("vendorProfiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAccount(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.ownerUserId !== userId) throw new ConvexError("That business isn't one of yours.");
    const user = await ctx.db.get(userId);
    await letGoOf(ctx, profile);
    if (user?.activeVendorId === profile._id) await ctx.db.patch(userId, { activeVendorId: undefined });
    return null;
  },
});

// ---------------------------------------------------------------- keeping it right

/**
 * A vendor's own edits. A new name or website on a verified listing sends it back for a
 * fresh check, since those are what was verified.
 */
export const update = mutation({
  args: profileArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireVendor(ctx);
    await editAllowance(ctx, userId);
    const fields = cleanProfile(args);
    if (fields.website && fields.website !== profile.website) {
      const taken = await ctx.db
        .query("vendorProfiles")
        .withIndex("by_website", (q) => q.eq("website", fields.website))
        .first();
      if (taken && taken._id !== profile._id) throw new ConvexError("Another listing already has that website. Write to us if it's yours.");
    }
    const recheck = !isTrial(profile) && profile.status === "verified" && (fields.name !== profile.name || fields.website !== profile.website);
    if (!recheck && needsReview(profile)) {
      // A verified listing's details change for customers once a person approves them.
      const { name: _name, website: _website, ...details } = fields;
      await proposeDetails(ctx, profile, userId, details);
      return null;
    }
    await ctx.db.patch(profile._id, {
      ...fields,
      ...(recheck ? { status: "pending" as const, statusReason: "New name or website, waiting for a fresh check", statusAt: Date.now() } : {}),
    });
    return null;
  },
});

/**
 * Add or change one priced offering, in the way the trade charges ("per hour", "for the
 * event") with what the price includes. For a category with a standard sheet the unit
 * Compare scales by is the sheet's, whatever was sent.
 */
export const saveOffering = mutation({
  args: {
    offeringId: v.optional(v.id("vendorOfferings")),
    category: v.string(),
    title: v.string(),
    unit: offeringUnit,
    priceUnit: v.optional(v.string()),
    quantities: v.optional(v.record(v.string(), v.number())),
    price: v.number(),
    currency: v.optional(v.string()),
    includes: v.array(v.string()),
    excludes: v.optional(v.array(v.string())),
    taxIncluded: v.optional(v.boolean()),
    charges: v.optional(v.array(packageCharge)),
    minQty: v.optional(v.number()),
    maxQty: v.optional(v.number()),
  },
  /** The saved package, or null when a verified listing's change is waiting for a person. */
  returns: v.union(v.id("vendorOfferings"), v.null()),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireVendor(ctx);
    await editAllowance(ctx, userId);
    if (!profile.categories.includes(args.category)) throw new ConvexError("Add that kind of service to your profile first.");
    const title = text(args.title, 120);
    if (!title) throw new ConvexError("Give the offering a name, like \"South Indian lunch, banana leaf\".");
    if (!Number.isFinite(args.price) || args.price <= 0 || args.price > 1e9) throw new ConvexError("That price doesn't look right.");
    const qty = (n: number | undefined) => (n === undefined || !Number.isFinite(n) || n <= 0 ? undefined : Math.round(n));
    const sheet = sheetFor(args.category);
    if (!sheet && (args.priceUnit !== undefined || args.quantities !== undefined)) throw new ConvexError("This kind of service is priced in one way only.");
    // A published price is a rate: "per hour" needn't say for how many hours.
    const terms = sheet ? checkPriceTerms(sheet, args.priceUnit, args.quantities, false) : null;
    if (terms && "problem" in terms) throw new ConvexError(terms.problem);
    const charges = cleanCharges(args.charges, sheet);
    // GST said on its line is the package's GST; the older yes-or-no stands when the line isn't there.
    const gst = charges?.find((c) => c.key === "gst");
    const taxIncluded = gst ? gst.status === "included" || gst.status === "none" : args.taxIncluded;
    const fields = {
      profileId: profile._id,
      category: args.category,
      title,
      unit: sheet?.unit ?? args.unit,
      ...(terms ? { priceUnit: terms.priceUnit, ...(Object.keys(terms.quantities).length ? { quantities: terms.quantities } : {}) } : {}),
      price: Math.round(args.price),
      currency: (text(args.currency, 3) ?? "INR").toUpperCase(),
      includes: cleanList(args.includes, MAX_INCLUDES, 120) ?? [],
      excludes: cleanList(args.excludes, MAX_INCLUDES, 120),
      taxIncluded,
      ...(charges?.length ? { charges } : {}),
      minQty: qty(args.minQty),
      maxQty: qty(args.maxQty),
    };
    if (args.offeringId) {
      const offering = await ctx.db.get(args.offeringId);
      if (!offering || offering.profileId !== profile._id) throw new ConvexError("That offering isn't yours to change.");
    }
    if (needsReview(profile)) {
      await proposeOffering(ctx, profile, userId, fields, args.offeringId);
      return null;
    }
    if (args.offeringId) {
      const offering = await ctx.db.get(args.offeringId);
      if (!offering) throw new ConvexError("That offering isn't yours to change.");
      await ctx.db.replace(offering._id, fields);
      return offering._id;
    }
    return await ctx.db.insert("vendorOfferings", fields);
  },
});

const MAX_CHARGES = 16;

/**
 * A package's charges, cleaned: a sheet line by its key (once each), or one the vendor named,
 * an amount only where it is added, and never more than the form can show.
 */
function cleanCharges(charges: ObjectType<{ c: typeof packageCharge }>["c"][] | undefined, sheet: ReturnType<typeof sheetFor>) {
  if (!charges) return undefined;
  const seen = new Set<string>();
  const out: typeof charges = [];
  for (const c of charges) {
    const amount = c.status === "priced" && c.amount !== undefined && Number.isFinite(c.amount) && c.amount >= 0 && c.amount <= 1e8 ? Math.round(c.amount) : undefined;
    if (c.status === "priced" && amount === undefined) throw new ConvexError("Give each added charge an amount, or mark it as charged at cost.");
    const status = c.status;
    if (c.key) {
      if (c.key !== "gst" && !sheet?.lines.some((l) => l.key === c.key)) continue;
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      out.push({ key: c.key, status, ...(amount !== undefined ? { amount } : {}) });
    } else {
      const label = text(c.label, 60);
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      out.push({ label, status, ...(amount !== undefined ? { amount } : {}) });
    }
    if (out.length >= MAX_CHARGES) break;
  }
  return out;
}

export const removeOffering = mutation({
  args: { offeringId: v.id("vendorOfferings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireVendor(ctx);
    const offering = await ctx.db.get(args.offeringId);
    if (!offering || offering.profileId !== profile._id) throw new ConvexError("That offering isn't yours to remove.");
    if (needsReview(profile)) {
      await proposeRemoval(ctx, profile, userId, offering._id);
      return null;
    }
    await ctx.db.delete(offering._id);
    return null;
  },
});
