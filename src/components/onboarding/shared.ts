import { splitByWeights } from "../../../convex/lib/templates";
import { ALL_NEEDS, budgetWeight, guestShare, needsFor, placeOnDays, type PlannedCeremony } from "../../../convex/lib/ceremonyPlan";
import type { CeremonyKind, VendorNeedKey } from "../../../convex/lib/vocab";
import { addDaysIso, daysBetweenIso } from "../../lib/format";

export { CURRENCIES } from "../../lib/currency";

/** One ceremony as the onboarding steps edit it, before the wedding exists. */
export type FunctionRow = {
  key: string;
  name: string;
  date: string;
  guestCount: number;
  budget: number;
  /** Off means it stays in the list but isn't planned; missing means on. */
  on?: boolean;
  /** Set for parts the kind of event offered; empty for ones they added themselves. */
  ceremonyKey?: string;
  significance?: string;
  rites?: { name: string; gloss: string }[];
  /** The vendors it calls for, as need keys (lib/vocab). */
  vendorNeeds?: VendorNeedKey[];
  kind?: CeremonyKind;
  /** Where it falls in the run of days; cleared once they pick its date by hand. */
  offset?: number;
  isDefault?: boolean;
};

export const isOn = (r: Pick<FunctionRow, "on">) => r.on !== false;

/** The feel a couple can pick from at onboarding and in settings; it shapes vendor searches. */
export const VIBES = [
  "Intimate", "Lavish", "Heritage", "Contemporary", "Indo-Western", "Royal",
  "Garden party", "By the sea", "Destination", "Pastels", "Jewel tones", "Lots of flowers",
  "Candlelit", "Understated", "Boho", "Vintage", "Full of colour", "Low-waste",
];

/** The guest-count buttons on the guests step: the number used, and how it reads. */
export const GUEST_ESTIMATES = [
  { value: 40, label: "Under 50" },
  { value: 100, label: "50 to 120" },
  { value: 150, label: "120 to 200" },
  { value: 250, label: "200 to 300" },
  { value: 400, label: "300 to 500" },
  { value: 600, label: "Over 500" },
];

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** Spread the ceremonies across the wedding's days, keeping any date they chose by hand. */
export function redate(rows: FunctionRow[], startDate: string, endDate: string): FunctionRow[] {
  if (!startDate) return rows;
  const totalDays = Math.max(0, daysBetweenIso(startDate, endDate || startDate)) + 1;
  const placed = rows.filter((r) => r.offset !== undefined);
  const days = placeOnDays(placed.map((r) => ({ offset: r.offset!, on: isOn(r) })), totalDays);
  return sortByDate(
    rows.map((r) => {
      const i = placed.indexOf(r);
      return i < 0 ? r : { ...r, date: addDaysIso(startDate, days[i]) };
    }),
  );
}

/** Earliest first; undated ones last; ties keep their current order. */
export function sortByDate(rows: FunctionRow[]): FunctionRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.date || "9999").localeCompare(b.r.date || "9999") || a.i - b.i)
    .map((x) => x.r);
}

