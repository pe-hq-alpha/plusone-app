import { describe, expect, test } from "vitest";
import {
  cleanQuery,
  defaultSearchText,
  fallbackQueries,
  isDocumentUrl,
  mergeByHost,
  needPlural,
  ownTitle,
  partOfNeed,
  roughBudget,
  searchCountry,
  searchLocation,
  withOccasion,
} from "./searchTerms";

describe("budgets the way people say them", () => {
  test("rupees round up to the next lakh, half crore or 5,000", () => {
    expect(roughBudget(715_000, "INR")).toBe("8 lakh");
    expect(roughBudget(700_000, "INR")).toBe("7 lakh");
    expect(roughBudget(12_000_000, "INR")).toBe("1.5 crore");
    expect(roughBudget(9_950_000, "INR")).toBe("1 crore");
    expect(roughBudget(45_000, "INR")).toBe("₹45,000");
    expect(roughBudget(41_200, "INR")).toBe("₹45,000");
    expect(roughBudget(97_000, "INR")).toBe("1 lakh");
  });

  test("the couple reads a sign on lakhs and crores", () => {
    expect(roughBudget(715_000, "INR", { sign: true })).toBe("₹8 lakh");
    expect(roughBudget(12_000_000, "INR", { sign: true })).toBe("₹1.5 crore");
    expect(roughBudget(250_000, "PKR", { sign: true })).toBe("Rs 3 lakh");
  });

  test("other currencies round up to two figures, in thousands", () => {
    expect(roughBudget(14_500, "USD")).toBe("$15k");
    expect(roughBudget(8_000, "GBP")).toBe("£8k");
    expect(roughBudget(4_200, "USD")).toBe("$4.2k");
    expect(roughBudget(4_210, "USD")).toBe("$4.3k");
    expect(roughBudget(1_234_567, "EUR")).toBe("€1.3m");
    expect(roughBudget(455, "USD")).toBe("$460");
    expect(roughBudget(0, "USD")).toBe("");
  });
});

describe("search words for a need", () => {
  test("plural search nouns, with a fallback", () => {
    expect(needPlural("Venue")).toBe("venues");
    expect(needPlural("Photographer")).toBe("photographers");
    expect(needPlural("Catering")).toBe("caterers");
    expect(needPlural("Music/DJ")).toBe("DJs");
    expect(needPlural("Decor & Florals")).toBe("decorators");
    expect(needPlural("Officiant")).toBe("officiants");
    expect(needPlural("Childcare")).toBe("childcare services");
  });

  test("a renamed need keeps the couple's word; a near-copy of the category doesn't count", () => {
    expect(ownTitle("Iyer", "Officiant")).toBe("Iyer");
    expect(ownTitle("Photography", "Photographer")).toBeUndefined();
    expect(ownTitle("Cake & desserts", "Cake")).toBeUndefined();
    expect(ownTitle("Decorations", "Decor & Florals")).toBeUndefined();
  });

  test("the plain label for someone to lead a ceremony is not searched for as a word", () => {
    expect(ownTitle("Who leads the ceremony", "Officiant")).toBeUndefined();
    expect(ownTitle("who leads the ceremony", "Officiant")).toBeUndefined();
    expect(ownTitle("Vadhyar", "Officiant")).toBe("Vadhyar");
  });

  test("a need's part is named only when it serves one of several parts", () => {
    const parts = [{ _id: "a", name: "Muhurtham" }, { _id: "b", name: "Reception" }];
    expect(partOfNeed(["a"], parts)).toBe("Muhurtham");
    expect(partOfNeed(["a", "b"], parts)).toBeUndefined();
    expect(partOfNeed(["a"], [parts[0]])).toBeUndefined();
    expect(partOfNeed(["z"], parts)).toBeUndefined();
  });

  test("country and location for the search", () => {
    expect(searchCountry("INR")).toBe("IN");
    expect(searchCountry("usd")).toBe("US");
    expect(searchCountry("EUR")).toBeUndefined();
    expect(searchLocation("Panampilly Nagar", "Kochi")).toBe("Panampilly Nagar, Kochi");
    expect(searchLocation(undefined, "Kochi")).toBe("Kochi");
  });
});

