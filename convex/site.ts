import { ConvexError, v } from "convex/values";
import { coverPath } from "./lib/covers";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { rateLimiter } from "./rateLimits";
import { eventSiteFields } from "./schema";
import { byDayThenOrder } from "./lib/sessionOrder";
import { answersOf } from "./lib/rsvp";
import { anOccasion, eventTypeOf, hostsLabel, isWedding } from "./lib/occasion";
import { eventType } from "./lib/validators";
import { ensureRsvpToken, recordAnswers } from "./guests";
import { giftsForGuests, publicGifts } from "./gifts";

/**
 * The event's public page and each guest's personal RSVP link. Everything a stranger can reach is here, read
 * through narrow queries that return only what the page shows: a site that isn't
 * published returns nothing, and an RSVP link shows one guest only their own invitation.
 */

const secret = () => crypto.randomUUID().replace(/-/g, "");
const asciiName = (s: string) =>
  s.trim().split(/\s+/)[0]?.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16) ?? "";

/** "emma-and-james-k3x9qz": readable, with a random part so it can't be guessed. */
export function siteSlug(host: string, coHost: string): string {
  const names = [asciiName(host), asciiName(coHost)].filter(Boolean).join("-and-") || "our-event";
  return `${names}-${secret().slice(0, 6)}`;
}

/** What the invitation calls it: the hosts' own words when they gave some, otherwise "a birthday". */
const occasionOf = (event: Doc<"events">) => event.occasionLabel?.trim() || anOccasion(event);

const textField = (s: string | undefined, max: number) => (s === undefined ? undefined : s.trim().slice(0, max) || undefined);

// ---------------------------------------------------------------- for the hosts

export const get = query({
  args: { eventId: v.id("events") },
  returns: v.union(v.object({ ...eventSiteFields, _id: v.id("eventSites"), _creationTime: v.number() }), v.null()),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "viewer");
    return await ctx.db
      .query("eventSites")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
  },
});

