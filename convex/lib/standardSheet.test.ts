import { describe, expect, test } from "vitest";
import { basisFor } from "./comparable";
import { amountFor, basisUnitOf, describeOffer, gapsIn, missingCharges, priceUnitOf, quantitiesFor, quantityText, quantityValue, readQuote, sheetFor, STANDARD_SHEETS, timesFor, taxRate } from "./standardSheet";
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

  test("a hall's one-line rent is asked about the decorators' night-before access, rooms and parking, as our own baby shower taught us", () => {
    const hall = { total: 75_000, lines: [line("Half-day rent, 5 am to 2 pm", "core", 75_000)] };
    const asked = missingCharges(hall, sheetFor("venue")!, []).map((m) => m.key);
    expect(asked).toEqual(expect.arrayContaining(["early_access", "rooms", "parking", "overtime"]));
    const later = { total: 95_000, lines: [line("Half-day rent", "core", 75_000), line("Decorators from 11 pm the night before", "extra", 20_000)] };
    expect(Object.fromEntries(readQuote(later, sheetFor("venue")!).map((x) => [x.key, x])).early_access).toMatchObject({ status: "priced", amount: 20_000 });
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

  test("a verified vendor's offer counts among what others charge", () => {
    const offered = [[{ key: "transport", status: "priced" as const, amount: 1_200 }]];
    expect(asMessages(missingCharges({ total: 40_000 }, decor, [], offered))).toContain("No transport line, and one other charges ₹1,200");
  });

  test("an offer's own answers are checked too: an extra with no price is flagged, a priced one isn't", () => {
    const answers = [
      { key: "gst", status: "extra" as const, amount: 4_410 },
      { key: "transport", status: "priced" as const, amount: 1_200 },
      { key: "setup", status: "included" as const },
      { key: "lighting", status: "extra" as const },
    ];
    expect(asMessages(gapsIn(answers, decor, [], "INR"))).toEqual(["Lighting is extra, with no price given"]);
  });

  test("each flag names the sheet line it is about, so Compare can mark that row", () => {
    const flags = missingCharges({ total: 40_000 }, decor, []);
    expect(flags.find((f) => f.message === "Doesn't say whether GST is included")).toMatchObject({ key: "gst", label: "GST" });
  });
});

describe("how each trade charges, and what its price includes", () => {
  const sheets = Object.values(STANDARD_SHEETS);

  test("every sheet has a main way of charging and says what its price includes", () => {
    for (const sheet of sheets) {
      expect(sheet.units.length, sheet.need).toBeGreaterThan(0);
      expect(sheet.units.length, sheet.need).toBeLessThanOrEqual(3);
      expect(sheet.quantities.length, sheet.need).toBeGreaterThan(0);
    }
  });

  test("keys are unique, and every quantity a price is multiplied by is on the sheet and shown with that way of charging", () => {
    for (const sheet of sheets) {
      const units = sheet.units.map((u) => u.key);
      const quantities = sheet.quantities.map((q) => q.key);
      expect(new Set(units).size, sheet.need).toBe(units.length);
      expect(new Set(quantities).size, sheet.need).toBe(quantities.length);
      for (const unit of sheet.units) {
        expect(unit.priceLabel, unit.key).toBe(`Price ${unit.label}`);
        const shown = quantitiesFor(sheet, unit.key).map((q) => q.key);
        for (const key of unit.times) expect(shown, `${sheet.need} ${unit.key}`).toContain(key);
      }
      for (const q of sheet.quantities) for (const u of q.forUnits ?? []) expect(units, `${sheet.need} ${q.key}`).toContain(u);
    }
  });

  test("the main ways match the trades: per plate, for the event, per kg, for the day", () => {
    const main = Object.fromEntries(sheets.map((s) => [s.need, s.units[0].label]));
    expect(main).toEqual({
      venue: "for the day",
      catering: "per plate",
      decor: "for the setup",
      cake: "per kg",
      photography: "for the event",
      videography: "for the event",
      entertainment: "for the performance",
      makeup_hair: "for the package",
      gifting: "per piece",
      officiant: "for the ceremony",
    });
    expect(sheetFor("Photographer")!.units.map((u) => u.label)).toEqual(["for the event", "per hour", "per day"]);
  });

  test("plates and pieces come from the brief's guests, as 'For how many' does", () => {
    expect(sheetFor("Catering")!.quantities.find((q) => q.key === "count")).toMatchObject({ label: "Plates", fromBrief: true });
    expect(sheetFor("Gifting")!.quantities.find((q) => q.key === "count")).toMatchObject({ label: "Pieces", fromBrief: true });
    for (const sheet of sheets) {
      // Compare scales per-plate and per-piece needs by the count, so those trades always price by it.
      if (sheet.unit === "per_person" || sheet.unit === "per_piece") {
        for (const unit of sheet.units) expect(unit.times, `${sheet.need} ${unit.key}`).toEqual(["count"]);
      }
    }
  });
});

