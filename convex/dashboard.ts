import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import type { Doc, Id } from "./_generated/dataModel";
import { slotStatus, threadStatus } from "./lib/validators";
import type { Infer } from "convex/values";
import { basisFor, basisLabel, compare, spread } from "./lib/comparable";
import { isLive } from "./lib/quoteHold";
import { missingCharges, readQuote, sheetFor, type Sheet } from "./lib/standardSheet";
import { tierFor } from "./lib/marketplace";
import { bandRow, tier } from "./marketplace/listings";

/**
 * Everything the couple needs to decide, in one read.
 *
 * The point of this screen is that nobody has to open an inbox: each vendor carries
 * where it has got to, what it quoted, and whether it said yes to the actual dates,
 * and each need carries its own cheapest and dearest. Because it is a Convex query,
 * a reply that lands while the couple is looking moves the board under them.
 */

const vendorRow = v.object({
  vendorId: v.id("vendors"),
  threadId: v.union(v.id("threads"), v.null()),
  name: v.string(),
  email: v.optional(v.string()),
  website: v.optional(v.string()),
  rating: v.optional(v.number()),
  reviewCount: v.optional(v.number()),
  isTopPick: v.optional(v.boolean()),
  /** Hearted by the couple on the Vendors page. */
  shortlisted: v.optional(v.boolean()),
  /** Where this one has got to, in the couple's words. */
  state: v.union(
    v.literal("not_contacted"),
    v.literal("emailed"),
    v.literal("chased"),
    v.literal("replied"),
    v.literal("quoted"),
    v.literal("declined"),
    v.literal("booked"),
    v.literal("needs_attention"),
  ),
  threadStatusRaw: v.union(threadStatus, v.null()),
  followUpCount: v.number(),
  lastOutboundAt: v.optional(v.number()),
  lastInboundAt: v.optional(v.number()),
  /** Hours between PlusOne writing and them answering. */
  repliedInHours: v.union(v.number(), v.null()),
  quote: v.union(
    v.object({
      total: v.number(),
      deposit: v.optional(v.number()),
      currency: v.string(),
      includes: v.array(v.string()),
      excludes: v.array(v.string()),
      redFlags: v.array(v.string()),
      validUntil: v.optional(v.string()),
      summary: v.string(),
      deltaVsBudget: v.number(),
      /** The quote in the need's comparison unit, at the host's numbers (lib/comparable). */
      perUnit: v.union(v.number(), v.null()),
      atYourNumbers: v.number(),
      flags: v.array(v.string()),
      lines: v.array(v.object({ item: v.string(), amount: v.number(), optional: v.boolean() })),
      /** What the quote says about each line of the need's standard sheet (lib/standardSheet). */
      readings: v.array(
        v.object({
          key: v.string(),
          status: v.union(v.literal("priced"), v.literal("included"), v.literal("extra"), v.literal("unstated")),
          amount: v.optional(v.number()),
        }),
      ),
      /** Charges it leaves unsaid, against the sheet and the other quotes for the same need. */
      missing: v.array(v.object({ key: v.string(), label: v.string(), message: v.string() })),
      /** Where the quote sits in its city's range (Value, Standard, Premium, Luxury); null with no range. It places a price, never judges it. */
      tier: v.union(tier, v.null()),
    }),
    v.null(),
  ),
  availableOnDates: v.union(v.literal("yes"), v.literal("no"), v.literal("unclear"), v.null()),
  availabilityNote: v.optional(v.string()),
  /** True when the vendor turned the couple down, rather than the couple passing on them. */
  theyDeclined: v.boolean(),
});

type VendorRow = Infer<typeof vendorRow>;

/** The parts of a comparison the board shows. */
function comparison(...args: Parameters<typeof compare>) {
  const { perUnit, atYourNumbers, flags } = compare(...args);
  return { perUnit, atYourNumbers, flags };
}

