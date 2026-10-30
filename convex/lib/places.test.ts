import { describe, expect, it } from "vitest";
import { distanceKm, kmText, placeFor, readSearch } from "./places";

describe("placeFor", () => {
  it("finds a Chennai area in an address, the longest name first", () => {
    expect(placeFor("No 4, 2nd Street, West Mambalam, Chennai 600033", "Chennai")).toMatchObject({ label: "West Mambalam", precision: "area" });
    expect(placeFor("R.A. Puram", "Chennai")?.label).toBe("R.A. Puram");
    expect(placeFor("t nagar")?.label).toBe("T. Nagar");
  });

  it("falls back to the city's middle when no area is named", () => {
    expect(placeFor("Somewhere unnamed", "Chennai")).toMatchObject({ label: "Chennai", precision: "city" });
    expect(placeFor(undefined, "Bangalore")).toMatchObject({ label: "Bengaluru", precision: "city" });
  });

  it("doesn't put a Chennai area on a vendor in another city", () => {
    expect(placeFor("Adyar Road", "Mumbai")).toMatchObject({ label: "Mumbai", precision: "city" });
  });

  it("knows nothing about a place it has no name for", () => {
    expect(placeFor("Springfield", "Springfield")).toBeNull();
    expect(placeFor(undefined, undefined)).toBeNull();
  });
});

describe("distanceKm", () => {
  it("measures Mylapore to Adyar as about four kilometres", () => {
    const mylapore = placeFor("Mylapore")!;
    const adyar = placeFor("Adyar")!;
    expect(distanceKm(mylapore, adyar)).toBeGreaterThan(3);
    expect(distanceKm(mylapore, adyar)).toBeLessThan(5);
    expect(distanceKm(mylapore, mylapore)).toBe(0);
  });

  it("reads distances in tenths below ten kilometres", () => {
    expect(kmText(3.46)).toBe("3.5 km");
    expect(kmText(12.4)).toBe("12 km");
    expect(kmText(0)).toBe("under 1 km");
  });
});

describe("readSearch", () => {
  it("reads a trade and a city", () => {
    expect(readSearch("caterers in Chennai")).toEqual({ category: "Catering", city: "Chennai" });
  });

  it("reads an area as Chennai's", () => {
    expect(readSearch("photographers near Adyar")).toEqual({ category: "Photographer", city: "Chennai", area: "Adyar" });
  });

  it("reads a price limit in rupees, thousands or lakhs", () => {
    expect(readSearch("veg caterers in Mylapore under 400").maxPrice).toBe(400);
    expect(readSearch("decorators under 25k").maxPrice).toBe(25_000);
    expect(readSearch("halls below 2 lakh in Anna Nagar")).toMatchObject({ category: "Venue", area: "Anna Nagar", maxPrice: 200_000 });
  });

  it("prefers the longer trade word", () => {
    expect(readSearch("marriage hall in Velachery").category).toBe("Venue");
    expect(readSearch("bridal makeup in T Nagar")).toMatchObject({ category: "Makeup & Hair", area: "T. Nagar" });
  });

  it("returns nothing it can't read", () => {
    expect(readSearch("something nice for amma")).toEqual({});
  });
});
