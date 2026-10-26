import { describe, expect, test } from "vitest";
import { isBotUserAgent, isLikelyProxy, parseVisit, sameSecret } from "./visits";

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

describe("isBotUserAgent", () => {
  test("people", () => {
    expect(isBotUserAgent(CHROME)).toBe(false);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(false);
  });
  test("bots and tools", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/141.0.0.0 Safari/537.36",
      "python-requests/2.32.3",
      "curl/8.7.1",
      "Wget/1.21.4",
      "Scrapy/2.11",
      "Go-http-client/2.0",
      "axios/1.7.2",
      "facebookexternalhit/1.1",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
      "",
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
    expect(isBotUserAgent(undefined)).toBe(true);
  });
});

describe("parseVisit", () => {
  const now = 1_800_000_000_000;
  const good = { at: now - 1000, ip: "203.0.113.7", host: "App.PlusOneEvents.site", path: "/", method: "get", userAgent: CHROME, asn: 13335 };

  test("accepts a good record", () => {
    expect(parseVisit(good, now)).toEqual({ ...good, host: "app.plusoneevents.site", method: "GET" });
  });
  test("rejects what isn't a visit", () => {
    expect(parseVisit(null, now)).toBeNull();
    expect(parseVisit([], now)).toBeNull();
    expect(parseVisit({ ...good, ip: undefined }, now)).toBeNull();
    expect(parseVisit({ ...good, ip: "<script>" }, now)).toBeNull();
    expect(parseVisit({ ...good, path: "no-slash" }, now)).toBeNull();
    expect(parseVisit({ ...good, host: 3 }, now)).toBeNull();
  });
  test("a far-off timestamp becomes now; long text is cut; junk optional fields are dropped", () => {
    const v = parseVisit({ ...good, at: 0, userAgent: "a".repeat(1000), asn: "x", city: 5, extra: "ignored" }, now)!;
    expect(v.at).toBe(now);
    expect(v.userAgent).toHaveLength(300);
    expect(v).not.toHaveProperty("asn");
    expect(v).not.toHaveProperty("city");
    expect(v).not.toHaveProperty("extra");
  });
});

test("sameSecret", () => {
  expect(sameSecret("abc", "abc")).toBe(true);
  expect(sameSecret("abc", "abd")).toBe(false);
  expect(sameSecret("abc", "abcd")).toBe(false);
});

describe("isLikelyProxy", () => {
  test("VPNs, clouds, relays and Tor", () => {
    expect(isLikelyProxy({ country: "T1" })).toBe(true);
    expect(isLikelyProxy({ asn: 9009, asOrganization: "M247 Europe SRL" })).toBe(true);
    expect(isLikelyProxy({ asn: 16509 })).toBe(true);
    expect(isLikelyProxy({ asOrganization: "Some VPN Ltd" })).toBe(true);
    expect(isLikelyProxy({ asOrganization: "Example Hosting GmbH" })).toBe(true);
    expect(isLikelyProxy({ asOrganization: "Tor exit" })).toBe(true);
  });
  test("ordinary home and mobile networks", () => {
    expect(isLikelyProxy({ country: "IN", asn: 24560, asOrganization: "Bharti Airtel Ltd., Telemedia Services" })).toBe(false);
    expect(isLikelyProxy({ asn: 55836, asOrganization: "Reliance Jio Infocomm Limited" })).toBe(false);
    expect(isLikelyProxy({ asOrganization: "Colombia Movil" })).toBe(false);
    expect(isLikelyProxy({ asOrganization: "Comcast Cable Communications, LLC" })).toBe(false);
    expect(isLikelyProxy({})).toBe(false);
  });
});

test("parseVisit keeps a well-formed visitor id and Clerk user, and drops bad ones", () => {
  const now = 1_800_000_000_000;
  const base = { at: now, ip: "203.0.113.7", host: "a.b", path: "/", method: "GET" };
  expect(parseVisit({ ...base, visitorId: "0b9c2f4e-5a6d-4e7f-8a9b-0c1d2e3f4a5b", clerkUserId: "user_2abcDEF" }, now)).toMatchObject({
    visitorId: "0b9c2f4e-5a6d-4e7f-8a9b-0c1d2e3f4a5b",
    clerkUserId: "user_2abcDEF",
  });
  const bad = parseVisit({ ...base, visitorId: "x; y", clerkUserId: "eyJhbGciOi.token" }, now)!;
  expect(bad).not.toHaveProperty("visitorId");
  expect(bad).not.toHaveProperty("clerkUserId");
});
