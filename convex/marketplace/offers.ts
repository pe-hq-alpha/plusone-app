import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalQuery, mutation, query, type QueryCtx } from "../_generated/server";
import { currentUserId } from "../lib/auth";
import { checkOfferLines, checkPriceTerms, isTrial, MAX_QUANTITY, offerTotal } from "../lib/marketplace";
import { sheetFor } from "../lib/standardSheet";
import { rateLimiter } from "../rateLimits";
import { offerLine, offeringUnit } from "../schema";
import { cardFor, listingCard } from "./listings";
import { currentBusiness, eventIdsOf, requireVendor } from "./vendors";

/**
 * Offers: a verified Partner vendor's answer to a family's brief, priced on the standard
 * sheet's lines. Every line is answered, so an offer leaves nothing unsaid, and its lines
 * are in the same shape Events reads a quote into, so Compare puts the two side by side.
 */

/** An offer's line with the sheet's label, as Compare shows it. */
const labelledLine = v.object({
  key: v.string(),
  label: v.string(),
  status: v.union(v.literal("priced"), v.literal("included"), v.literal("extra"), v.literal("unstated")),
  amount: v.optional(v.number()),
});

export const offerForCompare = v.object({
  _id: v.id("vendorOffers"),
  slotId: v.id("vendorSlots"),
  category: v.string(),
  vendor: listingCard,
  unit: offeringUnit,
  priceUnit: v.optional(v.string()),
  quantities: v.optional(v.record(v.string(), v.number())),
  price: v.number(),
  quantity: v.number(),
  currency: v.string(),
  covers: v.optional(v.string()),
  lines: v.array(labelledLine),
  total: v.number(),
  notes: v.optional(v.string()),
  submittedAt: v.number(),
});

/** An event's live offers, each with its vendor's card. Callers check access first. */
export async function offersForEvent(ctx: QueryCtx, eventId: Id<"events">) {
  const offers = await ctx.db
    .query("vendorOffers")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(200);
  const out = [];
  for (const offer of offers) {
    if (offer.status !== "sent") continue;
    const profile = await ctx.db.get(offer.profileId);
    // A vendor suspended after offering is no longer put in front of the family.
    if (!profile || profile.status !== "verified") continue;
    const sheet = sheetFor(offer.category);
    out.push({
      _id: offer._id,
      slotId: offer.slotId,
      category: offer.category,
      vendor: await cardFor(ctx, profile, offer.category),
      unit: offer.unit,
      priceUnit: offer.priceUnit,
      quantities: offer.quantities,
      price: offer.price,
      quantity: offer.quantity,
      currency: offer.currency,
      covers: offer.covers,
      lines: offer.lines.map((l) => ({ ...l, label: sheet?.lines.find((s) => s.key === l.key)?.label ?? l.key })),
      total: offer.total,
      notes: offer.notes,
      submittedAt: offer.submittedAt,
    });
  }
  return out;
}

/** For Compare: every offer on an event, beside the quotes found on the web. */
export const offersFor = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.array(offerForCompare),
  handler: async (ctx, args) => await offersForEvent(ctx, args.eventId),
});

// ---------------------------------------------------------------- for the vendor

/**
 * Answer a brief, or change the answer already sent. Only a verified vendor in the
 * brief's category and city can, and every line on the category's sheet must be answered.
 * The price is in one of the ways the trade charges, with what it includes; the total is
 * worked out here from the price and the quantities, never taken from the form.
 */
