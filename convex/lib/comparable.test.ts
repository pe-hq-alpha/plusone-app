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

describe("a quote priced for more than you need", () => {
  test("is never scaled down below what was asked, so a minimum order can't look cheapest", () => {
    // Annam: 150 plates at ₹380 (a 150-plate minimum), service ₹6,000, GST ₹3,150, for 120 guests.
    const annam = {
      total: 66_150,
      headcountAssumed: 150,
      lines: [
        { item: "Lunch", kind: "core" as const, unit: "per_person" as const, quantity: 150, unitPrice: 380, amount: 57_000 },
        { item: "Service charge", kind: "fee" as const, unit: "total" as const, amount: 6_000 },
        { item: "GST", kind: "tax" as const, unit: "total" as const, amount: 3_150 },
      ],
    };
    const c = compare(annam, "per_person", 120);
    expect(c.atYourNumbers).toBe(66_150);
    expect(c.perUnit).toBe(551);
    expect(c.flags).toContain("Priced for 150; you expect 120");
  });

  test("a quote for fewer than you need still scales up to your number", () => {
    const c = compare({ total: 50_000, headcountAssumed: 100 }, "per_person", 120);
    expect(c.atYourNumbers).toBe(60_000);
    expect(c.perUnit).toBe(500);
  });
});

describe("a new headcount moves every price for a need", () => {
  test("an offer per plate for 120 is the same rate at 140; an all-in or other-unit offer stays as it is", async () => {
    const { offerAtYourNumbers } = await import("./comparable");
    expect(offerAtYourNumbers({ total: 44_340, unit: "per_person", quantity: 120 }, "per_person", 140)).toBe(51_730);
    expect(offerAtYourNumbers({ total: 44_340, unit: "per_person", quantity: 120 }, "per_person", 120)).toBe(44_340);
    expect(offerAtYourNumbers({ total: 25_700, unit: "total", quantity: 1 }, "total", 140)).toBe(25_700);
    expect(offerAtYourNumbers({ total: 12_500, unit: "per_hour", quantity: 5 }, "per_person", 140)).toBe(12_500);
  });

  test("plates for the most people at the parts a need serves; days for stays", async () => {
    const { unitsForNeed } = await import("./comparable");
    const lunch = { guestCount: 140, date: "2027-02-06" };
    const pooja = { guestCount: 40, date: "2027-02-06" };
    expect(unitsForNeed("per_person", [lunch, pooja])).toBe(140);
    expect(unitsForNeed("per_person", [], 60)).toBe(60);
    expect(unitsForNeed("per_day", [lunch, { guestCount: 10, date: "2027-02-07" }])).toBe(2);
  });
});
