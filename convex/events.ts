import { adopt } from "./spaces";
import { byDayThenOrder } from "./lib/sessionOrder";
import { ConvexError, v, type ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity, requireAccount, requireMember, requireUserId, nameFromEmail } from "./lib/auth";
import { rebalanceEventBudget } from "./lib/budget";
import { clearDraft } from "./drafts";
import { INBOX_READY_TEXT } from "./activity";
import { sessionDoc, eventDoc } from "./lib/docs";
import {
  SESSION_COLORS,
  sessionsFor,
  slotsFor,
  allocateSlotBudgets,
  spreadDayIndexes,
  splitByWeights,
} from "./lib/templates";
import { addDays, daysBetween } from "./lib/text";
import { CEREMONY_KINDS } from "./lib/vocab";
import { guessKind } from "./lib/kinds";
import { startPurge } from "./maintenance";
import { eventType, sendMode, styleFormality, role } from "./lib/validators";
import { partWord } from "./lib/occasion";
import { workflow } from "./workflows";
import { HELP_WITH_KEYS } from "./lib/helpWith";
import { track } from "./analytics";
import { claimUpload } from "./lib/uploads";

export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      event: eventDoc,
      role,
      /** Enough for the card to say where this wedding stands without opening it. */
      /** The host's own picture for the card, when they've set one. */
      coverUrl: v.optional(v.string()),
      summary: v.object({
        daysToGo: v.number(),
        needs: v.number(),
        booked: v.number(),
        committed: v.number(),
        quotesToCompare: v.number(),
        awaiting: v.number(),
        nextStep: v.string(),
      }),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(50);
    const out = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const m of memberships) {
      const event = await ctx.db.get(m.eventId);
      if (!event) continue;

      const slots = await ctx.db
        .query("vendorSlots")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(200);
      const lines = await ctx.db
        .query("budgetLines")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(200);

      const booked = slots.filter((s) => s.status === "booked").length;
      const quotesToCompare = slots.filter((s) => s.status === "quoted").length;
      const awaiting = slots.filter((s) => s.status === "contacted").length;
      const researched = slots.filter((s) => s.status === "research").length;
      const committed = lines.reduce((sum, l) => sum + (slots.find((s) => s._id === l.slotId)?.status === "booked" ? l.committed : 0), 0);

      // One honest next step, in the order people planning would actually take them.
      const nextStep =
        slots.length === 0
          ? "Add what you need"
          : booked === slots.length
            ? "Everything is booked"
            : quotesToCompare > 0
              ? `${quotesToCompare} ${quotesToCompare === 1 ? "need has quotes" : "needs have quotes"} to compare`
              : awaiting > 0
                ? `Waiting on ${awaiting} ${awaiting === 1 ? "vendor" : "vendors"}`
                : researched > 0
                  ? booked > 0 || slots.length - researched > 0
                    ? `Find the other ${researched} ${researched === 1 ? "vendor" : "vendors"}`
                    : "Find your first vendors"
                  : "Pick who to ask";

      const daysToGo = Math.max(
        0,
        Math.round((new Date(event.startDate).getTime() - new Date(today).getTime()) / 86_400_000),
      );

      const coverUrl = event.coverImage ? ((await ctx.storage.getUrl(event.coverImage)) ?? undefined) : undefined;
      out.push({
        event,
        role: m.role,
        ...(coverUrl ? { coverUrl } : {}),
        summary: { daysToGo, needs: slots.length, booked, committed, quotesToCompare, awaiting, nextStep },
      });
    }
    return out;
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    event: eventDoc,
    role,
    sessions: v.array(sessionDoc),
    stats: v.object({
      plannedTotal: v.number(),
      committedTotal: v.number(),
      /** What's committed on needs that are booked: the money actually agreed with a vendor. */
      bookedTotal: v.number(),
      paidTotal: v.number(),
      slotCounts: v.object({
        research: v.number(),
        contacted: v.number(),
        quoted: v.number(),
        booked: v.number(),
      }),
      guestCounts: v.object({
        pending: v.number(),
        yes: v.number(),
        no: v.number(),
        maybe: v.number(),
        attending: v.number(),
      }),
    }),
  }),
  handler: async (ctx, args) => {
    const { member, event } = await requireMember(ctx, args.eventId);
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(50)
    ).sort(byDayThenOrder);

    const lines = await ctx.db
      .query("budgetLines")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const slots = await ctx.db
      .query("vendorSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const guests = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);

    const bookedSlots = new Set(slots.filter((s) => s.status === "booked").map((s) => s._id));
    const slotCounts = { research: 0, contacted: 0, quoted: 0, booked: 0 };
    for (const s of slots) slotCounts[s.status] += 1;
    const guestCounts = { pending: 0, yes: 0, no: 0, maybe: 0, attending: 0 };
    for (const g of guests) {
      guestCounts[g.rsvp] += 1;
      if (g.rsvp === "yes") guestCounts.attending += g.attendingCount;
    }

    return {
      event,
      role: member.role,
      sessions,
      stats: {
        plannedTotal: lines.reduce((a, l) => a + l.planned, 0),
        committedTotal: lines.reduce((a, l) => a + l.committed, 0),
        bookedTotal: lines.filter((l) => l.slotId && bookedSlots.has(l.slotId)).reduce((a, l) => a + l.committed, 0),
        paidTotal: lines.reduce((a, l) => a + l.paid, 0),
        slotCounts,
        guestCounts,
      },
    };
  },
});

