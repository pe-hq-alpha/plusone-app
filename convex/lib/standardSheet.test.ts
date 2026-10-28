import { describe, expect, test } from "vitest";
import { basisFor } from "./comparable";
import { missingCharges, readQuote, sheetFor, STANDARD_SHEETS } from "./standardSheet";
import { VENDOR_NEEDS } from "./vocab";

const line = (item: string, kind: "core" | "extra" | "tax" | "fee", amount: number, more: object = {}) => ({
  item,
  kind,
  unit: "total" as const,
  amount,
  ...more,
});

describe("a sheet for each first category", () => {
  test("the launch categories each have a sheet: venue, food, decor, cake, photos, video, entertainment, return gifts, priest", () => {
    for (const need of ["venue", "catering", "decor", "cake", "photography", "videography", "entertainment", "gifting", "officiant"] as const) {
      expect(sheetFor(need), need).not.toBeNull();
    }
  });

  test("a sheet is found by the category name a slot carries, as well as by its need", () => {
    expect(sheetFor("Decor & Florals")?.need).toBe("decor");
    expect(sheetFor("Catering")?.need).toBe("catering");
    expect(sheetFor("catering")?.need).toBe("catering");
  });

  test("a category without a sheet gets none, rather than a wrong one", () => {
    expect(sheetFor("Fireworks")).toBeNull();
    expect(sheetFor("Something new")).toBeNull();
  });

  test("each sheet prices in the same unit Compare uses for its category, so offers and quotes line up", () => {
    for (const sheet of Object.values(STANDARD_SHEETS)) {
      expect(sheet.unit, sheet.need).toBe(basisFor(VENDOR_NEEDS[sheet.need].category));
    }
  });

  test("line keys are unique within a sheet", () => {
    for (const sheet of Object.values(STANDARD_SHEETS)) {
      const keys = sheet.lines.map((l) => l.key);
      expect(new Set(keys).size, sheet.need).toBe(keys.length);
    }
  });
});

describe("reading a quote against its sheet", () => {
  const catering = sheetFor("catering")!;
  const quote = {
    total: 59_500,
    lines: [
      { item: "Lunch, South Indian meals", kind: "core" as const, unit: "per_person" as const, quantity: 150, unitPrice: 380, amount: 57_000 },
      line("Transport", "fee", 2_500),
      line("Packaged water bottles", "extra", 1_800, { optional: true }),
    ],
    includes: ["Banana leaf service"],
    excludes: ["Service staff"],
  };
  const reading = Object.fromEntries(readQuote(quote, catering).map((r) => [r.key, r]));

  test("a charge on its own line is priced, with its amount", () => {
    expect(reading.transport).toMatchObject({ status: "priced", amount: 2_500 });
  });

  test("something the vendor lists as included is included", () => {
    expect(reading.crockery).toMatchObject({ status: "included" });
  });

  test("something the vendor leaves out is extra, with no amount", () => {
    expect(reading.service_staff).toMatchObject({ status: "extra" });
    expect(reading.service_staff.amount).toBeUndefined();
  });

  test("an add-on offered outside the total is extra, with its price", () => {
    expect(reading.water).toMatchObject({ status: "extra", amount: 1_800 });
  });

  test("a charge the quote never mentions is unstated", () => {
    expect(reading.gst).toMatchObject({ status: "unstated" });
  });

  test("GST follows the quote's own reading of tax when there is no tax line", () => {
    expect(Object.fromEntries(readQuote({ ...quote, taxIncluded: true }, catering).map((r) => [r.key, r.status])).gst).toBe("included");
    expect(Object.fromEntries(readQuote({ ...quote, taxIncluded: false }, catering).map((r) => [r.key, r.status])).gst).toBe("extra");
  });

  test("a line that names two charges counts once, for the one it names first", () => {
    const vessels = { total: 56_500, lines: [line("Transport of vessels and staff", "fee", 2_500)] };
    const r = Object.fromEntries(readQuote(vessels, catering).map((x) => [x.key, x]));
    expect(r.transport).toMatchObject({ status: "priced", amount: 2_500 });
    expect(r.service_staff.status).toBe("unstated");
  });

  test("'banana-leaf' with a hyphen is still the serving ware", () => {
    const leaf = { total: 62_000, includes: ["Banana-leaf lunch with two sweets"] };
    expect(Object.fromEntries(readQuote(leaf, catering).map((x) => [x.key, x.status])).crockery).toBe("included");
  });

  test("a service charge for staff and cleaning is the service staff line", () => {
    const annam = { total: 63_000, lines: [line("Service charge (staff and cleaning)", "fee", 6_000)] };
    expect(Object.fromEntries(readQuote(annam, catering).map((x) => [x.key, x])).service_staff).toMatchObject({ status: "priced", amount: 6_000 });
  });

  test("the price of the food itself never counts as a charge: 'per plate' is not crockery", () => {
    const plain = { total: 57_000, lines: [{ item: "Veg meals per plate", kind: "core" as const, unit: "per_person" as const, amount: 57_000 }] };
    expect(Object.fromEntries(readQuote(plain, catering).map((r) => [r.key, r.status])).crockery).toBe("unstated");
  });
});