describe("reading a way of charging", () => {
  const photo = sheetFor("Photographer")!;
  const cake = sheetFor("Cake")!;

  test("a key finds its way of charging; none reads as the one Compare's unit is", () => {
    expect(priceUnitOf(photo, "per_hour").label).toBe("per hour");
    expect(priceUnitOf(photo).key).toBe("for_event");
    expect(priceUnitOf(photo, "per_fortnight").key).toBe("for_event");
  });

  test("a cake is priced per kg, but a price from before had no weight and was for the whole cake", () => {
    expect(cake.units[0].key).toBe("per_kg");
    expect(basisUnitOf(cake).key).toBe("for_cake");
    expect(priceUnitOf(cake).key).toBe("for_cake");
    for (const sheet of Object.values(STANDARD_SHEETS)) if (sheet.need !== "cake") expect(basisUnitOf(sheet), sheet.need).toBe(sheet.units[0]);
  });

  test("the days are asked for only with a price per day", () => {
    expect(quantitiesFor(photo, "for_event").map((q) => q.key)).toEqual(["hours", "photographers", "photos", "delivery"]);
    expect(quantitiesFor(photo, "per_day").map((q) => q.key)).toEqual(["hours", "photographers", "photos", "delivery", "days"]);
    expect(quantitiesFor(sheetFor("Venue")!, "per_session").map((q) => q.key)).toContain("sessions");
    expect(quantitiesFor(sheetFor("Venue")!, "for_day").map((q) => q.key)).not.toContain("sessions");
  });

  test("the amount is the price times what its unit counts, and waits for a missing quantity", () => {
    expect(amountFor(45_000, priceUnitOf(photo, "for_event"), {})).toBe(45_000);
    expect(amountFor(2_000, priceUnitOf(photo, "per_hour"), { hours: 6, photographers: 2 })).toBe(12_000);
    expect(amountFor(1_200, priceUnitOf(cake, "per_kg"), { weight: 2.5 })).toBe(3_000);
    expect(amountFor(340, priceUnitOf(sheetFor("Catering")!, "per_plate"), { count: 120 })).toBe(40_800);
    expect(amountFor(2_000, priceUnitOf(photo, "per_hour"), {})).toBeNull();
    expect(amountFor(2_000, priceUnitOf(photo, "per_hour"), { hours: 0 })).toBeNull();
    expect(timesFor(priceUnitOf(photo, "per_day"), { days: 2 })).toBe(2);
  });
});

