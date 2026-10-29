/**
 * The other ways the missing-charge evaluation is run, set against the pipeline (Muse Spark
 * reads lines, fixed rules decide): Muse Spark naming each charge's status itself from the
 * sheet's fixed list, Muse Spark asked directly what's missing, and the sheet's keywords on
 * the raw text with no model at all. Pure helpers; the calls are in convex/evals.ts.
 */

import type { Answer, Sheet } from "./standardSheet";

/** How Muse Spark may describe one charge, as constrained output. */
export const CHARGE_STATUSES = ["priced", "included", "extra_with_amount_or_rate", "extra_without_price", "not_offered", "not_mentioned"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

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

/** No model: a charge counts as settled when its keyword appears anywhere in the quote. */
export function keywordFlags(text: string, sheet: Sheet): string[] {
  return sheet.lines.filter((line) => !line.match.test(text)).map((line) => line.key);
}