describe("missing charges", () => {
  const decor = sheetFor("decor")!;
  const asMessages = (xs: { message: string }[]) => xs.map((x) => x.message);

  test("a quote that never mentions GST is asked about it", () => {
    expect(asMessages(missingCharges({ total: 40_000 }, decor, []))).toContain("Doesn't say whether GST is included");
  });

  test("a usual extra the quote never mentions is asked about", () => {
    expect(asMessages(missingCharges({ total: 40_000 }, decor, []))).toContain("Doesn't say whether transport is included");
  });

  test("a charge other quotes for the same need price is shown with their range", () => {
    const others = [
      { total: 45_000, lines: [line("Stage decor", "core", 42_000), line("Transport", "fee", 3_000)] },
      { total: 38_000, lines: [line("Stage decor", "core", 36_000), line("Vehicle charges", "fee", 2_000)] },
    ];
    expect(asMessages(missingCharges({ total: 40_000 }, decor, others))).toContain("No transport line, and two others charge ₹2,000–₹3,000");
  });

  test("one other quote's charge reads in the singular, as a single figure", () => {
    const others = [{ total: 45_000, lines: [line("Stage decor", "core", 42_000), line("Transport", "fee", 3_000)] }];
    expect(asMessages(missingCharges({ total: 40_000 }, decor, others))).toContain("No transport line, and one other charges ₹3,000");
  });

  test("an extra with no price is flagged, since it isn't in the total", () => {
    expect(asMessages(missingCharges({ total: 40_000, excludes: ["Transport"] }, decor, []))).toContain("Transport is extra, with no price given");
  });

  test("an extra with no price says what others charge for it", () => {
    const others = [{ total: 45_000, lines: [line("Stage decor", "core", 42_000), line("Transport", "fee", 3_000)] }];
    expect(asMessages(missingCharges({ total: 40_000, excludes: ["Transport"] }, decor, others))).toContain(
      "Transport is extra, with no price given; one other charges ₹3,000",
    );
  });

  test("GST left out isn't compared with another quote's GST, since GST is a share of each price", () => {
    const others = [{ total: 66_150, lines: [line("Lunch", "core", 63_000), line("GST at 5%", "tax", 3_150)] }];
    expect(asMessages(missingCharges({ total: 56_500, taxIncluded: false }, sheetFor("catering")!, others))).toContain("GST is extra, with no amount given");
  });

  test("a hall that charges for its dining hall and kitchen shows it on its own line", () => {
    const hall = { total: 80_000, lines: [line("Hall rent", "core", 68_000), line("Dining hall and kitchen", "fee", 8_000), line("Electricity and cleaning", "fee", 4_000)], includes: ["Electricity and cleaning"] };
    const r = Object.fromEntries(readQuote(hall, sheetFor("venue")!).map((x) => [x.key, x]));
    expect(r.dining).toMatchObject({ status: "priced", amount: 8_000 });
    expect(r.electricity).toMatchObject({ status: "priced", amount: 4_000 });
    expect(r.cleaning.status).toBe("included");
  });

  test("a quote that prices or includes every usual extra has nothing missing", () => {
    const full = {
      total: 52_000,
      taxIncluded: true,
      lines: [line("Stage decor", "core", 44_000), line("Transport", "fee", 2_500), line("Setup and dismantling", "fee", 3_000), line("Lighting", "extra", 2_500)],
    };
    expect(missingCharges(full, decor, [])).toEqual([]);
  });

  test("something usually included isn't asked about unless others charge for it", () => {
    const cake = sheetFor("cake")!;
    const plain = { total: 6_000, taxIncluded: true, lines: [line("2 kg cake", "core", 5_500), line("Delivery", "fee", 500)] };
    expect(missingCharges(plain, cake, [])).toEqual([]);
    const topperElsewhere = [{ total: 7_000, lines: [line("2 kg cake", "core", 5_800), line("Custom topper", "extra", 1_200)] }];
    expect(asMessages(missingCharges(plain, cake, topperElsewhere))).toEqual(["No topper and customisation line, and one other charges ₹1,200"]);
  });

  test("food priced as a lump sum for no stated headcount is asked how many plates it covers", () => {
    const catering = sheetFor("catering")!;
    expect(asMessages(missingCharges({ total: 60_000, taxIncluded: true }, catering, []))).toContain("Doesn't say how many plates the price is for");
    expect(asMessages(missingCharges({ total: 60_000, taxIncluded: true, headcountAssumed: 150 }, catering, []))).not.toContain(
      "Doesn't say how many plates the price is for",
    );
  });

  test("each flag names the sheet line it is about, so Compare can mark that row", () => {
    const flags = missingCharges({ total: 40_000 }, decor, []);
    expect(flags.find((f) => f.message === "Doesn't say whether GST is included")).toMatchObject({ key: "gst", label: "GST" });
  });
});
