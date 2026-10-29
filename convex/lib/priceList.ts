import { z } from "zod";
import type { Sheet } from "./standardSheet";
import { numbersIn } from "./tidy";

/**
 * "Bring your price list": a vendor pastes or photographs the price list they already
 * hand out, and Muse Spark Open turns it into packages on their trade's standard sheet,
 * for them to check and save. The rules here decide what is kept: only the sheet's own
 * ways of charging and quantities, and, for typed text, only prices the list really has.
 */

export const MAX_PACKAGES = 6;

export const priceListSchema = z.object({
  packages: z
    .array(
      z.object({
        title: z.string().max(120),
        /** One of the sheet's ways of charging, by key. */
        priceUnit: z.string(),
        price: z.number(),
        quantities: z.array(z.object({ key: z.string(), value: z.number() })).max(8),
        includes: z.array(z.string().max(120)).max(12),
        /** Whether the price includes GST; null when the list doesn't say. */
        taxIncluded: z.boolean().nullable(),
      }),
    )
    .max(MAX_PACKAGES),
});
export type PriceListAnswer = z.infer<typeof priceListSchema>;

export type PackageDraft = {
  title: string;
  priceUnit: string;
  price: number;
  quantities: Record<string, number>;
  includes: string[];
  taxIncluded: boolean | null;
};

/** What the model is told: the job, and this trade's ways of charging and quantities by key. */
export function priceListInstructions(category: string, sheet: Sheet): string {
  const units = sheet.units.map((u) => `- ${u.key}: ${u.priceLabel.toLowerCase()}`).join("\n");
  const quantities = sheet.quantities.map((q) => `- ${q.key}: ${q.label}${q.unit ? ` (in ${q.unit})` : ""}`).join("\n");
  return (
    `A ${category.toLowerCase()} vendor in India has shared the price list they give customers, as text or a photo. ` +
    `Turn each package or rate on it into one entry, at most ${MAX_PACKAGES}. For each: a short title in their own words; ` +
    "how it is priced, as exactly one of these keys:\n" +
    units +
    "\nthe price as a plain number of rupees (₹1.2 lakh is 120000); the quantities it includes, using only these keys:\n" +
    quantities +
    "\nwhat it includes, one short item each, in their words; and whether the price includes GST (null if the list doesn't say). " +
    "Use only what the list says. Never invent a package, a price or an item, and never change a number. " +
    "Leave out add-ons that have no price of their own. Keep Tamil and Hindi words as they are."
  );
}

/** A price the list really has: its digits are in the text, or it is a lakh figure written that way. */
function inSource(price: number, source: string[]): boolean {
  const asLakh = price / 100_000;
  return source.some((n) => Number(n) === price || Number(n) === asLakh);
}

/**
 * The packages to offer the vendor: only the sheet's ways of charging and quantities,
 * positive prices, and, when the list was typed, only prices found in it. A photo has
 * no text to check against, so the vendor is asked to check every price.
 */
export function keepPackages(answer: PriceListAnswer, sheet: Sheet, typed: string | null): PackageDraft[] {
  const source = typed === null ? null : numbersIn(typed);
  const kept: PackageDraft[] = [];
  for (const p of answer.packages) {
    const unit = sheet.units.find((u) => u.key === p.priceUnit);
    if (!unit || !Number.isFinite(p.price) || p.price <= 0 || p.price > 1e9) continue;
    if (source && !inSource(p.price, source)) continue;
    const allowed = new Set(sheet.quantities.filter((q) => !q.forUnits || q.forUnits.includes(unit.key)).map((q) => q.key));
    const quantities = Object.fromEntries(
      p.quantities.filter((q) => allowed.has(q.key) && Number.isFinite(q.value) && q.value > 0).map((q) => [q.key, q.value]),
    );
    const title = p.title.trim();
    if (!title) continue;
    kept.push({
      title,
      priceUnit: unit.key,
      price: Math.round(p.price),
      quantities,
      includes: p.includes.map((s) => s.trim()).filter(Boolean),
      taxIncluded: p.taxIncluded,
    });
  }
  return kept.slice(0, MAX_PACKAGES);
}