describe("the line a customer reads", () => {
  test("a photographer's price, with what's in it", () => {
    expect(describeOffer(sheetFor("Photographer")!, "for_event", 45_000, { hours: 8, photographers: 2, photos: 400, delivery: 3 }, "INR")).toBe(
      "₹45,000 for the event · 8 hours · 2 photographers · 400 edited photos · delivered in 3 weeks",
    );
  });

  test("what the vendor didn't say is left out, and what doesn't go with the unit too", () => {
    expect(describeOffer(sheetFor("Photographer")!, "for_event", 45_000, { hours: 8, days: 2 }, "INR")).toBe("₹45,000 for the event · 8 hours");
    expect(describeOffer(sheetFor("Photographer")!, "per_day", 30_000, { days: 2 }, "INR")).toBe("₹30,000 per day · 2 days");
    expect(describeOffer(sheetFor("Decor & Florals")!, undefined, 24_500, {}, "INR")).toBe("₹24,500 for the setup");
  });

  test("each trade in its own words, one and many", () => {
    expect(describeOffer(sheetFor("Catering")!, "per_plate", 340, { count: 120, dishes: 10, sweets: 1, staff: 6 }, "INR")).toBe(
      "₹340 per plate · 120 plates · 10 dishes · 1 sweet · 6 serving staff",
    );
    expect(describeOffer(sheetFor("Cake")!, "per_kg", 1_100, { weight: 1.5, tiers: 1 }, "INR")).toBe("₹1,100 per kg · 1.5 kg · 1 tier");
    expect(describeOffer(sheetFor("Videographer")!, "for_event", 60_000, { operators: 1, film: 20, highlights: 3, delivery: 1 }, "INR")).toBe(
      "₹60,000 for the event · 1 camera operator · 20-minute film · 3-minute highlights film · delivered in 1 week",
    );
    expect(describeOffer(sheetFor("Officiant")!, "for_ceremony", 15_000, { hours: 2, assistants: 0 }, "INR")).toBe(
      "₹15,000 for the ceremony · 2 hours · no assistant priests",
    );
    expect(describeOffer(sheetFor("Decor & Florals")!, "for_setup", 18_000, { areas: 1 }, "INR")).toBe("₹18,000 for the setup · 1 area decorated");
  });

  test("a value in a Compare cell carries its measure, and a count just the number", () => {
    const photo = sheetFor("Photographer")!;
    const q = (key: string) => photo.quantities.find((x) => x.key === key)!;
    expect(quantityValue(q("hours"), 6)).toBe("6 hours");
    expect(quantityValue(q("delivery"), 1)).toBe("1 week");
    expect(quantityValue(q("photos"), 1200)).toBe("1,200");
    expect(quantityText(q("photographers"), 1)).toBe("1 photographer");
  });
});

describe("charges written the way vendors write them (from the missing-charge evaluation, 29 Oct)", () => {
  const sheet = sheetFor("Catering")!;
  const statusOf = (q: Parameters<typeof readQuote>[0]) => Object.fromEntries(readQuote(q, sheet).map((r) => [r.key, r]));

  test("a GST rate is priced on the quote's total, so it isn't asked about", () => {
    const r = statusOf({ total: 50_400, taxIncluded: false, excludes: ["GST 5% extra"] });
    expect(r.gst).toMatchObject({ status: "extra", amount: 2_520 });
  });

  test("a percentage that isn't beside the tax's name is never read as tax", () => {
    expect(taxRate({ total: 50_000, excludes: ["10% advance to confirm"] }, /\bgst\b/i)).toBeNull();
    expect(statusOf({ total: 50_000, taxIncluded: false, excludes: ["10% advance"] }).gst).toMatchObject({ status: "extra" });
    expect(statusOf({ total: 50_000, taxIncluded: false, excludes: ["10% advance"] }).gst.amount).toBeUndefined();
  });

  test("plates, glasses and tumblers are crockery, but a price per plate is not", () => {
    const line = (item: string) => ({ item, kind: "extra" as const, unit: "total" as const, amount: 1_500 });
    expect(statusOf({ total: 1_500, lines: [line("Plates and glasses")] }).crockery).toMatchObject({ status: "priced", amount: 1_500 });
    expect(statusOf({ total: 0, includes: ["Plates, tumblers and serving vessels"] }).crockery).toMatchObject({ status: "included" });
    expect(statusOf({ total: 0, includes: ["Rs 400 per plate"] }).crockery).toMatchObject({ status: "unstated" });
  });

  test("\"service\" on its own is service staff, but not inside \"banana leaf service\"", () => {
    expect(statusOf({ total: 0, includes: ["service", "GST"] }).service_staff).toMatchObject({ status: "included" });
    expect(statusOf({ total: 0, includes: ["Banana leaf service"] }).service_staff).toMatchObject({ status: "unstated" });
  });
});

