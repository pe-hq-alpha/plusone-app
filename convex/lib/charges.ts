/**
 * Muse Spark naming each charge's status itself, from the sheet's fixed list: the reading
 * Compare now uses first, because on held-out quotes in new shapes it flagged far less
 * wrongly than matching lines with fixed rules. The rules in lib/standardSheet still
 * decide what is missing; this only says what each charge's status is.
 */

import { z } from "zod";
import type { Answer, LineReading, Sheet } from "./standardSheet";

/** How Muse Spark may describe one charge, as constrained output. */
export const CHARGE_STATUSES = ["priced", "included", "extra_with_amount_or_rate", "extra_without_price", "not_offered", "not_mentioned"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const CHARGES_INSTRUCTIONS =
  "You read one vendor's quote for an event and say, for each charge on the list, what the quote says about it. " +
  "priced: it has its own amount inside the total. included: the quote says the price covers it. " +
  "extra_with_amount_or_rate: it is outside the price, with an amount or a rate (\"GST 18% extra\" has a rate). " +
  "extra_without_price: it is outside the price with no amount or rate (\"setup charges extra\", \"at actuals\"). " +
  "not_offered: the quote says it isn't part of the service. not_mentioned: the quote says nothing about it. " +
  "Give the amount in rupees when there is one, otherwise null. Read Tamil, Tanglish, lakh and k amounts as written.";

/** Its statuses as the sheet's answers, for the same rules Compare runs. */
export function answersFrom(charges: { key: string; status: ChargeStatus; amount: number | null }[], sheet: Sheet): Answer[] {
  return sheet.lines.map((line) => {
    const c = charges.find((x) => x.key === line.key);
    const amount = c?.amount ?? undefined;
    switch (c?.status) {
      case "priced":
        return { key: line.key, status: "priced", ...(amount !== undefined ? { amount } : {}) };
      case "included":
      case "not_offered":
        return { key: line.key, status: "included" };
      case "extra_with_amount_or_rate":
        // A rate or an amount settles it, as "GST 5% extra" does in the rules.
        return { key: line.key, status: "extra", amount: amount ?? 0 };
      case "extra_without_price":
        return { key: line.key, status: "extra" };
      default:
        return { key: line.key, status: "unstated" };
    }
  });
}

/** The constrained shape for one quote's charges, with the sheet's own line keys. */
export function chargesSchema(sheet: Sheet) {
  const keys = sheet.lines.map((l) => l.key) as [string, ...string[]];
  return z.object({ charges: z.array(z.object({ key: z.enum(keys), status: z.enum(CHARGE_STATUSES), amount: z.number().nullable() })) });
}

/** The prompt for one quote, naming the charges it is read against. */
export function chargesPrompt(category: string, sheet: Sheet, vendorName: string, text: string): string {
  const keys = sheet.lines.map((l) => l.key);
  return `The charges for ${category}: ${keys.join(", ")}.\n\nThe quote from ${vendorName}:\n${text}`;
}

/** Each sheet line's reading from the charges, with its label, in the sheet's order; a key left out is unstated. */
export function readingsFrom(charges: { key: string; status: ChargeStatus; amount?: number | null }[], sheet: Sheet): LineReading[] {
  const answers = answersFrom(
    charges.map((c) => ({ key: c.key, status: c.status, amount: c.amount ?? null })),
    sheet,
  );
  return sheet.lines.map((line, i) => ({ ...answers[i], label: line.label }));
}
