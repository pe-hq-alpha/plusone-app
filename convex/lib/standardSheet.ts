import type { Basis } from "./comparable";
import { formatMoney, inSentence } from "./text";
import type { QuoteLine } from "./validators";
import { VENDOR_NEEDS, type VendorNeedKey } from "./vocab";

/**
 * The standard sheet: for each kind of vendor, the unit a quote should be priced in and
 * the charges it should state (GST, transport, setup, overtime and the rest). Quotes are
 * read against it in Events and Partner vendors price their offers on it, so every offer
 * for a need speaks the same lines. The rules here are fixed and tested; a model only
 * reads the quote into lines, never decides what's missing.
 */

export type SheetLine = {
  key: string;
  label: string;
  kind: "tax" | "fee" | "extra";
  /**
   * "extra": usually charged on top, so a quote that never mentions it is asked about it.
   * "included": usually part of the price, so it is only raised when other quotes charge for it.
   */
  usually: "extra" | "included";
  /** How a quote's line, includes or excludes name it. No `g` flag: it is reused. */
  match: RegExp;
  /** The question when a quote never mentions it, if "Doesn't say whether … is included" reads wrong. */
  ask?: string;
};

/**
 * One way a trade charges. The price is multiplied by the quantities named in `times`
 * ("per hour" by the hours), so a price for the whole thing names none. Named SheetUnit,
 * not PriceUnit, which is already the unit a quote's line is read in (lib/validators).
 */
export type SheetUnit = {
  key: string;
  /** As it reads after a price: "per plate", "for the event". */
  label: string;
  /** The price field on Partner: "Price per plate". */
  priceLabel: string;
  times: string[];
};

/** Something a price includes, as a number a vendor taps in: hours of coverage, edited photos, kg. */
export type SheetQuantity = {
  key: string;
  /** The field on Partner and the row in Compare: "Hours of coverage". */
  label: string;
  /** A measure written after the number, plural: "hours", "kg", "weeks", "minutes". */
  unit?: string;
  presets: number[];
  /** Shown only with these ways of charging, like the days for a price per day. */
  forUnits?: string[];
  /** Filled from the brief's guests, as "For how many" is: the plates or pieces. */
  fromBrief?: boolean;
  /** When fewer is the better side, as with weeks to delivery; Compare marks the others. */
  better?: "less";
  /** How the customer's line says it, one and many, with # for the number, when the label or unit reads wrong after a number. */
  say?: [one: string, many: string];
};

export type Sheet = {
  need: VendorNeedKey;
  unit: Basis;
  /** What the main price covers, in the words a vendor fills in on Partner. */
  covers: string;
  lines: SheetLine[];
  /** How the trade charges: the main way first, then the other ways it really does, kept short so offers stay comparable. */
  units: SheetUnit[];
  /** What a price includes, as numbers. */
  quantities: SheetQuantity[];
};

const priced = (key: string, label: string, times: string[] = []): SheetUnit => ({ key, label, priceLabel: `Price ${label}`, times });
const hours = (presets: number[], label = "Hours of coverage"): SheetQuantity => ({ key: "hours", label, unit: "hours", presets });
const DAYS: SheetQuantity = { key: "days", label: "Days", unit: "days", presets: [1, 2, 3], forUnits: ["per_day"] };
const weeksToDeliver = (presets: number[]): SheetQuantity => ({
  key: "delivery",
  label: "Delivered in",
  unit: "weeks",
  presets,
  better: "less",
  say: ["delivered in # week", "delivered in # weeks"],
});
/** Event photo and video teams charge for the event, by the hour, or by the day. */
const COVERAGE_UNITS = [priced("for_event", "for the event"), priced("per_hour", "per hour", ["hours"]), priced("per_day", "per day", ["days"])];

