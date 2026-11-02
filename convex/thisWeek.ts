import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { HELP_WITH } from "./lib/helpWith";
import { isWedding, partWord, peopleWord } from "./lib/occasion";
import { isLive } from "./lib/quoteHold";
import { offersForEvent } from "./marketplace/offers";
import { clip, formatMoney, inSentence } from "./lib/text";
import { bookAheadWeeks } from "./lib/vendorNeeds";
import { basisFor, compare, offerAtYourNumbers, unitsForNeed } from "./lib/comparable";

/**
 * What is waiting on the hosts, read straight from the plan: the "Over to you" items in
 * Today's "Where things stand" (copilot.route). Nothing here is guessed by a model, so
 * the list is instant, free and always agrees with what the rest of the page shows. The
 * caller passes today's date, which keeps this a pure read of the plan.
 */

export const weekKind = v.union(v.literal("reply"), v.literal("choose"), v.literal("book"), v.literal("rsvp"), v.literal("times"));
export const weekItem = v.object({ kind: weekKind, title: v.string(), detail: v.string(), href: v.string(), hrefLabel: v.string() });
export type WeekItem = { kind: "reply" | "choose" | "book" | "rsvp" | "times"; title: string; detail: string; href: string; hrefLabel: string };

const DAY = 86_400_000;
const lower = inSentence;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The things worth doing now for one event, best first; shared with the co-pilot's route. */
export async function weekItems(ctx: QueryCtx, event: Doc<"events">, today: string, max = 3): Promise<WeekItem[]> {
  const args = { eventId: event._id };
  const now = Date.parse(today);
  if (Number.isNaN(now)) return [];
  const weeksLeft = Math.floor((Date.parse(event.startDate) - now) / (7 * DAY));
  if (weeksLeft < 0) return [];

  const [slots, threads, quotes, sessions, guests] = await Promise.all([
    ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(100),
    ctx.db.query("threads").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(300),
    ctx.db.query("quotes").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(300),
    ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(60),
    ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(2000),
  ]);

  // How much each kind of task leans forward when the family asked for help with it.
  const leaning = new Set<string>(
    (event.helpWith ?? []).map((k) => HELP_WITH.find((h) => h.key === k)?.leans).filter((l): l is NonNullable<typeof l> => Boolean(l)),
  );
  const scored: { item: WeekItem; score: number }[] = [];
  const add = (item: WeekItem, score: number) => scored.push({ item, score: score + (leaning.has(item.kind) ? 15 : 0) });

  // A vendor waiting on the family: a slow answer can lose the date.
  const waiting = threads
    .filter((t) => t.pendingQuestion || t.status === "needs_attention")
    .sort((a, b) => (a.lastInboundAt ?? 0) - (b.lastInboundAt ?? 0))
    .slice(0, 5);
  for (const thread of waiting) {
    // The need, not the vendor's name: the name is one tap away, in the thread.
    const slot = await ctx.db.get("vendorSlots", thread.slotId);
    const days = thread.lastInboundAt ? Math.max(0, Math.floor((now - thread.lastInboundAt) / DAY)) : 0;
    add(
      {
        kind: "reply",
        title: slot ? `Answer a vendor about your ${lower(slot.title)}` : "Answer a vendor",
        detail: clip(thread.pendingQuestion ?? thread.attentionReason ?? "They're waiting to hear back.", 160),
        href: `inbox/${thread._id}`,
        hrefLabel: "Reply",
      },
      100 + Math.min(days, 14),
    );
  }

  // "The wedding is 6 weeks away", or "Amma's 60th is 6 weeks away".
  const whenItIs = `${isWedding(event) ? "The wedding" : event.name} is ${plural(weeksLeft, "week")} away.`;
  const person = peopleWord(event).replace(/s$/, "");

  // Two or more prices for something not yet booked (quotes and verified vendors' offers,
  // counted as Compare counts them): a choice is ready to make.
  const live = quotes.filter(isLive);
  const open = slots.filter((s) => s.status !== "booked");
  const offers = await offersForEvent(ctx, event._id);
  for (const slot of open) {
    const ins = live.filter((q) => q.slotId === slot._id);
    const offered = offers.filter((o) => o.slotId === slot._id);
    if (ins.length + offered.length < 2) continue;
    // At the host's current numbers, as Compare shows them, so a new headcount moves this range too.
    const basis = basisFor(slot.category);
    const units = unitsForNeed(basis, sessions.filter((e: Doc<"sessions">) => slot.sessionIds.includes(e._id)), event.guestEstimate);
    const totals = [...ins.map((q) => compare(q, basis, units).atYourNumbers), ...offered.map((o) => offerAtYourNumbers(o, basis, units))].sort((a, b) => a - b);
    const range = totals[0] === totals[totals.length - 1]
      ? formatMoney(totals[0], event.currency)
      : `${formatMoney(totals[0], event.currency)} to ${formatMoney(totals[totals.length - 1], event.currency)}`;
    add(
      { kind: "choose", title: `Choose your ${lower(slot.title)}`, detail: `${[ins.length ? plural(ins.length, "quote") : "", offered.length ? plural(offered.length, "offer") : ""].filter(Boolean).join(" and ")} in, ${range}.`, href: "decisions", hrefLabel: "Compare" },
      80 + ins.length,
    );
  }

  // Something that is usually secured by now and has nothing in yet.
  for (const slot of open) {
    const ahead = bookAheadWeeks(slot.category, event.eventType ?? "party");
    if (ahead === null || weeksLeft > ahead) continue;
    if (live.some((q) => q.slotId === slot._id)) continue;
    const late = ahead - weeksLeft;
    add(
      {
        kind: "book",
        title: slot.status === "contacted" ? `Follow up on ${lower(slot.title)}` : `Look for ${lower(slot.title)}`,
        detail: `Usually secured about ${ahead} weeks out. ${whenItIs}`,
        href: `vendors/${slot._id}`,
        hrefLabel: "Open",
      },
      60 + Math.min(late, 30),
    );
  }

  // Guests still to answer, once the event is close enough for it to matter.
  const pending = guests.filter((g) => g.rsvp === "pending").length;
  if (pending && weeksLeft <= 8) {
    add(
      { kind: "rsvp", title: `${plural(pending, person)} still to reply`, detail: whenItIs, href: "guests", hrefLabel: "Open guests" },
      50 + Math.min(pending, 30),
    );
  }

  // Sessions in the next few weeks with no start time.
  const untimed = sessions.filter((e: Doc<"sessions">) => !e.startTime && (Date.parse(e.date) - now) / DAY <= 56);
  if (untimed.length) {
    const first = untimed[0];
    add(
      {
        kind: "times",
        title: untimed.length === 1 ? `Set a time for ${first.name}` : `Set times for ${plural(untimed.length, partWord(event), partWord(event, true))}`,
        detail: untimed.length === 1 ? `It's on ${first.date} and has no start time yet.` : `${untimed.map((e) => e.name).slice(0, 3).join(", ")} have no start time yet.`,
        href: `sessions/${first._id}`,
        hrefLabel: "Open",
      },
      40,
    );
  }

  // Best first, and no more than two of any one kind.
  const out: WeekItem[] = [];
  const perKind = new Map<string, number>();
  for (const { item } of scored.sort((a, b) => b.score - a.score)) {
    const n = perKind.get(item.kind) ?? 0;
    if (n >= 2) continue;
    perKind.set(item.kind, n + 1);
    out.push(item);
    if (out.length === max) break;
  }
  return out;
}