/** Put a ceremony on a chosen day, after anything already on that day. */
export function moveToDate(rows: FunctionRow[], key: string, date: string): FunctionRow[] {
  const row = rows.find((r) => r.key === key);
  if (!row) return rows;
  const rest = rows.filter((r) => r.key !== key);
  const moved = { ...row, date, offset: undefined };
  const sortKey = (d: string) => d || "9999";
  let at = rest.length;
  for (let i = 0; i < rest.length; i++) {
    if (sortKey(rest[i].date) > sortKey(date)) { at = i; break; }
  }
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** The nearest ceremony that is on, on the same day, in the given direction. */
export function dayNeighbour(rows: FunctionRow[], key: string, dir: -1 | 1): FunctionRow | undefined {
  const i = rows.findIndex((r) => r.key === key);
  if (i < 0) return undefined;
  for (let j = i + dir; j >= 0 && j < rows.length; j += dir) {
    if (rows[j].date !== rows[i].date) return undefined;
    if (isOn(rows[j])) return rows[j];
  }
  return undefined;
}

/** Swap a ceremony with its neighbour on the same day. */
export function moveWithinDay(rows: FunctionRow[], key: string, dir: -1 | 1): FunctionRow[] {
  const other = dayNeighbour(rows, key, dir);
  if (!other) return rows;
  const a = rows.findIndex((r) => r.key === key);
  const b = rows.findIndex((r) => r.key === other.key);
  const next = [...rows];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Split the total across the ceremonies that are on, by what each one usually needs. */
export function reweigh(rows: FunctionRow[], total: number): FunctionRow[] {
  const on = rows.filter(isOn);
  const shares = splitByWeights(total, on.map((r) => (r.vendorNeeds?.length ? budgetWeight(r) : 30)));
  let i = 0;
  return rows.map((r) => (isOn(r) ? { ...r, budget: shares[i++] } : { ...r, budget: 0 }));
}

/** Re-split a new total in the same proportions they already have. */
export function rebalance(rows: FunctionRow[], total: number): FunctionRow[] {
  const on = rows.filter(isOn);
  const shares = splitByWeights(total, on.map((r) => Math.max(1, r.budget)));
  let i = 0;
  return rows.map((r) => (isOn(r) ? { ...r, budget: shares[i++] } : r));
}

/** Guests per ceremony from the overall estimate: everyone at the big days, fewer at the home rites. */
export function regroup(rows: FunctionRow[], estimate: number): FunctionRow[] {
  return rows.map((r) => ({
    ...r,
    guestCount: round5(estimate * (r.vendorNeeds?.length ? guestShare(r) : 1)),
  }));
}

/** The starting rows for a set of ceremonies: dated, sized and budgeted. */
export function rowsForCeremonies(ceremonies: PlannedCeremony[], startDate: string, endDate: string, total: number, estimate: number): FunctionRow[] {
  const rows: FunctionRow[] = ceremonies.map((c, i) => ({
    key: `c-${i}-${c.key}`,
    name: c.name,
    date: startDate,
    guestCount: 0,
    budget: 0,
    on: c.isDefault,
    ceremonyKey: c.key,
    significance: c.significance,
    rites: c.rites,
    vendorNeeds: c.vendorNeeds,
    kind: c.kind,
    offset: c.offset,
    isDefault: c.isDefault,
  }));
  return reweigh(regroup(redate(rows, startDate, endDate), estimate), total);
}

/** One thing to book, as the vendors step shows it. */
export type NeedRow = {
  key: string;
  category: string;
  title: string;
  pct?: number;
  sessionNames?: string[];
  /** "looking" is the default; "none" means they don't want this at all. */
  state: "looking" | "booked" | "none";
  /** What they have already spent on a booked one, when they know it. */
  committed: number | "";
  /** Who they booked, for a booked one, when they say: their venue's name, say. */
  vendorName?: string;
  /** They have typed their own title, so a new suggestion won't overwrite it. */
  renamed?: boolean;
};

/** The vendors needed for the ceremonies that are on, keeping what they already said about each. */
export function needsForRows(
  rows: FunctionRow[],
  previous: NeedRow[],
  firstTitles: Partial<Record<VendorNeedKey, string>> = {},
): NeedRow[] {
  const on = rows.filter(isOn);
  // A ceremony they added themselves starts with the three things nearly every gathering books.
  const own: VendorNeedKey[] = ["venue", "catering", "photography"];
  const needs = needsFor(on.map((r) => ({ name: r.name.trim() || "Celebration", kind: r.kind, offset: r.offset, vendorNeeds: r.vendorNeeds?.length ? r.vendorNeeds : own })));
  const byKey = new Map(previous.map((n) => [n.key, n]));
  const byTitle = new Map(previous.map((n) => [n.title.toLowerCase(), n]));
  return needs.map((n) => {
    const title = firstTitles[n.key] ?? n.title;
    const kept = byKey.get(`need-${n.key}`) ?? byTitle.get(title.toLowerCase()) ?? byTitle.get(n.title.toLowerCase());
    return {
      key: `need-${n.key}`,
      category: n.category,
      title: kept?.renamed ? kept.title : title,
      pct: n.pct,
      sessionNames: n.ceremonyNames,
      state: kept?.state ?? "looking",
      committed: kept?.committed ?? "",
      ...(kept?.vendorName ? { vendorName: kept.vendorName } : {}),
      ...(kept?.renamed ? { renamed: true } : {}),
    };
  });
}

/** Kinds of vendor not yet in the list, for adding one by hand. */
export function extraNeeds(existing: NeedRow[]): { category: string; title: string }[] {
  // Skip anything already there by title or by kind.
  const taken = new Set(existing.flatMap((n) => [n.title.toLowerCase(), n.category.toLowerCase()]));
  return ALL_NEEDS.filter((c) => !taken.has(c.category.toLowerCase()) && !taken.has(c.title.toLowerCase())).map((c) => ({ category: c.category, title: c.title }));
}