const GST: SheetLine = { key: "gst", label: "GST", kind: "tax", usually: "extra", match: /\b(gst|[cs]gst|igst|tax(es)?)\b/i };
const TRANSPORT: SheetLine = {
  key: "transport",
  label: "Transport",
  kind: "fee",
  usually: "extra",
  match: /\b(transport(ation)?|delivery|vehicle|logistics?|conveyance|freight)\b/i,
};
const TRAVEL: SheetLine = {
  key: "travel",
  label: "Travel",
  kind: "fee",
  usually: "extra",
  match: /\b(travel(l?ing)?|transport(ation)?|conveyance|outstation|accommodation|stay)\b/i,
};
const OVERTIME: SheetLine = {
  key: "overtime",
  label: "Overtime",
  kind: "extra",
  usually: "extra",
  match: /\b(overtime|extra (hours?|time)|additional (hours?|time)|per extra hour|beyond \d+ ?(hours?|hrs?))\b/i,
  ask: "Doesn't say what an extra hour costs",
};
const SETUP: SheetLine = {
  key: "setup",
  label: "Setup and teardown",
  kind: "fee",
  usually: "extra",
  match: /\b(set ?up|install(ation)?|dismantl\w*|tear ?down|labou?r|removal)\b/i,
};

export const STANDARD_SHEETS: Partial<Record<VendorNeedKey, Sheet>> = {
  venue: {
    need: "venue",
    unit: "total",
    covers: "The hall for the hours agreed, with its chairs",
    lines: [
      GST,
      { key: "dining", label: "Dining hall and kitchen", kind: "fee", usually: "included", match: /\b(dining( hall)?|kitchen)\b/i },
      { key: "electricity", label: "Electricity and generator", kind: "fee", usually: "extra", match: /\b(eb|electricity|power|generator|genset|diesel)\b/i },
      { key: "ac", label: "Air conditioning", kind: "fee", usually: "extra", match: /\b(a\/?c|air[- ]?condition\w*)\b/i },
      { key: "cleaning", label: "Cleaning", kind: "fee", usually: "extra", match: /\b(clean\w*|housekeeping|maintenance)\b/i },
      OVERTIME,
    ],
    units: [priced("for_day", "for the day"), priced("per_session", "per session", ["sessions"])],
    quantities: [
      hours([4, 6, 8, 12], "Hours"),
      { key: "capacity", label: "Seated guests", presets: [100, 200, 300, 500] },
      { key: "sessions", label: "Sessions", presets: [1, 2, 3], forUnits: ["per_session"] },
    ],
  },
  catering: {
    need: "catering",
    unit: "per_person",
    covers: "The menu agreed, per plate, cooked and served at the venue",
    lines: [
      GST,
      {
        key: "service_staff",
        label: "Service staff",
        kind: "fee",
        usually: "extra",
        // "Service" alone counts only as an item of its own ("includes service and GST"), never inside "banana leaf service".
        match: /\b(service staff|serving staff|catering staff|waiters?|servers?|service boys|service charges?)\b|^\s*service\b(?!\s*tax)/i,
      },
      TRANSPORT,
      {
        key: "crockery",
        label: "Crockery and serving ware",
        kind: "fee",
        usually: "included",
        match: /\b(crocker\w*|cutlery|serving ware|serving vessels?|banana[- ]leaf|leaf plates?|disposables?|tableware|(?<!per )plates|glass(es)?|tumblers?)\b/i,
      },
      { key: "water", label: "Water", kind: "extra", usually: "included", match: /\bwater\b/i },
    ],
    units: [priced("per_plate", "per plate", ["count"]), priced("per_person_buffet", "per person, buffet", ["count"])],
    quantities: [
      { key: "count", label: "Plates", presets: [], fromBrief: true },
      { key: "dishes", label: "Dishes on the menu", presets: [8, 12, 16, 20], say: ["# dish", "# dishes"] },
      { key: "sweets", label: "Sweets", presets: [1, 2, 3] },
      { key: "staff", label: "Serving staff", presets: [4, 8, 12] },
    ],
  },
  decor: {
    need: "decor",
    unit: "total",
    covers: "The stage and decor agreed, with the flowers named (fresh or artificial)",
    lines: [GST, TRANSPORT, SETUP, { key: "lighting", label: "Lighting", kind: "extra", usually: "extra", match: /\b(light(s|ing)?|led)\b/i }],
    units: [priced("for_setup", "for the setup")],
    quantities: [{ key: "areas", label: "Areas decorated", presets: [1, 2, 3, 4], say: ["# area decorated", "# areas decorated"] }],
  },
  cake: {
    need: "cake",
    unit: "total",
    covers: "The cake agreed, by weight and flavour",
    lines: [
      GST,
      { ...TRANSPORT, key: "delivery", label: "Delivery" },
      { key: "topper", label: "Topper and customisation", kind: "extra", usually: "included", match: /\b(topper|custom\w*|figurines?|photo print)\b/i },
    ],
    units: [priced("per_kg", "per kg", ["weight"]), priced("for_cake", "for the cake")],
    quantities: [
      { key: "weight", label: "Weight", unit: "kg", presets: [1, 2, 3, 5] },
      { key: "tiers", label: "Tiers", presets: [1, 2, 3] },
    ],
  },
  photography: {
    need: "photography",
    unit: "total",
    covers: "Coverage for the hours agreed, with the edited photos delivered",
    lines: [
      GST,
      TRAVEL,
      OVERTIME,
      { key: "album", label: "Printed album", kind: "extra", usually: "extra", match: /\balbums?\b/i },
      { key: "drone", label: "Drone", kind: "extra", usually: "included", match: /\bdrone\b/i },
    ],
    units: COVERAGE_UNITS,
    quantities: [
      hours([4, 6, 8, 10, 12]),
      { key: "photographers", label: "Photographers", presets: [1, 2, 3] },
      { key: "photos", label: "Edited photos", presets: [100, 200, 400, 600] },
      weeksToDeliver([1, 2, 3, 4]),
      DAYS,
    ],
  },
  videography: {
    need: "videography",
    unit: "total",
    covers: "Coverage for the hours agreed, with the edited film delivered",
    lines: [
      GST,
      TRAVEL,
      OVERTIME,
      { key: "highlights", label: "Highlights film", kind: "extra", usually: "included", match: /\b(highlights?|teaser|reels?|short film)\b/i },
      { key: "drone", label: "Drone", kind: "extra", usually: "included", match: /\bdrone\b/i },
    ],
    units: COVERAGE_UNITS,
    quantities: [
      hours([4, 6, 8, 10, 12]),
      { key: "operators", label: "Camera operators", presets: [1, 2, 3] },
      { key: "film", label: "Film length", unit: "minutes", presets: [5, 10, 20, 30], say: ["#-minute film", "#-minute film"] },
      { key: "highlights", label: "Highlights film", unit: "minutes", presets: [1, 2, 3], say: ["#-minute highlights film", "#-minute highlights film"] },
      weeksToDeliver([2, 4, 6, 8]),
      DAYS,
    ],
  },
  entertainment: {
    need: "entertainment",
    unit: "total",
    covers: "The act or performance for the time agreed",
    lines: [
      GST,
      TRAVEL,
      { key: "sound", label: "Sound equipment", kind: "fee", usually: "extra", match: /\b(sound|speakers?|mics?|microphones?|audio|pa system)\b/i },
      OVERTIME,
    ],
    units: [priced("for_performance", "for the performance"), priced("per_hour", "per hour", ["hours"])],
    quantities: [hours([1, 2, 3, 4], "Hours"), { key: "performers", label: "Performers", presets: [1, 2, 4, 6] }],
  },
  gifting: {
    need: "gifting",
    unit: "per_piece",
    covers: "Each return gift, as agreed",
    lines: [
      GST,
      { key: "packing", label: "Packing and wrapping", kind: "fee", usually: "included", match: /\b(pack(ing|aging)?|wrap(ping)?|gift bags?|boxes)\b/i },
      { key: "printing", label: "Name printing", kind: "extra", usually: "extra", match: /\b(name|print(ing)?|personali[sz]\w*|tags?)\b/i },
      { ...TRANSPORT, key: "delivery", label: "Delivery" },
    ],
    units: [priced("per_piece", "per piece", ["count"])],
    quantities: [{ key: "count", label: "Pieces", presets: [], fromBrief: true }],
  },
  officiant: {
    need: "officiant",
    unit: "total",
    covers: "The priest's dakshina for the ceremony agreed",
    lines: [
      { key: "samagri", label: "Puja items", kind: "fee", usually: "extra", match: /\b(samagri|puja items|pooja items|homam items|havan|materials?)\b/i, ask: "Doesn't say whether the puja items are included" },
      TRAVEL,
      { key: "assistants", label: "Assistant priests", kind: "fee", usually: "included", match: /\b(assistants?|helpers?|additional priests?|second priest)\b/i },
    ],
    units: [priced("for_ceremony", "for the ceremony")],
    quantities: [hours([1, 2, 3], "Duration"), { key: "assistants", label: "Assistant priests", presets: [0, 1, 2] }],
  },
};

