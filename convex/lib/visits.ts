/**
 * The visit log's pure parts: checking what the site's Cloudflare middleware sends,
 * and telling bots from people by their user agent. No database, no network.
 */

/** How long a visit is kept. */
export const VISITS_KEPT_FOR = 180 * 24 * 60 * 60 * 1000;

/** One visit, as stored (less `isBot`, which is worked out here, not trusted from the sender). */
export type VisitInput = {
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
  /** This browser's id, from the site's first-party cookie. */
  visitorId?: string;
  /** The signed-in Clerk user, verified by the middleware. */
  clerkUserId?: string;
};

const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|headless|python|curl|wget|scrapy|httpclient|http-client|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|perl\/|ruby|php\/|phantomjs|puppeteer|playwright|selenium|lighthouse|facebookexternalhit|archiver|httrack|semrush|ahrefs|mj12|dataforseo|feedfetcher|uptime|monitor/i;

/**
 * Networks that mostly carry VPNs, proxies, cloud servers and relays rather than people
 * at home or on a phone: a short built-in list by network number and by name.
 */
const PROXY_ASNS = new Set([
  16509, 14618, // Amazon
  15169, 396982, // Google, Google Cloud
  8075, // Microsoft
  31898, // Oracle Cloud
  45102, 132203, // Alibaba, Tencent
  14061, // DigitalOcean
  16276, // OVH
  24940, 213230, // Hetzner
  63949, // Linode / Akamai Cloud
  20473, // Vultr (Choopa)
  51167, // Contabo
  60781, 28753, // Leaseweb
  9009, // M247 (many VPNs)
  60068, 212238, // CDN77 / Datacamp (many VPNs)
  136787, // NordVPN (Tefincom)
  39351, // 31173 / Mullvad
  209854, // Surfshark
  13335, // Cloudflare (WARP)
  36183, 54113, // Akamai and Fastly relays (iCloud Private Relay)
  396356, // Latitude.sh
]);
const PROXY_ORG =
  /\bvpn\b|proxy|hosting|\bhost\b|datacent(er|re)|data cent(er|re)|\bvps\b|\bserver|cloud|amazon|\baws\b|microsoft|azure|digitalocean|\bovh|hetzner|linode|vultr|choopa|\bm247\b|datacamp|cdn77|contabo|leaseweb|oracle|alibaba|tencent|nordvpn|tefincom|surfshark|expressvpn|mullvad|31173|proton|private internet access|\btor\b|private relay/i;

/** A hint, not proof: the visit came through a VPN, proxy, Tor, relay or cloud server. */
export function isLikelyProxy(v: { country?: string; asn?: number; asOrganization?: string }): boolean {
  if (v.country?.toUpperCase() === "T1") return true; // Cloudflare's code for Tor
  if (v.asn !== undefined && PROXY_ASNS.has(v.asn)) return true;
  return Boolean(v.asOrganization && PROXY_ORG.test(v.asOrganization));
}

/** A guess from the user agent alone: a missing one counts as a bot. */
export function isBotUserAgent(ua: string | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return BOT_UA.test(ua);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * Narrow the JSON body from the middleware to a visit, or null when it isn't one.
 * A timestamp more than a day from `now` is replaced with `now`.
 */
export function parseVisit(body: unknown, now: number): VisitInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const ip = text(b.ip, 64);
  const host = text(b.host, 255);
  const path = text(b.path, 500);
  const method = text(b.method, 10)?.toUpperCase();
  if (!ip || !/^[0-9a-fA-F:.]+$/.test(ip) || !host || !path || !path.startsWith("/") || !method) return null;
  const at = typeof b.at === "number" && Number.isFinite(b.at) && Math.abs(b.at - now) < 24 * 60 * 60 * 1000 ? b.at : now;
  const visit: VisitInput = { at, ip, host: host.toLowerCase(), path, method };
  const optional = {
    userAgent: text(b.userAgent, 300),
    referrer: text(b.referrer, 255),
    country: text(b.country, 8),
    city: text(b.city, 100),
    region: text(b.region, 100),
    asOrganization: text(b.asOrganization, 200),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (visit as Record<string, unknown>)[key] = value;
  }
  if (typeof b.asn === "number" && Number.isInteger(b.asn) && b.asn >= 0) visit.asn = b.asn;
  if (typeof b.visitorId === "string" && /^[0-9a-f-]{36}$/.test(b.visitorId)) visit.visitorId = b.visitorId;
  if (typeof b.clerkUserId === "string" && /^user_[A-Za-z0-9]{1,64}$/.test(b.clerkUserId)) visit.clerkUserId = b.clerkUserId;
  return visit;
}

/** Equal strings, compared in time that doesn't depend on where they first differ. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
