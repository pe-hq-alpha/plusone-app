/**
 * "The day, part by part": the pure logic behind the plan's main view and its
 * read-only copies (the printable plan, the event website, the RSVP page). No React
 * and no Convex imports, so it is tested on its own.
 *
 * - The parts of an event are grouped by day and put in time order within it.
 * - Each part's vendor needs read as one of four states: Booked, Compare, Waiting, Next.
 * - A part's node on the line is done when all its needs are booked, under way when any
 *   has moved, and up next otherwise.
 */
import { money } from "./format";

// ---------------------------------------------------------------- order and days

/** Anything with a date that can sit on the plan: a part, or its public copy. */
export type Datable = { date: string; dayIndex?: number; order?: number; startTime?: string };

/**
 * By day, then by start time, then by the order the hosts gave it. A part without a
 * time goes after the timed ones on its day, in its saved order.
 */
export function inTimeOrder(a: Datable, b: Datable): number {
  const day = (a.dayIndex !== undefined && b.dayIndex !== undefined ? a.dayIndex - b.dayIndex : 0) || a.date.localeCompare(b.date);
  if (day) return day;
  const ta = a.startTime || "99:99";
  const tb = b.startTime || "99:99";
  return ta.localeCompare(tb) || (a.order ?? 0) - (b.order ?? 0);
}

export type Day<T> = { date: string; parts: T[] };

/** The days that have something on them, in order, each with its parts in time order. */
export function groupByDay<T extends Datable>(parts: readonly T[]): Day<T>[] {
  const ordered = parts.map((p, i) => ({ p, i })).sort((x, y) => inTimeOrder(x.p, y.p) || x.i - y.i).map((x) => x.p);
  const days: Day<T>[] = [];
  for (const p of ordered) {
    const last = days[days.length - 1];
    if (last && last.date === p.date) last.parts.push(p);
    else days.push({ date: p.date, parts: [p] });
  }
  return days;
}

