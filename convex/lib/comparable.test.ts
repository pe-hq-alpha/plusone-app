import { describe, expect, test } from "vitest";
import { basisFor, basisLabel, compare, spread } from "./comparable";

describe("three caterers, three shapes, one unit", () => {
  const annam = {
    total: 63_000,
    lines: [
      { item: "Lunch", kind: "core" as const, unit: "per_person" as const, quantity: 150, unitPrice: 380, amount: 57_000 },
      { item: "Service charge", kind: "fee" as const, unit: "total" as const, amount: 6_000 },
    ],
    headcountAssumed: 150,
  };
  const saapadu = { total: 62_000, headcountAssumed: 120 };
  const kaveri = {
    total: 70_000,
    lines: [
      { item: "Lunch", kind: "core" as const, unit: "per_person" as const, quantity: 150, unitPrice: 450, amount: 67_500 },
      { item: "Transport", kind: "fee" as const, unit: "total" as const, amount: 2_500 },
    ],
    taxIncluded: false,
  };

  test("a per-plate quote with a service charge comes to its own figure per plate", () => {
    expect(compare(annam, "per_person", 150)).toMatchObject({ atYourNumbers: 63_000, perUnit: 420, flags: [] });
  });

  test("an all-in price for fewer people is scaled to the host's headcount, and says so", () => {
    const c = compare(saapadu, "per_person", 150);
    expect(c.atYourNumbers).toBe(77_500);
    expect(c.perUnit).toBe(517);
    expect(c.flags).toContain("Priced for 120; you expect 150");
  });

  test("a quote without tax is flagged", () => {
    const c = compare(kaveri, "per_person", 150);
    expect(c.perUnit).toBe(467);
    expect(c.flags).toContain("GST extra");
  });

  test("what a quote leaves out reads in a sentence, keeping acronyms whole", () => {
    const c = compare({ ...saapadu, excludes: ["GST", "Extra plates beyond 120"] }, "per_person", 120);
    expect(c.flags).toEqual(expect.arrayContaining(["Leaves out GST", "Leaves out extra plates beyond 120"]));
  });

  test("tax left out is said once", () => {
    for (const excluded of ["GST", "GST at 18%", "Taxes"]) {
      const c = compare({ ...kaveri, excludes: [excluded, "Fans"] }, "per_person", 150);
      expect(c.flags.filter((f) => /GST|tax/i.test(f))).toEqual(["GST extra"]);
      expect(c.flags).toContain("Leaves out fans");
    }
  });

  test("the cheapest total is not the cheapest per plate", () => {
    const totals = [annam.total, saapadu.total, kaveri.total];
    const perPlate = [annam, saapadu, kaveri].map((q) => compare(q, "per_person", 150).perUnit);
    expect(Math.min(...totals)).toBe(saapadu.total);
    expect(spread(perPlate)).toEqual({ low: 420, high: 517 });
  });

  test("lines that don't add up show no per-plate figure", () => {
    const off = { ...annam, total: 80_000 };
    const c = compare(off, "per_person", 150);
    expect(c.perUnit).toBeNull();
    expect(c.linesCheck).toBe(false);
  });

  test("a per-plate quote rises with the host's headcount", () => {
    expect(compare(annam, "per_person", 200).atYourNumbers).toBe(82_000);
  });
});

describe("the unit a need is compared in", () => {
  test("food per plate, gifts per piece, the rest all in", () => {
    expect(basisFor("Catering")).toBe("per_person");
    expect(basisLabel(basisFor("Catering"), "Catering")).toBe("Per plate");
    expect(basisFor("Gifting")).toBe("per_piece");
    expect(basisFor("Venue")).toBe("total");
  });
});
