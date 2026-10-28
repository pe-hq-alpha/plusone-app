import { describe, expect, test } from "vitest";
import { badgesFor, bandOf, cityKey, e164, emailMatchesWebsite, isListed, levelFor, startingOffering, tierFor } from "./marketplace";

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
    expect(emailMatchesWebsite("owner@anjalicaterers.in", "https://anjalicaterers.in")).toBe(true);
    expect(emailMatchesWebsite("Owner@Mail.AnjaliCaterers.in", "https://anjalicaterers.in")).toBe(true);
    expect(emailMatchesWebsite("owner@anjali.in", "https://www.anjali.in/menu")).toBe(true);
  });

  test("free mail and other sites never do", () => {
    expect(emailMatchesWebsite("anjalicaterers@gmail.com", "https://anjalicaterers.in")).toBe(false);
    expect(emailMatchesWebsite("someone@gmail.com", "https://gmail.com")).toBe(false);
    expect(emailMatchesWebsite("owner@other.in", "https://anjalicaterers.in")).toBe(false);
    expect(emailMatchesWebsite(undefined, "https://anjalicaterers.in")).toBe(false);
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
