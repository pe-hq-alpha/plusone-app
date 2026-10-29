/**
 * Scoring the missing-charge evaluation: the charges PlusOne flagged against the answer
 * key, per quote and in all. Precision is how many flags were right; recall is how many
 * of the charges to ask about were found.
 */

export type QuoteScore = { vendor: string; category: string; expected: string[]; flagged: string[]; hits: string[]; missed: string[]; extra: string[] };

export function scoreQuote(vendor: string, category: string, expected: string[], flagged: string[]): QuoteScore {
  const want = new Set(expected);
  const got = new Set(flagged);
  return {
    vendor,
    category,
    expected: [...want].sort(),
    flagged: [...got].sort(),
    hits: [...got].filter((k) => want.has(k)).sort(),
    missed: [...want].filter((k) => !got.has(k)).sort(),
    extra: [...got].filter((k) => !want.has(k)).sort(),
  };
}

export type Totals = { quotes: number; expected: number; found: number; missed: number; falseAlarms: number; precision: number; recall: number; exactQuotes: number };

export function totals(scores: QuoteScore[]): Totals {
  const expected = scores.reduce((n, s) => n + s.expected.length, 0);
  const found = scores.reduce((n, s) => n + s.hits.length, 0);
  const falseAlarms = scores.reduce((n, s) => n + s.extra.length, 0);
  const flagged = found + falseAlarms;
  return {
    quotes: scores.length,
    expected,
    found,
    missed: expected - found,
    falseAlarms,
    precision: flagged ? found / flagged : 1,
    recall: expected ? found / expected : 1,
    exactQuotes: scores.filter((s) => s.missed.length === 0 && s.extra.length === 0).length,
  };
}
