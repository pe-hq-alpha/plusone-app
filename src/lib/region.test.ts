import { describe, expect, it } from "vitest";
import { regionFromGeo, regionFromLink, regionFromTimeZone } from "./region";
import { sampleFor } from "../../convex/lib/regions";
import { regionOf } from "../../functions/geo";
import { examplesFor } from "./regionExamples";
import { upstreamHeaders, upstreamUrl } from "../../functions/ingest/[[path]]";

describe("where a visitor is", () => {
  it("reads the region from /geo", () => {
    expect(regionFromGeo({ region: "IN-DL" })).toBe("IN-DL");
    expect(regionFromGeo({ region: "US" })).toBe("US");
    expect(regionFromGeo({ region: null })).toBeUndefined();
    expect(regionFromGeo(null)).toBeUndefined();
    expect(regionFromGeo({ region: "<script>" })).toBeUndefined();
  });

  it("gives the country and state Cloudflare knows, and nothing for unknown or Tor", () => {
    expect(regionOf({ country: "IN", regionCode: "TN" })).toBe("IN-TN");
    expect(regionOf({ country: "US" })).toBe("US");
    expect(regionOf({ country: "XX" })).toBeNull();
    expect(regionOf({ country: "T1" })).toBeNull();
    expect(regionOf(undefined)).toBeNull();
  });

  it("sends North India to Delhi, the rest of India to Chennai, and everyone else to Austin", () => {
    expect(sampleFor("IN-DL")).toBe("delhi");
    expect(sampleFor("IN-UP")).toBe("delhi");
    expect(sampleFor("IN-PB")).toBe("delhi");
    expect(sampleFor("IN-TN")).toBe("chennai");
    expect(sampleFor("IN-KA")).toBe("chennai");
    expect(sampleFor("IN-MH")).toBe("chennai");
    expect(sampleFor("IN")).toBe("chennai");
    expect(sampleFor("US-CA")).toBe("austin");
    expect(sampleFor(undefined)).toBe("austin");
  });

  it("guesses from the clock only where a zone clearly means one country", () => {
    expect(regionFromTimeZone("Asia/Kolkata")).toBe("IN");
    expect(regionFromTimeZone("Asia/Calcutta")).toBe("IN");
    expect(regionFromTimeZone("America/Chicago")).toBe("US");
    expect(regionFromTimeZone("America/Indiana/Indianapolis")).toBe("US");
    expect(regionFromTimeZone("America/Toronto")).toBe("CA");
    expect(regionFromTimeZone("Europe/Paris")).toBeUndefined();
    expect(regionFromTimeZone(undefined)).toBeUndefined();
  });

  it("takes a hand-picked region from the address", () => {
    expect(regionFromLink("?region=in")).toBe("IN");
    expect(regionFromLink("?region=in-dl")).toBe("IN-DL");
    expect(regionFromLink("?region=auto")).toBeUndefined();
    expect(regionFromLink("?region=india")).toBeUndefined();
    expect(regionFromLink("")).toBeUndefined();
  });
});

describe("examples in the visitor's money", () => {
  it("shows rupees in India and dollars elsewhere", () => {
    expect(examplesFor("IN").compare.range).toMatch(/Chennai: ₹/);
    expect(examplesFor("IN-DL").compare.range).toMatch(/Delhi: ₹/);
    expect(examplesFor("US").compare.range).toMatch(/\$/);
    expect(examplesFor(undefined).compare.range).toMatch(/\$/);
  });

  it("marks exactly one quote as the best per unit", () => {
    for (const region of ["IN", "IN-DL", "US"]) expect(examplesFor(region).compare.rows.filter((r) => r.best)).toHaveLength(1);
  });
});

describe("the analytics proxy", () => {
  it("sends events and assets to the region named in the path", () => {
    expect(upstreamUrl(new URL("https://plusoneevents.site/ingest/eu/e/?ip=0&_=1"))).toBe("https://eu.i.posthog.com/e/?ip=0&_=1");
    expect(upstreamUrl(new URL("https://app.plusoneevents.site/ingest/us/flags/?v=2"))).toBe("https://us.i.posthog.com/flags/?v=2");
    expect(upstreamUrl(new URL("https://app.plusoneevents.site/ingest/eu/static/array.js"))).toBe("https://eu-assets.i.posthog.com/static/array.js");
  });

  it("refuses anything that isn't a known region", () => {
    expect(upstreamUrl(new URL("https://app.plusoneevents.site/ingest/e/"))).toBeNull();
    expect(upstreamUrl(new URL("https://app.plusoneevents.site/ingest/evil.example/e/"))).toBeNull();
  });

  it("drops the visitor's IP address and cookies", () => {
    const request = new Request("https://app.plusoneevents.site/ingest/eu/e/", {
      method: "POST",
      headers: {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "203.0.113.7",
        "x-real-ip": "203.0.113.7",
        "true-client-ip": "203.0.113.7",
        cookie: "session=secret",
        "content-type": "application/json",
      },
    });
    const headers = upstreamHeaders(request);
    for (const name of ["cf-connecting-ip", "x-forwarded-for", "x-real-ip", "true-client-ip"]) expect(headers.get(name)).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
  });
});
