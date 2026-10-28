import { describe, expect, it } from "vitest";
import { monthlyPrice } from "./pricing";

describe("plan prices", () => {
  it("are in rupees for India, state or not", () => {
    expect(monthlyPrice("basic", "IN")).toEqual({ amount: 1000, currency: "INR" });
    expect(monthlyPrice("premium", "IN-TN")).toEqual({ amount: 2500, currency: "INR" });
  });

  it("are in dollars everywhere else, and before the region is known", () => {
    expect(monthlyPrice("basic", "US")).toEqual({ amount: 10, currency: "USD" });
    expect(monthlyPrice("premium", "GB")).toEqual({ amount: 25, currency: "USD" });
    expect(monthlyPrice("basic", undefined)).toEqual({ amount: 10, currency: "USD" });
  });
});
