/**
 * The visit log. Runs on Cloudflare in front of plusoneevents.site and
 * app.plusoneevents.site. For each page load (not scripts, images, fonts or the
 * analytics proxy) it sends a small record to Convex (POST /visit) after the response
 * has gone, so it never slows a page: the visitor's address, the page, the browser,
 * where the visit came from, Cloudflare's rough idea of where they are, this browser's
 * visitor id, and, when someone is signed in, which account.
 *
 * - Visitor id: a random id in a first-party cookie (`po_vid`, HttpOnly, 180 days), set
 *   on the first page load. Once the browser signs in, its earlier visits are linked to
 *   the account in Convex.
 * - Account: Clerk's `__session` cookie is verified here (RS256 against Clerk's published
 *   keys, issuer, expiry); only the verified user id (`sub`) is sent, never the token.
 *
 * Never sent: cookies, sign-in tokens, query strings, request bodies, or the full
 * referring address (only its host name).
 *
 * Settings on the Pages project: VISIT_LOG_SECRET (also set in Convex) and
 * CONVEX_SITE_URL (the deployment's .convex.site address); without either it does
 * nothing at all, sets no cookie. CLERK_ISSUER (the same value as Convex's
 * CLERK_JWT_ISSUER_DOMAIN) turns on linking to accounts.
 */

type Cf = {
  country?: string;
  city?: string;
  region?: string;
  asn?: number;
  asOrganization?: string;
};

type Env = { VISIT_LOG_SECRET?: string; CONVEX_SITE_URL?: string; CLERK_ISSUER?: string };

type Context = {
  request: Request & { cf?: Cf };
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
  next: () => Promise<Response>;
};

export type VisitRecord = {
  at: number;
  ip: string;
  host: string;
  path: string;
  method: string;
  userAgent?: string;
  referrer?: string;
  country?: string;
  city?: string;
  region?: string;
  asn?: number;
  asOrganization?: string;
  visitorId?: string;
  clerkUserId?: string;
};

// ---------------------------------------------------------------- which requests

const SKIP_PREFIXES = ["/assets/", "/ingest/", "/plates/", "/photos/", "/.well-known/"];
const SKIP_EXACT = new Set(["/ingest", "/geo", "/favicon.ico", "/favicon.svg", "/robots.txt", "/sitemap.xml"]);
const STATIC_EXT = new Set([
  "js", "mjs", "cjs", "css", "map", "json", "webmanifest", "txt", "xml",
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp4", "webm", "mp3", "wav", "ogg", "pdf", "zip",
]);

/** The extension of the last path segment, lower-cased, or "" when there isn't one. */
function extensionOf(path: string): string {
  const last = path.slice(path.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  return dot >= 0 ? last.slice(dot + 1).toLowerCase() : "";
}

/** Whether a request is a page load worth recording. */
export function isPageRequest(method: string, path: string, accept: string | null): boolean {
  if (method.toUpperCase() !== "GET") return false;
  if (SKIP_EXACT.has(path) || SKIP_PREFIXES.some((p) => path.startsWith(p))) return false;
  const ext = extensionOf(path);
  if (!ext) return true;
  if (STATIC_EXT.has(ext)) return false;
  return (accept ?? "").toLowerCase().includes("text/html");
}

// ---------------------------------------------------------------- cookies

/** One cookie's value from a Cookie header, or undefined. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** Clerk's session token: `__session`, or a suffixed `__session_<x>` on newer Clerk. */
export function clerkSessionCookie(header: string | null): string | undefined {
  const plain = readCookie(header, "__session");
  if (plain) return plain;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim().startsWith("__session_")) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export const VISITOR_COOKIE = "po_vid";
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HALF_YEAR_SECONDS = 180 * 24 * 60 * 60;

/** This browser's visitor id from its cookie, when it has a well-formed one. */
export function visitorIdFrom(header: string | null): string | undefined {
  const id = readCookie(header, VISITOR_COOKIE)?.toLowerCase();
  return id && VISITOR_ID.test(id) ? id : undefined;
}

/** The Set-Cookie value for a new visitor id; shared by both hosts on the live domain. */
export function visitorCookie(id: string, hostname: string): string {
  const shared = hostname === "plusoneevents.site" || hostname.endsWith(".plusoneevents.site");
  return `${VISITOR_COOKIE}=${id}; Max-Age=${HALF_YEAR_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax${shared ? "; Domain=plusoneevents.site" : ""}`;
}

// ---------------------------------------------------------------- Clerk session

function base64UrlBytes(part: string): Uint8Array<ArrayBuffer> {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlBytes(part)));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type Jwt = { header: Record<string, unknown>; payload: Record<string, unknown>; signed: Uint8Array<ArrayBuffer>; signature: Uint8Array<ArrayBuffer> };

