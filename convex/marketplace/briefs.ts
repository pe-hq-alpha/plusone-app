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
import { currentBusiness, eventIdsOf } from "./vendors";
import { bandRow } from "./listings";

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

/**
 * What a vendor needs to know that the plan already says, when the host wrote no note: the
 * need's own notes and, for food, the guests' food needs from their RSVPs ("Jain food (3) ·
 * No onion or garlic (2)"). Never a guest's name.
 */
async function notesFromPlan(ctx: MutationCtx, event: Doc<"events">, slot: Doc<"vendorSlots">): Promise<string | undefined> {
  const parts: string[] = [];
  if (slot.notes?.trim()) parts.push(slot.notes.trim());
  if (/cater|food|cake|sweet/i.test(slot.category)) {
    const guests = await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(500);
    const counts = new Map<string, number>();
    for (const g of guests) {
      const need = g.dietary?.trim();
      if (!need || g.rsvp === "no") continue;
      const key = need.replace(/\s*\(.*\)\s*$/, "");
      counts.set(key, (counts.get(key) ?? 0) + Math.max(1, g.attendingCount || g.partySize || 1));
    }
    const food = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} (${n})`);
    if (food.length) parts.push(`Food needs from the guests' replies: ${food.join(" · ")}`);
  }
  // Each part's own closing stop comes off before they're joined, so a note never ends "lunch.."
  return parts.length ? parts.map((p) => p.replace(/[.\s]+$/, "")).join(". ") : undefined;
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
    notes: (notes?.trim() || (await notesFromPlan(ctx, event, slot)))?.slice(0, 1000) || undefined,
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
  /** The city's range for this kind of service, from the same prices the customer's Compare shows. */
  range: v.optional(v.object({ p25: v.number(), p50: v.number(), p75: v.number(), count: v.number(), currency: v.string() })),
});

/** Open briefs a vendor can answer: their categories, their city, newest first. */
export const open = query({
  args: {},
  returns: v.array(briefCard),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return [];
    const profile = await currentBusiness(ctx, userId);
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
    const shown = briefs.sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_BRIEFS_SHOWN);
    return await Promise.all(
      shown.map(async (b) => {
        // The same band Compare places the customer's quotes in: same trade, unit and city, sample prices on a sample event.
        const band = await bandRow(ctx, b.category, basisFor(b.category), b.city, b.demo === true);
        return {
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
          ...(band ? { range: { p25: band.p25, p50: band.p50, p75: band.p75, count: band.count, currency: band.currency } } : {}),
        };
      }),
    );
  },
});
