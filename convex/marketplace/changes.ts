import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "../_generated/server";
import { requireStaff } from "../lib/auth";
import { isTrial } from "../lib/marketplace";
import { listingDetails, vendorOfferingFields } from "../schema";
import { packageCharges, sheetFor } from "../lib/standardSheet";
import { requireVendor } from "./vendors";

/**
 * Changes waiting for Ops. Once a person has verified a listing, what customers see of it
 * (its packages and prices, its details and contact numbers) changes only when a person
 * approves the change; until then customers keep seeing the approved version. A trial
 * listing in the vendors' demo, and the sample vendors, never wait.
 */

type OfferingFields = Infer<ReturnType<typeof v.object<typeof vendorOfferingFields>>>;
type Details = Infer<typeof listingDetails>;

/** Whether this listing's edits wait for a person. */
export function needsReview(profile: Doc<"vendorProfiles">): boolean {
  return profile.status === "verified" && !isTrial(profile) && profile.sample !== true;
}

/** At most this many changes wait per listing, so a slip can't fill the queue. */
const MAX_WAITING = 20;

async function propose(
  ctx: MutationCtx,
  profile: Doc<"vendorProfiles">,
  userId: Id<"users">,
  change: { kind: "offering" | "offering_remove" | "details"; offeringId?: Id<"vendorOfferings">; offering?: OfferingFields; details?: Details },
) {
  const waiting = await ctx.db
    .query("listingChanges")
    .withIndex("by_profileId_and_status", (q) => q.eq("profileId", profile._id).eq("status", "waiting"))
    .take(MAX_WAITING + 1);
  // A second edit to the same package, or to the details, replaces the first while both wait.
  const same = waiting.find((c) => c.kind === change.kind && c.offeringId === change.offeringId && change.kind !== "offering_remove" && (change.offeringId || change.kind === "details"));
  if (same) {
    await ctx.db.patch(same._id, { ...change, submittedBy: userId, submittedAt: Date.now() });
    return same._id;
  }
  if (waiting.length >= MAX_WAITING) throw new ConvexError("Twenty changes are already waiting for our team. They'll be checked soon.");
  return await ctx.db.insert("listingChanges", { profileId: profile._id, ...change, submittedBy: userId, submittedAt: Date.now(), status: "waiting" });
}

export const proposeOffering = (ctx: MutationCtx, profile: Doc<"vendorProfiles">, userId: Id<"users">, offering: OfferingFields, offeringId?: Id<"vendorOfferings">) =>
  propose(ctx, profile, userId, { kind: "offering", offering, ...(offeringId ? { offeringId } : {}) });

export const proposeRemoval = (ctx: MutationCtx, profile: Doc<"vendorProfiles">, userId: Id<"users">, offeringId: Id<"vendorOfferings">) =>
  propose(ctx, profile, userId, { kind: "offering_remove", offeringId });

export const proposeDetails = (ctx: MutationCtx, profile: Doc<"vendorProfiles">, userId: Id<"users">, details: Details) =>
  propose(ctx, profile, userId, { kind: "details", details });

const changeView = v.object({
  _id: v.id("listingChanges"),
  profileId: v.id("vendorProfiles"),
  profileName: v.string(),
  kind: v.union(v.literal("offering"), v.literal("offering_remove"), v.literal("details")),
  /** What customers see now, and what they would see after. */
  before: v.optional(v.string()),
  after: v.optional(v.string()),
  submittedAt: v.number(),
});