async function siteFor(ctx: MutationCtx, event: Doc<"events">): Promise<Doc<"eventSites">> {
  const existing = await ctx.db
    .query("eventSites")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("eventSites", {
    eventId: event._id,
    slug: siteSlug(event.host, event.coHost),
    published: false,
    welcome: `We can't wait to celebrate with you.`,
    showSchedule: true,
    showTravel: true,
    showRsvp: true,
    hiddenSessionIds: [],
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

/** The site's words and which sections show. Making it public is a separate step, for the owners. */
export const save = mutation({
  args: {
    eventId: v.id("events"),
    patch: v.object({
      welcome: v.optional(v.string()),
      story: v.optional(v.string()),
      travel: v.optional(v.string()),
      showSchedule: v.optional(v.boolean()),
      showTravel: v.optional(v.boolean()),
      showRsvp: v.optional(v.boolean()),
      hiddenSessionIds: v.optional(v.array(v.id("sessions"))),
      showGifts: v.optional(v.boolean()),
      noGifts: v.optional(v.boolean()),
      cashGiftNote: v.optional(v.string()),
    }),
  },
  returns: v.id("eventSites"),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId, "planner");
    const site = await siteFor(ctx, event);
    const p = args.patch;
    if (p.hiddenSessionIds) {
      for (const id of p.hiddenSessionIds) {
        const e = await ctx.db.get(id);
        if (!e || e.eventId !== args.eventId) throw new ConvexError("That function isn't part of this event.");
      }
    }
    await ctx.db.patch(site._id, {
      ...(p.welcome !== undefined ? { welcome: textField(p.welcome, 600) } : {}),
      ...(p.story !== undefined ? { story: textField(p.story, 3000) } : {}),
      ...(p.travel !== undefined ? { travel: textField(p.travel, 3000) } : {}),
      ...(p.showSchedule !== undefined ? { showSchedule: p.showSchedule } : {}),
      ...(p.showTravel !== undefined ? { showTravel: p.showTravel } : {}),
      ...(p.showRsvp !== undefined ? { showRsvp: p.showRsvp } : {}),
      ...(p.hiddenSessionIds ? { hiddenSessionIds: [...new Set(p.hiddenSessionIds)].slice(0, 50) } : {}),
      ...(p.showGifts !== undefined ? { showGifts: p.showGifts } : {}),
      ...(p.noGifts !== undefined ? { noGifts: p.noGifts } : {}),
      ...(p.cashGiftNote !== undefined ? { cashGiftNote: textField(p.cashGiftNote, 400) } : {}),
      updatedAt: Date.now(),
    });
    return site._id;
  },
});

/** Put the site online, or take it down. Owners only: it's the first thing strangers can see. */
export const setPublished = mutation({
  args: { eventId: v.id("events"), published: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { event, userId } = await requireMember(ctx, args.eventId, "owner");
    if (event.demo && args.published) throw new ConvexError("The demo's event page stays private. Plan your own event to publish one.");
    const site = await siteFor(ctx, event);
    if (site.published === args.published) return null;
    await ctx.db.patch(site._id, { published: args.published, updatedAt: Date.now() });
    const page = isWedding(event) ? "wedding website" : "event page";
    await logActivity(ctx, { eventId: args.eventId, actorUserId: userId, type: "note", text: args.published ? `Published the ${page}.` : `Took the ${page} down.` });
    return null;
  },
});

/** A guest's personal RSVP link, made the first time someone asks for it. */
export const rsvpLink = mutation({
  args: { guestId: v.id("guests") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new ConvexError("That guest is no longer on the list.");
    await requireMember(ctx, guest.eventId, "planner");
    return await ensureRsvpToken(ctx, guest);
  },
});

// ---------------------------------------------------------------- for everyone

const publicSession = v.object({
  _id: v.id("sessions"),
  name: v.string(),
  key: v.optional(v.string()),
  kind: v.optional(v.string()),
  date: v.string(),
  startTime: v.optional(v.string()),
  endTime: v.optional(v.string()),
  location: v.optional(v.string()),
});

function showSession(e: Doc<"sessions">) {
  return {
    _id: e._id,
    name: e.name,
    key: e.key,
    kind: e.kind,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    location: e.location,
  };
}

async function sessionsOf(ctx: QueryCtx, eventId: Id<"events">): Promise<Doc<"sessions">[]> {
  return (
    await ctx.db
      .query("sessions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(50)
  ).sort(byDayThenOrder);
}

const siteView = v.union(
    v.object({
      host: v.string(),
      coHost: v.string(),
      eventType,
      occasion: v.string(),
      startDate: v.string(),
      endDate: v.string(),
      city: v.string(),
      area: v.optional(v.string()),
      welcome: v.optional(v.string()),
      story: v.optional(v.string()),
      travel: v.optional(v.string()),
      showRsvp: v.boolean(),
      sessions: v.array(publicSession),
      gifts: v.optional(publicGifts),
      name: v.string(),
      cover: v.string(),
      coverIsPhoto: v.boolean(),
    }),
    v.null(),
  );

async function siteView_(ctx: QueryCtx, site: Doc<"eventSites">) {
  const event = await ctx.db.get(site.eventId);
  if (!event) return null;
  const hidden = new Set(site.hiddenSessionIds);
  const sessions = site.showSchedule ? (await sessionsOf(ctx, event._id)).filter((e) => !hidden.has(e._id)).map(showSession) : [];
  return {
    host: event.host,
    coHost: event.coHost,
    eventType: eventTypeOf(event),
    occasion: occasionOf(event),
    startDate: event.startDate,
    endDate: event.endDate,
    city: event.city,
    area: event.area,
    welcome: site.welcome,
    story: site.story,
    travel: site.showTravel ? site.travel : undefined,
    showRsvp: site.showRsvp,
    sessions,
    gifts: await giftsForGuests(ctx, site, event),
    name: event.name,
    ...(await coverOf(ctx, event)),
  };
}

/** The host's own picture when they set one, else the drawing for the festival or kind of event. */
async function coverOf(ctx: QueryCtx, event: Doc<"events">): Promise<{ cover: string; coverIsPhoto: boolean }> {
  const own = event.coverImage ? await ctx.storage.getUrl(event.coverImage) : null;
  return own ? { cover: own, coverIsPhoto: true } : { cover: coverPath(event.eventType, event.name, occasionOf(event)), coverIsPhoto: false };
}

async function siteBySlug(ctx: QueryCtx, slug: string) {
  if (slug.length > 80) return null;
  return await ctx.db
    .query("eventSites")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

/** A published site, for anyone with its address; nothing at all for one that isn't. */
export const bySlug = query({
  args: { slug: v.string() },
  returns: siteView,
  handler: async (ctx, args) => {
    const site = await siteBySlug(ctx, args.slug);
    return site?.published ? await siteView_(ctx, site) : null;
  },
});

/** The same page before it's published, for the people planning the wedding only. */
export const preview = query({
  args: { slug: v.string() },
  returns: siteView,
  handler: async (ctx, args) => {
    const site = await siteBySlug(ctx, args.slug);
    if (!site) return null;
    await requireMember(ctx, site.eventId, "viewer");
    return await siteView_(ctx, site);
  },
});

/** One guest's invitation, from their own link: the ceremonies they're invited to and what they've answered. */
export const invitation = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      firstName: v.string(),
      partySize: v.number(),
      hosts: v.string(),
      eventType,
      occasion: v.string(),
      startDate: v.string(),
      endDate: v.string(),
      city: v.string(),
      sessions: v.array(v.object({ ...publicSession.fields, coming: v.optional(v.boolean()), count: v.optional(v.number()) })),
      dietary: v.optional(v.string()),
      allergies: v.optional(v.string()),
      responded: v.boolean(),
      gifts: v.optional(publicGifts),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (args.token.length < 24 || args.token.length > 64) return null;
    const guest = await ctx.db
      .query("guests")
      .withIndex("by_rsvpToken", (q) => q.eq("rsvpToken", args.token))
      .unique();
    if (!guest) return null;
    const event = await ctx.db.get(guest.eventId);
    if (!event) return null;
    const invited = new Set(guest.sessionIds);
    const answers = new Map(answersOf(guest).map((a) => [a.sessionId, a]));
    const sessions = (await sessionsOf(ctx, event._id))
      .filter((e) => invited.has(e._id))
      .map((e) => ({ ...showSession(e), coming: answers.get(e._id)?.coming, count: answers.get(e._id)?.count }));
    const site = await ctx.db
      .query("eventSites")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .unique();
    return {
      firstName: guest.name.trim().split(/\s+/)[0] ?? guest.name,
      partySize: guest.partySize,
      hosts: hostsLabel(event),
      eventType: eventTypeOf(event),
      occasion: occasionOf(event),
      startDate: event.startDate,
      endDate: event.endDate,
      city: event.city,
      sessions,
      dietary: guest.dietary,
      allergies: guest.allergies?.join(", "),
      responded: guest.respondedAt !== undefined,
      gifts: await giftsForGuests(ctx, site, event, guest._id),
    };
  },
});

