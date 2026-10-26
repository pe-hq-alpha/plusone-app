import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { slotStatus } from "./lib/validators";

/**
 * Read-only links to the plan: the couple makes one for their
 * parents or a venue, who open it without an account. Owners only, since the link is a
 * key. What it shows is deliberately narrow: the days, who's booked, what's due and
 * guest numbers. No emails, no guests' names, no vendors' contacts.
 */

const MAX_LINKS = 20;
const secret = () => crypto.randomUUID().replace(/-/g, "");

const linkView = v.object({
  _id: v.id("shareLinks"),
  _creationTime: v.number(),
  token: v.string(),
  label: v.string(),
  showMoney: v.boolean(),
});

export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(linkView),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "owner");
    const rows = await ctx.db.query("shareLinks").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).order("desc").take(MAX_LINKS);
    return rows.map(({ _id, _creationTime, token, label, showMoney }) => ({ _id, _creationTime, token, label, showMoney }));
  },
});

export const create = mutation({
  args: { eventId: v.id("events"), label: v.string(), showMoney: v.boolean() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "owner");
    const label = args.label.trim().slice(0, 60) || "A read-only link";
    const existing = await ctx.db.query("shareLinks").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(MAX_LINKS);
    if (existing.length >= MAX_LINKS) throw new ConvexError(`You have ${MAX_LINKS} links already. Turn one off first.`);
    const token = secret();
    await ctx.db.insert("shareLinks", { eventId: args.eventId, token, label, showMoney: args.showMoney, createdBy: userId });
    await logActivity(ctx, { eventId: args.eventId, actorUserId: userId, type: "note", text: `Made a read-only link for ${label}${args.showMoney ? ", with money" : ""}.` });
    return token;
  },
});

/** Turn a link off for good: it stops working at once. */
export const revoke = mutation({
  args: { linkId: v.id("shareLinks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) return null;
    const { userId } = await requireMember(ctx, link.eventId, "owner");
    await ctx.db.delete(link._id);
    await logActivity(ctx, { eventId: link.eventId, actorUserId: userId, type: "note", text: `Turned off the read-only link for ${link.label}.` });
    return null;
  },
});

// ---------------------------------------------------------------- for anyone with the link


const planView = v.object({
  name: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  city: v.string(),
  area: v.optional(v.string()),
  styleSummary: v.optional(v.string()),
  currency: v.string(),
  showMoney: v.boolean(),
  days: v.array(
    v.object({
      _id: v.id("sessions"),
      name: v.string(),
      key: v.optional(v.string()),
      kind: v.optional(v.string()),
      date: v.string(),
      dayIndex: v.number(),
      order: v.number(),
      startTime: v.optional(v.string()),
      endTime: v.optional(v.string()),
      location: v.optional(v.string()),
      guestCount: v.number(),
      budget: v.optional(v.number()),
      /** The colours kept for this part in its Space. */
      palette: v.optional(v.array(v.object({ name: v.string(), hex: v.string() }))),
    }),
  ),
  vendors: v.array(
    v.object({
      _id: v.id("vendorSlots"),
      title: v.string(),
      status: slotStatus,
      bookedName: v.optional(v.string()),
      budget: v.optional(v.number()),
    }),
  ),
  budget: v.union(v.object({ total: v.number(), committed: v.number(), paid: v.number() }), v.null()),
  dues: v.array(
    v.object({
      _id: v.id("dues"),
      dueDate: v.string(),
      label: v.string(),
      vendorName: v.optional(v.string()),
      amount: v.optional(v.number()),
    }),
  ),
  guests: v.object({ invited: v.number(), coming: v.number() }),
});

export const view = query({
  args: { token: v.string() },
  returns: v.union(planView, v.null()),
  handler: async (ctx, args) => {
    if (args.token.length < 16) return null;
    const link = await ctx.db.query("shareLinks").withIndex("by_token", (q) => q.eq("token", args.token)).unique();
    if (!link) return null;
    const event = await ctx.db.get(link.eventId);
    if (!event) return null;
    const money = link.showMoney;
    const [sessions, slots, lines, dues, guests] = await Promise.all([
      ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(50),
      ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(200),
      ctx.db.query("budgetLines").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(500),
      ctx.db.query("dues").withIndex("by_eventId_and_dueDate", (q) => q.eq("eventId", event._id)).take(300),
      ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(3000),
    ]);
    const vendors = await Promise.all(
      slots.map(async (s) => ({
        _id: s._id,
        title: s.title,
        status: s.status,
        bookedName: s.bookedVendorId ? (await ctx.db.get(s.bookedVendorId))?.name : undefined,
        budget: money ? s.budget : undefined,
      })),
    );
    const open = dues.filter((d) => !d.doneAt && (money || d.kind !== "payment"));
    return {
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      city: event.city,
      area: event.area,
      styleSummary: event.styleSummary,
      currency: event.currency,
      showMoney: money,
      days: sessions.map((e) => ({
        _id: e._id,
        name: e.name,
        key: e.key,
        kind: e.kind,
        date: e.date,
        dayIndex: e.dayIndex,
        order: e.order,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        guestCount: e.guestCount,
        budget: money ? e.budget : undefined,
        palette: e.choices?.find((c) => c.label === "Palette")?.colors,
      })),
      vendors,
      budget: money
        ? {
            total: event.totalBudget,
            committed: lines.reduce((a, l) => a + l.committed, 0),
            paid: lines.reduce((a, l) => a + l.paid, 0),
          }
        : null,
      dues: await Promise.all(
        open.map(async (d) => ({
          _id: d._id,
          dueDate: d.dueDate,
          label: d.label,
          vendorName: d.vendorId ? (await ctx.db.get(d.vendorId))?.name : undefined,
          amount: money ? d.amount : undefined,
        })),
      ),
      guests: {
        invited: guests.length,
        coming: guests.filter((g) => g.rsvp === "yes").reduce((a, g) => a + (g.attendingCount || g.partySize), 0),
      },
    };
  },
});