/** The sheet for a need ("catering") or for the category a slot carries ("Decor & Florals"); null when there is none. */
export function sheetFor(needOrCategory: string): Sheet | null {
  const wanted = needOrCategory.trim().toLowerCase();
  const need = (Object.keys(VENDOR_NEEDS) as VendorNeedKey[]).find(
    (k) => k === wanted || VENDOR_NEEDS[k].category.toLowerCase() === wanted,
  );
  return (need && STANDARD_SHEETS[need]) || null;
}

// ---------------------------------------------------------------- how a price is charged

/**
 * The way of charging that prices the way Compare reads the category (`Sheet.unit`): the
 * main one, except where the trade's main way is a rate Compare can't read. A cake is
 * priced per kg but compared by its total, so this is "for the cake". A city's range is
 * pooled in it, so a rate per kg never sits among whole cakes' prices, and a price saved
 * before there were ways of charging reads as it, since it was priced in Compare's unit.
 */
export function basisUnitOf(sheet: Sheet): SheetUnit {
  const scales = sheet.unit === "total" ? "" : sheet.unit === "per_day" ? "days" : "count";
  return sheet.units.find((u) => u.times.join() === scales) ?? sheet.units[0];
}

/** A way of charging on a sheet by its key. None, as on an older price, reads as the one Compare's unit is (basisUnitOf). */
export function priceUnitOf(sheet: Sheet, key?: string): SheetUnit {
  return sheet.units.find((u) => u.key === key) ?? basisUnitOf(sheet);
}

