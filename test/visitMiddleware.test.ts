import { describe, expect, test, vi } from "vitest";
import {
  checkClaims,
  clerkSessionCookie,
  decodeJwt,
  isPageRequest,
  onRequest,
  readCookie,
  referrerHost,
  shapeVisit,
  verifyClerkSession,
  visitorCookie,
  visitorIdFrom,
  withoutWww,
} from "../functions/_middleware";

const HTML = "text/html,application/xhtml+xml,*/*;q=0.8";

describe("isPageRequest", () => {
  test("page navigations count", () => {
    expect(isPageRequest("GET", "/", HTML)).toBe(true);
    expect(isPageRequest("GET", "/how-it-works", "*/*")).toBe(true);
    expect(isPageRequest("GET", "/s/maya-and-sam", null)).toBe(true);
    expect(isPageRequest("GET", "/wp-login.php", HTML)).toBe(true);
  });
  test("assets, the analytics proxy and housekeeping files don't", () => {
    for (const path of [
      "/assets/index-abc.js",
      "/assets/font.woff2",
      "/ingest/eu/e",
      "/ingest",
      "/geo",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
      "/og.jpg",
      "/manifest.webmanifest",
      "/plates/one",
    ]) {
      expect(isPageRequest("GET", path, HTML), path).toBe(false);
    }
  });
  test("a file with an unknown extension counts only when HTML is asked for", () => {
    expect(isPageRequest("GET", "/wp-login.php", "*/*")).toBe(false);
  });
  test("only GET", () => {
    expect(isPageRequest("POST", "/", HTML)).toBe(false);
    expect(isPageRequest("HEAD", "/", HTML)).toBe(false);
  });
});

describe("referrerHost", () => {
  test("host only", () => {
    expect(referrerHost("https://www.Google.com/search?q=secret")).toBe("www.google.com");
    expect(referrerHost("not a url")).toBeUndefined();
    expect(referrerHost(null)).toBeUndefined();
  });
});

function request(path: string, headers: Record<string, string>, cf?: object) {
  const r = new Request(`https://app.plusoneevents.site${path}`, { headers }) as Request & { cf?: object };
  if (cf) Object.defineProperty(r, "cf", { value: cf });
  return r;
}

describe("shapeVisit", () => {
  test("keeps what the log needs and nothing else", () => {
    const r = request(
      "/p/abc?token=secret&x=1",
      {
        "cf-connecting-ip": "203.0.113.7",
        "user-agent": "x".repeat(400),
        referer: "https://example.com/some/page?id=1",
        cookie: "session=secret",
        authorization: "Bearer secret",
      },
      { country: "IN", city: "Chennai", region: "Tamil Nadu", asn: 24560, asOrganization: "Example Net", colo: "MAA" },
    );
    const v = shapeVisit(r, 1_000)!;
    expect(v).toEqual({
      at: 1_000,
      ip: "203.0.113.7",
      host: "app.plusoneevents.site",
      path: "/p/abc",
      method: "GET",
      userAgent: "x".repeat(300),
      referrer: "example.com",
      country: "IN",
      city: "Chennai",
      region: "Tamil Nadu",
      asn: 24560,
      asOrganization: "Example Net",
    });
    expect(JSON.stringify(v)).not.toContain("secret");
  });
  test("no address, no record", () => {
    expect(shapeVisit(request("/", {}), 1)).toBeNull();
  });
  test("missing optional fields are left out", () => {
    expect(shapeVisit(request("/", { "cf-connecting-ip": "::1" }), 5)).toEqual({
      at: 5,
      ip: "::1",
      host: "app.plusoneevents.site",
      path: "/",
      method: "GET",
    });
  });
});