describe("readQuote with charges", () => {
  const sheet = sheetFor("Catering")!;

  test("uses the charges and ignores lines the rules would have matched differently", () => {
    const quote = {
      total: 59_500,
      lines: [line("Transport", "fee", 2_500)],
      includes: ["Banana leaf service"],
      charges: [
        { key: "gst" as const, status: "included" as const },
        { key: "transport" as const, status: "not_mentioned" as const },
        { key: "water" as const, status: "priced" as const, amount: 1_800 },
      ],
    };
    const reading = Object.fromEntries(readQuote(quote, sheet).map((r) => [r.key, r]));
    // The rules would call transport priced from its line; the charge reading says it was never mentioned.
    expect(reading.transport).toMatchObject({ status: "unstated" });
    expect(reading.gst).toMatchObject({ status: "included" });
    expect(reading.water).toMatchObject({ status: "priced", amount: 1_800 });
    expect(reading.crockery).toMatchObject({ status: "unstated" });
  });

  test("an empty charges list falls back to the line-matching rules", () => {
    const quote = { total: 59_500, lines: [line("Transport", "fee", 2_500)], charges: [] };
    expect(Object.fromEntries(readQuote(quote, sheet).map((r) => [r.key, r])).transport).toMatchObject({ status: "priced", amount: 2_500 });
  });

  test("missingCharges flags water on the silent quote when the other prices it", () => {
    const silent = {
      total: 57_000,
      charges: [
        { key: "gst" as const, status: "included" as const },
        { key: "water" as const, status: "not_mentioned" as const },
      ],
    };
    const other = {
      total: 58_200,
      charges: [
        { key: "gst" as const, status: "included" as const },
        { key: "water" as const, status: "priced" as const, amount: 1_200 },
      ],
    };
    expect(missingCharges(silent, sheet, [other]).map((m) => m.message)).toContain("No water line, and one other charges ₹1,200");
  });
});

test("a GST rate read by Muse Spark is priced on the quote's total, never shown as nothing", () => {
  const sheet = sheetFor("Catering")!;
  const q = { total: 48_000, excludes: ["GST 5% extra"], charges: [{ key: "gst", status: "extra_with_amount_or_rate" as const }] };
  expect(readQuote(q, sheet).find((r) => r.key === "gst")).toMatchObject({ status: "extra", amount: 2_400 });
});


describe("makeup and hair", () => {
  const makeup = sheetFor("Makeup & Hair")!;

  test("a makeup artist prices a package, or each look, with the people and looks it covers", () => {
    expect(makeup.unit).toBe("total");
    expect(makeup.units.map((u) => u.label)).toEqual(["for the package", "per look"]);
    expect(timesFor(priceUnitOf(makeup, "per_look"), { looks: 3 })).toBe(3);
    expect(timesFor(priceUnitOf(makeup), {})).toBe(1);
  });

  test("the lines a makeup quote should state, a trial and an early start asked about", () => {
    expect(makeup.lines.map((l) => l.key)).toEqual(["gst", "travel", "hair", "draping", "trial", "early", "products"]);
    const line = (key: string) => makeup.lines.find((l) => l.key === key)!;
    expect(line("trial").match.test("Trial session ₹2,000")).toBe(true);
    expect(line("draping").match.test("saree draping included")).toBe(true);
    expect(line("products").match.test("HD makeup")).toBe(true);
    expect(line("early").usually).toBe("extra");
  });
});
