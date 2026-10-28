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

export type Sheet = {
  need: VendorNeedKey;
  unit: Basis;
  /** What the main price covers, in the words a vendor fills in on Partner. */
  covers: string;
  lines: SheetLine[];
};

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
    covers: "The hall for the hours agreed, with its chairs and dining hall",
    lines: [
      GST,
      { key: "electricity", label: "Electricity and generator", kind: "fee", usually: "extra", match: /\b(eb|electricity|power|generator|genset|diesel)\b/i },
      { key: "ac", label: "Air conditioning", kind: "fee", usually: "extra", match: /\b(a\/?c|air[- ]?condition\w*)\b/i },
      { key: "cleaning", label: "Cleaning", kind: "fee", usually: "extra", match: /\b(clean\w*|housekeeping|maintenance)\b/i },
      OVERTIME,
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
        match: /\b(service staff|serving staff|waiters?|servers?|service boys|staff|service charges?)\b/i,
      },
      TRANSPORT,
      {
        key: "crockery",
        label: "Crockery and serving ware",
        kind: "fee",
        usually: "included",
        match: /\b(crocker\w*|cutlery|serving ware|banana leaf|leaf plates?|disposables?|tableware)\b/i,
      },
      { key: "water", label: "Water", kind: "extra", usually: "included", match: /\bwater\b/i },
    ],
  },
  decor: {
    need: "decor",
    unit: "total",
    covers: "The stage and decor agreed, with the flowers named (fresh or artificial)",
    lines: [GST, TRANSPORT, SETUP, { key: "lighting", label: "Lighting", kind: "extra", usually: "extra", match: /\b(light(s|ing)?|led)\b/i }],
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
  const charges = (q.lines ?? []).filter((l) => l.kind !== "core" && l.kind !== "discount");
  return sheet.lines.map((s) => {
    const base = { key: s.key, label: s.label };
    const names = (text: string) => s.match.test(text);
    const charged = charges.filter((l) => names(l.item) || (s.kind === "tax" && l.kind === "tax"));
    const inTotal = charged.filter((l) => !l.optional);
    if (inTotal.length) return { ...base, status: "priced" as const, amount: sum(inTotal.map((l) => l.amount)) };
    if ((q.includes ?? []).some(names) || (s.kind === "tax" && q.taxIncluded === true)) return { ...base, status: "included" as const };
    const addOns = charged.filter((l) => l.optional);
    if (addOns.length) return { ...base, status: "extra" as const, amount: sum(addOns.map((l) => l.amount)) };
    if ((q.excludes ?? []).some(names) || (s.kind === "tax" && q.taxIncluded === false)) return { ...base, status: "extra" as const };
    return { ...base, status: "unstated" as const };
  });
}

/** A charge a quote doesn't state, or states without a price. `key` is the sheet line, so Compare can mark that row. */
export type MissingCharge = { key: string; label: string; message: string };

const OTHERS = ["", "one other", "two others", "three others", "four others"];

/**
 * What a quote leaves unsaid, checked against its sheet and against the other quotes for
 * the same need: "Doesn't say whether GST is included"; "No transport line, and two others
 * charge ₹2,000–₹3,000".
 */
export function missingCharges(q: QuoteLike, sheet: Sheet, others: QuoteLike[]): MissingCharge[] {
  const flags: MissingCharge[] = [];
  const currency = q.currency ?? "INR";
  if (sheet.unit === "per_person" || sheet.unit === "per_piece") {
    const perUnit = (q.lines ?? []).some((l) => l.kind === "core" && l.unit === sheet.unit);
    if (!perUnit && !q.headcountAssumed) {
      const what = sheet.unit === "per_person" ? "plates" : "pieces";
      flags.push({ key: "unit", label: `Number of ${what}`, message: `Doesn't say how many ${what} the price is for` });
    }
  }

  const theirs = others.map((o) => readQuote(o, sheet));
  for (const r of readQuote(q, sheet)) {
    const line = sheet.lines.find((s) => s.key === r.key)!;
    const charged = theirs
      .map((rs) => rs.find((x) => x.key === r.key))
      .filter((x): x is LineReading => !!x && x.amount !== undefined && (x.status === "priced" || x.status === "extra"))
      .map((x) => x.amount!);
    const elsewhere = charged.length ? `${countOthers(charged.length)} ${charged.length === 1 ? "charges" : "charge"} ${range(charged, currency)}` : "";

    let message: string | undefined;
    if (r.status === "unstated") {
      if (charged.length) message = `No ${inSentence(line.label)} line, and ${elsewhere}`;
      else if (line.usually === "extra") message = line.ask ?? `Doesn't say whether ${inSentence(line.label)} is included`;
    } else if (r.status === "extra" && r.amount === undefined) {
      message = `${line.label} is extra, with no price given${charged.length ? `; ${elsewhere}` : ""}`;
    }
    if (message) flags.push({ key: r.key, label: r.label, message });
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
