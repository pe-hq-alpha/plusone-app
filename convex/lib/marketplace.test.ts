import { describe, expect, test } from "vitest";
import { badgesFor, bandOf, checkOfferLines, checkPriceTerms, cityKey, e164, emailMatchesWebsite, inRangeUnit, isListed, levelFor, offerTotal, startingOffering, tierFor } from "./marketplace";
import { sheetFor } from "./standardSheet";

describe("cityKey", () => {
  test("reads spacing, case and old names as one city", () => {
    expect(cityKey(" Chennai ")).toBe("chennai");
    expect(cityKey("Madras")).toBe("chennai");
    expect(cityKey("Bangalore")).toBe("bengaluru");
    expect(cityKey("New  Delhi")).toBe("delhi");
  });
});

describe("bandOf", () => {
  test("needs eight prices before it calls anything a range", () => {
    expect(bandOf([400, 450, 500, 550, 600, 650, 700])).toBeNull();
    expect(bandOf([400, 450, 500, 550, 600, 650, 700, 0, -5])).toBeNull();
  });

  test("gives the quartiles and the 90th percentile of the prices", () => {
    const band = bandOf([800, 400, 450, 500, 550, 600, 650, 700, 750]);
    expect(band).toEqual({ count: 9, p25: 500, p50: 600, p75: 700, p90: 760 });
  });
});

describe("tierFor", () => {
  const band = { count: 9, p25: 500, p50: 600, p75: 700, p90: 760 };

  test("places a price in its city's range", () => {
    expect(tierFor(480, band)).toBe("Value");
    expect(tierFor(500, band)).toBe("Value");
    expect(tierFor(650, band)).toBe("Standard");
    expect(tierFor(740, band)).toBe("Premium");
    expect(tierFor(900, band)).toBe("Luxury");
  });

  test("says nothing without a range or a price", () => {
    expect(tierFor(650, null)).toBeUndefined();
    expect(tierFor(0, band)).toBeUndefined();
  });
});

describe("levelFor", () => {
  test("grows with events done through PlusOne", () => {
    expect(levelFor(0)).toBe("New");
    expect(levelFor(3)).toBe("Trusted");
    expect(levelFor(12)).toBe("Top");
  });
});

describe("badges and listing", () => {
  const itemised = { price: 550, unit: "per_person" as const, includes: ["Banana leaf service", "Water"] };
  const bare = { price: 550, unit: "per_person" as const, includes: [] };

  test("a verified vendor with itemised prices shows transparent pricing", () => {
    expect(badgesFor({ status: "verified", source: "vendor_signup" }, [itemised])).toEqual(["verified", "transparent_pricing"]);
  });

  test("one price without its inclusions holds the badge back", () => {
    expect(badgesFor({ status: "verified", source: "vendor_signup" }, [itemised, bare])).toEqual(["verified"]);
    expect(badgesFor({ status: "verified", source: "vendor_signup" }, [])).toEqual(["verified"]);
  });

  test("a listing PlusOne added says so until it is verified, and never earns the pricing badge", () => {
    expect(badgesFor({ status: "pending", source: "plusone_added" }, [itemised])).toEqual(["plusone_added"]);
    expect(badgesFor({ status: "verified", source: "plusone_added" }, [itemised])).toEqual(["verified", "transparent_pricing"]);
  });

  test("families see verified vendors and PlusOne's own listings, never an unchecked sign-up", () => {
    expect(isListed({ status: "verified", source: "vendor_signup" })).toBe(true);
    expect(isListed({ status: "pending", source: "plusone_added" })).toBe(true);
    expect(isListed({ status: "pending", source: "vendor_signup" })).toBe(false);
    expect(isListed({ status: "suspended", source: "plusone_added" })).toBe(false);
    expect(isListed({ status: "rejected", source: "vendor_signup" })).toBe(false);
  });

  test("the starting price is the cheapest offering in the category asked about", () => {
    const offerings = [
      { ...itemised, category: "Catering", price: 650 },
      { ...itemised, category: "Catering", price: 480 },
      { ...itemised, category: "Cake", price: 200 },
    ];
    expect(startingOffering(offerings, "Catering")?.price).toBe(480);
    expect(startingOffering(offerings, "Venue")).toBeUndefined();
  });
});

