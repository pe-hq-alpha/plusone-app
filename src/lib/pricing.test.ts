import { describe, expect, it } from "vitest";
import { monthlyPrice } from "./pricing";

describe("plan prices", () => {
  it("are in rupees for India, state or not", () => {
    expect(monthlyPrice("copilot", "IN")).toEqual({ amount: 1000, currency: "INR" });
    expect(monthlyPrice("assisted", "IN-TN")).toEqual({ amount: 2500, currency: "INR" });
  });

  it("are in dollars everywhere else, and before the region is known", () => {
    expect(monthlyPrice("copilot", "US")).toEqual({ amount: 10, currency: "USD" });
    expect(monthlyPrice("assisted", "GB")).toEqual({ amount: 25, currency: "USD" });
    expect(monthlyPrice("copilot", undefined)).toEqual({ amount: 10, currency: "USD" });
  });
});
