import type { PriceUnit, QuoteLine } from "./validators";
import { inSentence } from "./text";

/**
 * Quotes made comparable. Vendors quote per plate, all in, plus service, plus transport,
 * for a headcount of their own choosing. This reads each quote into the same unit at the
 * host's own numbers, and says what it leaves out. Pure, so it is worked out when read
 * and never goes stale.
 */

export type Basis = "per_person" | "per_piece" | "per_day" | "total";

/** How each kind of need is best compared. */
export function basisFor(category: string): Basis {
  if (/cater|food|meal|prasad/i.test(category)) return "per_person";
  if (/gift|hamper|merch/i.test(category)) return "per_piece";
  if (/accommodation|stay|transport|bus/i.test(category)) return "per_day";
  return "total";
}

export function basisLabel(basis: Basis, category = ""): string {
  if (basis === "per_person") return /cater|food|meal|prasad/i.test(category) ? "Per plate" : "Per head";
  if (basis === "per_piece") return "Per piece";
  if (basis === "per_day") return "Per day";
  return "All in";
}

type QuoteLike = {
  total: number;
  lines?: QuoteLine[];
  headcountAssumed?: number;
  taxIncluded?: boolean;
  excludes?: string[];
};

export type Comparison = {
  /** What the host would pay at their own numbers: core and fees, scaled to their headcount. */
  atYourNumbers: number;
  /** The figure in the comparison's unit, or null when the quote can't be put in it honestly. */
  perUnit: number | null;
  /** Plain warnings: "Priced for 120; you expect 150", "GST extra". */
  flags: string[];
  /** False when the lines don't add up to the quoted total, so no per-unit figure is shown. */
  linesCheck: boolean;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * One quote at the host's numbers. `units` is how many plates, pieces or days the host
 * needs (their headcount for food).
 */
export function compare(q: QuoteLike, basis: Basis, units: number): Comparison {
  const flags: string[] = [];
  const lines = (q.lines ?? []).filter((l) => !l.optional);
  const linesTotal = sum(lines.map((l) => (l.kind === "discount" ? -Math.abs(l.amount) : l.amount)));
  const linesCheck = !lines.length || Math.abs(linesTotal - q.total) <= Math.max(1, q.total * 0.02);
  if (!linesCheck) flags.push("The lines don't add up to the total; check the reply");

  // Per-unit lines scale with the host's numbers; fixed lines (service, transport) stay as they are.
  const perUnitLines = lines.filter((l) => l.unit === unitOf(basis) && l.kind !== "discount");
  const fixed = lines.filter((l) => !perUnitLines.includes(l));
  let atYourNumbers = q.total;
  if (basis !== "total" && units > 0) {
    if (perUnitLines.length) {
      const rate = sum(perUnitLines.map((l) => l.unitPrice ?? (l.quantity ? l.amount / l.quantity : l.amount)));
      atYourNumbers = rate * units + sum(fixed.map((l) => (l.kind === "discount" ? -Math.abs(l.amount) : l.amount)));
    } else if (q.headcountAssumed && q.headcountAssumed > 0) {
      // An all-in price for someone else's headcount: scale it to theirs.
      atYourNumbers = (q.total / q.headcountAssumed) * units;
    }
  }
  if (q.headcountAssumed && units > 0 && basis === "per_person" && q.headcountAssumed !== units) {
    flags.push(`Priced for ${q.headcountAssumed}; you expect ${units}`);
    // Priced for more than you need is often a minimum order. Until the vendor agrees to
    // fewer, what they asked for is what you'd pay, so it is never scaled down to look cheaper.
    if (q.headcountAssumed > units) atYourNumbers = Math.max(atYourNumbers, q.total);
  }
  if (q.taxIncluded === false) flags.push("GST extra");
  // "GST extra" already says it, so a separate "Leaves out GST" would repeat it.
  const excludes = (q.excludes ?? []).filter((x) => !(q.taxIncluded === false && /^(gst|tax(es)?)\b/i.test(x.trim())));
  for (const x of excludes.slice(0, 2)) flags.push(`Leaves out ${inSentence(x)}`);

  const perUnit = basis === "total" || units <= 0 || !linesCheck ? null : Math.round(atYourNumbers / units);
  return { atYourNumbers: Math.round(atYourNumbers), perUnit, flags, linesCheck };
}

function unitOf(basis: Basis): PriceUnit {
  return basis === "total" ? "total" : basis;
}

/** The lowest and highest figures among quotes that could be compared, or null with fewer than two. */
export function spread(values: (number | null)[]): { low: number; high: number } | null {
  const xs = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (xs.length < 2) return null;
  return { low: Math.min(...xs), high: Math.max(...xs) };
}

/**
 * How many of a need's unit the host needs: plates for the most people at the parts it serves
 * (or the event's guess before any part has a headcount), days for stays and transport.
 */
export function unitsForNeed(basis: Basis, served: Array<{ guestCount: number; date: string }>, guestEstimate?: number): number {
  if (basis === "per_day") return Math.max(1, new Set(served.map((e) => e.date)).size);
  return Math.max(0, ...served.map((e) => e.guestCount), served.length ? 0 : guestEstimate ?? 0);
}

/**
 * A verified vendor's offer at the host's numbers. Offers answer the brief per plate or piece for
 * the brief's quantity; when the headcount changes, the same rate is applied to the new one, so
 * Compare's totals, its range and the plan all move together.
 */
export function offerAtYourNumbers(o: { total: number; unit: string; quantity: number }, basis: Basis, units: number): number {
  if (basis === "total" || o.unit !== basis || o.quantity <= 0 || units <= 0 || o.quantity === units) return o.total;
  return Math.round((o.total / o.quantity) * units);
}
