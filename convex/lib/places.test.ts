import { describe, expect, it, test } from "vitest";
import {
  addressTries,
  distanceKm,
  isGoogleMapsHost,
  isShortLinkHost,
  isShortMapLink,
  kmText,
  linkIn,
  pastConsent,
  placeFor,
  placeFromLink,
  placeWordsFromLink,
  plusCodePlace,
  readSearch,
} from "./places";

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

describe("a pasted Google Maps link or coordinates", () => {
  test("reads the place's own marker, with its name", () => {
    const url = "https://www.google.com/maps/place/Kaveri+Feast+Co./@13.0339,80.2619,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d13.03412!4d80.26205";
    expect(placeFromLink(url)).toEqual({ lat: 13.03412, lng: 80.26205, name: "Kaveri Feast Co." });
  });
  test("reads a search link, the map's middle, and plain coordinates", () => {
    expect(placeFromLink("https://maps.google.com/?q=13.0827,80.2707")).toMatchObject({ lat: 13.0827, lng: 80.2707 });
    expect(placeFromLink("https://www.google.com/maps/@12.9716,77.5946,15z")).toMatchObject({ lat: 12.9716, lng: 77.5946 });
    expect(placeFromLink(" 13.0339, 80.2619 ")).toEqual({ lat: 13.0339, lng: 80.2619 });
    expect(placeFromLink("https://www.google.com/maps/search/13.05,+80.24")).toMatchObject({ lat: 13.05, lng: 80.24 });
  });
  test("finds nothing in plain words or impossible numbers", () => {
    expect(placeFromLink("Mylapore")).toBeNull();
    expect(placeFromLink("123.4, 80.2")).toBeNull();
  });
  test("follows only Google's own map links", () => {
    expect(isShortMapLink("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isShortMapLink("https://maps.app.goo.gl/1z9VE4D4UNAQ6UcD9?g_st=ic")).toBe(true);
    expect(isShortMapLink("https://maps.app.goo.gl/MhwvYwjtYmtbuYsF7?g_st=com.google.maps")).toBe(true);
    expect(isShortMapLink("https://goo.gl/maps/AbC123")).toBe(true);
    expect(isShortMapLink("https://example.com/x")).toBe(false);
    expect(isShortLinkHost("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isShortLinkHost("https://www.google.com/maps/place/x")).toBe(false);
    expect(isGoogleMapsHost("https://www.google.com/maps/place/x")).toBe(true);
    expect(isGoogleMapsHost("https://maps.google.co.in/?q=1,2")).toBe(true);
    expect(isGoogleMapsHost("https://www.google.com/search?q=x")).toBe(false);
    expect(isGoogleMapsHost("https://evil.example/maps")).toBe(false);
  });

  // Where real maps.app.goo.gl share links led on 3 Nov 2026: Google now hands out several shapes.
  const SHOP_PLACE =
    "https://www.google.com/maps/place/16,+1st+floor,+Shingar+Bridal+Makeup+And+Mehandi+Studio,+CTA+Garden+Main+Rd,+Manali+Saravana+Nagar,+Kamatchiamman+Nagar,+Poonamallee,+Chennai,+Tamil+Nadu+600056,+India/data=!4m2!3m1!1s0x3a5261dba56e2713:0x766115f5356c17fd?utm_source=mstt_1&entry=gps";
  const SHOP_ENCODED =
    "https://www.google.com/maps/place/1%2F81,+Fusion+Trends-Unisex+Hair+and+Style+Salon,+Market+Road,+Thaiyur+Market+Rd,+Kelambakkam,+Chennai,+Tamil+Nadu+603103/data=!4m2!3m1!1s0x3a52511c96bdb1cb:0x65f9cf7f2668c70c?utm_source=mstt_1&entry=gps";
  const DIRECTIONS =
    "https://www.google.com/maps/dir/10.4174606,79.3380266/Jeri+Beauty+and+bridal+academy/data=!4m10!4m9!1m1!4e1!1m5!1m4!1s0x3a526305f7715b13:0xf9e2a97efb5b903f!8m2!3d13.114750899999999!4d80.1081775!3e9?utm_source=mstt_0";
  const IPHONE_DIRECTIONS =
    "https://maps.google.com/?geocode=FWY9cQAdEYLgBA%3D%3D;FR05cQAd537gBCnlYIDnHT_lOjFT0RqTXebxJA%3D%3D&daddr=289A+Colombo+-+Batticaloa+Hwy,+Kalmunai+32300&saddr=7.4212860,81.8222250&dirflg=d&ftid=0x3ae53f1de78060e5:0x24f1e65d931ad153&g_st=ic";
  const SEARCH_BY_NAME =
    "https://maps.google.com?q=MUA+Trend,+5911+Edsall+Rd,+Alexandria,+VA+22304,+United+States&ftid=0x89b7b3b9bac28dfd:0x3fd6621b741bf0d3&entry=gps&g_st=com.google.maps";

  test("the place's own marker wins over the map's middle", () => {
    const url = "https://www.google.com/maps/place/Pink+Bridles/@12.97,80.25,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.9712!4d80.2521!16s%2Fg%2F11abc";
    expect(placeFromLink(url)).toEqual({ lat: 12.9712, lng: 80.2521, name: "Pink Bridles" });
  });
  test("a directions link gives its destination, never where the person sharing stood", () => {
    expect(placeFromLink(DIRECTIONS)).toMatchObject({ lat: 13.114750899999999, lng: 80.1081775 });
    expect(placeFromLink("https://www.google.com/maps/dir/13.0,80.2/Some+Hall/@13.05,80.22,13z")).toBeNull();
    expect(placeWordsFromLink("https://www.google.com/maps/dir/13.0,80.2/Some+Hall/@13.05,80.22,13z")).toBe("Some Hall");
  });
  test("an iPhone directions link gives its destination from geocode=, not saddr", () => {
    expect(placeFromLink(IPHONE_DIRECTIONS)).toEqual({ lat: 7.420189, lng: 81.821415 });
  });
  test("reads ll=, q=loc:, a dropped pin's degrees and a coordinate place", () => {
    expect(placeFromLink("https://maps.google.com/maps?ll=13.0418,80.2341&z=16")).toMatchObject({ lat: 13.0418, lng: 80.2341 });
    expect(placeFromLink("https://maps.google.com/?q=loc:13.0418,80.2341")).toMatchObject({ lat: 13.0418, lng: 80.2341 });
    expect(placeFromLink("https://www.google.com/maps/place/13%C2%B001'59.3%22N+80%C2%B015'38.6%22E/@13.03,80.25,17z")).toEqual({ lat: 13.033139, lng: 80.260722 });
    expect(placeFromLink("https://www.google.com/maps/place/13.0339,80.2619")).toEqual({ lat: 13.0339, lng: 80.2619 });
  });
  test("a link that only names its place gives no point, but its words", () => {
    expect(placeFromLink(SHOP_PLACE)).toBeNull();
    expect(placeWordsFromLink(SHOP_PLACE)).toBe(
      "16, 1st floor, Shingar Bridal Makeup And Mehandi Studio, CTA Garden Main Rd, Manali Saravana Nagar, Kamatchiamman Nagar, Poonamallee, Chennai, Tamil Nadu 600056, India",
    );
    expect(placeFromLink(SEARCH_BY_NAME)).toBeNull();
    expect(placeWordsFromLink(SEARCH_BY_NAME)).toBe("MUA Trend, 5911 Edsall Rd, Alexandria, VA 22304, United States");
    expect(placeWordsFromLink("https://www.google.com/maps/search/Pink+Bridles+Velachery")).toBe("Pink Bridles Velachery");
    expect(placeWordsFromLink("https://maps.google.com/?q=13.05,80.24")).toBeUndefined();
  });
  test("a slash inside an encoded name stays in the name", () => {
    expect(placeWordsFromLink(SHOP_ENCODED)?.startsWith("1/81, Fusion Trends-Unisex Hair and Style Salon")).toBe(true);
    expect(placeFromLink("https://www.google.com/maps/place/Caf%C3%A9+No.+1%2F2/@13.03,80.26,17z/data=!3d13.031!4d80.262")).toEqual({ lat: 13.031, lng: 80.262, name: "Café No. 1/2" });
  });
  test("an address is looked up whole first, then by its road or locality", () => {
    expect(addressTries(placeWordsFromLink(SHOP_PLACE)!)).toEqual([
      "16, 1st floor, Shingar Bridal Makeup And Mehandi Studio, CTA Garden Main Rd, Manali Saravana Nagar, Kamatchiamman Nagar, Poonamallee, Chennai, Tamil Nadu 600056",
      "Kamatchiamman Nagar, Poonamallee, Chennai, Tamil Nadu 600056",
      "Poonamallee, Chennai, Tamil Nadu 600056",
    ]);
    expect(addressTries("Pink Bridles")).toEqual(["Pink Bridles"]);
  });
  test("reads Plus Codes, full or completed from the city", () => {
    const hq = placeFromLink("849VCWC8+R9");
    expect(hq?.lat).toBeCloseTo(37.4220625, 6);
    expect(hq?.lng).toBeCloseTo(-122.0840625, 6);
    const short = placeFromLink("https://www.google.com/maps/place/37J7%2B5R+Chennai,+Tamil+Nadu/@13.08,80.26,17z");
    expect(short?.lat).toBeCloseTo(13.0804375, 6);
    expect(short?.lng).toBeCloseTo(80.2645625, 6);
    expect(placeFromLink("37J7+5R", { lat: 13.0827, lng: 80.2707 })?.lat).toBeCloseTo(13.0804375, 6);
    // A short code with no city to put it near is not guessed at.
    expect(plusCodePlace("37J7+5R")).toBeNull();
  });
  test("picks the link out of a share that starts with the shop's name", () => {
    expect(linkIn("Pink Bridles\nhttps://maps.app.goo.gl/AbC123?g_st=ic")).toBe("https://maps.app.goo.gl/AbC123?g_st=ic");
    expect(linkIn("Pink Bridles https://maps.app.goo.gl/AbC123 call us")).toBe("https://maps.app.goo.gl/AbC123");
    expect(linkIn("Mylapore")).toBeNull();
  });
  test("steps past Google's consent page to the address behind it", () => {
    const behind = "https://www.google.com/maps/place/X/data=!3d13.1!4d80.2";
    expect(pastConsent(`https://consent.google.com/ml?continue=${encodeURIComponent(behind)}&gl=IE`)).toBe(behind);
    expect(pastConsent(behind)).toBe(behind);
  });
});