/** The quantities a vendor states for a way of charging, in the sheet's order: the days only for a price per day. */
export function quantitiesFor(sheet: Sheet, unitKey?: string): SheetQuantity[] {
  const unit = priceUnitOf(sheet, unitKey);
  return sheet.quantities.filter((q) => !q.forUnits || q.forUnits.includes(unit.key));
}

/** How many times the price is counted: the unit's quantities multiplied (1 for a price for the whole thing), or null while one is missing. */
export function timesFor(unit: SheetUnit, quantities: Record<string, number>): number | null {
  let times = 1;
  for (const key of unit.times) {
    const n = quantities[key];
    if (n === undefined || !Number.isFinite(n) || n <= 0) return null;
    times *= n;
  }
  return times;
}

/** What a price comes to: ₹2,000 per hour for 6 hours is ₹12,000. Null while a quantity it is multiplied by is missing. */
export function amountFor(price: number, unit: SheetUnit, quantities: Record<string, number>): number | null {
  const times = timesFor(unit, quantities);
  return times === null ? null : price * times;
}

function singular(word: string): string {
  if (/(sh|ch|x|ss)es$/.test(word)) return word.slice(0, -2);
  return /[^s]s$/.test(word) ? word.slice(0, -1) : word;
}

const numberText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** A quantity as the customer's line says it: "8 hours", "2 photographers", "delivered in 3 weeks". */
export function quantityText(q: Pick<SheetQuantity, "label" | "unit" | "say">, n: number): string {
  const noun = q.unit ?? q.label.toLowerCase();
  const [one, many] = q.say ?? [`# ${singular(noun)}`, `# ${noun}`];
  const form = n === 1 ? one : many;
  return n === 0 && form.startsWith("# ") ? form.replace("#", "no") : form.replace("#", numberText(n));
}

