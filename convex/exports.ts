import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireMember } from "./lib/auth";

/**
 * Everything in a wedding, for "Download our data" (a privacy right, and a way to leave).
 * For the owner only, since it includes every email and every guest. Files are listed by
 * name; the files themselves stay where they are.
 */
export const event = query({
  args: { eventId: v.id("events") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId, "owner");
    const sessions = await ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(100);
    const needs = await ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(200);
    const vendors = await ctx.db.query("vendors").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(1000);
    const conversations = await ctx.db.query("threads").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(500);
    const emails = await ctx.db.query("messages").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(3000);
    const quotes = await ctx.db.query("quotes").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(1000);
    const budget = await ctx.db.query("budgetLines").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(500);
    const guests = await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(3000);
    const gifts = await ctx.db.query("gifts").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(200);
    const todos = await ctx.db.query("tasks").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(1000);
    const kept = await ctx.db.query("spaceItems").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(1000);
    const due = await ctx.db.query("dues").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(500);
    const members = await ctx.db.query("members").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(100);
    const history = await ctx.db.query("activity").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(2000);
    const people = await Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return { name: user?.name, email: user?.email, role: m.role, relationship: m.relationship };
      }),
    );
    const strip = <D extends Record<string, unknown>>(rows: D[]) => rows.map(({ eventId: _w, ...rest }) => rest);
    return {
      exportedAt: new Date().toISOString(),
      event: { ...event, inspirationImages: undefined },
      ceremonies: strip(sessions),
      vendorNeeds: strip(needs),
      vendors: strip(vendors),
      conversations: strip(conversations),
      emails: strip(emails).map((m) => ({ ...m, attachments: (m.attachments as { filename: string }[]).map((a) => a.filename) })),
      quotes: strip(quotes),
      budget: strip(budget),
      guests: strip(guests),
      gifts: strip(gifts),
      toDos: strip(todos),
      spaces: strip(kept).map((b) => ({ ...b, storageId: undefined, previewStorageId: undefined })),
      paymentsAndDeadlines: strip(due),
      people,
      history: strip(history),
    };
  },
});