describe("clean search terms", () => {
  test("the Kochi sentence becomes a short query with no figure in it", () => {
    const q = cleanQuery("Venue in Kochi for a beach wedding that feels intimate under ₹7,15,000", "Kochi");
    expect(q).toBe("Venue in Kochi beach wedding intimate");
    expect(q).not.toMatch(/\d|₹|under|that feels|for a/);
    expect(q.split(" ").length).toBeLessThanOrEqual(8);
  });

  test("keeps the budget words it was given, and only those", () => {
    expect(cleanQuery("venues in Kochi under 8 lakh", "Kochi", "8 lakh")).toBe("venues in Kochi under 8 lakh");
    expect(cleanQuery("venues in Kochi under ₹8 lakhs", "Kochi", "8 lakh")).toBe("venues in Kochi under 8 lakh");
    expect(cleanQuery("venues in Kochi under 7.15 lakh", "Kochi", "8 lakh")).toBe("venues in Kochi");
    expect(cleanQuery('"Photographer" Austin $4,200 budget', "Austin")).toBe("Photographer Austin");
  });

  test("adds the place, neighbourhood before the city, and caps the length", () => {
    expect(cleanQuery("intimate venues", "Kochi")).toBe("intimate venues in Kochi");
    expect(cleanQuery("venues in Kochi", "Panampilly Nagar Kochi")).toBe("venues in Panampilly Nagar Kochi");
    const long = cleanQuery("rustic barn wedding venue with string lights and a lake view for two hundred guests", "Austin");
    expect(long.split(" ").length).toBeLessThanOrEqual(8);
    expect(long.length).toBeLessThanOrEqual(70);
    expect(long.endsWith("in Austin")).toBe(true);
    expect(cleanQuery("₹7,15,000", "Kochi")).toBe("");
  });
});

describe("what the search box says before anyone types", () => {
  test("reads naturally, with the budget the way people say it", () => {
    const base = { city: "Kochi", occasion: "a wedding", amount: 715_000, currency: "INR" };
    expect(defaultSearchText({ ...base, category: "Venue", title: "Venue", vibes: ["Intimate"] })).toBe(
      "Venues in Kochi for a wedding, intimate, under ₹8 lakh",
    );
    expect(defaultSearchText({ ...base, category: "Officiant", title: "Iyer", area: "Panampilly Nagar", amount: 50_000 })).toBe(
      "Iyer in Panampilly Nagar, Kochi for a wedding, under ₹50,000",
    );
    expect(defaultSearchText({ ...base, category: "Officiant", title: "Who leads the ceremony", amount: 50_000 })).toBe(
      "Officiants in Kochi for a wedding, under ₹50,000",
    );
    expect(
      defaultSearchText({ category: "Photographer", title: "Photography", city: "Austin", occasion: "a wedding", amount: 4_200, currency: "USD" }),
    ).toBe("Photographers in Austin for a wedding, under $4.2k");
  });

  test("a need for one part names the part, in the family's words", () => {
    expect(
      defaultSearchText({ category: "Live band", title: "Nadaswaram", area: "Mylapore", city: "Chennai", occasion: "a wedding", part: "Muhurtham", amount: 45_000, currency: "INR" }),
    ).toBe("Nadaswaram for Muhurtham in Mylapore, Chennai, under ₹45,000");
  });

  test("cleans down to terms with no exact figure", () => {
    const text = defaultSearchText({ category: "Venue", city: "Kochi", occasion: "a wedding", vibes: ["intimate"], amount: 715_000, currency: "INR" });
    expect(cleanQuery(text, "Kochi")).toBe("Venues in Kochi wedding intimate");
  });
});

