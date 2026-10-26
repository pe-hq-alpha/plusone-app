import { describe, expect, it } from "vitest";
import { ALL_NEEDS, budgetWeight, guestShare, needsFor, placeOnDays } from "./lib/ceremonyPlan";
import { guessKind } from "./lib/kinds";
import { VENDOR_NEEDS, type CeremonyKind, type VendorNeedKey } from "./lib/vocab";

describe("placeOnDays", () => {
  it("keeps natural spacing when it fits", () => {
    expect(placeOnDays([{ offset: -1, on: true }, { offset: 0, on: true }, { offset: 1, on: true }], 3)).toEqual([0, 1, 2]);
    expect(placeOnDays([{ offset: 0, on: true }, { offset: 0, on: true }], 3)).toEqual([0, 0]);
  });

  it("keeps the wedding day and after in place and folds early rites onto the first day", () => {
    const days = placeOnDays(
      [-60, -14, -2, -1, 0, 0, 1].map((offset) => ({ offset, on: true })),
      3,
    );
    expect(days).toEqual([0, 0, 0, 0, 1, 1, 2]);
  });

  it("puts everything on one day for a one-day wedding", () => {
    expect(placeOnDays([{ offset: -2, on: true }, { offset: 0, on: true }, { offset: 1, on: false }], 1)).toEqual([0, 0, 0]);
  });

  it("does not let a ceremony that is off stretch the run", () => {
    expect(placeOnDays([{ offset: -60, on: false }, { offset: 0, on: true }, { offset: 1, on: true }], 2)).toEqual([0, 0, 1]);
  });
});

describe("sizes and budgets", () => {
  it("gives the big days everyone and the home rites a smaller circle", () => {
    expect(guestShare({ kind: "reception", vendorNeeds: ["venue", "catering"] })).toBe(1);
    expect(guestShare({ kind: "puja", vendorNeeds: ["officiant"] })).toBeLessThan(0.5);
    expect(guestShare({ kind: "engagement", vendorNeeds: ["venue", "catering"], offset: -60 })).toBeLessThanOrEqual(0.5);
    expect(guestShare({ vendorNeeds: [] })).toBeGreaterThan(0);
  });

  it("weighs a catered party above a small rite", () => {
    expect(budgetWeight({ kind: "reception", vendorNeeds: ["venue", "catering", "decor"] })).toBeGreaterThan(
      budgetWeight({ kind: "puja", vendorNeeds: ["officiant"] }),
    );
    expect(budgetWeight({ vendorNeeds: [] })).toBe(1);
  });

  it("ignores vendor keys it doesn't know, such as ones from an old draft", () => {
    expect(budgetWeight({ vendorNeeds: ["caterer", "photographer"] })).toBe(1);
  });
});

describe("needsFor", () => {
  const plan: { name: string; kind: CeremonyKind; vendorNeeds: VendorNeedKey[]; offset: number }[] = [
    { name: "Mehndi", kind: "mehndi", vendorNeeds: ["venue", "catering", "mehndi_artist", "music"], offset: -1 },
    { name: "Ceremony", kind: "fire", vendorNeeds: ["venue", "catering", "officiant", "photography", "decor"], offset: 0 },
    { name: "Reception", kind: "reception", vendorNeeds: ["venue", "catering", "photography", "music"], offset: 0 },
  ];
  const needs = needsFor(plan);

  it("adds up to 100 percent, venue first", () => {
    expect(needs.reduce((s, n) => s + n.pct, 0)).toBe(100);
    expect(needs[0].key).toBe("venue");
    expect(needs.every((n) => n.pct >= 1)).toBe(true);
  });

  it("names the ceremonies each need serves, from the ceremonies' own needs", () => {
    const mehndi = needs.find((n) => n.key === "mehndi_artist")!;
    expect(mehndi.ceremonyNames).toEqual(plan.filter((c) => c.vendorNeeds.includes("mehndi_artist")).map((c) => c.name));
    expect(mehndi.category).toBe(VENDOR_NEEDS.mehndi_artist.category);
  });

  it("returns nothing for nothing", () => {
    expect(needsFor([])).toEqual([]);
  });

  it("lists every kind of vendor for adding by hand", () => {
    expect(ALL_NEEDS.map((n) => n.key)).toEqual(Object.keys(VENDOR_NEEDS));
  });
});

describe("kinds", () => {
  it("guesses a kind from a ceremony's name", () => {
    expect(guessKind("Mehendi night")).toBe("mehndi");
    expect(guessKind("Ceremony & Reception (Chuppah)")).toBe("chuppah");
    expect(guessKind("Rehearsal Dinner")).toBe("dinner");
    expect(guessKind("Anand Karaj")).toBe("gurdwara");
    expect(guessKind("Walima")).toBe("reception");
    expect(guessKind("Something else entirely")).toBeUndefined();
  });
});
