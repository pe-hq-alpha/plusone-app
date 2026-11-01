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

/** The kinds of work that read as a milestone for one need, rather than one line per vendor. */
const MILESTONE = new Set<Doc<"activity">["type"]>(["vendor_found", "inquiry_sent", "vendor_replied", "quote_received", "follow_up_sent", "booked"]);

/**
 * One need's milestone, in the need's own name (the host may call it "Biryani place"),
 * with no vendor named; without a need, the same milestone in general words.
 */
export function milestone(type: Doc<"activity">["type"], n: number, slot?: Pick<Doc<"vendorSlots">, "title">): string | undefined {
  const forNeed = slot ? ` for your ${lower(slot.title)}` : "";
  switch (type) {
    case "vendor_found":
      return slot ? `Found ${count(n, "option")}${forNeed}` : "Found vendors to consider";
    case "inquiry_sent":
      return `Wrote to ${count(n, "vendor")}${forNeed}`;
    case "vendor_replied":
      return `${count(n, "reply", "replies")} in${forNeed}`;
    case "quote_received":
      return `${count(n, "quote")} in${forNeed}`;
    case "follow_up_sent":
      return `Followed up with ${n === 1 ? "a vendor" : "vendors"} who went quiet${slot ? ` about your ${lower(slot.title)}` : ""}`;
    case "booked":
      return slot ? `${slot.title} booked` : "A vendor booked";
    default:
      return undefined;
  }
}

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

    // Done: milestones, never vendors' names. A need's finds, letters, replies and quotes
    // each read as one line ("Found 6 options for your caterer"); the names are a tap away.
    // A free-text line that names a vendor stays on the History page; the route keeps to milestones.
    const vendorNames = (await ctx.db.query("vendors").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(300))
      .map((v) => v.name.trim())
      .filter((n) => n.length >= 3);
    const namesVendor = (text: string) => vendorNames.some((n) => text.includes(n));
    const work = activity.filter((a) => isAppActor(a) && !NOT_WORK.has(a.type) && (MILESTONE.has(a.type) || !namesVendor(a.text)));
    const threadById = new Map(threads.map((t) => [t._id, t]));
    const slotOf = (a: Doc<"activity">) => {
      const id = a.refs?.slotId ?? (a.refs?.threadId ? threadById.get(a.refs.threadId)?.slotId : undefined);
      return id ? slotById.get(id) : undefined;
    };
    const groups = new Map<string, { a: Doc<"activity">; slot?: Doc<"vendorSlots">; n: number }>();
    for (const a of work) {
      const slot = slotOf(a);
      const key = MILESTONE.has(a.type) ? `${a.type}:${slot?._id ?? "any"}` : a._id;
      const g = groups.get(key);
      if (g) g.n += 1;
      else groups.set(key, { a, slot, n: 1 });
    }
    const top = [...groups.values()].slice(0, 4);
    const found = await Promise.all(
      top.map(({ a, slot }) =>
        a.type === "vendor_found" && slot ? ctx.db.query("vendors").withIndex("by_slotId", (q) => q.eq("slotId", slot._id)).take(100).then((r) => r.length) : Promise.resolve(0),
      ),
    );
    const done = top.map(({ a, slot, n }, i) => ({
      title: milestone(a.type, Math.max(n, found[i]), slot) ?? clip(a.text, 170),
      detail: "",
      href: slot ? `vendors/${slot._id}` : a.refs?.threadId ? `inbox/${a.refs.threadId}` : undefined,
      at: a._creationTime,
    }));

    // Under way: searches still reading websites, then vendors written to and not yet heard from.
    const now: { title: string; detail: string; href?: string; at?: number }[] = [];
    for (const run of runs.filter((r) => r.status === "running").slice(0, 2)) {
      const slot = slotById.get(run.slotId);
      if (!slot) continue;
      now.push({ title: `Looking for ${needPlural(slot.category)} for your ${lower(slot.title)}`, detail: run.step.startsWith("Found ") ? "Reading vendors' websites for prices and contacts" : run.step, href: `vendors/${slot._id}`, at: run.startedAt });
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