describe("the searches PlusOne falls back on", () => {
  test("an intimate wedding venue in Kochi at 8 lakh: no price and no mood in any search", () => {
    // "under 8 lakh" and "intimate" pull in directories and listicles, not vendors' own sites.
    expect(
      fallbackQueries({ need: "Venue", title: "Venue", place: "Kochi", vibe: "intimate", budgetWords: "8 lakh", occasion: "wedding" }),
    ).toEqual(["wedding venues in Kochi", "venue Kochi wedding packages pricing"]);
  });

  test("an Officiant renamed Iyer searches for the Iyer, in the family's word", () => {
    const queries = fallbackQueries({ need: "Officiant", title: "Iyer", place: "Chennai", budgetWords: "₹50,000", occasion: "wedding" });
    expect(queries).toEqual(["Iyer for wedding in Chennai", "Iyer Chennai wedding packages pricing"]);
  });

  test("a need for one part searches by the need, the part and the place first", () => {
    const queries = fallbackQueries({ need: "Live band", title: "Nadaswaram", place: "Mylapore Chennai", part: "Muhurtham", occasion: "wedding" });
    expect(queries[0]).toBe("Nadaswaram for Muhurtham in Mylapore Chennai");
    expect(queries).toContain("Nadaswaram for wedding in Mylapore Chennai");
  });

  test("an unnamed need to lead a part searches for officiants for that part, never a religion's word", () => {
    const queries = fallbackQueries({ need: "Officiant", title: "Who leads the ceremony", place: "Kochi", part: "Ceremony", occasion: "wedding" });
    expect(queries).toEqual([
      "officiants for Ceremony in Kochi",
      "wedding officiants in Kochi",
      "officiant Kochi wedding packages pricing",
    ]);
    expect(queries.join(" ")).not.toMatch(/who leads|priest|qazi|granthi|hindu|muslim|sikh/i);
  });

  test("every query names the place and the occasion, and none mentions money", () => {
    const queries = fallbackQueries({ need: "Photographer", title: "Photography", place: "Austin", budgetWords: "$4.2k", occasion: "wedding" });
    expect(queries).toEqual(["wedding photographers in Austin", "photographer Austin wedding packages pricing"]);
    expect(queries.every((q) => q.includes("Austin") && q.includes("wedding"))).toBe(true);
    expect(queries.filter((q) => /\$|₹|under/.test(q))).toEqual([]);
    expect(queries.filter((q) => /pricing/.test(q))).toHaveLength(1);
  });

  test("another occasion uses its own word", () => {
    expect(fallbackQueries({ need: "Venue", place: "Austin", occasion: "birthday party", budgetWords: "$2k" })).toEqual([
      "birthday party venues in Austin",
      "venue Austin birthday party packages pricing",
    ]);
  });

  test("a planner search that left the occasion out gets it back", () => {
    expect(withOccasion("venues in Kochi under 8 lakh", "wedding")).toBe("wedding venues in Kochi under 8 lakh");
    expect(withOccasion("beach wedding venues in Kochi", "wedding")).toBe("beach wedding venues in Kochi");
    expect(withOccasion("Kochi weddings venue packages", "wedding")).toBe("Kochi weddings venue packages");
    expect(withOccasion("venues in Austin", "birthday party")).toBe("birthday party venues in Austin");
  });
});

describe("one list from several searches", () => {
  const r = (url: string) => ({ url });

  test("a site several searches found ranks above one a single search put first", () => {
    const merged = mergeByHost([
      [r("https://solo.com/"), r("https://both.com/a"), r("https://third.com/")],
      [r("https://other.com/"), r("https://www.both.com/b")],
    ]);
    expect(merged.map((m) => m.url)).toEqual([
      "https://both.com/a",
      "https://solo.com/",
      "https://other.com/",
      "https://third.com/",
    ]);
  });

  test("one entry per site, keeping its best-placed page, counted once per search", () => {
    const merged = mergeByHost([
      [r("https://a.com/1"), r("https://a.com/2"), r("https://b.com/")],
      [r("https://b.com/x"), r("https://a.com/3")],
    ]);
    expect(merged.map((m) => m.url)).toEqual(["https://a.com/1", "https://b.com/x"]);
  });

  test("a PDF or other document is never a candidate", () => {
    expect(isDocumentUrl("https://images.example.com/uploads/WH2022-23-MAGZTER.pdf")).toBe(true);
    expect(isDocumentUrl("https://venue.example.com/brochure.PDF?v=2")).toBe(true);
    expect(isDocumentUrl("https://venue.example.com/packages")).toBe(false);
    expect(isDocumentUrl("not a url")).toBe(false);
  });

  test("ties go to the better position, then the earlier search", () => {
    const merged = mergeByHost([[r("https://first.com/")], [r("https://second.com/")]]);
    expect(merged.map((m) => m.url)).toEqual(["https://first.com/", "https://second.com/"]);
  });
});