function offeringText(o: Pick<OfferingFields, "title" | "price" | "currency" | "includes" | "taxIncluded" | "charges" | "category"> & { priceUnit?: string }): string {
  const gst = o.taxIncluded === true ? ", GST included" : o.taxIncluded === false ? ", GST extra" : "";
  const unit = o.priceUnit ? ` (${o.priceUnit.replace(/_/g, " ")})` : "";
  const includes = o.includes.length ? `. Includes ${o.includes.join(", ")}` : "";
  const c = packageCharges(sheetFor(o.category), o.charges, o.currency);
  const charges = [
    c.inPrice.length && `In the price: ${c.inPrice.join(", ")}`,
    c.onTop.length && `On top: ${c.onTop.join(", ")}`,
    c.notProvided.length && `Not provided: ${c.notProvided.join(", ")}`,
  ].filter(Boolean);
  return `${o.title}: ${o.currency} ${o.price.toLocaleString("en-IN")}${unit}${gst}${includes}${charges.length ? `. ${charges.join(". ")}` : ""}`;
}

function detailsText(d: Partial<Details>): string {
  return [
    d.about && `About: ${d.about}`,
    d.categories?.length && `Services: ${d.categories.join(", ")}`,
    d.city && `City: ${d.city}`,
    d.serviceArea?.length && `Areas: ${d.serviceArea.join(", ")}`,
    d.place && `On the map: ${d.place.label}`,
    d.languages?.length && `Languages: ${d.languages.join(", ")}`,
    d.phone && `Phone: ${d.phone}`,
    d.whatsapp && `WhatsApp: ${d.whatsapp}`,
    d.email && `Email: ${d.email}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function view(ctx: { db: QueryCtx["db"] }, c: Doc<"listingChanges">) {
  const profile = await ctx.db.get(c.profileId);
  const current = c.offeringId ? await ctx.db.get(c.offeringId) : null;
  const before = c.kind === "details" ? (profile ? detailsText(profile) : undefined) : current ? offeringText(current) : undefined;
  const after = c.kind === "details" && c.details ? detailsText(c.details) : c.kind === "offering" && c.offering ? offeringText(c.offering) : undefined;
  return {
    _id: c._id,
    profileId: c.profileId,
    profileName: profile?.name ?? "A removed listing",
    kind: c.kind,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    submittedAt: c.submittedAt,
  };
}

/** The changes waiting for a person, oldest first. */
export const waiting = query({
  args: {},
  returns: v.array(changeView),
  handler: async (ctx) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("listingChanges").withIndex("by_status", (q) => q.eq("status", "waiting")).take(50);
    return await Promise.all(rows.map((c) => view(ctx, c)));
  },
});

/** The caller's own changes still waiting, for Partner to show. */
export const mine = query({
  args: {},
  returns: v.array(changeView),
  handler: async (ctx) => {
    const { profile } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("listingChanges")
      .withIndex("by_profileId_and_status", (q) => q.eq("profileId", profile._id).eq("status", "waiting"))
      .take(MAX_WAITING);
    return await Promise.all(rows.map((c) => view(ctx, c)));
  },
});

/** Approve a change, which puts it in front of customers, or reject it, which leaves the listing as it was. */
export const decide = mutation({
  args: { changeId: v.id("listingChanges"), decision: v.union(v.literal("approved"), v.literal("rejected")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const change = await ctx.db.get(args.changeId);
    if (!change || change.status !== "waiting") throw new ConvexError("That change has already been decided.");
    if (args.decision === "approved") {
      const profile = await ctx.db.get(change.profileId);
      if (!profile) throw new ConvexError("That listing is no longer there.");
      if (change.kind === "details" && change.details) {
        await ctx.db.patch(profile._id, change.details);
      } else if (change.kind === "offering" && change.offering) {
        const existing = change.offeringId ? await ctx.db.get(change.offeringId) : null;
        if (existing) await ctx.db.replace(existing._id, change.offering);
        else await ctx.db.insert("vendorOfferings", change.offering);
      } else if (change.kind === "offering_remove" && change.offeringId) {
        if (await ctx.db.get(change.offeringId)) await ctx.db.delete(change.offeringId);
      }
    }
    await ctx.db.patch(change._id, { status: args.decision, decidedBy: userId, decidedAt: Date.now() });
    return null;
  },
});