describe("emailMatchesWebsite", () => {
  test("an address at the listing's own site proves the claim", () => {
    expect(emailMatchesWebsite("owner@anjalicaterers.example", "https://anjalicaterers.example")).toBe(true);
    expect(emailMatchesWebsite("Owner@Mail.AnjaliCaterers.example", "https://anjalicaterers.example")).toBe(true);
    expect(emailMatchesWebsite("owner@anjali.example", "https://www.anjali.example/menu")).toBe(true);
  });

  test("free mail and other sites never do", () => {
    expect(emailMatchesWebsite("anjalicaterers@gmail.com", "https://anjalicaterers.example")).toBe(false);
    expect(emailMatchesWebsite("someone@gmail.com", "https://gmail.com")).toBe(false);
    expect(emailMatchesWebsite("owner@other.example", "https://anjalicaterers.example")).toBe(false);
    expect(emailMatchesWebsite(undefined, "https://anjalicaterers.example")).toBe(false);
  });
});

describe("e164", () => {
  test("reads Indian mobiles with or without the country code", () => {
    expect(e164("98400 12345")).toBe("+919840012345");
    expect(e164("098400-12345")).toBe("+919840012345");
    expect(e164("+91 98400 12345")).toBe("+919840012345");
    expect(e164("+1 (416) 555-0100")).toBe("+14165550100");
  });

  test("turns down what can't be a number", () => {
    expect(e164("12345")).toBeUndefined();
    expect(e164("call me")).toBeUndefined();
  });
});

describe("offers on the standard sheet", () => {
  const sheet = sheetFor("Catering");
  const answers = [
    { key: "gst", status: "extra" as const },
    { key: "service_staff", status: "included" as const, amount: 999 },
    { key: "transport", status: "priced" as const, amount: 2499.6 },
    { key: "crockery", status: "included" as const },
    { key: "water", status: "extra" as const, amount: 600 },
    { key: "not_on_the_sheet", status: "priced" as const, amount: 5 },
  ];

  test("keeps the sheet's lines in its order, rounds amounts and drops what isn't on the sheet", () => {
    expect(checkOfferLines(sheet, answers)).toEqual({
      lines: [
        { key: "gst", status: "extra" },
        { key: "service_staff", status: "included" },
        { key: "transport", status: "priced", amount: 2500 },
        { key: "crockery", status: "included" },
        { key: "water", status: "extra", amount: 600 },
      ],
    });
  });

  test("every line must be answered, and a priced line needs its amount", () => {
    expect(checkOfferLines(sheet, answers.filter((a) => a.key !== "crockery"))).toEqual({ problem: expect.stringMatching(/crockery/i) });
    expect(checkOfferLines(sheet, answers.map((a) => (a.key === "gst" ? { key: "gst", status: "unstated" as const } : a)))).toEqual({
      problem: expect.stringMatching(/GST/),
    });
    expect(checkOfferLines(sheet, answers.map((a) => (a.key === "transport" ? { key: "transport", status: "priced" as const } : a)))).toEqual({
      problem: expect.stringMatching(/amount for transport/),
    });
    expect(checkOfferLines(null, answers)).toEqual({ lines: [] });
  });

  test("the total is the main price for its quantity plus the lines priced inside it, never the extras", () => {
    const checked = checkOfferLines(sheet, answers);
    expect("lines" in checked && offerTotal(550, 120, checked.lines)).toBe(550 * 120 + 2500);
  });
});