const MAX_INSPIRATION_IMAGES = 6;

/** A one-off upload URL for an inspiration picture; the id comes back to `create`. */
export const generateInspirationUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAccount(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

const COVER_TYPES = /^image\/(jpeg|png|webp)$/;
const COVER_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The event's own picture, for its card and the previews of its shared links: set from an
 * upload, or taken away (the illustration for its kind shows again). The old picture is deleted.
 */
export const setCover = mutation({
  args: { eventId: v.id("events"), storageId: v.optional(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId, "planner");
    if (args.storageId) {
      const file = await ctx.db.system.get(args.storageId);
      if (!file || !COVER_TYPES.test(file.contentType ?? "") || file.size > COVER_MAX_BYTES) {
        if (file) await ctx.storage.delete(args.storageId);
        throw new ConvexError("Use a JPEG, PNG or WebP picture under 8 MB.");
      }
    }
    if (event.coverImage && event.coverImage !== args.storageId) await ctx.storage.delete(event.coverImage).catch(() => undefined);
    await ctx.db.patch(event._id, { coverImage: args.storageId });
    return null;
  },
});

const createArgs = {
    name: v.string(),
    host: v.string(),
    coHost: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    city: v.string(),
    /** Neighbourhood / district inside the city; vendor searches are biased to it. */
    area: v.optional(v.string()),
    country: v.optional(v.string()),
    currency: v.string(),
    totalBudget: v.number(),
    /** What kind of event this is. Omitted means a general event. */
    eventType: v.optional(eventType),
    /** The host's own words for it, when the type alone doesn't say it ("Amma's 60th"). */
    occasionLabel: v.optional(v.string()),
    /** The company, college or community holding a work or community event. */
    organisation: v.optional(v.string()),
    inspirationUrl: v.optional(v.string()),
    inspirationNotes: v.optional(v.string()),
    inspirationImages: v.optional(v.array(v.id("_storage"))),
    styleVibes: v.optional(v.array(v.string())),
    stylePalette: v.optional(v.string()),
    styleFormality: v.optional(styleFormality),
    guestEstimate: v.optional(v.number()),
    helpWith: v.optional(v.array(v.string())),
    helpNotes: v.optional(v.string()),
    /**
     * The host's own functions, honoured for every kind of event. Omit to take the
     * kind of event's defaults. `budget` is a share of the total, not an amount: the
     * shares are normalised so they always add up to the wedding's budget.
     */
    sessions: v.optional(
      v.array(
        v.object({
          name: v.string(),
          date: v.string(),
          dayIndex: v.optional(v.number()),
          guestCount: v.number(),
          budget: v.number(),
          /** The part's own key, its meaning, and the rites inside it. */
          key: v.optional(v.string()),
          significance: v.optional(v.string()),
          rites: v.optional(v.array(v.object({ name: v.string(), gloss: v.string() }))),
          /** Its kind of ceremony (lib/vocab CEREMONY_KINDS). */
          kind: v.optional(v.string()),
          /** When it starts, HH:MM, if the host said. */
          startTime: v.optional(v.string()),
        }),
      ),
    ),
    /**
     * The vendors this couple actually needs, and which of them they have already
     * booked. Omit to take the kind of event's defaults, all of them unbooked. A booked
     * need is never researched or emailed, and what they have already spent on it
     * counts against the budget from the first screen.
     */
    needs: v.optional(
      v.array(
        v.object({
          category: v.string(),
          title: v.string(),
          /** Share of the budget, as a percentage. Falls back to an even share. */
          pct: v.optional(v.number()),
          booked: v.boolean(),
          committed: v.optional(v.number()),
          /** Who they booked, for a booked need, when they say. The venue is captured here too. */
          vendorName: v.optional(v.string()),
          /** Which functions this need serves, by name. Omitted means all of them. */
          sessionNames: v.optional(v.array(v.string())),
        }),
      ),
    ),
};
type CreateArgs = ObjectType<typeof createArgs>;

export const create = mutation({
  args: createArgs,
  returns: v.id("events"),
  handler: async (ctx, args): Promise<Id<"events">> => {
    const userId = await requireAccount(ctx);
    const eventId = await insertEvent(ctx, userId, args);
    await clearDraft(ctx, userId);
    await track(ctx, "setup.finished", userId, { ceremonies: args.sessions?.length ?? 0 });
    await workflow.start(ctx, internal.workflows.onboardingWorkflow, { eventId });
    return eventId;
  },
});

/**
 * The wedding, its owner, its functions, its needs and their budget lines. Shared by
 * `create` and the guest demo, so a sample wedding is built exactly like a real one.
 */
export async function insertEvent(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: CreateArgs,
  extra: { demo?: boolean } = {},
): Promise<Id<"events">> {
    if (!Number.isFinite(args.totalBudget) || args.totalBudget < 0) {
      throw new ConvexError("Total budget must be a non-negative number.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.endDate)) {
      throw new ConvexError("Dates must be YYYY-MM-DD.");
    }
    if (args.endDate < args.startDate) throw new ConvexError("End date must be on or after the start date.");
    if (args.inspirationUrl && !/^https?:\/\//i.test(args.inspirationUrl)) {
      throw new ConvexError("Inspiration URL must start with http:// or https://");
    }
    const images = args.inspirationImages ?? [];
    if (images.length > MAX_INSPIRATION_IMAGES) {
      throw new ConvexError(`Up to ${MAX_INSPIRATION_IMAGES} inspiration pictures, please.`);
    }
    for (const id of images) {
      await claimUpload(ctx, id, userId);
      const file = await ctx.db.system.get("_storage", id);
      if (!file?.contentType?.startsWith("image/")) throw new ConvexError("Inspiration uploads must be pictures.");
    }

    // Nobody named in it ("our office party"): emails are signed with the account holder's own name.
    let host = args.host.trim();
    if (!host && !args.coHost.trim()) {
      const user = await ctx.db.get("users", userId);
      host = (user?.name?.trim() || nameFromEmail(user?.email) || "").split(/\s+/)[0] ?? "";
    }
    const eventId = await ctx.db.insert("events", {
      name: args.name.trim(),
      host,
      coHost: args.coHost.trim(),
      startDate: args.startDate,
      endDate: args.endDate,
      city: args.city.trim(),
      area: args.area?.trim() || undefined,
      country: args.country,
      currency: args.currency.toUpperCase(),
      totalBudget: args.totalBudget,
      // What kind of event it is; a plan made without one is a general event.
      eventType: args.eventType ?? "party",
      occasionLabel: args.occasionLabel?.trim().slice(0, 80) || undefined,
      organisation: args.organisation?.trim().slice(0, 120) || undefined,
      inspirationUrl: args.inspirationUrl,
      inspirationNotes: args.inspirationNotes?.trim().slice(0, 2000) || undefined,
      inspirationImages: images.length ? images : undefined,
      styleVibes: args.styleVibes?.filter((t) => t.trim()).slice(0, 12),
      stylePalette: args.stylePalette?.trim() || undefined,
      styleFormality: args.styleFormality,
      guestEstimate: Number.isFinite(args.guestEstimate) && (args.guestEstimate ?? 0) > 0 ? Math.floor(args.guestEstimate!) : undefined,
      helpWith: args.helpWith?.filter((k) => HELP_WITH_KEYS.has(k)).slice(0, HELP_WITH_KEYS.size),
      helpNotes: args.helpNotes?.trim().slice(0, 1000) || undefined,
      createdBy: userId,
      // New events hold every email for the host to read first; samples send (simulated) at once.
      ...(extra.demo ? { demo: true } : { sendMode: "review" as const }),
    });
    // Onboarding pictures start the wedding's own Space.
    const created = await ctx.db.get(eventId);
    if (created) await adopt(ctx, created);
    await ctx.db.insert("members", { eventId, userId, role: "owner" });

    // The parts the family set out, or their kind of event's defaults.
    const totalDays = daysBetween(args.startDate, args.endDate);
    let plan: {
      name: string; dayIndex: number; date: string; weight: number; guestCount: number; description?: string;
      key?: string; significance?: string; rites?: { name: string; gloss: string }[];
      kind?: string;
      startTime?: string;
    }[];
    if (args.sessions && args.sessions.length > 0) {
      plan = args.sessions.slice(0, 20).map((e) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new ConvexError("Each function needs a date as YYYY-MM-DD.");
        if (!Number.isFinite(e.guestCount) || e.guestCount < 0) throw new ConvexError("Guest counts must be zero or more.");
        if (!Number.isFinite(e.budget) || e.budget < 0) throw new ConvexError("Function budgets must be zero or more.");
        const dayIndex = e.dayIndex ?? daysBetween(args.startDate, e.date);
        return {
          name: e.name.trim() || "Celebration",
          dayIndex: Math.max(0, Math.min(totalDays, Math.floor(dayIndex))),
          date: e.date,
          // Budgets are weights here, so a couple's split is honoured exactly and
          // still adds up to the total even when their numbers do not.
          weight: e.budget,
          guestCount: Math.floor(e.guestCount),
          key: e.key?.slice(0, 60),
          significance: e.significance?.trim().slice(0, 600) || undefined,
          rites: e.rites?.slice(0, 10),
          kind: e.kind && (CEREMONY_KINDS as readonly string[]).includes(e.kind) ? e.kind : undefined,
          startTime: e.startTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.startTime) ? e.startTime : undefined,
        };
      });
      if (plan.every((e) => e.weight === 0)) plan = plan.map((e) => ({ ...e, weight: 1 }));
    } else {
      const tpl = sessionsFor(args.eventType);
      const dayIndexes = spreadDayIndexes(tpl.length, totalDays);
      plan = tpl.map((e, i) => ({
        ...e,
        dayIndex: dayIndexes[i],
        date: addDays(args.startDate, dayIndexes[i]),
      }));
    }
    // Safety net: whatever order the client sent, ceremonies are saved by day, keeping the given order within a day.
    plan = plan.map((e, i) => ({ e, i })).sort((a, b) => a.e.dayIndex - b.e.dayIndex || a.i - b.i).map((x) => x.e);
    const sessionBudgets = splitByWeights(args.totalBudget, plan.map((e) => e.weight));
    const sessionIds: Id<"sessions">[] = [];
    const sessionNames: string[] = [];
    for (let i = 0; i < plan.length; i++) {
      const e = plan[i];
      const id = await ctx.db.insert("sessions", {
        eventId,
        name: e.name,
        dayIndex: e.dayIndex,
        date: e.date,
        guestCount: e.guestCount,
        budget: sessionBudgets[i],
        color: SESSION_COLORS[i % SESSION_COLORS.length],
        order: i,
        description: e.description,
        key: e.key,
        significance: e.significance,
        rites: e.rites?.length ? e.rites : undefined,
        kind: e.kind ?? guessKind(e.name),
        ...(e.startTime ? { startTime: e.startTime } : {}),
      });
      sessionIds.push(id);
      sessionNames.push(e.name);
    }

    // Default vendor needs, with their budgets drawn from the functions they serve
    // so needs, functions and the wedding total all add up to the same number.
    const chosen = args.needs && args.needs.length > 0 ? args.needs.slice(0, 40) : undefined;
    const startSlots: Array<{ category: string; title: string; pct: number; sessionNames?: string[]; booked?: boolean; committed?: number; vendorName?: string }> =
      chosen
        ? chosen.map((n) => ({
            category: n.category.trim().slice(0, 60) || "Other",
            title: n.title.trim().slice(0, 80) || n.category.trim().slice(0, 80) || "A vendor",
            pct: Number.isFinite(n.pct) && (n.pct ?? 0) > 0 ? (n.pct as number) : 100 / chosen.length,
            sessionNames: n.sessionNames,
            booked: n.booked,
            committed: Number.isFinite(n.committed) && (n.committed ?? 0) > 0 ? n.committed : undefined,
            vendorName: n.booked ? n.vendorName?.trim().slice(0, 120) || undefined : undefined,
          }))
        : slotsFor(args.eventType);
    const slotPlans = startSlots.map((slot) => {
      const matchedIndexes = slot.sessionNames
        ? sessionNames.map((n, i) => (slot.sessionNames!.includes(n) ? i : -1)).filter((i) => i >= 0)
        : sessionIds.map((_, i) => i);
      const sessionIndexes = matchedIndexes.length > 0 ? matchedIndexes : sessionIds.map((_, i) => i);
      return { pct: slot.pct, sessionIndexes };
    });
    const slotBudgets = allocateSlotBudgets(sessionBudgets, slotPlans);

    for (let i = 0; i < startSlots.length; i++) {
      const slot = startSlots[i];
      const { sessionIndexes } = slotPlans[i];
      const budget = slotBudgets[i];
      const slotId = await ctx.db.insert("vendorSlots", {
        eventId,
        sessionIds: sessionIndexes.map((idx) => sessionIds[idx]),
        category: slot.category,
        title: slot.title,
        budget,
        // Something they have already booked is not something to go looking for.
        status: slot.booked ? "booked" : "research",
      });
      // A booked need they named (their venue, say) carries that vendor, so nobody
      // goes looking for, or emails, that kind of vendor on their behalf.
      if (slot.booked && slot.vendorName) {
        const vendorId = await ctx.db.insert("vendors", {
          eventId, slotId, name: slot.vendorName, category: slot.category,
          packages: [], highlights: [], sourceUrls: [], reviewHighlights: [], pagesRead: [],
          shortlisted: true, scrapedAt: Date.now(),
        });
        await ctx.db.patch(slotId, { bookedVendorId: vendorId });
      }
      await ctx.db.insert("budgetLines", {
        eventId,
        slotId,
        // A need that serves exactly one function is attributed to it, instead of
        // being split evenly across guesses when the budget is summarised.
        sessionId: sessionIndexes.length === 1 ? sessionIds[sessionIndexes[0]] : undefined,
        label: slot.title,
        planned: budget,
        // Money already spent is money already spent: the budget bar tells the truth
        // from the first screen rather than pretending nothing is committed.
        committed: slot.committed ?? 0,
        paid: 0,
      });
    }

    await logActivity(ctx, {
      eventId,
      actorUserId: userId,
      type: "event_created",
      text: `created "${args.name.trim()}" (${plan.length} ${partWord({ eventType: args.eventType ?? "party" }, plan.length !== 1)} in ${args.city.trim()}).`,
    });
    return eventId;
}

