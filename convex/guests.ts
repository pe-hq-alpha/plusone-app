import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { guestDoc, eventDoc } from "./lib/docs";
import { emailPool } from "./lib/pools";
import { importStatus, rsvpStatus, type RsvpStatus } from "./lib/validators";
import { hasCoHost, hostsLabel, isWorkEvent, occasionNoun, partWord } from "./lib/occasion";
import { trackForEvent } from "./analytics";
import { byDayThenOrder } from "./lib/sessionOrder";
import { dayRange } from "./lib/text";
import {
  answerSummary,
  answersOf,
  ceremonyLine,
  eatingAt,
  foodNeeds,
  headCount,
  replyFromEmail,
  settle,
  type Reply,
  type RsvpSource,
} from "./lib/rsvp";
import { claimUpload } from "./lib/uploads";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(guestDoc),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    return await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
  },
});

export const add = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    email: v.optional(v.string()),
    side: v.optional(v.string()),
    partySize: v.optional(v.number()),
    sessionIds: v.optional(v.array(v.id("sessions"))),
  },
  returns: v.id("guests"),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    return await addGuestHelper(ctx, args.eventId, args);
  },
});

/** One guest, validated and inserted. Shared by the form and the assistant. */
export async function addGuestHelper(
  ctx: MutationCtx,
  eventId: Id<"events">,
  guest: { name: string; email?: string; side?: string; partySize?: number; sessionIds?: Id<"sessions">[] },
): Promise<Id<"guests">> {
  const email = guest.email?.trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) throw new ConvexError("That does not look like an email address.");
  const partySize = guest.partySize ?? 1;
  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 20) throw new ConvexError("Party size must be between 1 and 20.");
  let sessionIds = guest.sessionIds ?? [];
  if (sessionIds.length === 0) {
    sessionIds = await allSessionIds(ctx, eventId);
  } else {
    for (const sessionId of sessionIds.slice(0, 20)) {
      const session = await ctx.db.get(sessionId);
      if (!session || session.eventId !== eventId) throw new ConvexError("That day isn't part of this event.");
    }
  }
  return await ctx.db.insert("guests", {
    eventId,
    name: guest.name.trim(),
    email: email || undefined,
    side: guest.side,
    partySize: Math.floor(partySize),
    rsvp: "pending",
    attendingCount: 0,
    sessionIds: sessionIds.slice(0, 20),
  });
}

