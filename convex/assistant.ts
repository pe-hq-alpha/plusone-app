import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { chatMessageDoc } from "./lib/docs";
import { addGuestHelper, findDuplicateGuest } from "./guests";
import { addSlotHelper, updateSlotHelper } from "./slots";
import { startResearchHelper } from "./research";
import { spend } from "./rateLimits";
import { addSessionHelper } from "./sessions";
import { writeToVendorHelper } from "./agent";
import { rebalanceEventBudget } from "./lib/budget";
import { daysBetween, formatMoney } from "./lib/text";
import type { Doc, Id } from "./_generated/dataModel";
import { track } from "./analytics";
import { isLive } from "./lib/quoteHold";
import { byDayThenOrder } from "./lib/sessionOrder";
import { BRAND } from "./lib/brand";

/** The fields a couple can edit on a card, typed, so nothing else gets through. */
const proposalEdits = v.object({
  guestName: v.optional(v.string()),
  guestEmail: v.optional(v.string()),
  guestSide: v.optional(v.string()),
  guestPartySize: v.optional(v.number()),
  sessionIds: v.optional(v.array(v.id("sessions"))),
  title: v.optional(v.string()),
  category: v.optional(v.string()),
  query: v.optional(v.string()),
  amount: v.optional(v.number()),
  sessionName: v.optional(v.string()),
  date: v.optional(v.string()),
  guestCount: v.optional(v.number()),
  startTime: v.optional(v.string()),
  budgetShare: v.optional(v.number()),
  message: v.optional(v.string()),
  asWritten: v.optional(v.boolean()),
});

/**
 * The assistant that knows this particular wedding.
 *
 * It answers from the plan rather than from the open web, and it is allowed to do
 * exactly two things on the couple's behalf: start a vendor search, and add a vendor
 * need. It is deliberately given no way to send an email — outreach always goes
 * through the confirmation screen, so nothing leaves the wedding inbox that the
 * couple has not said yes to.
 */

const MAX_QUESTION = 800;
/** How many remembered lines a wedding keeps. */
const MAX_NOTES = 20;

export const history = query({
  args: { eventId: v.id("events") },
  returns: v.array(chatMessageDoc),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    // Newest first from the database, then flipped: a long conversation must still
    // show the reply that just arrived, and the cards attached to it.
    return (
      await ctx.db
        .query("chatMessages")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .order("desc")
        .take(100)
    ).reverse();
  },
});

/** Record the question, park a "thinking" reply, and let the action fill it in. */
export const ask = mutation({
  args: { eventId: v.id("events"), content: v.string(), context: v.optional(v.string()) },
  returns: v.id("chatMessages"),
  handler: async (ctx, args): Promise<Id<"chatMessages">> => {
    const { userId, event } = await requireMember(ctx, args.eventId, "planner");
    await track(ctx, "assistant.asked", userId);
    const content = args.content.trim();
    if (content.length < 2) throw new ConvexError("Ask a question first.");
    if (content.length > MAX_QUESTION) throw new ConvexError(`Keep it under ${MAX_QUESTION} characters.`);
    await spend(ctx, "assistant", event, userId);

    const context = args.context?.trim().slice(0, 120) || undefined;
    await ctx.db.insert("chatMessages", { eventId: args.eventId, userId, role: "user", content, ...(context ? { context } : {}) });
    const replyId = await ctx.db.insert("chatMessages", {
      eventId: args.eventId,
      role: "assistant",
      content: "",
      status: "thinking",
    });
    await ctx.scheduler.runAfter(0, internal.claude.answerQuestion, { eventId: args.eventId, replyId });
    return replyId;
  },
});

export const clear = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    for (const m of messages) await ctx.db.delete(m._id);
    return null;
  },
});

/**
 * Do one of the things the assistant offered, once the couple has pressed the button.
 *
 * Every write goes through the same helper the matching screen uses, so a confirmed
 * card and a filled-in form produce exactly the same result, activity entry included.
 * Nothing here re-resolves a name: the ids were fixed when the card was made, so a card
 * can never quietly point at something created since.
 */
