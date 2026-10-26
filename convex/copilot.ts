import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { clip, inSentence } from "./lib/text";
import { isAppActor } from "./lib/brand";
import { bookAheadWeeks } from "./lib/vendorNeeds";
import { needPlural } from "./lib/searchTerms";
import { weekItem, weekItems } from "./thisWeek";

/**
 * The co-pilot's route for one event, as the Today screen draws it: what PlusOne has done,
 * what it is doing right now, what is waiting on the hosts, and what it will pick up next.
 * Read straight from the plan, like This week, so it is instant and never disagrees with
 * the pages it links to.
 */

const DAY = 86_400_000;
const stop = v.object({ title: v.string(), detail: v.string(), href: v.optional(v.string()), at: v.optional(v.number()) });

/** The app's own work is what shows as done; a person's edits stay on the History page. */
const NOT_WORK = new Set<Doc<"activity">["type"]>(["event_created", "research_started", "guest_rsvp", "member_joined"]);

const lower = inSentence;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const route = query({
  args: { eventId: v.id("events"), today: v.string() },
  returns: v.object({
    done: v.array(stop),
    now: v.array(stop),
    yours: v.array(weekItem),
    next: v.array(stop),
    booked: v.number(),
    needs: v.number(),
  }),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId);
    const today = Date.parse(args.today);
    const [activity, slots, runs, threads, yours] = await Promise.all([
      ctx.db.query("activity").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).order("desc").take(40),
      ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(100),
      ctx.db.query("researchRuns").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).order("desc").take(60),
      ctx.db.query("threads").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(300),
      weekItems(ctx, event, args.today, 4),
    ]);
    const slotById = new Map(slots.map((s) => [s._id, s]));
    const slotHref = (id?: Doc<"vendorSlots">["_id"]) => (id && slotById.has(id) ? `vendors/${id}` : undefined);

    const done = activity
      .filter((a) => isAppActor(a) && !NOT_WORK.has(a.type))
      .slice(0, 4)
      .map((a) => ({ title: clip(a.text, 170), detail: "", href: a.refs?.threadId ? `inbox/${a.refs.threadId}` : slotHref(a.refs?.slotId), at: a._creationTime }));

    // Under way: searches still reading websites, then vendors written to and not yet heard from.
    const now: { title: string; detail: string; href?: string; at?: number }[] = [];
    for (const run of runs.filter((r) => r.status === "running").slice(0, 2)) {
      const slot = slotById.get(run.slotId);
      if (!slot) continue;
      now.push({ title: `Looking for ${needPlural(slot.category)} for your ${lower(slot.title)}`, detail: run.step, href: `vendors/${slot._id}`, at: run.startedAt });
    }
    const silent = new Map<string, { slot: Doc<"vendorSlots">; n: number; last: number }>();
    for (const t of threads) {
      if (t.status !== "sent" || t.lastInboundAt) continue;
      const slot = slotById.get(t.slotId);
      if (!slot || slot.status === "booked") continue;
      const entry = silent.get(slot._id) ?? { slot, n: 0, last: 0 };
      entry.n += 1;
      entry.last = Math.max(entry.last, t.lastOutboundAt ?? 0);
      silent.set(slot._id, entry);
    }
    for (const { slot, n, last } of [...silent.values()].sort((a, b) => b.n - a.n).slice(0, 3)) {
      const days = last && !Number.isNaN(today) ? Math.max(0, Math.floor((today - last) / DAY)) : undefined;
      now.push({
        title: `Waiting on ${n === 1 ? "a reply" : `${n} replies`} for your ${lower(slot.title)}`,
        detail: days === undefined ? "Replies are read as they arrive." : days === 0 ? "Written to today; replies are read as they arrive." : `Written to ${count(days, "day")} ago; a polite nudge goes after three days of quiet.`,
        href: `vendors/${slot._id}`,
      });
    }

    // Next: needs nobody has started on yet, the ones usually booked furthest ahead first.
    const started = new Set(runs.map((r) => r.slotId));
    const next = slots
      .filter((s) => s.status === "research" && !started.has(s._id))
      .map((s) => ({ s, ahead: bookAheadWeeks(s.category, event.eventType ?? "party") }))
      .sort((a, b) => (b.ahead ?? 0) - (a.ahead ?? 0))
      .slice(0, 3)
      .map(({ s, ahead }) => ({
        title: `Find your ${lower(s.title)}`,
        detail: ahead ? `Usually booked about ${count(ahead, "week")} ahead.` : "Whenever you're ready.",
        href: `vendors/${s._id}`,
      }));

    return { done, now, yours, next, booked: slots.filter((s) => s.status === "booked").length, needs: slots.length };
  },
});