/** A quantity's value in a Compare cell, under its label: "8 hours", "3 weeks", "400". */
export function quantityValue(q: Pick<SheetQuantity, "unit">, n: number): string {
  if (!q.unit) return n === 0 ? "None" : numberText(n);
  return `${numberText(n)} ${n === 1 ? singular(q.unit) : q.unit}`;
}

/**
 * The one line a customer reads for a price, in the trade's own terms, leaving out what
 * the vendor didn't say: "₹45,000 for the event · 8 hours · 2 photographers · 400 edited
 * photos · delivered in 3 weeks".
 */
export function describeOffer(sheet: Sheet, unitKey: string | undefined, price: number, quantities: Record<string, number>, currency: string): string {
  const unit = priceUnitOf(sheet, unitKey);
  const parts = [`${formatMoney(price, currency)} ${unit.label}`];
  for (const q of quantitiesFor(sheet, unit.key)) {
    const n = quantities[q.key];
    if (n !== undefined && Number.isFinite(n) && n >= 0) parts.push(quantityText(q, n));
  }
  return parts.join(" · ");
}

type QuoteLike = {
  total: number;
  currency?: string;
  lines?: QuoteLine[];
  includes?: string[];
  excludes?: string[];
  taxIncluded?: boolean;
  headcountAssumed?: number;
};

/**
 * priced: on its own line inside the total. included: the vendor says the price covers it.
 * extra: outside the total, with a price when the vendor gave one. unstated: never mentioned.
 */
export type LineStatus = "priced" | "included" | "extra" | "unstated";
export type LineReading = { key: string; label: string; status: LineStatus; amount?: number };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** One quote against its sheet: what it says about each line. */
export function readQuote(q: QuoteLike, sheet: Sheet): LineReading[] {
  // The price of the thing itself ("Veg meals per plate") is never one of the sheet's charges.
  // Each charge counts once, for the sheet line it names first: "Transport of vessels and
  // staff" is transport, not service staff too.
  const charges = (q.lines ?? []).filter((l) => l.kind !== "core" && l.kind !== "discount");
  const ownerOf = (l: QuoteLine): string | undefined => {
    if (l.kind === "tax") return sheet.lines.find((s) => s.kind === "tax")?.key;
    let best: { key: string; at: number } | undefined;
    for (const s of sheet.lines) {
      const at = l.item.search(s.match);
      if (at >= 0 && (!best || at < best.at)) best = { key: s.key, at };
    }
    return best?.key;
  };
  const owners = charges.map(ownerOf);
  return sheet.lines.map((s) => {
    const base = { key: s.key, label: s.label };
    const names = (text: string) => s.match.test(text);
    const charged = charges.filter((_, i) => owners[i] === s.key);
    const inTotal = charged.filter((l) => !l.optional);
    if (inTotal.length) return { ...base, status: "priced" as const, amount: sum(inTotal.map((l) => l.amount)) };
    if ((q.includes ?? []).some(names) || (s.kind === "tax" && q.taxIncluded === true)) return { ...base, status: "included" as const };
    const addOns = charged.filter((l) => l.optional);
    if (addOns.length) return { ...base, status: "extra" as const, amount: sum(addOns.map((l) => l.amount)) };
    if (s.kind === "tax" && q.taxIncluded !== true) {
      // "GST 5% extra" is a rate the family can work out, so it is priced on the quote's own total.
      const rate = taxRate(q, s.match);
      if (rate !== null && q.total > 0) return { ...base, status: "extra" as const, amount: Math.round((q.total * rate) / 100) };
    }
    if ((q.excludes ?? []).some(names) || (s.kind === "tax" && q.taxIncluded === false)) return { ...base, status: "extra" as const };
    return { ...base, status: "unstated" as const };
  });
}

