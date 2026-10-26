import { describe, expect, test } from "vitest";
import { inboxUsernames } from "./inboxName";

describe("inboxUsernames", () => {
  test("reads like the couple, first names only", () => {
    expect(inboxUsernames("Priya Sharma", "Arjun Mehta", "2027-02-12", "k57abcdef123")[0]).toBe("priya.and.arjun");
  });

  test("adds the wedding year, then a number, before anything random", () => {
    expect(inboxUsernames("Priya", "Arjun", "2027-02-12", "k57abcdef123")).toEqual([
      "priya.and.arjun",
      "priya.and.arjun.2027",
      "priya.and.arjun.2027.2",
      "priya.and.arjun.2027.3",
      "priya.and.arjun.2027.4",
      "priya.and.arjun.def123",
    ]);
  });

  test("drops accents and anything an address can't hold", () => {
    expect(inboxUsernames("Zoë", "José-Luis", "2027-06-01", "x1")[0]).toBe("zoe.and.joseluis");
  });

  test("one name, or none that can be written in an address", () => {
    expect(inboxUsernames("Ananya", "", "2027-01-01", "x1")[0]).toBe("ananya");
    expect(inboxUsernames("प्रिया", "अर्जुन", "", "abc999")[0]).toBe("event");
    expect(inboxUsernames("प्रिया", "अर्जुन", "", "abc999")).toContain("event.abc999");
  });
});
