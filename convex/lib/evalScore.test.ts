import { describe, expect, it } from "vitest";
import { EVAL_GROUPS } from "./evalQuotes";
import { scoreQuote, totals } from "./evalScore";
import { sheetFor } from "./standardSheet";

describe("scoring the missing-charge evaluation", () => {
  it("counts hits, misses and false alarms, and works out precision and recall", () => {
    const a = scoreQuote("A", "Catering", ["gst", "water"], ["gst", "crockery"]);
    expect(a).toMatchObject({ hits: ["gst"], missed: ["water"], extra: ["crockery"] });
    const t = totals([a, scoreQuote("B", "Catering", [], [])]);
    expect(t).toMatchObject({ quotes: 2, expected: 2, found: 1, missed: 1, falseAlarms: 1, exactQuotes: 1 });
    expect(t.precision).toBe(0.5);
    expect(t.recall).toBe(0.5);
  });

  it("keys only charges each trade's sheet has, so a typo can't make a charge unfindable", () => {
    for (const g of EVAL_GROUPS) {
      const keys = new Set([...(sheetFor(g.category)?.lines ?? []).map((l) => l.key), "unit"]);
      for (const q of g.quotes) for (const k of q.expected) expect(keys.has(k), `${q.vendor}: ${k}`).toBe(true);
    }
  });
});