/** Where a quote sits in its city's range, in the need's unit: the total for "all in" needs, per plate or piece for the rest. */
function placeInBand(quote: Doc<"quotes">, ...[basis, units, band]: [Parameters<typeof compare>[1], number, Doc<"priceBands"> | null]) {
  if (!band || band.currency !== quote.currency) return null;
  const price = basis === "total" ? quote.total : compare(quote, basis, units).perUnit;
  return price === null ? null : (tierFor(price, band) ?? null);
}

/** A quote against its need's standard sheet: each line, and what it leaves unsaid. */
function againstSheet(quote: Doc<"quotes">, sheet: Sheet | null, others: Doc<"quotes">[]) {
  if (!sheet) return { readings: [], missing: [] };
  return {
    readings: readQuote(quote, sheet).map(({ key, status, amount }) => (amount === undefined ? { key, status } : { key, status, amount })),
    missing: missingCharges(quote, sheet, others),
  };
}

export const board = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    currency: v.string(),
    totals: v.object({
      needs: v.number(),
      needsContacted: v.number(),
      needsBooked: v.number(),
      vendorsContacted: v.number(),
      vendorsReplied: v.number(),
      vendorsQuoted: v.number(),
      vendorsDeclined: v.number(),
      awaiting: v.number(),
      quotesIn: v.number(),
      /** Money actually committed: only what has been booked. */
      committed: v.number(),
      /** What the whole plan would cost taking the cheapest quote for every need. */
      cheapestSoFar: v.number(),
      totalBudget: v.number(),
      /** Median hours to a reply, across everyone who has replied. */
      medianReplyHours: v.union(v.number(), v.null()),
    }),
    needs: v.array(
      v.object({
        slotId: v.id("vendorSlots"),
        title: v.string(),
        category: v.string(),
        budget: v.number(),
        status: slotStatus,
        bookedVendorId: v.optional(v.id("vendors")),
        sessionNames: v.array(v.string()),
        cheapest: v.union(v.number(), v.null()),
        dearest: v.union(v.number(), v.null()),
        /** How this need's quotes are compared: "Per plate", "Per piece", "All in". */
        basisLabel: v.string(),
        /** How many plates, pieces or days the host needs, which the per-unit figures assume. */
        units: v.number(),
        /** Lowest and highest per-unit figures among the quotes, when two or more compare. */
        spread: v.union(v.object({ low: v.number(), high: v.number() }), v.null()),
        /** The need's standard sheet, whose lines are the rows of a line-by-line compare; null when it has none. */
        sheet: v.union(v.object({ covers: v.string(), lines: v.array(v.object({ key: v.string(), label: v.string() })) }), v.null()),
        /** The city's range for this need, in its comparison unit, from listed vendors' prices; null until there are enough. */
        market: v.union(
          v.object({ count: v.number(), p25: v.number(), p50: v.number(), p75: v.number(), p90: v.number(), currency: v.string() }),
          v.null(),
        ),
        vendors: v.array(vendorRow),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { event } = await requireMember(ctx, args.eventId);

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const sessionName = new Map(sessions.map((e) => [e._id, e.name]));

    const slots = (
      await ctx.db
        .query("vendorSlots")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(200)
    ).sort((a, b) => b.budget - a.budget);

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(400);
    const threadByVendor = new Map<Id<"vendors">, Doc<"threads">>();
    for (const t of threads) threadByVendor.set(t.vendorId, t);

    // Latest quote per vendor.
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(400);
    const quoteByVendor = new Map<Id<"vendors">, Doc<"quotes">>();
    for (const q of quotes) if (isLive(q) && !quoteByVendor.has(q.vendorId)) quoteByVendor.set(q.vendorId, q);

    // The couple's dates came back in the last inbound message of each thread.
    const availabilityByThread = new Map<
      Id<"threads">,
      { verdict: "yes" | "no" | "unclear"; note?: string; declined: boolean }
    >();
    for (const thread of threads) {
      const inbound = (
        await ctx.db
          .query("messages")
          .withIndex("by_threadId", (q) => q.eq("threadId", thread._id))
          .order("desc")
          .take(8)
      ).find((m) => m.direction === "in" && m.extracted);
      if (!inbound?.extracted) continue;
      availabilityByThread.set(thread._id, {
        verdict: inbound.extracted.availableOnDates ?? "unclear",
        note: inbound.extracted.availability,
        declined: inbound.classification === "declined",
      });
    }

    // `budgetLines.committed` follows the live quote until a need is booked, which is
    // useful on the budget bar but would be a lie on a decision screen: money is only
    // committed once the couple says yes. Only booked needs count here.
    const lines = await ctx.db
      .query("budgetLines")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(200);
    const committedBySlot = new Map<Id<"vendorSlots">, number>();
    for (const l of lines) if (l.slotId) committedBySlot.set(l.slotId, l.committed);
    let committed = 0;
    let cheapestSoFar = 0;

    const replyHours: number[] = [];
    let vendorsContacted = 0;
    let vendorsReplied = 0;
    let vendorsQuoted = 0;
    let vendorsDeclined = 0;
    let awaiting = 0;

    const needs = [];
    for (const slot of slots) {
      const vendors = await ctx.db
        .query("vendors")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .take(50);

      // The comparison unit and how many of it the host needs: plates for the people at the
      // functions this need serves, pieces for gifts, days for stays and transport.
      const basis = basisFor(slot.category);
      const served = sessions.filter((e) => slot.sessionIds.includes(e._id));
      const people = Math.max(0, ...served.map((e) => e.guestCount), served.length ? 0 : event.guestEstimate ?? 0);
      const units = basis === "per_day" ? Math.max(1, new Set(served.map((e) => e.date)).size) : people;
      const sheet = sheetFor(slot.category);
      // A sample event sees ranges that count the sample vendors; a real family only real prices.
      const band = await bandRow(ctx, slot.category, basis, event.city, event.demo === true);
      const slotQuotes = vendors.map((vendor) => quoteByVendor.get(vendor._id)).filter((q): q is Doc<"quotes"> => !!q);

      const rows: VendorRow[] = [];
      for (const vendor of vendors) {
        const thread = threadByVendor.get(vendor._id) ?? null;
        const quote = quoteByVendor.get(vendor._id) ?? null;
        const booked = slot.bookedVendorId === vendor._id;

        // One word for where this vendor has got to, which is what the couple reads.
        const state = booked
          ? ("booked" as const)
          : thread === null || thread.status === "draft"
            ? ("not_contacted" as const)
            : thread.status === "declined"
              ? ("declined" as const)
              : thread.status === "needs_attention"
                ? ("needs_attention" as const)
                : quote !== null || thread.status === "quoted"
                  ? ("quoted" as const)
                  : thread.status === "replied"
                    ? ("replied" as const)
                    : thread.followUpCount > 0
                      ? ("chased" as const)
                      : ("emailed" as const);

        const repliedInHours =
          thread?.lastInboundAt && thread.lastOutboundAt && thread.lastInboundAt > thread.lastOutboundAt
            ? Math.round(((thread.lastInboundAt - thread.lastOutboundAt) / 3_600_000) * 10) / 10
            : null;
        if (repliedInHours !== null) replyHours.push(repliedInHours);

        if (state !== "not_contacted") vendorsContacted += 1;
        if (state === "replied" || state === "quoted" || state === "booked") vendorsReplied += 1;
        if (quote !== null) vendorsQuoted += 1;
        if (state === "declined") vendorsDeclined += 1;
        if (state === "emailed" || state === "chased") awaiting += 1;

        const availability = thread ? (availabilityByThread.get(thread._id) ?? null) : null;

        rows.push({
          vendorId: vendor._id,
          threadId: thread?._id ?? null,
          name: vendor.name,
          email: vendor.email,
          website: vendor.website,
          rating: vendor.rating,
          reviewCount: vendor.reviewCount,
          isTopPick: vendor.isTopPick,
          shortlisted: vendor.shortlisted,
          state,
          threadStatusRaw: thread?.status ?? null,
          followUpCount: thread?.followUpCount ?? 0,
          lastOutboundAt: thread?.lastOutboundAt,
          lastInboundAt: thread?.lastInboundAt,
          repliedInHours,
          quote: quote
            ? {
                total: quote.total,
                deposit: quote.deposit,
                currency: quote.currency,
                includes: quote.includes,
                excludes: quote.excludes,
                redFlags: quote.redFlags,
                validUntil: quote.validUntil,
                summary: quote.summary,
                deltaVsBudget: quote.total - slot.budget,
                ...comparison(quote, basis, units),
                tier: placeInBand(quote, basis, units, band),
                lines: (quote.lines ?? []).slice(0, 12).map((l) => ({ item: l.item, amount: l.amount, optional: Boolean(l.optional) })),
                ...againstSheet(quote, sheet, slotQuotes.filter((o) => o._id !== quote._id)),
              }
            : null,
          availableOnDates: availability?.verdict ?? null,
          availabilityNote: availability?.note,
          theyDeclined: availability?.declined ?? false,
        });
      }

      // A booked vendor first, then whoever quoted, cheapest first, then the rest.
      const rank = (r: VendorRow) =>
        r.state === "booked" ? 0 : r.quote ? 1 : r.state === "replied" ? 2 : r.state === "declined" ? 4 : 3;
      rows.sort((a, b) => rank(a) - rank(b) || (a.quote?.total ?? Infinity) - (b.quote?.total ?? Infinity));

      const totals = rows
        .filter((r) => r.state !== "declined")
        .map((r) => r.quote?.total)
        .filter((t): t is number => t !== undefined);
      const bookedHere = slot.status === "booked" ? (committedBySlot.get(slot._id) ?? 0) : 0;
      committed += bookedHere;
      cheapestSoFar += bookedHere > 0 ? bookedHere : totals.length ? Math.min(...totals) : 0;
      needs.push({
        slotId: slot._id,
        title: slot.title,
        category: slot.category,
        budget: slot.budget,
        status: slot.status,
        bookedVendorId: slot.bookedVendorId,
        sessionNames: slot.sessionIds.map((id) => sessionName.get(id)).filter((n): n is string => !!n),
        cheapest: totals.length ? Math.min(...totals) : null,
        dearest: totals.length ? Math.max(...totals) : null,
        basisLabel: basisLabel(basis, slot.category),
        units,
        spread: spread(rows.filter((r) => r.state !== "declined").map((r) => r.quote?.perUnit ?? null)),
        sheet: sheet && { covers: sheet.covers, lines: sheet.lines.map(({ key, label }) => ({ key, label })) },
        market: band && band.currency === event.currency ? { count: band.count, p25: band.p25, p50: band.p50, p75: band.p75, p90: band.p90, currency: band.currency } : null,
        vendors: rows,
      });
    }

    const sortedHours = replyHours.slice().sort((a, b) => a - b);
    const medianReplyHours = sortedHours.length ? sortedHours[Math.floor(sortedHours.length / 2)] : null;

    return {
      currency: event.currency,
      totals: {
        needs: slots.length,
        needsContacted: slots.filter((s) => s.status !== "research").length,
        needsBooked: slots.filter((s) => s.status === "booked").length,
        vendorsContacted,
        vendorsReplied,
        vendorsQuoted,
        vendorsDeclined,
        awaiting,
        quotesIn: quoteByVendor.size,
        committed,
        cheapestSoFar,
        totalBudget: event.totalBudget,
        medianReplyHours,
      },
      needs,
    };
  },
});
