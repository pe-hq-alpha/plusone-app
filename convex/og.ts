import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { coverPath } from "./lib/covers";

/**
 * What a shared link shows in a chat or a post: the event's name, its date and place, and its
 * picture (the host's own, else the illustration for its kind). Only for links that work:
 * a published event page, a guest's RSVP link, a shared plan. Never a guest's name or anything
 * the page itself doesn't show.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const when = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const card = internalQuery({
  args: { kind: v.union(v.literal("s"), v.literal("r"), v.literal("p")), key: v.string() },
  returns: v.union(v.null(), v.object({ title: v.string(), description: v.string(), image: v.optional(v.string()), eventType: v.string(), cover: v.string() })),
  handler: async (ctx, args) => {
    const key = args.key.slice(0, 80);
    let eventId = null;
    let lead = "";
    if (args.kind === "s") {
      const site = await ctx.db.query("eventSites").withIndex("by_slug", (q) => q.eq("slug", key)).unique();
      if (!site?.published) return null;
      eventId = site.eventId;
    } else if (args.kind === "r") {
      if (key.length < 24) return null;
      const guest = await ctx.db.query("guests").withIndex("by_rsvpToken", (q) => q.eq("rsvpToken", key)).unique();
      if (!guest) return null;
      eventId = guest.eventId;
      lead = "You're invited. ";
    } else {
      if (key.length < 16) return null;
      const link = await ctx.db.query("shareLinks").withIndex("by_token", (q) => q.eq("token", key)).unique();
      if (!link) return null;
      eventId = link.eventId;
      lead = "The plan, shared with you. ";
    }
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const dates = event.endDate && event.endDate !== event.startDate ? `${when(event.startDate)} to ${when(event.endDate)}` : when(event.startDate);
    const place = [event.area, event.city].filter(Boolean).join(", ");
    const image = event.coverImage ? ((await ctx.storage.getUrl(event.coverImage)) ?? undefined) : undefined;
    return {
      title: event.name,
      description: `${lead}${[dates, place].filter(Boolean).join(" · ")}`.trim(),
      ...(image ? { image } : {}),
      eventType: event.eventType ?? "party",
      cover: coverPath(event.eventType, event.name, event.occasionLabel),
    };
  },
});