/** A JWT's parts, decoded but not yet trusted, or null when it isn't one. */
export function decodeJwt(token: string): Jwt | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = base64UrlJson(parts[0]);
  const payload = base64UrlJson(parts[1]);
  if (!header || !payload) return null;
  try {
    return { header, payload, signed: new TextEncoder().encode(`${parts[0]}.${parts[1]}`), signature: base64UrlBytes(parts[2]) };
  } catch {
    return null;
  }
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");
const SKEW_SECONDS = 5;

/** The Clerk user id when the claims are right for this issuer and time, else null. */
export function checkClaims(payload: Record<string, unknown>, issuer: string, nowSeconds: number): string | null {
  if (typeof payload.iss !== "string" || trimSlash(payload.iss) !== trimSlash(issuer)) return null;
  if (typeof payload.exp !== "number" || payload.exp + SKEW_SECONDS <= nowSeconds) return null;
  if (payload.nbf !== undefined && (typeof payload.nbf !== "number" || payload.nbf - SKEW_SECONDS > nowSeconds)) return null;
  if (typeof payload.sub !== "string" || !/^user_[A-Za-z0-9]{1,64}$/.test(payload.sub)) return null;
  return payload.sub;
}

type Jwk = JsonWebKey & { kid?: string };
type KeyFetcher = (url: string) => Promise<Jwk[]>;

const keyCache = new Map<string, { at: number; keys: Map<string, CryptoKey> }>();
const KEYS_KEPT_MS = 60 * 60 * 1000;

const fetchJwks: KeyFetcher = async (url) => {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const body = (await res.json()) as { keys?: Jwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
};

async function signingKey(issuer: string, kid: string, now: number, fetcher: KeyFetcher): Promise<CryptoKey | null> {
  const url = `${trimSlash(issuer)}/.well-known/jwks.json`;
  let cached = keyCache.get(url);
  if (!cached || now - cached.at > KEYS_KEPT_MS || !cached.keys.has(kid)) {
    const keys = new Map<string, CryptoKey>();
    for (const jwk of await fetcher(url)) {
      if (jwk.kty !== "RSA" || !jwk.kid) continue;
      try {
        keys.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
      } catch {
        // A key we can't use is skipped.
      }
    }
    cached = { at: now, keys };
    keyCache.set(url, cached);
  }
  return cached.keys.get(kid) ?? null;
}

/**
 * The Clerk user id from a session token, verified: RS256 signature against the
 * issuer's published keys, then issuer, expiry and not-before. Null on any doubt.
 */
export async function verifyClerkSession(
  token: string,
  issuer: string,
  now: number,
  fetcher: KeyFetcher = fetchJwks,
): Promise<string | null> {
  const jwt = decodeJwt(token);
  if (!jwt || jwt.header.alg !== "RS256" || typeof jwt.header.kid !== "string") return null;
  const sub = checkClaims(jwt.payload, issuer, Math.floor(now / 1000));
  if (!sub) return null;
  const key = await signingKey(issuer, jwt.header.kid, now, fetcher);
  if (!key) return null;
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, jwt.signature, jwt.signed);
  return ok ? sub : null;
}

// ---------------------------------------------------------------- the record