/** "Saturday, 30 January": a day's quiet heading. */
export function dayHeading(iso: string, locale?: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

/** "18:30" as "6:30 PM", the way people say it. */
export function clock(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const hour = ((h + 11) % 12) + 1;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** The part's time chip: "From 9 AM", or "9 AM–1 PM" when it has an end. Empty without a start. */
export function timeChip(start?: string, end?: string): string {
  if (!start) return "";
  return end ? `${clock(start)}–${clock(end)}` : `From ${clock(start)}`;
}

// ---------------------------------------------------------------- needs and their states

export type NeedState = "booked" | "compare" | "waiting" | "next";

export const STATE_LABEL: Record<NeedState, string> = {
  booked: "Booked",
  compare: "Compare",
  waiting: "Waiting",
  next: "Next",
};

/** A vendor need as `slots.list` gives it (flattened). */
export type SlotLike = {
  _id: string;
  title: string;
  status: "research" | "contacted" | "quoted" | "booked";
  sessionIds: string[];
  budget: number;
  vendorsCount: number;
  bookedVendor: { name: string } | null;
  bestQuote: { total: number } | null;
  /** The budget's committed amount: a booking's price even without a quote (booked outside PlusOne). */
  committed?: number | null;
};

type VendorState = "not_contacted" | "emailed" | "chased" | "replied" | "quoted" | "declined" | "booked" | "needs_attention";

/** The same need as the decisions board (`dashboard.board`) reads it: each vendor's state and quote. */
export type BoardNeedLike = {
  slotId: string;
  cheapest: number | null;
  dearest: number | null;
  basisLabel: string;
  units: number;
  vendors: { name: string; state: VendorState; followUpCount: number; quote: { total: number; flags: string[] } | null }[];
};

export type NeedRow = {
  slotId: string;
  title: string;
  state: NeedState;
  /** The full story of the need: who, how many quotes, what is next. Shown on hover, not on the line. */
  detail: string;
  /** What the line itself says under the name, only when it matters: the booked vendor, or a question waiting on the host. */
  note?: string;
  /** What it costs: the booked amount, or the range of quotes. Null when there is nothing yet. */
  price: { low: number; high: number } | null;
  /** The basis of the price, when it needs saying: "before GST". */
  priceNote?: string;
  /** Live quotes in, which is when Compare has something to show. */
  quotes: number;
  /** What the budget sets aside for the need, shown until there is a price. */
  planned: number;
};

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One need, read into the row the part's card shows. */
export function needRow(slot: SlotLike, need?: BoardNeedLike): NeedRow {
  const vendors = need?.vendors ?? [];
  const live = vendors.filter((v) => v.state !== "declined");
  const quoted = live.filter((v) => v.quote);
  const asking = live.find((v) => v.state === "needs_attention");
  const question = asking ? `${asking.name} has a question for you` : "";
  const base = { slotId: slot._id, title: slot.title, quotes: quoted.length, planned: slot.budget };

  if (slot.status === "booked") {
    const booked = vendors.find((v) => v.state === "booked");
    const amount = booked?.quote?.total ?? slot.committed ?? slot.bestQuote?.total;
    return {
      ...base,
      state: "booked",
      detail: slot.bookedVendor ? `${slot.bookedVendor.name}, booked` : "Booked",
      note: slot.bookedVendor?.name,
      price: amount !== undefined ? { low: amount, high: amount } : null,
    };
  }

  if (quoted.length > 0 || slot.status === "quoted") {
    const low = need?.cheapest ?? slot.bestQuote?.total ?? null;
    const high = need?.dearest ?? low;
    const count = Math.max(1, quoted.length);
    const basis = need && need.basisLabel !== "All in" && need.units > 0 ? `${need.basisLabel.toLowerCase()} for your ${need.units}` : "";
    // The comparison flags a quote that leaves tax out ("GST extra"); the range is then before it.
    const taxExtra = quoted.flatMap((v) => v.quote?.flags ?? []).map((f) => /^(GST|VAT|tax) extra$/i.exec(f)?.[1]).find(Boolean);
    return {
      ...base,
      state: "compare",
      detail: [`${plural(count, "quote")} in${basis ? `, ${basis}` : ""}`, question].filter(Boolean).join(" · "),
      note: question || undefined,
      price: low !== null ? { low, high: high ?? low } : null,
      priceNote: taxExtra ? `before ${taxExtra}` : undefined,
    };
  }

  const writtenTo = live.filter((v) => v.state === "emailed" || v.state === "chased" || v.state === "replied" || v.state === "needs_attention");
  if (writtenTo.length > 0 || slot.status === "contacted") {
    const replied = writtenTo.find((v) => v.state === "replied");
    const chased = Math.max(0, ...writtenTo.map((v) => v.followUpCount));
    const who = writtenTo.length === 1 ? writtenTo[0].name : writtenTo.length > 1 ? `Written to ${plural(writtenTo.length, "vendor")}` : "Written to";
    const detail = question
      ? question
      : replied
        ? `${replied.name} replied`
        : chased > 0
          ? `${who} · followed up ${times(chased)}`
          : writtenTo.length === 1
            ? `Written to ${who}`
            : who;
    return { ...base, state: "waiting", detail, note: question || undefined, price: null };
  }

  return {
    ...base,
    state: "next",
    detail: slot.vendorsCount > 0 ? `${plural(slot.vendorsCount, "vendor")} found, not written to yet` : "To choose",
    price: null,
  };
}

/** The price as the row prints it: one amount, or a range; with none yet, what's planned for it. */
export function priceText(price: NeedRow["price"], currency: string, planned?: number): string {
  if (!price) return planned && planned > 0 ? `${money(planned, currency)} planned` : "";
  return price.low === price.high ? money(price.low, currency) : `${money(price.low, currency)} – ${money(price.high, currency)}`;
}

/**
 * Needs that serve every part of a multi-part event belong to the whole event, not to
 * one part: repeating them on every card is what made the old board crowded.
 */
export function sharedAcrossEvent<S extends { sessionIds: string[] }>(slots: readonly S[], partCount: number): S[] {
  return partCount > 1 ? slots.filter((s) => s.sessionIds.length >= partCount) : [];
}

/** A part's own needs, in the order they move: what needs you first, booked last. */
export function needsOfPart(partId: string, slots: readonly SlotLike[], needs: readonly BoardNeedLike[] | undefined, partCount: number): NeedRow[] {
  const shared = new Set(sharedAcrossEvent(slots, partCount).map((s) => s._id));
  const byId = new Map((needs ?? []).map((n) => [n.slotId, n]));
  const rank: Record<NeedState, number> = { booked: 0, compare: 1, waiting: 2, next: 3 };
  return slots
    .filter((s) => s.sessionIds.includes(partId) && !shared.has(s._id))
    .map((s) => needRow(s, byId.get(s._id)))
    .sort((a, b) => rank[a.state] - rank[b.state]);
}

// ---------------------------------------------------------------- the line

export type PartProgress = { booked: number; total: number; fraction: number; node: "done" | "now" | "next" };

/** How far a part has got: its node, and how much of the line beside it is filled. */
export function partProgress(rows: readonly NeedRow[]): PartProgress {
  const total = rows.length;
  const booked = rows.filter((r) => r.state === "booked").length;
  const node = total > 0 && booked === total ? "done" : rows.some((r) => r.state !== "next") ? "now" : "next";
  return { booked, total, fraction: total ? booked / total : 0, node };
}

/** The places a day moves through, in order, without repeats. */
export function placesOf(parts: readonly { location?: string }[]): string[] {
  const seen: string[] = [];
  for (const p of parts) {
    const place = p.location?.trim();
    if (place && !seen.includes(place)) seen.push(place);
  }
  return seen;
}
