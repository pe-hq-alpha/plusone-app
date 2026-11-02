import { describe, expect, test } from "vitest";
import { leadDisplayName } from "./leadName";

describe("a web find's name, without its page title's tagline", () => {
  test.each([
    ["Chetan's Caterings: Best Catering Services in Tamil Nadu", "Chetan's Caterings"],
    ["CM Caterers - Veg Caterers In Chennai", "CM Caterers"],
    ["AstroVed: Vedic Astrology, Free Horoscope & Daily Panchang", "AstroVed"],
    ["Home | Annam Caterers", "Annam Caterers"],
    ["Best Caterers in Chennai | Kaveri Feast Co.", "Kaveri Feast Co"],
    ["Mangala Isai Nadaswaram Group — Official Website", "Mangala Isai Nadaswaram Group"],
    ["Sri Krishna Sweets - Mylapore", "Sri Krishna Sweets"],
  ])("%s → %s", (raw, shown) => {
    expect(leadDisplayName(raw)).toBe(shown);
  });

  test("a name with no separator, or a hyphen inside a word, is left as it is", () => {
    expect(leadDisplayName("Keto Ambrosia")).toBe("Keto Ambrosia");
    expect(leadDisplayName("Chettinad-Caterers")).toBe("Chettinad-Caterers");
    expect(leadDisplayName("  Thamarai   Hall ")).toBe("Thamarai Hall");
  });

  test("a one-letter piece never becomes the name", () => {
    expect(leadDisplayName("A - Annam Caterers")).toBe("A - Annam Caterers");
  });
});