/**
 * Delete an event and everything in it: days, vendors, conversations, quotes, guests
 * and stored files. Owner only, and the name has to be typed, because it cannot be undone.
 */
export const remove = mutation({
  args: { eventId: v.id("events"), confirmName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId, "owner");
    if (args.confirmName.trim().toLowerCase() !== event.name.trim().toLowerCase()) {
      throw new ConvexError("That doesn't match the event's name, so nothing was deleted.");
    }
    await startPurge(ctx, args.eventId);
    return null;
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    patch: v.object({
      name: v.optional(v.string()),
      host: v.optional(v.string()),
      coHost: v.optional(v.string()),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      city: v.optional(v.string()),
      area: v.optional(v.string()),
      country: v.optional(v.string()),
      currency: v.optional(v.string()),
      totalBudget: v.optional(v.number()),
      styleSummary: v.optional(v.string()),
      inspirationUrl: v.optional(v.string()),
      inspirationNotes: v.optional(v.string()),
      styleVibes: v.optional(v.array(v.string())),
      stylePalette: v.optional(v.string()),
      styleFormality: v.optional(styleFormality),
      sendMode: v.optional(sendMode),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId, "planner");
    if (args.patch.totalBudget !== undefined && (!Number.isFinite(args.patch.totalBudget) || args.patch.totalBudget < 0)) {
      throw new ConvexError("Total budget must be a non-negative number.");
    }
    await ctx.db.patch(args.eventId, args.patch);
    // A new total has to reach the functions, the needs and the budget lines,
    // or the budget bar would be measuring against a number nothing adds up to.
    if (args.patch.totalBudget !== undefined && args.patch.totalBudget !== event.totalBudget) {
      await rebalanceEventBudget(ctx, args.eventId);
    }
    return null;
  },
});