/** Every day of the wedding: what a guest is invited to unless told otherwise. */
async function allSessionIds(ctx: MutationCtx, eventId: Id<"events">): Promise<Id<"sessions">[]> {
  return (
    await ctx.db
      .query("sessions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(50)
  ).map((e) => e._id);
}

/**
 * Whether this person is already on the list: by email, or by name when there is no
 * email. `knownNames` lets a bulk import check hundreds of rows with one read.
 */
export async function findDuplicateGuest(
  ctx: MutationCtx,
  eventId: Id<"events">,
  name: string,
  email?: string,
  knownNames?: Set<string>,
): Promise<boolean> {
  if (email) {
    const existing = await ctx.db
      .query("guests")
      .withIndex("by_eventId_and_email", (q) => q.eq("eventId", eventId).eq("email", email))
      .first();
    return Boolean(existing);
  }
  const names =
    knownNames ??
    new Set(
      (
        await ctx.db
          .query("guests")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .take(2000)
      ).map((g) => g.name.trim().toLowerCase()),
    );
  return names.has(name.trim().toLowerCase());
}

export const update = mutation({
  args: {
    guestId: v.id("guests"),
    patch: v.object({
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      side: v.optional(v.string()),
      partySize: v.optional(v.number()),
      dietary: v.optional(v.string()),
      sessionIds: v.optional(v.array(v.id("sessions"))),
      notes: v.optional(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new ConvexError("Guest not found.");
    await requireMember(ctx, guest.eventId, "planner");
    const patch = { ...args.patch };
    if (patch.email !== undefined) {
      patch.email = patch.email.trim().toLowerCase();
      if (patch.email && !EMAIL_RE.test(patch.email)) throw new ConvexError("That does not look like an email address.");
    }
    if (patch.partySize !== undefined && (!Number.isFinite(patch.partySize) || patch.partySize < 1 || patch.partySize > 20)) {
      throw new ConvexError("Party size must be between 1 and 20.");
    }
    if (patch.sessionIds) {
      patch.sessionIds = [...new Set(patch.sessionIds)].slice(0, 20);
      for (const sessionId of patch.sessionIds) {
        const session = await ctx.db.get(sessionId);
        if (!session || session.eventId !== guest.eventId) throw new ConvexError("That day isn't part of this event.");
      }
    }
    // Whether they're coming follows from their answer for each ceremony (setAnswer), so a
    // change to what they're invited to is worked through again rather than set directly.
    const next = patch.sessionIds
      ? settle({ ...guest, ...patch, sessionIds: patch.sessionIds }, null, "couple", Date.now(), guest.rsvp === "maybe" ? "maybe" : "pending")
      : {};
    await ctx.db.patch(args.guestId, { ...patch, ...next });
    return null;
  },
});

export const remove = mutation({
  args: { guestId: v.id("guests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new ConvexError("Guest not found.");
    await requireMember(ctx, guest.eventId, "planner");
    await ctx.db.delete(args.guestId);
    return null;
  },
});

/** The guest's own RSVP link secret (/r/<token>), made the first time it's needed. */
export async function ensureRsvpToken(ctx: MutationCtx, guest: Doc<"guests">): Promise<string> {
  if (guest.rsvpToken) return guest.rsvpToken;
  const token = crypto.randomUUID().replace(/-/g, "");
  await ctx.db.patch(guest._id, { rsvpToken: token });
  return token;
}

/**
 * The invitation: one email listing what they're invited to and asking which they can make, with
 * their own RSVP link as the other way to answer. Both answers land in the same place.
 */
export function inviteText(v: {
  firstName: string;
  hosts: string;
  their: string;
  occasion: string;
  city: string;
  dates: string;
  ceremonies: string[];
  partySize: number;
  link?: string;
  /** A work or community event: a plainer invitation, signed with the organisation too. */
  work?: boolean;
  organisation?: string;
}): string {
  const many = v.ceremonies.length > 1;
  const party = v.partySize > 1 ? `, how many of your party of ${v.partySize} are coming` : "";
  return (
    `Hi ${v.firstName},\n\n` +
    (v.work
      ? `${v.hosts}${v.organisation ? ` at ${v.organisation}` : ""} would like to invite you to the ${v.occasion} in ${v.city}, ${v.dates}.\n\n`
      : `${v.hosts} would love to have you at ${v.their} ${v.occasion} in ${v.city}, ${v.dates}.\n\n`) +
    (v.ceremonies.length ? `You're invited to:\n${v.ceremonies.map((c) => `  • ${c}`).join("\n")}\n\n` : "") +
    (many
      ? `Could you let us know which of these you can make? Just reply to this email with the ones you'll be at${party}, and any food needs or allergies.`
      : `Could you let us know if you can make it? Just reply to this email with yes or no${party}, and any food needs or allergies.`) +
    (v.link
      ? `\n\nOr, if it's easier, tap your own RSVP link and answer ${many ? "for each one " : ""}there:\n${v.link}\n\n` +
        `Either way works, and you can change your answer later.`
      : "") +
    (v.work ? `\n\nBest regards,\n${v.hosts}${v.organisation ? `\n${v.organisation}` : ""}` : `\n\nWith love,\n${v.hosts}`)
  );
}

/**
 * Email RSVP invites from the event's own inbox: exactly one email per guest, and a reminder
 * is one email too. Replies are matched back by sender address; the link in the email
 * answers the same invitation, so both land on the same answers.
 */
export const sendInvites = mutation({
  args: { eventId: v.id("events"), guestIds: v.array(v.id("guests")) },
  returns: v.object({ queued: v.number(), skipped: v.number() }),
  handler: async (ctx, args): Promise<{ queued: number; skipped: number }> => {
    const { event } = await requireMember(ctx, args.eventId, "planner");
    if (args.guestIds.length > 50) throw new ConvexError("Send to at most 50 guests at a time.");
    const fromAddress = event.inboxAddress ?? process.env.AGENTMAIL_FALLBACK_INBOX_ID;
    if (!fromAddress) throw new ConvexError("The event's inbox isn't ready yet. Try again in a moment.");
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(50)
    ).sort(byDayThenOrder);
    const site = process.env.SITE_URL?.trim().replace(/\/+$/, "");
    let queued = 0;
    let skipped = 0;
    for (const guestId of args.guestIds) {
      const guest = await ctx.db.get(guestId);
      if (!guest || guest.eventId !== args.eventId || !guest.email) {
        skipped += 1;
        continue;
      }
      const invited = sessions.filter((e) => guest.sessionIds.includes(e._id));
      const token = site ? await ensureRsvpToken(ctx, guest) : undefined;
      const bodyText = inviteText({
        firstName: guest.name.trim().split(/\s+/)[0] || guest.name,
        hosts: hostsLabel(event),
        their: hasCoHost(event) ? "their" : "the",
        occasion: occasionNoun(event),
        city: event.city,
        dates: dayRange(event.startDate, event.endDate),
        ceremonies: invited.map(ceremonyLine),
        partySize: guest.partySize,
        link: token ? `${site}/r/${token}` : undefined,
        work: isWorkEvent(event),
        organisation: event.organisation?.trim() || undefined,
      });
      const round = (guest.lastInvitedAt ? 2 : 1);
      const messageId = await ctx.db.insert("messages", {
        eventId: args.eventId,
        guestId,
        direction: "out",
        kind: "rsvp_invite",
        status: "queued",
        fromAddress,
        toAddress: guest.email,
        subject: `You're invited: ${event.name}`.slice(0, 70),
        bodyText,
        attachments: [],
        idempotencyKey: `${guestId}:rsvp_invite:${round}`,
      });
      await emailPool.enqueueAction(ctx, internal.agentmail.sendOutbound, { messageId }, { retry: false });
      queued += 1;
    }
    return { queued, skipped };
  },
});

// ---- internal ---------------------------------------------------------------

/** A guest, their wedding and the ceremonies they're invited to in day order, to read a reply against. */
export const getContextForRsvp = internalQuery({
  args: { guestId: v.id("guests") },
  returns: v.union(
    v.object({
      guest: guestDoc,
      event: eventDoc,
      sessions: v.array(v.object({ _id: v.id("sessions"), name: v.string(), date: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) return null;
    const event = await ctx.db.get(guest.eventId);
    if (!event) return null;
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_eventId", (q) => q.eq("eventId", guest.eventId))
        .take(50)
    )
      .filter((e) => guest.sessionIds.includes(e._id))
      .sort(byDayThenOrder)
      .map((e) => ({ _id: e._id, name: e.name, date: e.date }));
    return { guest, event, sessions };
  },
});

export const markInvited = internalMutation({
  args: { guestId: v.id("guests"), at: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) return null;
    await ctx.db.patch(args.guestId, guest.lastInvitedAt ? { lastRemindedAt: args.at } : { lastInvitedAt: args.at });
    return null;
  },
});

/**
 * The one way a guest's answers are written, whether from their RSVP link, an emailed
 * reply or the couple: the reply is laid over their earlier answers ceremony by ceremony
 * (see `mergeAnswers` in lib/rsvp.ts), and the overall answer and head count are worked
 * out from the result. Returns the history's summary, e.g. "coming to 3 of 4".
 */
export async function recordAnswers(
  ctx: MutationCtx,
  guest: Doc<"guests">,
  args: {
    source: RsvpSource;
    reply: Reply<Id<"sessions">> | null;
    /** What an undecided guest is: "maybe" when they said so. */
    undecided?: "pending" | "maybe";
    /** Their food needs or a note, saved in the same write. */
    patch?: Partial<Pick<Doc<"guests">, "dietary" | "allergies" | "notes">>;
    /** False when the couple only takes an answer back, which isn't the guest answering. */
    responded?: boolean;
  },
): Promise<{ summary: string; rsvp: RsvpStatus; attendingCount: number }> {
  const now = Date.now();
  const next = settle(guest, args.reply, args.source, now, args.undecided ?? (guest.rsvp === "maybe" ? "maybe" : "pending"));
  await ctx.db.patch(guest._id, {
    ...args.patch,
    sessionRsvps: next.sessionRsvps,
    rsvp: next.rsvp,
    attendingCount: next.attendingCount,
    ...(args.responded === false ? {} : { respondedAt: now }),
  });
  return {
    summary: answerSummary(guest.sessionIds, next.sessionRsvps, next.rsvp, next.attendingCount),
    rsvp: next.rsvp,
    attendingCount: next.attendingCount,
  };
}

/** A guest's emailed reply, as read by `claude.parseRsvp`. */
export const applyRsvp = internalMutation({
  args: {
    guestId: v.id("guests"),
    /** Omitted when the reply only told us about food, so their answer stays as it was. */
    rsvp: v.optional(rsvpStatus),
    attendingCount: v.number(),
    /** What the reply says about each of their ceremonies; null where it doesn't say. */
    ceremonies: v.optional(
      v.array(v.object({ sessionId: v.id("sessions"), coming: v.union(v.boolean(), v.null()), count: v.number() })),
    ),
    /** Whether it named particular ceremonies, rather than a plain yes or no. */
    namedCeremonies: v.optional(v.boolean()),
    dietary: v.optional(v.string()),
    allergies: v.optional(v.array(v.string())),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) return null;
    // Allergies only ever accumulate: a later "see you there!" must not erase "Sam is allergic to shellfish".
    const known = guest.allergies ?? [];
    const fresh = (args.allergies ?? []).filter(
      (a) => !known.some((k) => k.split(",")[0].trim().toLowerCase() === a.split(",")[0].trim().toLowerCase()),
    );
    const allergies = [...known, ...fresh].slice(0, 12).map((a) => a.slice(0, 120));
    const food = {
      ...(args.dietary ? { dietary: args.dietary.slice(0, 300) } : {}),
      ...(fresh.length ? { allergies } : {}),
      ...(args.note ? { notes: args.note.slice(0, 500) } : {}),
    };
    await trackForEvent(ctx, "rsvp.received", guest.eventId, { rsvp: args.rsvp ?? "food_only" });
    const allergyText = fresh.length ? ` Allergy: ${fresh.join("; ")}.` : "";
    const dietText = args.dietary ? ` Food: ${args.dietary}.` : "";

    if (!args.rsvp) {
      await ctx.db.patch(args.guestId, food);
      await logActivity(ctx, {
        eventId: guest.eventId,
        actorLabel: guest.name,
        actorKind: "person",
        type: "guest_rsvp",
        text: `told you about their food needs.${allergyText}${args.dietary ? ` ${args.dietary}.` : ""}`,
        refs: { guestId: guest._id },
      });
      return null;
    }

    const invited = new Set(guest.sessionIds);
    const reply = replyFromEmail({
      rsvp: args.rsvp,
      attendingCount: args.attendingCount,
      ceremonies: (args.ceremonies ?? []).filter((c) => invited.has(c.sessionId)),
      namedCeremonies: args.namedCeremonies ?? false,
    });
    const before = answersOf(guest);
    const { summary } = await recordAnswers(ctx, guest, {
      source: "email",
      reply,
      undecided: args.rsvp === "maybe" || (!reply && guest.rsvp === "maybe") ? "maybe" : "pending",
      patch: food,
    });
    // A plain yes after answering ceremony by ceremony keeps those answers; say so, so the
    // couple isn't left wondering why the email didn't turn everything to coming.
    const kept = reply?.kind === "vagueYes" && before.some((a) => !a.coming) && before.some((a) => a.coming);
    await logActivity(ctx, {
      eventId: guest.eventId,
      actorLabel: guest.name,
      actorKind: "person",
      type: "guest_rsvp",
      text: kept
        ? `replied by email with a yes; their earlier answers stand: ${summary}.${dietText}${allergyText}`
        : `replied by email: ${summary}.${dietText}${allergyText}`,
      refs: { guestId: guest._id },
    });
    return null;
  },
});

/**
 * The couple setting a guest's answer by hand, for one ceremony or for every one they're
 * invited to: what a guest said on the phone or at the door. Viewers can't.
 */
export const setAnswer = mutation({
  args: {
    guestId: v.id("guests"),
    /** Omitted to answer for every ceremony they're invited to. */
    sessionId: v.optional(v.id("sessions")),
    /** Null takes the answer back to "not answered yet". */
    coming: v.union(v.boolean(), v.null()),
    /** How many are coming; their earlier number or their whole party when left out. */
    count: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guest = await ctx.db.get(args.guestId);
    if (!guest) throw new ConvexError("Guest not found.");
    const { userId } = await requireMember(ctx, guest.eventId, "planner");
    if (args.count !== undefined && (!Number.isFinite(args.count) || args.count < 1 || args.count > 20)) {
      throw new ConvexError("How many are coming must be between 1 and 20.");
    }
    const n = guest.sessionIds.length;
    const event = await ctx.db.get(guest.eventId);
    const part = event ? partWord(event) : "function";
    let what = n === 0 ? "the event" : n === 1 ? `their ${part}` : `all ${n} ${event ? partWord(event, true) : "functions"}`;
    if (args.sessionId) {
      if (!guest.sessionIds.includes(args.sessionId)) throw new ConvexError(`${guest.name} isn't invited to that ${part}.`);
      const session = await ctx.db.get(args.sessionId);
      what = `the ${session?.name ?? part}`;
    }
    const ids = args.sessionId ? [args.sessionId] : guest.sessionIds;
    const earlier = new Map(answersOf(guest).map((a) => [a.sessionId, a]));
    const coming = args.coming;
    const reply: Reply<Id<"sessions">> =
      coming === null
        ? { kind: "clear", sessionIds: ids }
        : ids.length === 0
          ? { kind: "all", coming, count: args.count ?? guest.partySize }
          : {
              kind: "each",
              answers: ids.map((sessionId) => ({
                sessionId,
                coming,
                count: args.count ?? (earlier.get(sessionId)?.coming ? earlier.get(sessionId)!.count : guest.partySize),
              })),
            };
    await recordAnswers(ctx, guest, { source: "couple", reply, responded: coming !== null });
    const one = reply.kind === "each" && ids.length === 1 ? headCount(reply.answers[0].count, guest.partySize) : 0;
    const people = coming && one > 1 ? ` (${one})` : "";
    await logActivity(ctx, {
      eventId: guest.eventId,
      actorUserId: userId,
      type: "guest_rsvp",
      text:
        coming === null
          ? `cleared ${guest.name}'s answer for ${what}.`
          : `marked ${guest.name} as ${coming ? "coming" : "not coming"} to ${what}${people}.`,
      refs: { guestId: guest._id, ...(args.sessionId ? { sessionId: args.sessionId } : {}) },
    });
    return null;
  },
});

/**
 * What the kitchen needs to know, without names: allergens with how many guests and
 * whether any are severe, then preferences. For one ceremony, only the guests invited to
 * it who haven't said no to it; the Guests page groups them the same way (lib/rsvp.ts).
 * Null when nobody has said anything.
 */
export const dietarySummary = internalQuery({
  args: { eventId: v.id("events"), sessionId: v.optional(v.id("sessions")) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const guests = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(1000);
    const { allergens, prefs } = foodNeeds(eatingAt(guests, args.sessionId));
    if (allergens.length === 0 && prefs.length === 0) return null;
    const parts: string[] = [];
    if (allergens.length) {
      parts.push(
        "Allergies: " +
          allergens.map((e) => `${e.name} (${e.count} ${e.count === 1 ? "guest" : "guests"}${e.severe ? `, ${e.severe} severe` : ""})`).join("; "),
      );
    }
    if (prefs.length) parts.push("Other food needs: " + prefs.map((p) => `${p.name} (${p.count})`).join("; "));
    return parts.join(". ") + ".";
  },
});

// ---- bringing in a whole list at once ---------------------------------------

const MAX_IMPORT_GUESTS = 400;

const importedGuest = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  side: v.optional(v.string()),
  partySize: v.number(),
});

/** A one-off upload URL for a guest list file. */
export const generateUploadUrl = mutation({
  args: { eventId: v.id("events") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Hand PlusOne a spreadsheet, a PDF or a pasted list; it comes back as rows to check. */
export const startImport = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.optional(v.id("_storage")),
    filename: v.optional(v.string()),
    rawText: v.optional(v.string()),
  },
  returns: v.id("guestImports"),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    if (!args.storageId && !args.rawText?.trim()) throw new ConvexError("Paste a list or choose a file first.");
    if (args.storageId) await claimUpload(ctx, args.storageId, userId);
    if (args.rawText && args.rawText.length > 200_000) throw new ConvexError("That's a very long list. Paste it in parts, or upload a file.");
    if (args.storageId) {
      const file = await ctx.db.system.get("_storage", args.storageId);
      if (!file) throw new ConvexError("That file didn't upload. Try again.");
      if (file.size > 5 * 1024 * 1024) throw new ConvexError("Files up to 5 MB, please.");
    }
    const importId = await ctx.db.insert("guestImports", {
      eventId: args.eventId,
      storageId: args.storageId,
      filename: args.filename?.slice(0, 200),
      rawText: args.rawText?.slice(0, 40_000),
      status: "pending",
    });
    await ctx.scheduler.runAfter(0, internal.guestImport.read, { importId });
    return importId;
  },
});

/** The list PlusOne read, for the couple to check before anyone is added. */
export const getImportForCouple = query({
  args: { importId: v.id("guestImports") },
  returns: v.union(
    v.object({
      status: importStatus,
      filename: v.optional(v.string()),
      error: v.optional(v.string()),
      note: v.optional(v.string()),
      guests: v.array(importedGuest),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.importId);
    if (!row) return null;
    await requireMember(ctx, row.eventId);
    const preview = (row.preview ?? {}) as { guests?: unknown; note?: string };
    return {
      status: row.status,
      filename: row.filename,
      error: row.error,
      note: preview.note,
      guests: (Array.isArray(preview.guests) ? preview.guests : []) as { name: string; email?: string; side?: string; partySize: number }[],
    };
  },
});

/** Add the rows the couple kept. Anyone already on the list by email is left alone. */
export const commitImport = mutation({
  args: { importId: v.id("guestImports"), guests: v.array(importedGuest), sessionIds: v.optional(v.array(v.id("sessions"))) },
  returns: v.object({ added: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.importId);
    if (!row) throw new ConvexError("That import is gone.");
    const { userId } = await requireMember(ctx, row.eventId, "planner");
    if (args.guests.length === 0) throw new ConvexError("Nobody to add.");
    if (args.guests.length > MAX_IMPORT_GUESTS) throw new ConvexError(`Up to ${MAX_IMPORT_GUESTS} guests at a time.`);

    const { added, skipped } = await addGuests(ctx, row.eventId, args.guests, args.sessionIds ?? []);
    await ctx.db.patch(args.importId, { status: "committed" });
    if (added > 0) {
      await logActivity(ctx, {
        eventId: row.eventId,
        actorUserId: userId,
        type: "note",
        text: `added ${added} ${added === 1 ? "guest" : "guests"} from ${row.filename ?? "a pasted list"}.`,
      });
    }
    return { added, skipped };
  },
});

// ---- internal ---------------------------------------------------------------

export const getImport = internalQuery({
  args: { importId: v.id("guestImports") },
  returns: v.union(
    v.object({
      eventId: v.id("events"),
      storageId: v.optional(v.id("_storage")),
      filename: v.optional(v.string()),
      rawText: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.importId);
    if (!row) return null;
    return { eventId: row.eventId, storageId: row.storageId, filename: row.filename, rawText: row.rawText };
  },
});

export const setImportPreview = internalMutation({
  args: { importId: v.id("guestImports"), guests: v.array(importedGuest), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.importId, { status: "mapped", preview: { guests: args.guests, note: args.note }, error: undefined });
    return null;
  },
});

export const failImport = internalMutation({
  args: { importId: v.id("guestImports"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.importId, { status: "failed", error: args.error.slice(0, 300) });
    return null;
  },
});

/**
 * Add guests from any list (a guest list, or a whole plan brought in). Someone already
 * on the list, by email or by name, is left alone; a bad email skips the row.
 */
export async function addGuests(
  ctx: MutationCtx,
  eventId: Id<"events">,
  guests: { name: string; email?: string; side?: string; partySize: number }[],
  sessionIdsIn: Id<"sessions">[],
): Promise<{ added: number; skipped: number }> {
  const sessionIds = sessionIdsIn.length ? sessionIdsIn : await allSessionIds(ctx, eventId);
  // Someone with no email can still be a duplicate, so names count too. Read once
  // for the whole list rather than per row.
  const existingNames = new Set(
    (await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(2000)).map((g) =>
      g.name.trim().toLowerCase(),
    ),
  );
  let added = 0;
  let skipped = 0;
  for (const guest of guests.slice(0, MAX_IMPORT_GUESTS)) {
    const name = guest.name.trim().slice(0, 120);
    const email = guest.email?.trim().toLowerCase();
    if (!name || (email && !EMAIL_RE.test(email)) || (await findDuplicateGuest(ctx, eventId, name, email, existingNames))) {
      skipped += 1;
      continue;
    }
    existingNames.add(name.toLowerCase());
    await ctx.db.insert("guests", {
      eventId,
      name,
      email: email || undefined,
      side: guest.side?.slice(0, 60) || undefined,
      partySize: Math.max(1, Math.min(20, Math.floor(guest.partySize || 1))),
      rsvp: "pending",
      attendingCount: 0,
      sessionIds: sessionIds.slice(0, 20),
    });
    added += 1;
  }
  return { added, skipped };
}