describe("prices in each trade's own units", () => {
  const photo = sheetFor("Photographer")!;
  const catering = sheetFor("Catering")!;

  test("a way of charging the trade uses is kept with what it includes; one it doesn't is turned down", () => {
    expect(checkPriceTerms(photo, "per_hour", { hours: 6, photographers: 2 }, true)).toEqual({ priceUnit: "per_hour", quantities: { hours: 6, photographers: 2 }, times: 6 });
    expect(checkPriceTerms(photo, "per_plate", {}, true)).toEqual({ problem: expect.stringMatching(/ways this service is priced/) });
    expect(checkPriceTerms(photo, undefined, {}, true)).toMatchObject({ priceUnit: "for_event", times: 1 });
  });

  test("quantities must be on the sheet and be numbers not below zero", () => {
    expect(checkPriceTerms(photo, "for_event", { plates: 100 }, true)).toEqual({ problem: expect.stringMatching(/isn't something/) });
    expect(checkPriceTerms(photo, "for_event", { hours: -2 }, true)).toEqual({ problem: "The number for hours of coverage doesn't look right." });
    expect(checkPriceTerms(photo, "for_event", { photos: Number.NaN }, true)).toEqual({ problem: expect.stringMatching(/edited photos/) });
    expect(checkPriceTerms(photo, "for_event", { photos: Infinity }, true)).toEqual({ problem: expect.stringMatching(/edited photos/) });
    expect(checkPriceTerms(sheetFor("Officiant")!, "for_ceremony", { assistants: 0 }, true)).toMatchObject({ quantities: { assistants: 0 } });
  });

  test("an offer must give what its price is multiplied by; a published rate needn't", () => {
    expect(checkPriceTerms(photo, "per_hour", { photographers: 2 }, true)).toEqual({ problem: "A price per hour needs the hours of coverage." });
    expect(checkPriceTerms(photo, "per_hour", { hours: 0 }, true)).toEqual({ problem: "A price per hour needs the hours of coverage." });
    expect(checkPriceTerms(sheetFor("Cake")!, "per_kg", {}, true)).toEqual({ problem: "A price per kg needs the weight." });
    expect(checkPriceTerms(catering, "per_plate", {}, true)).toEqual({ problem: "Say how many plates the price is for." });
    expect(checkPriceTerms(photo, "per_hour", {}, false)).toEqual({ priceUnit: "per_hour", quantities: {}, times: null });
  });

  test("quantities that go with another way of charging are dropped, and plates are whole", () => {
    expect(checkPriceTerms(photo, "for_event", { hours: 8, days: 2 }, true)).toEqual({ priceUnit: "for_event", quantities: { hours: 8 }, times: 1 });
    expect(checkPriceTerms(catering, "per_plate", { count: 119.6, dishes: 12 }, true)).toEqual({ priceUnit: "per_plate", quantities: { count: 120, dishes: 12 }, times: 120 });
    expect(checkPriceTerms(sheetFor("Cake")!, "per_kg", { weight: 1.5 }, true)).toMatchObject({ times: 1.5 });
  });

  test("only prices in the way Compare reads a category go into its city's range", () => {
    expect(inRangeUnit({ category: "Photographer", unit: "total", priceUnit: "for_event" })).toBe(true);
    expect(inRangeUnit({ category: "Photographer", unit: "total" })).toBe(true);
    expect(inRangeUnit({ category: "Photographer", unit: "total", priceUnit: "per_hour" })).toBe(false);
    expect(inRangeUnit({ category: "Catering", unit: "per_person", priceUnit: "per_plate" })).toBe(true);
    // A caterer's lump sum, saved as "all in" before units followed the sheet, isn't a price per plate.
    expect(inRangeUnit({ category: "Catering", unit: "total" })).toBe(false);
    expect(inRangeUnit({ category: "Cake", unit: "total", priceUnit: "per_kg" })).toBe(false);
    expect(inRangeUnit({ category: "Cake", unit: "total", priceUnit: "for_cake" })).toBe(true);
    expect(inRangeUnit({ category: "Mehndi artist", unit: "per_person" })).toBe(true);
  });

  test("the starting price is the cheapest priced the way the range is, ahead of a cheaper rate per hour", () => {
    const offerings = [
      { price: 2_000, unit: "total" as const, includes: ["Edited photos"], category: "Photographer", priceUnit: "per_hour" },
      { price: 15_000, unit: "total" as const, includes: ["Edited photos"], category: "Photographer", priceUnit: "for_event" },
      { price: 12_500, unit: "total" as const, includes: ["Edited photos"], category: "Photographer" },
    ];
    expect(startingOffering(offerings, "Photographer")?.price).toBe(12_500);
    expect(startingOffering(offerings.slice(0, 1), "Photographer")?.priceUnit).toBe("per_hour");
  });
});