/** The referring site's host name only, or undefined. */
export function referrerHost(referer: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

function clip(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

/** The record for one request, or null when there is no visitor address (local dev). */
export function shapeVisit(
  request: Request & { cf?: Cf },
  now: number,
  who: { visitorId?: string; clerkUserId?: string } = {},
): VisitRecord | null {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return null;
  const url = new URL(request.url);
  const record: VisitRecord = {
    at: now,
    ip: ip.slice(0, 64),
    host: url.hostname.toLowerCase(),
    path: url.pathname.slice(0, 500),
    method: request.method.toUpperCase(),
  };
  const cf = request.cf ?? {};
  const optional: Partial<VisitRecord> = {
    userAgent: clip(request.headers.get("user-agent"), 300),
    referrer: referrerHost(request.headers.get("referer")),
    country: clip(cf.country, 8),
    city: clip(cf.city, 100),
    region: clip(cf.region, 100),
    asOrganization: clip(cf.asOrganization, 200),
    asn: typeof cf.asn === "number" ? cf.asn : undefined,
    visitorId: who.visitorId,
    clerkUserId: who.clerkUserId,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (record as Record<string, unknown>)[key] = value;
  }
  return record;
}

// ---------------------------------------------------------------- the middleware

/** www. is the same site under a second name: send it to the one address, path and query kept. */
export function withoutWww(url: URL): string | null {
  if (!url.hostname.startsWith("www.")) return null;
  return `${url.protocol}//${url.hostname.slice(4)}${url.pathname}${url.search}`;
}

export const onRequest = async (context: Context): Promise<Response> => {
  const bare = withoutWww(new URL(context.request.url));
  if (bare) return Response.redirect(bare, 301);
  let newVisitorId: string | undefined;
  try {
    const { request, env } = context;
    const secret = env.VISIT_LOG_SECRET;
    const base = env.CONVEX_SITE_URL;
    const url = new URL(request.url);
    if (secret && base && isPageRequest(request.method, url.pathname, request.headers.get("accept"))) {
      const cookies = request.headers.get("cookie");
      let visitorId = visitorIdFrom(cookies);
      if (!visitorId) visitorId = newVisitorId = crypto.randomUUID();
      const session = env.CLERK_ISSUER ? clerkSessionCookie(cookies) : undefined;
      const issuer = env.CLERK_ISSUER;
      const now = Date.now();
      context.waitUntil(
        (async () => {
          const clerkUserId = session && issuer ? await verifyClerkSession(session, issuer, now).catch(() => null) : null;
          const record = shapeVisit(request, now, { visitorId, clerkUserId: clerkUserId ?? undefined });
          if (!record) return;
          await fetch(new URL("/visit", base).toString(), {
            method: "POST",
            headers: { "content-type": "application/json", "x-visit-secret": secret },
            body: JSON.stringify(record),
          });
        })().catch(() => undefined),
      );
    }
  } catch {
    // Logging must never break a page.
  }
  const response = await withSharedPreview(context, await context.next());
  if (!newVisitorId) return response;
  try {
    const out = new Response(response.body, response);
    out.headers.append("set-cookie", visitorCookie(newVisitorId, new URL(context.request.url).hostname));
    return out;
  } catch {
    return response;
  }
};

/** A shared event page, RSVP link or plan, by its address: /s/<slug>, /r/<token>, /p/<token>. */
export function sharedCard(path: string): { kind: "s" | "r" | "p"; key: string } | null {
  const m = /^\/(s|r|p)\/([A-Za-z0-9_-]{1,80})\/?$/.exec(path);
  return m ? { kind: m[1] as "s" | "r" | "p", key: m[2] } : null;
}

type Card = { title: string; description: string; image?: string; eventType: string };
// Cloudflare's streaming HTML rewriter, present on Pages.
declare const HTMLRewriter: {
  new (): { on(selector: string, handler: { element(e: { setAttribute(n: string, v: string): void; setInnerContent(t: string): void }): void }): InstanceType<typeof HTMLRewriter>; transform(r: Response): Response };
};

/**
 * A shared event link shows that event in a chat or a post: its name, date and place, and its
 * picture (the host's own, else the illustration for its kind), instead of PlusOne's general
 * preview. Anything that fails leaves the page as it was.
 */
async function withSharedPreview(context: Context, response: Response): Promise<Response> {
  try {
    const base = context.env.CONVEX_SITE_URL;
    const url = new URL(context.request.url);
    const card = sharedCard(url.pathname);
    if (!base || !card || !(response.headers.get("content-type") ?? "").includes("text/html")) return response;
    const res = await fetch(new URL(`/og?kind=${card.kind}&key=${encodeURIComponent(card.key)}`, base).toString(), { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return response;
    const data = (await res.json()) as Card | null;
    if (!data) return response;
    const image = data.image ?? `${url.origin}/covers/${/^[a-z_]{3,30}$/.test(data.eventType) ? data.eventType : "party"}.jpg`;
    const set = (selector: string, value: string) => ({ selector, value });
    const tags = [
      set('meta[property="og:title"]', data.title),
      set('meta[property="og:description"]', data.description),
      set('meta[property="og:image"]', image),
      set('meta[name="twitter:title"]', data.title),
      set('meta[name="twitter:description"]', data.description),
      set('meta[name="twitter:image"]', image),
      set('meta[name="description"]', data.description),
    ];
    let rewriter = new HTMLRewriter().on("title", { element: (e) => e.setInnerContent(`${data.title} · PlusOne Events`) });
    for (const t of tags) rewriter = rewriter.on(t.selector, { element: (e) => e.setAttribute("content", t.value) });
    return rewriter.transform(response);
  } catch {
    return response;
  }
}