/** A guest's answers from their link: for each ceremony, coming or not and how many. */
export const answer = mutation({
  args: {
    token: v.string(),
    answers: v.array(v.object({ sessionId: v.id("sessions"), coming: v.boolean(), count: v.number() })),
    dietary: v.optional(v.string()),
    allergies: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guest = args.token.length >= 24 && args.token.length <= 64
      ? await ctx.db
          .query("guests")
          .withIndex("by_rsvpToken", (q) => q.eq("rsvpToken", args.token))
          .unique()
      : null;
    if (!guest) throw new ConvexError("This RSVP link isn't valid any more. Ask whoever invited you for a new one.");
    const room = await rateLimiter.limit(ctx, "rsvpAnswers", { key: guest._id });
    if (!room.ok) throw new ConvexError("That's a lot of changes in a short time. Try again in a little while.");
    const invited = new Set(guest.sessionIds);
    if (args.answers.length === 0 || args.answers.length > 50) throw new ConvexError("Answer for at least one part of the invitation.");
    const answers = args.answers.filter((a) => invited.has(a.sessionId));
    if (answers.length === 0) throw new ConvexError("Answer for at least one part of the invitation.");
    // The link shows their food needs as they stand, so what comes back replaces them.
    const allergies = args.allergies?.split(/[;\n]/).map((s) => s.trim().slice(0, 80)).filter(Boolean).slice(0, 10);
    const { summary } = await recordAnswers(ctx, guest, {
      source: "link",
      reply: { kind: "each", answers },
      patch: {
        ...(args.dietary !== undefined ? { dietary: args.dietary.trim().slice(0, 200) || undefined } : {}),
        ...(allergies !== undefined ? { allergies: allergies.length ? allergies : undefined } : {}),
      },
    });
    await logActivity(ctx, {
      eventId: guest.eventId,
      actorLabel: guest.name,
      actorKind: "person",
      type: "guest_rsvp",
      text: `replied on their RSVP link: ${summary}.`,
      refs: { guestId: guest._id },
    });
    return null;
  },
});