// ---- internal ---------------------------------------------------------------

export const getInternal = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.union(eventDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId);
  },
});

/** An event and its sessions, for prompt building in actions. */
export const getContext = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.union(v.object({ event: eventDoc, sessions: v.array(sessionDoc) }), v.null()),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(50)
    ).sort(byDayThenOrder);
    return { event, sessions };
  },
});

/**
 * The event's venue need, as the planning brief reads it: whether one is booked, and
 * with whom when they named it. Null when there is no venue need at all.
 */
export const venueNeed = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.union(v.object({ booked: v.boolean(), name: v.optional(v.string()) }), v.null()),
  handler: async (ctx, args) => {
    const slots = await ctx.db
      .query("vendorSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100);
    const venues = slots.filter((s) => /venue/i.test(s.category));
    if (venues.length === 0) return null;
    const booked = venues.find((s) => s.status === "booked");
    if (!booked) return { booked: false };
    const vendor = booked.bookedVendorId ? await ctx.db.get(booked.bookedVendorId) : null;
    return { booked: true, name: vendor?.name };
  },
});

export const setInbox = internalMutation({
  args: { eventId: v.id("events"), inboxId: v.string(), inboxAddress: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { inboxId: args.inboxId, inboxAddress: args.inboxAddress });
    await logActivity(ctx, {
      eventId: args.eventId,
      type: "inbox_ready",
      text: INBOX_READY_TEXT,
    });
    return null;
  },
});

