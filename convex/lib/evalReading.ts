/**
 * The quote-reading evaluation: six of the missing-charge quotes, each sent three ways
 * (in an email, as a PDF, and as a phone photo of the printed quote), read by the same
 * reader replies go through. Each has a total marked by hand before any run; a reading is
 * right when its total is one of them and it kept every figure the quote states.
 */

import { EVAL_GROUPS } from "./evalQuotes";
import type { QuoteLine } from "./validators";

export type ReadingCase = { vendor: string; category: string; text: string; totals: number[] };

/** Totals a careful planner would accept: before GST where GST is "extra" with only a rate, or with it priced. */
const KEY: Record<string, number[]> = {
  "Annapoorna Catering": [52_400, 55_020],
  "Mylai Kitchen": [58_000],
  "Krishna Bhavan Caterers": [61_900],
  "Green Palace": [110_000],
  "Malar Florists": [37_170],
  "Thinnai Photography": [12_500],
};

export const READING_CASES: ReadingCase[] = EVAL_GROUPS.flatMap((g) =>
  g.quotes.filter((q) => KEY[q.vendor]).map((q) => ({ vendor: q.vendor, category: g.category, text: q.text, totals: KEY[q.vendor] })),
);

export const FORMATS = ["email", "pdf", "photo"] as const;
export type Format = (typeof FORMATS)[number];

/** The rupee amounts a quote states ("Rs 1,10,000" is 110000); head counts, hours and rates are left out. */
export function statedFigures(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/(?:Rs\.?\s*|₹\s*)(\d{1,3}(?:,\d{2,3})+|\d+)/g)) {
    found.add(Number(m[1].replace(/,/g, "")));
  }
  return [...found].sort((a, b) => a - b);
}

export type ReadingScore = { vendor: string; format: Format; total: number; totalRight: boolean; figures: number[]; kept: number[]; lost: number[] };

export function scoreReading(c: ReadingCase, format: Format, read: { total: number; lines: Pick<QuoteLine, "amount" | "unitPrice" | "quantity">[] }): ReadingScore {
  const seen = new Set<number>([read.total]);
  for (const l of read.lines) {
    seen.add(l.amount);
    if (l.unitPrice !== undefined) seen.add(l.unitPrice);
    if (l.quantity !== undefined) seen.add(l.quantity);
  }
  const figures = statedFigures(c.text);
  return {
    vendor: c.vendor,
    format,
    total: read.total,
    totalRight: c.totals.some((t) => Math.abs(t - read.total) <= 1),
    figures,
    kept: figures.filter((f) => seen.has(f)),
    lost: figures.filter((f) => !seen.has(f)),
  };
}