export const runProposal = mutation({
  args: {
    eventId: v.id("events"),
    replyId: v.id("chatMessages"),
    index: v.number(),
    /** The couple's edits. Only the content fields of that kind are taken. */
    overrides: v.optional(proposalEdits),
  },
  returns: v.object({ done: v.string(), tab: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ done: string; tab?: string }> => {
    const { userId, event } = await requireMember(ctx, args.eventId, "planner");
    const reply = await ctx.db.get(args.replyId);
    if (!reply || reply.eventId !== args.eventId) throw new ConvexError("That message is gone.");
    const calls = reply.toolCalls ?? [];
    const call = calls[args.index];
    if (!call || call.name !== "propose") throw new ConvexError("That suggestion is gone.");
    if (call.status !== "proposed") throw new ConvexError("You have already handled that one.");

    const p = mergeOverrides(call.args as Record<string, unknown>, args.overrides);
    // Whatever days a card names, from the model or the couple, must be this wedding's.
    if (p.sessionIds !== undefined) {
      const ids = Array.isArray(p.sessionIds) ? (p.sessionIds as unknown[]) : [];
      for (const id of ids) {
        const sessionId = typeof id === "string" ? ctx.db.normalizeId("sessions", id) : null;
        const session = sessionId ? await ctx.db.get(sessionId) : null;
        if (!session || session.eventId !== args.eventId) throw new ConvexError("One of those days isn't part of your plan any more.");
      }
      p.sessionIds = ids;
    }
    const money = (n: number) => formatMoney(n, event.currency);
    let done: string;
    let tab: string | undefined;

    switch (p.kind) {
      case "add_guest": {
        const name = String(p.guestName ?? "").trim();
        if (!name) throw new ConvexError("This one needs a name.");
        const email = p.guestEmail ? String(p.guestEmail).trim().toLowerCase() : undefined;
        if (await findDuplicateGuest(ctx, args.eventId, name, email)) {
          throw new ConvexError(`${name} is already on your guest list.`);
        }
        await addGuestHelper(ctx, args.eventId, {
          name,
          email,
          side: p.guestSide ? String(p.guestSide) : undefined,
          partySize: Math.min(50, Math.max(1, Math.round(Number(p.guestPartySize ?? 1)) || 1)),
          sessionIds: (p.sessionIds as Id<"sessions">[] | undefined) ?? [],
        });
        done = `Added ${name} to the guest list.`;
        tab = "guests";
        break;
      }
      case "add_need": {
        const title = String(p.title ?? "").trim();
        if (!title) throw new ConvexError("This one needs a name.");
        const sessionIds =
          (p.sessionIds as Id<"sessions">[] | undefined) ??
          (
            await ctx.db
              .query("sessions")
              .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
              .take(50)
          ).map((e) => e._id);
        // A new need starts at what a typical need costs here, then everything is
        // re-split: it takes a share of the same total rather than inventing money.
        // Starting at zero would leave it at zero, because the re-split weighs each
        // need by what it already has.
        const slots = await ctx.db
          .query("vendorSlots")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
          .take(100);
        const typical = slots.length
          ? Math.round(slots.reduce((sum, s) => sum + s.budget, 0) / slots.length)
          : Math.round(event.totalBudget / 10);
        const slotId = await addSlotHelper(ctx, {
          eventId: args.eventId,
          title,
          category: String(p.category ?? title),
          sessionIds,
          budget: Math.max(1, typical),
        });
        await rebalanceEventBudget(ctx, args.eventId);
        const slot = await ctx.db.get(slotId);
        done = `Added ${title} to your vendors${slot ? `, with ${money(slot.budget)} of the budget` : ""}.`;
        tab = "vendors";
        break;
      }
      case "research": {
        const slot = await ctx.db.get(p.slotId as Id<"vendorSlots">);
        if (!slot || slot.eventId !== args.eventId) {
          throw new ConvexError(`${p.slotTitle ?? "That need"} is not part of your plan any more.`);
        }
        await startResearchHelper(ctx, { slot, event, userId, query: String(p.query ?? "") });
        done = `Searching the web for ${slot.title.toLowerCase()}.`;
        tab = "vendors";
        break;
      }
      case "set_budget": {
        const amount = Number(p.amount);
        if (!Number.isFinite(amount) || amount < 0) throw new ConvexError("That amount doesn't look right.");
        if (p.budgetTarget === "need") {
          const slot = await ctx.db.get(p.slotId as Id<"vendorSlots">);
          if (!slot || slot.eventId !== args.eventId) {
            throw new ConvexError(`${p.slotTitle ?? "That need"} is not part of your plan any more.`);
          }
          await updateSlotHelper(ctx, slot, { budget: amount });
          done = `${slot.title} is now planned at ${money(amount)}. The other needs are unchanged.`;
          tab = "vendors";
          break;
        }
        if (p.budgetTarget === "event") {
          const session = await ctx.db.get(p.sessionId as Id<"sessions">);
          if (!session || session.eventId !== args.eventId) {
            throw new ConvexError(`${p.sessionName ?? "That day"} is not part of your plan any more.`);
          }
          await setSessionBudget(ctx, session, amount);
          done = `${session.name} now takes ${money(amount)}, and the other days share the rest.`;
          tab = "";
          break;
        }
        await ctx.db.patch(args.eventId, { totalBudget: amount });
        await rebalanceEventBudget(ctx, args.eventId);
        await logActivity(ctx, {
          eventId: args.eventId,
          actorUserId: userId,
          type: "note",
          text: `set the total budget to ${money(amount)}.`,
        });
        done = `Your total is now ${money(amount)}, and every day and need has moved with it.`;
        tab = "";
        break;
      }
      case "add_session": {
        const name = String(p.sessionName ?? "").trim().slice(0, 80);
        const date = String(p.date ?? "");
        if (!name) throw new ConvexError("This one needs a name.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ConvexError("That date doesn't look right.");
        // Same reasoning as a new need: a day with no weight would stay at nothing, so
        // an unstated share becomes what an average day here takes.
        const days = await ctx.db
          .query("sessions")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
          .take(50);
        const share = Number(p.budgetShare ?? 0);
        const typicalDay = days.length
          ? Math.round(days.reduce((sum, e) => sum + e.budget, 0) / days.length)
          : Math.round(event.totalBudget / 3);
        const sessionId = await addSessionHelper(ctx, args.eventId, {
          name,
          date,
          dayIndex: daysBetween(event.startDate, date),
          budget: share > 0 ? share : Math.max(1, typicalDay),
          guestCount: Number(p.guestCount ?? 0),
        });
        const session = await ctx.db.get(sessionId);
        done = `Added ${name}${session ? ` with ${money(session.budget)} of the budget` : ""}.`;
        tab = "";
        break;
      }
      case "set_guests": {
        const count = Math.round(Number(p.guestCount));
        if (!Number.isFinite(count) || count < 1) throw new ConvexError("That number of people doesn't look right.");
        const ids = (p.sessionIds as Id<"sessions">[] | undefined) ?? [];
        if (!ids.length) throw new ConvexError("Pick at least one part of the event.");
        const names: string[] = [];
        for (const id of ids) {
          const session = await ctx.db.get(id);
          if (!session || session.eventId !== args.eventId) continue;
          await ctx.db.patch(id, { guestCount: count });
          names.push(session.name);
        }
        if (!names.length) throw new ConvexError("Those parts aren't in your plan any more.");
        const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
        await logActivity(ctx, { eventId: args.eventId, actorUserId: userId, type: "note", text: `planned ${list} for ${count} people.` });
        done = `${list} ${names.length === 1 ? "is" : "are"} now planned for ${count} people. Quotes compare at the new number.`;
        tab = "";
        break;
      }
      case "set_time": {
        const time = String(p.startTime ?? "");
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ConvexError("Times are written as HH:MM.");
        const id = ((p.sessionIds as Id<"sessions">[] | undefined) ?? [])[0];
        const session = id ? await ctx.db.get(id) : null;
        if (!session || session.eventId !== args.eventId) throw new ConvexError("That part isn't in your plan any more.");
        await ctx.db.patch(session._id, { startTime: time });
        await logActivity(ctx, { eventId: args.eventId, actorUserId: userId, type: "note", text: `moved ${session.name} to ${time}.`, refs: { sessionId: session._id } });
        done = `${session.name} now starts at ${time}.`;
        tab = "";
        break;
      }
      case "write_vendor": {
        const thread = await ctx.db.get(p.threadId as Id<"threads">);
        if (!thread || thread.eventId !== args.eventId) {
          throw new ConvexError(`That conversation with ${p.vendorName ?? "the vendor"} is gone.`);
        }
        await writeToVendorHelper(ctx, thread, String(p.message ?? ""), Boolean(p.asWritten));
        // "Golden Hour Photo Co." already ends in a full stop; don't give it two.
        const vendorName = String(p.vendorName ?? "them").replace(/\.$/, "");
        done =
          event.sendMode === "review" && !p.asWritten
            ? `Written to ${vendorName}, waiting in your inbox for you to send.`
            : `Sent to ${vendorName}.`;
        tab = "inbox";
        break;
      }
      default:
        throw new ConvexError(`${BRAND.name} can't do that one.`);
    }

    const next = [...calls];
    next[args.index] = { ...call, status: "done", result: { done, tab, at: Date.now() } };
    await ctx.db.patch(args.replyId, { toolCalls: next });
    return { done, ...(tab ? { tab } : {}) };
  },
});

/** Not now: the card stops asking, and nothing is written. */
export const dismissProposal = mutation({
  args: { eventId: v.id("events"), replyId: v.id("chatMessages"), index: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    const reply = await ctx.db.get(args.replyId);
    if (!reply || reply.eventId !== args.eventId) return null;
    const calls = reply.toolCalls ?? [];
    const call = calls[args.index];
    if (!call || call.status !== "proposed") return null;
    const next = [...calls];
    next[args.index] = { ...call, status: "dismissed", result: { done: "Dismissed.", at: Date.now() } };
    await ctx.db.patch(args.replyId, { toolCalls: next });
    return null;
  },
});

/** Only the content of a card is the couple's to change; never what it points at. */
const OVERRIDABLE: Record<string, string[]> = {
  add_guest: ["guestName", "guestEmail", "guestSide", "guestPartySize", "sessionIds"],
  add_need: ["title", "category", "sessionIds"],
  research: ["query"],
  set_budget: ["amount"],
  add_session: ["sessionName", "date", "guestCount", "budgetShare"],
  set_guests: ["guestCount", "sessionIds"],
  set_time: ["startTime"],
  write_vendor: ["message", "asWritten"],
};

function mergeOverrides(stored: Record<string, unknown>, overrides: unknown): Record<string, unknown> {
  if (!overrides || typeof overrides !== "object") return stored;
  const allowed = OVERRIDABLE[String(stored.kind)] ?? [];
  const merged = { ...stored };
  for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
    if (allowed.includes(key) && value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * One day's budget, with the rest sharing what is left in their current proportions —
 * the same arithmetic the days screen uses, so the total never drifts.
 */
async function setSessionBudget(ctx: MutationCtx, session: Doc<"sessions">, amount: number): Promise<void> {
  const event = await ctx.db.get(session.eventId);
  if (!event) return;
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_eventId", (q) => q.eq("eventId", session.eventId))
    .take(50);
  const mine = Math.min(amount, event.totalBudget);
  const others = sessions.filter((e) => e._id !== session._id);
  const othersTotal = others.reduce((sum, e) => sum + e.budget, 0);
  const left = Math.max(0, event.totalBudget - mine);
  const weights = new Map<Id<"sessions">, number>([[session._id, mine]]);
  for (const other of others) {
    weights.set(other._id, othersTotal > 0 ? (other.budget / othersTotal) * left : left / Math.max(1, others.length));
  }
  await rebalanceEventBudget(ctx, session.eventId, weights);
}

// ---- internal ---------------------------------------------------------------

/**
 * Everything the assistant is allowed to know, gathered in one read.
 *
 * Ids travel with the names they belong to, because the assistant proposes actions by
 * name ("the florist", "the Oak Barn") and those have to resolve to something real
 * before a card is ever shown.
 */
export const context = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.object({
    recent: v.array(v.object({ role: v.string(), content: v.string() })),
    /** Where the latest question was asked, if it came from the drawer on a page. */
    context: v.optional(v.string()),
    currency: v.string(),
    totalBudget: v.number(),
    sendMode: v.string(),
    committed: v.number(),
    sessions: v.array(
      v.object({
        sessionId: v.id("sessions"),
        name: v.string(),
        date: v.string(),
        dayIndex: v.number(),
        guestCount: v.number(),
        budget: v.number(),
      }),
    ),
    needs: v.array(
      v.object({
        slotId: v.id("vendorSlots"),
        title: v.string(),
        category: v.string(),
        budget: v.number(),
        status: v.string(),
        vendorCount: v.number(),
        bestQuote: v.union(v.number(), v.null()),
        sessionIds: v.array(v.id("sessions")),
      }),
    ),
    vendors: v.array(
      v.object({
        threadId: v.id("threads"),
        vendorName: v.string(),
        slotTitle: v.string(),
        state: v.string(),
        hasEmail: v.boolean(),
      }),
    ),
    guests: v.object({
      total: v.number(),
      yes: v.number(),
      pending: v.number(),
      names: v.array(v.string()),
    }),
  }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(40);
    const recent = messages
      .reverse()
      .filter((m) => m.content.trim().length > 0)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const slots = await ctx.db
      .query("vendorSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100);
    // Flat reads and an in-memory group-by: the same answer as two queries per slot,
    // in two queries for the whole wedding.
    const vendorRows = await ctx.db
      .query("vendors")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const quoteRows = (
      await ctx.db
        .query("quotes")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(400)
    ).filter(isLive);
    const threadRows = await ctx.db
      .query("threads")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(100);
    const guests = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500);
    const lines = await ctx.db
      .query("budgetLines")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);

    const vendorById = new Map(vendorRows.map((vendor) => [vendor._id, vendor]));
    const slotById = new Map(slots.map((slot) => [slot._id, slot]));
    const countBySlot = new Map<string, number>();
    for (const vendor of vendorRows) {
      if (!vendor.slotId) continue;
      countBySlot.set(vendor.slotId, (countBySlot.get(vendor.slotId) ?? 0) + 1);
    }
    const bestBySlot = new Map<string, number>();
    for (const quote of quoteRows) {
      const best = bestBySlot.get(quote.slotId);
      if (best === undefined || quote.total < best) bestBySlot.set(quote.slotId, quote.total);
    }

    return {
      recent,
      context: messages.find((m) => m.role === "user")?.context,
      currency: event.currency,
      totalBudget: event.totalBudget,
      sendMode: event.sendMode ?? "auto",
      committed: lines.reduce((sum, l) => sum + l.committed, 0),
      sessions: sessions
        .sort(byDayThenOrder)
        .map((e) => ({
          sessionId: e._id,
          name: e.name,
          date: e.date,
          dayIndex: e.dayIndex,
          guestCount: e.guestCount,
          budget: e.budget,
        })),
      needs: slots.map((slot) => ({
        slotId: slot._id,
        title: slot.title,
        category: slot.category,
        budget: slot.budget,
        status: slot.status,
        vendorCount: countBySlot.get(slot._id) ?? 0,
        bestQuote: bestBySlot.get(slot._id) ?? null,
        sessionIds: slot.sessionIds,
      })),
      vendors: threadRows.map((thread) => ({
        threadId: thread._id,
        vendorName: vendorById.get(thread.vendorId)?.name ?? "A vendor",
        slotTitle: slotById.get(thread.slotId)?.title ?? "",
        state: thread.status,
        hasEmail: Boolean(vendorById.get(thread.vendorId)?.email),
      })),
      guests: {
        total: guests.length,
        yes: guests.filter((g) => g.rsvp === "yes").length,
        pending: guests.filter((g) => g.rsvp === "pending").length,
        names: guests.slice(0, 200).map((g) => g.name),
      },
    };
  },
});

/** Keep a few things the couple said that no screen holds. Newest wins, oldest drops. */
export const remember = internalMutation({
  args: { eventId: v.id("events"), notes: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const known = event.assistantNotes ?? [];
    const seen = new Set(known.map((n) => n.trim().toLowerCase()));
    const fresh = args.notes
      .map((n) => n.trim().slice(0, 160))
      .filter((n) => n.length > 2 && !seen.has(n.toLowerCase()));
    if (fresh.length === 0) return null;
    await ctx.db.patch(args.eventId, { assistantNotes: [...known, ...fresh].slice(-MAX_NOTES) });
    return null;
  },
});

/** The couple can drop anything it remembered. */
export const forgetNote = mutation({
  args: { eventId: v.id("events"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId, "planner");
    const kept = (event.assistantNotes ?? []).filter((n) => n !== args.note);
    await ctx.db.patch(args.eventId, { assistantNotes: kept });
    return null;
  },
});

/** What the assistant has been told to remember, for the couple to see and edit. */
export const notes = query({
  args: { eventId: v.id("events") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId);
    return event.assistantNotes ?? [];
  },
});

export const finishReply = internalMutation({
  args: {
    replyId: v.id("chatMessages"),
    content: v.string(),
    status: v.union(v.literal("done"), v.literal("error")),
    toolCalls: v.optional(v.array(v.object({ name: v.string(), args: v.any(), result: v.optional(v.any()), status: v.string() }))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.replyId, {
      content: args.content,
      status: args.status,
      ...(args.toolCalls ? { toolCalls: args.toolCalls } : {}),
    });
    return null;
  },
});
