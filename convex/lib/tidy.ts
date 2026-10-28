/**
 * Small pure helpers for tidying what vendors write before it is saved.
 * A tidy never changes a number, a price or what is included; fixed rules
 * check that afterwards, and a tidy that fails them is thrown away.
 */

/** Every number in the text as digits only, sorted, so "₹1,20,000" and "120000" match. */
export function numbersIn(text: string): string[] {
  const found = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const cleaned = found.map((n) => n.replace(/,/g, "")).filter((n) => n.length > 0 && n !== ".");
  return cleaned.sort((a, b) => Number(a) - Number(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Whether a tidied field keeps the vendor's facts: non-empty, the same numbers,
 * and not much longer than what was written (half as long again, plus 20 characters).
 */
export function keepsFacts(before: string, after: string): boolean {
  if (!after.trim()) return false;
  const a = numbersIn(before);
  const b = numbersIn(after);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return after.length <= before.length * 1.5 + 20;
}

export type ContactKind = "phone" | "email" | "link";

/**
 * Which contact details appear in free text. Phones and emails belong in the
 * contact fields, where they are checked; free text with them is flagged, not changed.
 */
export function contactIn(text: string): ContactKind[] {
  const out: ContactKind[] = [];
  // An Indian mobile (10 digits from 6-9, spaced or not) or landline, with or without +91.
  const phone = /(?:\+91[\s-]?)?(?:[6-9]\d{4}[\s-]?\d{5}|[6-9]\d{9}|\d{2,5}[\s-]?\d{6,8})/;
  if (phone.test(text)) out.push("phone");
  if (/[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(text)) out.push("email");
  if (/https?:\/\/|www\./i.test(text)) out.push("link");
  return out;
}

/**
 * The job for the tidy: fix the writing, never the facts. Units in full,
 * lists split into items, names and dishes untouched, British spelling.
 */
export const TIDY_INSTRUCTIONS =
  "Tidy what a vendor wrote for customers on PlusOne Partner. " +
  "Fix spelling, spacing, capital letters and punctuation. " +
  'Write units in full: "5hrs" becomes "5 hours", "pax" becomes "guests", "rs.500/-" or "Rs 500" becomes "₹500". ' +
  "Split a list written on one line into items when it is clearly a list. " +
  "Never change a number, a price, a name, a dish or what is included. " +
  "Never add a claim, an adjective or anything the vendor did not say. " +
  "Keep Tamil and Hindi words as they are (sambar, payasam, mehndi). " +
  "Use British spelling. " +
  "If a field is already fine, return it unchanged.";
