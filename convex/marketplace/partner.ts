import { ConvexError, v, type ObjectType } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { currentUserId, requireAccount, requireUserId } from "../lib/auth";
import { checkPriceTerms, cityKey, e164, emailMatchesWebsite, isListed, isTrial } from "../lib/marketplace";
import { sheetFor } from "../lib/standardSheet";
import { canonicalWebsite } from "../lib/text";
import { VENDOR_CATEGORIES } from "../lib/vendorNeeds";
import { rateLimiter } from "../rateLimits";
import { offeringUnit, vendorOfferingFields, vendorProfileFields } from "../schema";
import { badge, cardFor, level, offeringsOf, tier } from "./listings";
import { requireVendor } from "./vendors";

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
  languages: v.optional(v.array(v.string())),
  about: v.optional(v.string()),
};

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
  }),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    const empty = { profile: null, offerings: [], badges: [], listed: false, claims: [] };
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
    const profile = await ctx.db
      .query("vendorProfiles")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
      .first();
    if (!profile) return { ...empty, claims: claimRows };
    const card = await cardFor(ctx, profile, profile.categories[0] ?? "");
    return {
      profile,
      offerings: await offeringsOf(ctx, profile),
      badges: card.badges,
      tier: card.tier,
      level: card.level,
      listed: isListed(profile),
      claims: claimRows,
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
    const owned = await ctx.db
      .query("vendorProfiles")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
      .first();
    if (owned) throw new ConvexError("Your account already runs a business on PlusOne Partner.");
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
    const owned = await ctx.db
      .query("vendorProfiles")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
      .first();
    if (owned) throw new ConvexError("Your account already runs a business on PlusOne Partner.");
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
    if (byEmail) await ctx.db.patch(profile._id, { ownerUserId: userId });
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
  const profileId = await ctx.db.insert("vendorProfiles", {
    name: "Your catering business",
    categories: ["Catering"],
    city: "Chennai",
    cityKey: "chennai",
    serviceArea: ["Mylapore"],
    languages: ["Tamil", "English"],
    about: "A sample business for trying PlusOne Partner.",
    source: "vendor_signup",
    ownerUserId: userId,
    status: "verified",
    statusAt: now,
    joinedAt: now,
    completedEvents: 0,
    sample: true,
  });
  await ctx.db.insert("vendorOfferings", {
    profileId,
    category: "Catering",
    title: "Veg lunch on banana leaf",
    unit: "per_person",
    priceUnit: "per_plate",
    quantities: { dishes: 8, sweets: 2 },
    price: 360,
    currency: "INR",
    includes: ["Sweet, two curries, kootu, sambar, rasam, payasam, appalam", "Banana leaf", "Serving staff"],
  });
  return profileId;
}

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
    minQty: v.optional(v.number()),
    maxQty: v.optional(v.number()),
  },
  returns: v.id("vendorOfferings"),
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
      taxIncluded: args.taxIncluded,
      minQty: qty(args.minQty),
      maxQty: qty(args.maxQty),
    };
    if (args.offeringId) {
      const offering = await ctx.db.get(args.offeringId);
      if (!offering || offering.profileId !== profile._id) throw new ConvexError("That offering isn't yours to change.");
      await ctx.db.replace(offering._id, fields);
      return offering._id;
    }
    return await ctx.db.insert("vendorOfferings", fields);
  },
});

export const removeOffering = mutation({
  args: { offeringId: v.id("vendorOfferings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireVendor(ctx);
    const offering = await ctx.db.get(args.offeringId);
    if (!offering || offering.profileId !== profile._id) throw new ConvexError("That offering isn't yours to remove.");
    await ctx.db.delete(offering._id);
    return null;
  },
});