export const submit = mutation({
  args: {
    briefId: v.id("vendorBriefs"),
    price: v.number(),
    /** The plates or pieces, as "For how many" sends it; `quantities.count` says the same. */
    quantity: v.optional(v.number()),
    priceUnit: v.optional(v.string()),
    quantities: v.optional(v.record(v.string(), v.number())),
    currency: v.optional(v.string()),
    covers: v.optional(v.string()),
    lines: v.array(offerLine),
    notes: v.optional(v.string()),
  },
  returns: v.id("vendorOffers"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireVendor(ctx);
    if (profile.status !== "verified") throw new ConvexError("You can answer customers once PlusOne has verified your business.");
    const brief = await ctx.db.get(args.briefId);
    if (!brief || brief.status !== "open") throw new ConvexError("This customer is no longer taking offers.");
    if (brief.demo !== (profile.sample === true) || brief.cityKey !== profile.cityKey || !profile.categories.includes(brief.category)) {
      throw new ConvexError("This request isn't for your kind of service or your city.");
    }
    if (isTrial(profile) && !(await eventIdsOf(ctx, userId)).has(brief.eventId)) {
      throw new ConvexError("A sample business answers your own sample event only.");
    }
    const room = await rateLimiter.limit(ctx, "partnerEdits", { key: userId });
    if (!room.ok) throw new ConvexError("That's a lot of changes at once. Try again in a few minutes.");

    if (!Number.isFinite(args.price) || args.price <= 0 || args.price > 1e9) throw new ConvexError("That price doesn't look right.");
    const sheet = sheetFor(brief.category);
    let quantity: number;
    let terms: { priceUnit: string; quantities: Record<string, number> } | undefined;
    if (sheet) {
      // The plates or pieces come from "For how many", else the brief's guests, as before.
      const count = args.quantities?.count ?? args.quantity ?? brief.guests;
      const usesCount = sheet.quantities.some((q) => q.key === "count");
      const checked = checkPriceTerms(sheet, args.priceUnit, { ...args.quantities, ...(usesCount && count !== undefined ? { count } : {}) }, true);
      if ("problem" in checked) throw new ConvexError(checked.problem);
      quantity = checked.times ?? 0;
      terms = { priceUnit: checked.priceUnit, quantities: checked.quantities };
    } else {
      if (args.priceUnit !== undefined || args.quantities !== undefined) throw new ConvexError("This kind of service is priced in one way only.");
      quantity = brief.unit === "total" ? 1 : Math.round(args.quantity ?? brief.guests ?? 0);
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
      throw new ConvexError(brief.unit === "per_person" ? "Say how many plates or guests the price is for." : "Say how many the price is for.");
    }
    const checked = checkOfferLines(sheet, args.lines);
    if ("problem" in checked) throw new ConvexError(checked.problem);
    const price = Math.round(args.price);
    const fields = {
      briefId: brief._id,
      profileId: profile._id,
      eventId: brief.eventId,
      slotId: brief.slotId,
      category: brief.category,
      unit: brief.unit,
      ...(terms ? { priceUnit: terms.priceUnit, ...(Object.keys(terms.quantities).length ? { quantities: terms.quantities } : {}) } : {}),
      price,
      quantity,
      currency: (args.currency?.trim().slice(0, 3) || "INR").toUpperCase(),
      covers: args.covers?.trim().slice(0, 300) || undefined,
      lines: checked.lines,
      total: offerTotal(price, quantity, checked.lines),
      notes: args.notes?.trim().slice(0, 1000) || undefined,
      status: "sent" as const,
      submittedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("vendorOffers")
      .withIndex("by_briefId_and_profileId", (q) => q.eq("briefId", brief._id).eq("profileId", profile._id))
      .first();
    if (existing) {
      await ctx.db.replace(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("vendorOffers", fields);
  },
});

export const withdraw = mutation({
  args: { offerId: v.id("vendorOffers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireVendor(ctx);
    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.profileId !== profile._id) throw new ConvexError("That offer isn't yours to withdraw.");
    await ctx.db.patch(offer._id, { status: "withdrawn" });
    return null;
  },
});

/** The vendor's own offers, newest first, with the brief each answers. */
export const mine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("vendorOffers"),
      briefId: v.id("vendorBriefs"),
      briefTitle: v.string(),
      occasion: v.string(),
      date: v.string(),
      briefOpen: v.boolean(),
      total: v.number(),
      currency: v.string(),
      status: v.union(v.literal("sent"), v.literal("withdrawn")),
      submittedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return [];
    const profile = await currentBusiness(ctx, userId);
    if (!profile) return [];
    const offers = await ctx.db
      .query("vendorOffers")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(50);
    return await Promise.all(
      offers.map(async (o) => {
        const brief = await ctx.db.get(o.briefId);
        return {
          _id: o._id,
          briefId: o.briefId,
          briefTitle: brief?.title ?? "A customer's request",
          occasion: brief?.occasion ?? "",
          date: brief?.date ?? "",
          briefOpen: brief?.status === "open",
          total: o.total,
          currency: o.currency,
          status: o.status,
          submittedAt: o.submittedAt,
        };
      }),
    );
  },
});