export const setStyleSummary = internalMutation({
  args: { eventId: v.id("events"), styleSummary: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { styleSummary: args.styleSummary });
    await logActivity(ctx, {
      eventId: args.eventId,
      type: "note",
      text: "Style summary generated from your inspiration.",
    });
    return null;
  },
});

/**
 * Which AgentMail inboxes this deployment is holding, and whether each one is
 * still carrying real correspondence.
 *
 * The plan allows only a handful of inboxes, so `agentmail.createInbox` has to
 * decide which one to give up when a new couple needs one. An inbox that has
 * actually written to or heard from a vendor is never a candidate; an inbox
 * belonging to a wedding that never got started is.
 */
/** Which wedding each inbox belongs to, by name, for the inbox report. */
export const namesByInbox = internalQuery({
  args: {},
  returns: v.array(v.object({ inboxId: v.string(), name: v.string() })),
  handler: async (ctx) => {
    const events = await ctx.db.query("events").take(500);
    return events
      .filter((w) => Boolean(w.inboxId))
      .map((w) => ({ inboxId: w.inboxId as string, name: w.name }));
  },
});

export const inboxUsage = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      eventId: v.id("events"),
      inboxId: v.string(),
      createdAt: v.number(),
      hasTraffic: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const events = await ctx.db.query("events").take(500);
    const out = [];
    for (const event of events) {
      if (!event.inboxId) continue;
      const threads = await ctx.db
        .query("threads")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(50);
      out.push({
        eventId: event._id,
        inboxId: event.inboxId,
        createdAt: event._creationTime,
        hasTraffic: threads.some((t) => t.lastOutboundAt !== undefined || t.lastInboundAt !== undefined),
      });
    }
    return out;
  },
});

/** Forget an inbox that has been handed to another couple, so nothing points at it. */
export const clearInbox = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { inboxId: undefined, inboxAddress: undefined });
    return null;
  },
});

// ---- the generation moment ----------------------------------------------------------

export const setGeneration = internalMutation({
  args: { eventId: v.id("events"), status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { generation: args.status });
    return null;
  },
});

/** Save the first pass over a new plan: the parts' descriptions where missing. */
export const saveFirstPlan = internalMutation({
  args: {
    eventId: v.id("events"),
    ceremonies: v.array(v.object({ sessionId: v.id("sessions"), about: v.string(), todos: v.array(v.string()) })),
    wholeEvent: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.generation === "done") return null;
    for (const c of args.ceremonies) {
      const session = await ctx.db.get(c.sessionId);
      if (!session || session.eventId !== args.eventId) continue;
      if (c.about && !session.significance) await ctx.db.patch(c.sessionId, { significance: c.about });
    }
    // No pre-made to-dos (founder, 1 Nov): the host jots their own notes. The suggested ones are not saved.
    await ctx.db.patch(args.eventId, { generation: "done" });
    await track(ctx, "plan.first_pass", event.createdBy, { ms: Date.now() - event._creationTime });
    return null;
  },
});