describe("onRequest", () => {
  const page = () => request("/", { "cf-connecting-ip": "203.0.113.7", accept: HTML });

  test("www. goes to the bare address, keeping the path and query", async () => {
    expect(withoutWww(new URL("https://www.plusoneevents.site/pricing?from=x"))).toBe("https://plusoneevents.site/pricing?from=x");
    expect(withoutWww(new URL("https://app.plusoneevents.site/"))).toBeNull();
    const next = vi.fn(async () => new Response("ok"));
    const res = await onRequest({ request: new Request("https://www.plusoneevents.site/how-it-works"), env: {}, waitUntil: vi.fn(), next });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://plusoneevents.site/how-it-works");
    expect(next).not.toHaveBeenCalled();
  });

  test("passes straight through when not configured", async () => {
    const waitUntil = vi.fn();
    const next = vi.fn(async () => new Response("ok"));
    const res = await onRequest({ request: page(), env: {}, waitUntil, next });
    expect(await res.text()).toBe("ok");
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test("sends the record in the background when configured", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const waitUntil = vi.fn();
      const next = vi.fn(async () => new Response("ok"));
      const res = await onRequest({
        request: page(),
        env: { VISIT_LOG_SECRET: "s3", CONVEX_SITE_URL: "https://example.convex.site" },
        waitUntil,
        next,
      });
      expect(await res.text()).toBe("ok");
      expect(waitUntil).toHaveBeenCalledOnce();
      await waitUntil.mock.calls[0][0];
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://example.convex.site/visit");
      expect((init.headers as Record<string, string>)["x-visit-secret"]).toBe("s3");
      expect(JSON.parse(init.body as string)).toMatchObject({ ip: "203.0.113.7", path: "/" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

const VID = "0b9c2f4e-5a6d-4e7f-8a9b-0c1d2e3f4a5b";

describe("cookies", () => {
  test("reads one cookie, and Clerk's session under either name", () => {
    const header = `a=1; __session=tok.en.x; po_vid=${VID}`;
    expect(readCookie(header, "a")).toBe("1");
    expect(readCookie(header, "missing")).toBeUndefined();
    expect(clerkSessionCookie(header)).toBe("tok.en.x");
    expect(clerkSessionCookie("__session_Ab12=suffixed.tok.en")).toBe("suffixed.tok.en");
    expect(clerkSessionCookie(null)).toBeUndefined();
  });
  test("visitor id: only a well-formed one is used", () => {
    expect(visitorIdFrom(`po_vid=${VID}`)).toBe(VID);
    expect(visitorIdFrom("po_vid=<script>")).toBeUndefined();
    expect(visitorIdFrom(null)).toBeUndefined();
  });
  test("the visitor cookie is first-party, HttpOnly, Secure, Lax, 180 days; shared across the live hosts only", () => {
    const live = visitorCookie(VID, "app.plusoneevents.site");
    expect(live).toBe(`po_vid=${VID}; Max-Age=15552000; Path=/; HttpOnly; Secure; SameSite=Lax; Domain=plusoneevents.site`);
    expect(visitorCookie(VID, "plusone-app.pages.dev")).not.toContain("Domain=");
  });
});

const ISSUER = "https://clerk.example.test";
const NOW = 1_800_000_000_000;
const nowS = NOW / 1000;

describe("checkClaims", () => {
  const good = { iss: ISSUER, sub: "user_2abc", exp: nowS + 60, nbf: nowS - 10 };
  test("a current token from our issuer gives its user", () => {
    expect(checkClaims(good, ISSUER, nowS)).toBe("user_2abc");
    expect(checkClaims({ ...good, iss: `${ISSUER}/` }, ISSUER, nowS)).toBe("user_2abc");
  });
  test("anything else gives nothing", () => {
    expect(checkClaims({ ...good, iss: "https://evil.example" }, ISSUER, nowS)).toBeNull();
    expect(checkClaims({ ...good, exp: nowS - 60 }, ISSUER, nowS)).toBeNull();
    expect(checkClaims({ ...good, exp: undefined }, ISSUER, nowS)).toBeNull();
    expect(checkClaims({ ...good, nbf: nowS + 60 }, ISSUER, nowS)).toBeNull();
    expect(checkClaims({ ...good, sub: "not-a-clerk-user" }, ISSUER, nowS)).toBeNull();
  });
});

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function keyPair() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
  return { pair, jwk };
}

async function sign(privateKey: CryptoKey, header: object, payload: object) {
  const data = `${enc(header)}.${enc(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(data)));
  return `${data}.${b64url(sig)}`;
}

describe("verifyClerkSession", () => {
  test("verifies the signature against the issuer's keys and returns only the user id", async () => {
    const { pair, jwk } = await keyPair();
    const fetcher = vi.fn(async () => [jwk]);
    const claims = { iss: ISSUER, sub: "user_2abc", exp: nowS + 60, sid: "sess_1" };
    const token = await sign(pair.privateKey, { alg: "RS256", kid: "k1" }, claims);
    expect(decodeJwt(token)?.payload.sub).toBe("user_2abc");
    expect(await verifyClerkSession(token, ISSUER, NOW, fetcher)).toBe("user_2abc");
    expect(fetcher).toHaveBeenCalledWith(`${ISSUER}/.well-known/jwks.json`);
  });
  test("a token signed by another key, a tampered one, or the wrong algorithm is refused", async () => {
    const { pair } = await keyPair();
    const other = await keyPair();
    const fetcher = async () => [other.jwk];
    const claims = { iss: ISSUER, sub: "user_2abc", exp: nowS + 60 };
    const token = await sign(pair.privateKey, { alg: "RS256", kid: "k1" }, claims);
    expect(await verifyClerkSession(token, "https://other-issuer.example", NOW, fetcher)).toBeNull();
    expect(await verifyClerkSession(token, ISSUER, NOW, fetcher)).toBeNull();
    const own = await sign(other.pair.privateKey, { alg: "RS256", kid: "k1" }, claims);
    const [h, , s] = own.split(".");
    expect(await verifyClerkSession(`${h}.${enc({ ...claims, sub: "user_someoneelse" })}.${s}`, ISSUER, NOW, fetcher)).toBeNull();
    expect(await verifyClerkSession(`${enc({ alg: "none", kid: "k1" })}.${enc(claims)}.`, ISSUER, NOW, fetcher)).toBeNull();
    expect(await verifyClerkSession("not a jwt", ISSUER, NOW, fetcher)).toBeNull();
  });
});

describe("onRequest: visitor cookie and account", () => {
  const env = { VISIT_LOG_SECRET: "s3", CONVEX_SITE_URL: "https://example.convex.site" };

  test("a new browser gets a visitor id cookie, and the visit carries it", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const waitUntil = vi.fn();
      const res = await onRequest({
        request: request("/", { "cf-connecting-ip": "203.0.113.7", accept: HTML }),
        env,
        waitUntil,
        next: async () => new Response("ok"),
      });
      const cookie = res.headers.get("set-cookie") ?? "";
      expect(cookie).toMatch(/^po_vid=[0-9a-f-]{36}; Max-Age=15552000; Path=\/; HttpOnly; Secure; SameSite=Lax; Domain=plusoneevents.site$/);
      await waitUntil.mock.calls[0][0];
      const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(body.visitorId).toBe(cookie.slice(7, 43));
      expect(body).not.toHaveProperty("clerkUserId");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("a known browser keeps its id and gets no new cookie; an unverifiable session links nothing and is never sent", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/jwks.json") ? new Response(JSON.stringify({ keys: [] })) : new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const waitUntil = vi.fn();
      const res = await onRequest({
        request: request("/", { "cf-connecting-ip": "203.0.113.7", accept: HTML, cookie: `po_vid=${VID}; __session=aaa.bbb.ccc` }),
        env: { ...env, CLERK_ISSUER: ISSUER },
        waitUntil,
        next: async () => new Response("ok"),
      });
      expect(res.headers.get("set-cookie")).toBeNull();
      await waitUntil.mock.calls[0][0];
      const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/visit")) as unknown as [string, RequestInit];
      const body = JSON.parse(call[1].body as string);
      expect(body.visitorId).toBe(VID);
      expect(body).not.toHaveProperty("clerkUserId");
      expect(call[1].body as string).not.toContain("aaa.bbb.ccc");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("no cookie at all when the log is off, or for assets", async () => {
    const waitUntil = vi.fn();
    let res = await onRequest({ request: request("/", { accept: HTML }), env: {}, waitUntil, next: async () => new Response("ok") });
    expect(res.headers.get("set-cookie")).toBeNull();
    res = await onRequest({ request: request("/assets/a.js", { accept: "*/*" }), env, waitUntil, next: async () => new Response("ok") });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
