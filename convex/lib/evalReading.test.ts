import { describe, expect, test } from "vitest";
import { READING_CASES, scoreReading, statedFigures, TAMIL_CASES } from "./evalReading";

describe("the quote-reading evaluation", () => {
  test("has its six hand-keyed quotes", () => {
    expect(READING_CASES.map((c) => c.vendor).sort()).toEqual(
      ["Annapoorna Catering", "Green Palace", "Krishna Bhavan Caterers", "Malar Florists", "Mylai Kitchen", "Thinnai Photography"],
    );
  });

  test("reads lakh figures and leaves out head counts and rates", () => {
    expect(statedFigures("Package Rs 1,10,000 inclusive. Dining hall for 150. after that Rs 8,000 per hour.")).toEqual([8000, 110000]);
    expect(statedFigures("For 120 guests, 14 items: Rs 420 per plate. GST 5% extra.")).toEqual([420]);
  });

  test("a reading is right when its total is accepted, and lists the figures it lost", () => {
    const c = READING_CASES.find((x) => x.vendor === "Malar Florists")!;
    const s = scoreReading(c, "photo", { total: 37_170, lines: [{ amount: 31_500 }, { amount: 5_670 }] });
    expect(s.totalRight).toBe(true);
    expect(s.lost).toEqual([]);
    const wrong = scoreReading(c, "pdf", { total: 31_500, lines: [{ amount: 31_500 }] });
    expect(wrong.totalRight).toBe(false);
    expect(wrong.lost).toEqual([5670]);
  });

  test("reads Rs 15k as 15,000, and has four Tamil and Tanglish quotes", () => {
    expect(statedFigures("Full day photography Rs 15k. Album Rs 5k extra.")).toEqual([5000, 15000]);
    expect(TAMIL_CASES).toHaveLength(4);
    expect(statedFigures(TAMIL_CASES[0].text)).toEqual([450, 2000, 54000]);
  });
});
