import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { currentUserId, requireStaff } from "../lib/auth";
import { profileStatus, vendorOfferingFields, vendorProfileFields, vettingReviewFields } from "../schema";
import { roomForAnother } from "./vendors";

/**
 * PlusOne Ops: the team's side of Partner. Vendors waiting to be verified, claims
 * waiting for a check, and the decision on each, kept as an append-only record of who
 * decided what on what evidence. Software gathers evidence and flags; a person decides.
 */

const QUEUE_SIZE = 50;

const queueProfile = v.object({
  _id: v.id("vendorProfiles"),
  name: v.string(),
  city: v.string(),
  categories: v.array(v.string()),
  website: v.optional(v.string()),
  source: v.union(v.literal("plusone_added"), v.literal("vendor_signup")),
  claimed: v.boolean(),
  statusReason: v.optional(v.string()),
  statusAt: v.number(),
});

const queueClaim = v.object({
  _id: v.id("vendorClaims"),
  profileId: v.id("vendorProfiles"),
  profileName: v.string(),
  website: v.optional(v.string()),
  claimantEmail: v.optional(v.string()),
  note: v.optional(v.string()),
  createdAt: v.number(),
});

/** The caller's role on the PlusOne team, or null, so the Ops page can say it's not for them. */
export const amStaff = query({
  args: {},
  returns: v.union(v.literal("admin"), v.literal("reviewer"), v.null()),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    return user && !user.isAnonymous ? (user.staffRole ?? null) : null;
  },
});

/** What's waiting for a person: sign-ups and changed listings to verify, and claims to check. */
export const queue = query({
  args: {},
  returns: v.object({ profiles: v.array(queueProfile), claims: v.array(queueClaim) }),
  handler: async (ctx) => {
    await requireStaff(ctx);
    // Listings PlusOne added wait as "pending" until claimed; only claimed ones need a person.
    const pending = await ctx.db
      .query("vendorProfiles")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(QUEUE_SIZE * 4);
    const profiles = pending
      .filter((p) => p.ownerUserId)
      .slice(0, QUEUE_SIZE)
      .map((p) => ({
        _id: p._id,
        name: p.name,
        city: p.city,
        categories: p.categories,
        website: p.website,
        source: p.source,
        claimed: Boolean(p.ownerUserId),
        statusReason: p.statusReason,
        statusAt: p.statusAt,
      }));
    const openClaims = await ctx.db
      .query("vendorClaims")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(QUEUE_SIZE);
    const claims = await Promise.all(
      openClaims.map(async (c) => {
        const profile = await ctx.db.get(c.profileId);
        const claimant = await ctx.db.get(c.userId);
        return {
          _id: c._id,
          profileId: c.profileId,
          profileName: profile?.name ?? "A removed listing",
          website: profile?.website,
          claimantEmail: claimant?.email,
          note: c.note,
          createdAt: c.createdAt,
        };
      }),
    );
    return { profiles, claims };
  },
});

/** One listing in full, for the reviewer: details, prices, and every decision so far. */
export const profile = query({
  args: { profileId: v.id("vendorProfiles") },
  returns: v.union(
    v.null(),
    v.object({
      profile: v.object({ _id: v.id("vendorProfiles"), _creationTime: v.number(), ...vendorProfileFields }),
      ownerEmail: v.optional(v.string()),
      offerings: v.array(v.object({ _id: v.id("vendorOfferings"), _creationTime: v.number(), ...vendorOfferingFields })),
      reviews: v.array(v.object({ _id: v.id("vettingReviews"), _creationTime: v.number(), ...vettingReviewFields })),
    }),
  ),
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return null;
    const owner = profile.ownerUserId ? await ctx.db.get(profile.ownerUserId) : null;
    const offerings = await ctx.db
      .query("vendorOfferings")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .take(50);
    const reviews = await ctx.db
      .query("vettingReviews")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(20);
    return { profile, ownerEmail: owner?.email, offerings, reviews };
  },
});

/** Verify, reject or suspend a listing, with the checks made and the evidence behind them. */
export const review = mutation({
  args: {
    profileId: v.id("vendorProfiles"),
    outcome: profileStatus,
    checks: v.array(v.object({ label: v.string(), passed: v.boolean() })),
    evidence: v.array(v.object({ label: v.string(), url: v.string() })),
    notes: v.optional(v.string()),
  },
  returns: v.id("vettingReviews"),
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new ConvexError("That listing is no longer there.");
    if (args.outcome === "verified" && !profile.ownerUserId) {
      throw new ConvexError("Only a listing its vendor runs can be verified. This one hasn't been claimed.");
    }
    if (args.outcome === "verified" && !args.checks.some((c) => c.passed)) {
      throw new ConvexError("Record at least one check that passed before verifying.");
    }
    const notes = args.notes?.trim().slice(0, 2000) || undefined;
    const at = Date.now();
    const reviewId = await ctx.db.insert("vettingReviews", {
      profileId: profile._id,
      reviewerId: userId,
      checks: args.checks.slice(0, 20).map((c) => ({ label: c.label.trim().slice(0, 200), passed: c.passed })),
      evidence: args.evidence
        .slice(0, 20)
        .filter((e) => /^https?:\/\//i.test(e.url.trim()))
        .map((e) => ({ label: e.label.trim().slice(0, 200), url: e.url.trim().slice(0, 1000) })),
      outcome: args.outcome,
      notes,
      at,
    });
    await ctx.db.patch(profile._id, { status: args.outcome, statusReason: args.outcome === "verified" ? undefined : notes, statusAt: at });
    return reviewId;
  },
});

/** Approve or turn down a claim a person had to check. Approving gives the vendor the listing. */
export const decideClaim = mutation({
  args: { claimId: v.id("vendorClaims"), approve: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.status !== "pending") throw new ConvexError("That claim has already been decided.");
    const profile = await ctx.db.get(claim.profileId);
    const now = Date.now();
    if (args.approve) {
      if (!profile) throw new ConvexError("That listing is no longer there.");
      if (profile.ownerUserId) throw new ConvexError("Someone else already runs this listing.");
      await roomForAnother(ctx, claim.userId, "This person");
      await ctx.db.patch(profile._id, { ownerUserId: claim.userId });
      // Anyone else waiting on the same listing is turned down with it.
      const others = await ctx.db
        .query("vendorClaims")
        .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
        .take(50);
      for (const other of others) {
        if (other._id !== claim._id && other.status === "pending") {
          await ctx.db.patch(other._id, { status: "rejected", decidedAt: now, decidedBy: userId });
        }
      }
    }
    await ctx.db.patch(claim._id, { status: args.approve ? "approved" : "rejected", decidedAt: now, decidedBy: userId });
    return null;
  },
});

/**
 * Put someone on the PlusOne team, or take them off. Run by hand:
 * `npx convex run marketplace/ops:setStaffRole '{"email":"…","role":"reviewer"}'`.
 */
export const setStaffRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("admin"), v.literal("reviewer"), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(5);
    const user = users.find((u) => !u.isAnonymous);
    if (!user) throw new ConvexError(`No account with the email ${email}.`);
    await ctx.db.patch(user._id, { staffRole: args.role ?? undefined });
    return null;
  },
});
