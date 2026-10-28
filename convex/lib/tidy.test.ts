import { describe, expect, it } from "vitest";
import { contactIn, keepsFacts, numbersIn } from "./tidy";

describe("numbersIn", () => {
  it("finds rupee amounts with commas as digits only", () => {
    expect(numbersIn("₹1,20,000 for the day")).toEqual(["120000"]);
  });

  it("keeps a lakh decimal as written", () => {
    expect(numbersIn("1.2 lakh for 100 guests")).toEqual(["1.2", "100"]);
  });

  it("gives rs.500/- as 500", () => {
    expect(numbersIn("rs.500/- per plate")).toEqual(["500"]);
  });

  it("finds both parts of a time", () => {
    expect(numbersIn("from 7:30 in the evening")).toEqual(["7", "30"]);
  });
});

describe("keepsFacts", () => {
  it("accepts a tidy that fixes units and the rupee sign", () => {
    expect(keepsFacts("5hrs veg lunch", "5 hours, vegetarian lunch")).toBe(true);
    expect(keepsFacts("rs.500/- per plate", "₹500 per plate")).toBe(true);
  });

  it("refuses a changed price, a dropped number, an empty answer and a much longer one", () => {
    expect(keepsFacts("₹500 per plate", "₹550 per plate")).toBe(false);
    expect(keepsFacts("lunch for 120 guests", "lunch for guests")).toBe(false);
    expect(keepsFacts("veg lunch", "")).toBe(false);
    expect(keepsFacts("veg lunch", "veg lunch and so much more that it goes on far beyond what was written at all")).toBe(false);
  });
});

describe("contactIn", () => {
  it("finds a +91 number, a 10-digit mobile, an email and a www link", () => {
    expect(contactIn("call +91 98400 12345")).toContain("phone");
    expect(contactIn("call 9840012345 today")).toContain("phone");
    expect(contactIn("write to us at hello@example.in")).toContain("email");
    expect(contactIn("see www.example.in for photos")).toContain("link");
    expect(contactIn("see https://example.in/menu")).toContain("link");
  });

  it("finds nothing in plain wording", () => {
    expect(contactIn("Lunch for 120 guests")).toEqual([]);
  });
});