/**
 * A tax rate the quote states in words ("GST 5% extra", "+18% GST"), from its lines, its
 * exclusions or its inclusions; null when it gives none. Only a figure beside the tax's own
 * name counts, so "10% advance" is never read as tax.
 */
export function taxRate(q: QuoteLike, taxName: RegExp): number | null {
  const texts = [...(q.lines ?? []).filter((l) => l.kind === "tax").map((l) => l.item), ...(q.excludes ?? []), ...(q.includes ?? [])];
  for (const t of texts) {
    if (!taxName.test(t)) continue;
    const m = t.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
    if (m) {
      const rate = Number(m[1]);
      if (rate > 0 && rate <= 28) return rate;
    }
  }
  return null;
}

/** A charge a quote doesn't state, or states without a price. `key` is the sheet line, so Compare can mark that row. */
export type MissingCharge = { key: string; label: string; message: string };

const OTHERS = ["", "one other", "two others", "three others", "four others"];

/**
 * What a quote leaves unsaid, checked against its sheet and against the other quotes for
 * the same need: "Doesn't say whether GST is included"; "No transport line, and two others
 * charge ₹2,000–₹3,000".
 */
export function missingCharges(q: QuoteLike, sheet: Sheet, others: QuoteLike[], offered: Answer[][] = []): MissingCharge[] {
  const flags: MissingCharge[] = [];
  if (sheet.unit === "per_person" || sheet.unit === "per_piece") {
    const perUnit = (q.lines ?? []).some((l) => l.kind === "core" && l.unit === sheet.unit);
    if (!perUnit && !q.headcountAssumed) {
      const what = sheet.unit === "per_person" ? "plates" : "pieces";
      flags.push({ key: "unit", label: `Number of ${what}`, message: `Doesn't say how many ${what} the price is for` });
    }
  }
  const theirs = [...others.map((o) => readQuote(o, sheet)), ...offered];
  return [...flags, ...gapsIn(readQuote(q, sheet), sheet, theirs, q.currency ?? "INR")];
}

/** One answer on a sheet line: a quote's reading, or a Partner offer's answer as the vendor gave it. */
export type Answer = Pick<LineReading, "key" | "status" | "amount">;

/**
 * The gaps in answers already made against a sheet: a quote's reading, or a verified vendor's
 * offer. `theirs` are the other answers for the same need, whose prices say what others charge.
 */
export function gapsIn(answers: Answer[], sheet: Sheet, theirs: Answer[][], currency: string): MissingCharge[] {
  const flags: MissingCharge[] = [];
  for (const r of answers) {
    const line = sheet.lines.find((s) => s.key === r.key);
    if (!line) continue;
    const charged = theirs
      .map((rs) => rs.find((x) => x.key === r.key))
      .filter((x): x is Answer => !!x && x.amount !== undefined && (x.status === "priced" || x.status === "extra"))
      .map((x) => x.amount!);
    const elsewhere = charged.length ? `${countOthers(charged.length)} ${charged.length === 1 ? "charges" : "charge"} ${range(charged, currency)}` : "";

    let message: string | undefined;
    if (r.status === "unstated") {
      if (charged.length) message = `No ${inSentence(line.label)} line, and ${elsewhere}`;
      else if (line.usually === "extra") message = line.ask ?? `Doesn't say whether ${inSentence(line.label)} is included`;
    } else if (r.status === "extra" && r.amount === undefined) {
      // GST is a share of each price, so another vendor's GST figure says nothing about this one.
      message =
        line.kind === "tax"
          ? `${line.label} is extra, with no amount given`
          : `${line.label} is extra, with no price given${charged.length ? `; ${elsewhere}` : ""}`;
    }
    if (message) flags.push({ key: r.key, label: line.label, message });
  }
  return flags;
}

function countOthers(n: number): string {
  return OTHERS[n] ?? `${n} others`;
}

function range(amounts: number[], currency: string): string {
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  return low === high ? formatMoney(low, currency) : `${formatMoney(low, currency)}–${formatMoney(high, currency)}`;
}
