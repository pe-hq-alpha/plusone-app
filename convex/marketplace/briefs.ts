import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "../_generated/server";
import { currentUserId, requireMember } from "../lib/auth";
import { basisFor } from "../lib/comparable";
import { cityKey, isTrial } from "../lib/marketplace";
import { EVENT_TYPES, eventTypeOf } from "../lib/occasion";
import { sheetFor } from "../lib/standardSheet";
import { rateLimiter } from "../rateLimits";
import { offeringUnit } from "../schema";
import { eventIdsOf } from "./vendors";

/**
 * Briefs: a family's need, sent to PlusOne Partner so verified vendors answer it on the
 * standard sheet. One brief per need. A vendor sees the occasion, date, headcount and
 * area, which is what a price depends on, and never the family's name, contact or budget.
 */

const MAX_BRIEFS_SHOWN = 30;

/** The guests a need is for: the largest of the parts it covers, else the event's estimate. */
async function guestsFor(ctx: MutationCtx, event: Doc<"events">, slot: Doc<"vendorSlots">): Promise<number | undefined> {
  const sessions = (await Promise.all(slot.sessionIds.map((id) => ctx.db.get(id)))).filter((s): s is Doc<"sessions"> => !!s);
  const most = Math.max(0, ...sessions.map((s) => s.guestCount));
  return most || event.guestEstimate || undefined;
}

async function dateFor(ctx: MutationCtx, event: Doc<"events">, slot: Doc<"vendorSlots">): Promise<string> {
  const dates = (await Promise.all(slot.sessionIds.map((id) => ctx.db.get(id)))).map((s) => s?.date).filter((d): d is string => !!d);
  return dates.sort()[0] ?? event.startDate;
}

/** Opens a brief for a need, or returns the one already open. Callers check access first. */
export async function openBrief(ctx: MutationCtx, eventId: Id<"events">, slotId: Id<"vendorSlots">, notes?: string): Promise<Id<"vendorBriefs">> {
  const event = await ctx.db.get(eventId);
  const slot = await ctx.db.get(slotId);
  if (!event || !slot || slot.eventId !== eventId) throw new ConvexError("That need isn't part of this event.");
  const existing = await ctx.db
    .query("vendorBriefs")
    .withIndex("by_slotId", (q) => q.eq("slotId", slotId))
    .order("desc")
    .first();
  if (existing?.status === "open") return existing._id;
  const sheet = sheetFor(slot.category);
  return await ctx.db.insert("vendorBriefs", {
    eventId,
    slotId,
    category: slot.category,
    title: slot.title,
    occasion: event.occasionLabel?.trim() || EVENT_TYPES.find((t) => t.id === eventTypeOf(event))?.name || "Event",
    city: event.city,
    cityKey: cityKey(event.city),
    area: event.area,
    date: await dateFor(ctx, event, slot),
    guests: await guestsFor(ctx, event, slot),
    unit: sheet?.unit ?? basisFor(slot.category),
    notes: notes?.trim().slice(0, 1000) || undefined,
    demo: event.demo === true,
    status: "open",
    openedAt: Date.now(),
  });
}

// ---------------------------------------------------------------- for the family

/** Ask PlusOne Partner's verified vendors to price a need on the standard sheet. */
export const ask = mutation({
  args: { eventId: v.id("events"), slotId: v.id("vendorSlots"), notes: v.optional(v.string()) },
  returns: v.id("vendorBriefs"),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    const room = await rateLimiter.limit(ctx, "partnerEdits", { key: userId });
    if (!room.ok) throw new ConvexError("That's a lot of requests at once. Try again in a few minutes.");
    const slot = await ctx.db.get(args.slotId);
    if (slot?.status === "booked") throw new ConvexError("This is already booked, so there's nothing to ask vendors for.");
    return await openBrief(ctx, args.eventId, args.slotId, args.notes);
  },
});

/** Stop taking offers for a need, once it's booked or the family has enough. */
export const close = mutation({
  args: { briefId: v.id("vendorBriefs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get(args.briefId);
    if (!brief) throw new ConvexError("That request is no longer there.");
    await requireMember(ctx, brief.eventId, "planner");
    if (brief.status === "open") await ctx.db.patch(brief._id, { status: "closed" });
    return null;
  },
});

/** Whether a need has been sent to Partner, and how many offers have come back. */
export const forSlot = query({
  args: { eventId: v.id("events"), slotId: v.id("vendorSlots") },
  returns: v.union(v.null(), v.object({ _id: v.id("vendorBriefs"), status: v.union(v.literal("open"), v.literal("closed")), openedAt: v.number(), offers: v.number() })),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "viewer");
    const brief = await ctx.db
      .query("vendorBriefs")
      .withIndex("by_slotId", (q) => q.eq("slotId", args.slotId))
      .order("desc")
      .first();
    if (!brief || brief.eventId !== args.eventId) return null;
    const offers = await ctx.db
      .query("vendorOffers")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    return { _id: brief._id, status: brief.status, openedAt: brief.openedAt, offers: offers.filter((o) => o.briefId === brief._id && o.status === "sent").length };
  },
});

/** For the sample events: open a brief without a signed-in member. */
export const openForSlot = internalMutation({
  args: { eventId: v.id("events"), slotId: v.id("vendorSlots"), notes: v.optional(v.string()) },
  returns: v.id("vendorBriefs"),
  handler: async (ctx, args) => await openBrief(ctx, args.eventId, args.slotId, args.notes),
});

// ---------------------------------------------------------------- for the vendor

export const briefCard = v.object({
  _id: v.id("vendorBriefs"),
  category: v.string(),
  title: v.string(),
  occasion: v.string(),
  city: v.string(),
  area: v.optional(v.string()),
  date: v.string(),
  guests: v.optional(v.number()),
  unit: offeringUnit,
  notes: v.optional(v.string()),
  openedAt: v.number(),
  /** Whether this vendor has already answered it. */
  answered: v.boolean(),
});

/** Open briefs a vendor can answer: their categories, their city, newest first. */
export const open = query({
  args: {},
  returns: v.array(briefCard),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return [];
    const profile = await ctx.db
      .query("vendorProfiles")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
      .first();
    if (!profile || profile.status !== "verified") return [];
    const briefs: Doc<"vendorBriefs">[] = [];
    if (isTrial(profile)) {
      // A guest's sample business sees only the guest's own sample event.
      for (const eventId of await eventIdsOf(ctx, userId)) {
        const rows = await ctx.db
          .query("vendorBriefs")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .take(20);
        briefs.push(...rows.filter((b) => b.status === "open" && b.demo && profile.categories.includes(b.category)));
      }
    } else for (const category of profile.categories) {
      const rows = await ctx.db
        .query("vendorBriefs")
        .withIndex("by_category_and_cityKey_and_status", (q) => q.eq("category", category).eq("cityKey", profile.cityKey).eq("status", "open"))
        .order("desc")
        .take(MAX_BRIEFS_SHOWN);
      // A sample event's brief reaches only sample vendors.
      briefs.push(...rows.filter((b) => b.demo === (profile.sample === true)));
    }
    const mine = await ctx.db
      .query("vendorOffers")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(200);
    const answered = new Set(mine.filter((o) => o.status === "sent").map((o) => o.briefId));
    return briefs
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, MAX_BRIEFS_SHOWN)
      .map((b) => ({
        _id: b._id,
        category: b.category,
        title: b.title,
        occasion: b.occasion,
        city: b.city,
        area: b.area,
        date: b.date,
        guests: b.guests,
        unit: b.unit,
        notes: b.notes,
        openedAt: b.openedAt,
        answered: answered.has(b._id),
      }));
  },
});
