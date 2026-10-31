/**
 * Vendor leads: a business name, area and trade to look up on the open web, and the rules
 * for what may be kept from what comes back. Only facts a business publishes about itself
 * are kept, each with the page it came from. Directories and social sites are never read:
 * from them PlusOne keeps only the link a search returned. No photos, reviews or ratings.
 */
import { e164 } from "./marketplace";
import { isNoScrapeHost } from "./scrapePolicy";
import { CHENNAI_AREAS, plain } from "./places";

/** A lead list's trades, as PlusOne names them; null for a trade PlusOne doesn't list. */
export const LEAD_CATEGORIES: Record<string, string | null> = {
  hair_makeup: "Makeup & Hair",
  venue: "Venue",
  photographer: "Photographer",
  videographer: "Videographer",
  decor: "Decor & Florals",
  florist: "Decor & Florals",
  caterer: "Catering",
  attire: "Attire",
  mehndi_artist: "Mehndi artist",
  cake: "Cake",
  favours_gifts: "Gifting",
  invitations: "Stationery",
  accommodations: "Accommodation",
  dj: "Music/DJ",
  live_music: "Live band",
  officiant: "Officiant",
  entertainment: "Entertainment",
  choreographer: "Entertainment",
  transport: "Transport",
  rentals: "Rentals",
  planner: null,
  jewellery: null,
  honeymoon: null,
};

/** The words a search adds so it finds the business, not a namesake: "makeup artist", "caterers". */
export const SEARCH_WORDS: Record<string, string> = {
  "Makeup & Hair": "makeup artist",
  Venue: "hall",
  Photographer: "photography",
  Videographer: "videography",
  "Decor & Florals": "decorators",
  Catering: "caterers",
  Attire: "boutique",
  "Mehndi artist": "mehndi",
  Cake: "cakes",
  Gifting: "return gifts",
  Stationery: "invitations",
  Accommodation: "hotel",
  "Music/DJ": "DJ",
  "Live band": "band",
  Officiant: "priest",
  Entertainment: "entertainment",
  Transport: "travels",
  Rentals: "rentals",
};

/** The same business across a directory and a search: "Sri Ganesh Caterers (Regd.)" and "sri ganesh caterers". */
export function leadKey(name: string, category: string): string {
  return `${plain(name).replace(/\s+/g, " ").trim()}|${category}`;
}

/** Words that say what a business is, not who: dropped before names are compared. */
const GENERIC = new Set([
  "the", "and", "of", "by", "in", "chennai", "india", "pvt", "ltd", "private", "limited", "llp", "co", "company",
  "studio", "studios", "photography", "photos", "photo", "events", "event", "caterers", "catering", "services", "service",
  "makeup", "make", "up", "artist", "artistry", "bridal", "salon", "hall", "halls", "mahal", "mandapam", "decor", "decorators",
  "decoration", "wedding", "weddings", "official", "home", "page", "best", "top",
  // Trade words, too common to say whose a site is: a directory's address carries them as often as a vendor's.
  "travel", "travels", "tours", "cab", "cabs", "cards", "card", "cake", "cakes", "bakes", "boutique", "designer", "designers",
  "fashion", "fashions", "beauty", "parlour", "point", "dj", "deejay", "dance", "music", "musicals", "orchestra", "band", "choir",
  "hotel", "hotels", "resort", "restaurant", "bar", "lounge", "cafe", "astro", "astrology", "astrologer", "print", "prints",
  "printers", "solution", "solutions", "gifts", "gift", "invitations", "invitation", "mehndi", "mehendi", "henna", "academy",
  "entertainment", "productions", "production", "creations", "group", "enterprises", "india", "center", "centre", "space",
]);

const tokens = (text: string): string[] => plain(text).split(/\s+/).filter((t) => t.length > 1 && !GENERIC.has(t));

/** Whether a page's title names the business: most of the name's own words are there, at least one. */
export function nameMatches(name: string, title: string): boolean {
  const want = tokens(name);
  if (!want.length) return false;
  const have = new Set(tokens(title));
  const hits = want.filter((t) => have.has(t)).length;
  return hits >= Math.max(1, Math.ceil(want.length * 0.6));
}

export type LinkKind = "maps" | "instagram" | "facebook" | "blocked" | "site";

/** What a search result's address is: a map listing or a social page to link to, a site we never read, or a site of its own. */
export function linkKind(url: string): LinkKind {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "blocked";
  }
  if (/^(maps\.app\.goo\.gl|g\.page|goo\.gl)$/.test(host) || (/^(google\.[a-z.]+|maps\.google\.[a-z.]+)$/.test(host) && /\/maps\b/.test(url))) return "maps";
  if (host === "instagram.com") return "instagram";
  if (host === "facebook.com" || host === "m.facebook.com") return "facebook";
  if (isNoScrapeHost(host)) return "blocked";
  // Other directories, marketplaces, review and social sites: neither read nor linked.
  if (/(^|\.)(google|youtube|linkedin|twitter|x|pinterest|quora|reddit|wikipedia|tripadvisor|zomato|swiggy|magicpin|nearbuy|bookmyshow|urbanclap|urbancompany|venuelook|weddingsutra|weddingbazaar|weddingplz|mywedding|shaadi|bharatmatrimony|jdmagicbox|asklaila|yellowpages|hotfrog|cybo|zaubacorp|tofler)\./.test(`${host}.`)) return "blocked";
  return "site";
}

/**
 * Whether a site is the business's own: its address carries the business's name
 * (benzzpark.com for Benzz Park). A page about the business on anyone else's site, a
 * directory, a marketplace or a review site, is someone else's listing and is never read.
 */
export function ownSite(name: string, url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  // The registered name only: crowne-plaza.hotelinchennai.com is hotelinchennai's page, not the hotel's.
  const labels = host.split(".");
  const tail = /^(co|com|net|org|gov|ac|edu)$/.test(labels[labels.length - 2] ?? "") && labels.length > 2 ? 3 : 2;
  const letters = labels.slice(-tail, -1).join("").replace(/[^a-z0-9]/g, "");
  const own = tokens(name).filter((t) => t.length >= 3);
  if (own.some((t) => letters.includes(t))) return true;
  // Initials and short words run together: "aagifts" for AA Gifts.
  const joined = plain(name).replace(/[^a-z0-9]/g, "");
  return joined.length >= 5 && letters.includes(joined);
}

export type SearchHit = { url: string; title?: string; description?: string };
export type LeadMatch = {
  /** The business's name as its own page or listing writes it. */
  name: string;
  website?: string;
  maps?: string;
  instagram?: string;
  facebook?: string;
  /** Every page a kept fact came from. */
  sources: string[];
};

/**
 * The business among a search's results: its own site, its map listing and its social
 * pages, each kept only when the result names it. Nothing is kept from a page we don't read
 * except the link itself; a lead with nothing that names it is not found.
 */
export function matchLead(name: string, hits: SearchHit[], context: string[] = []): LeadMatch | null {
  const match: LeadMatch = { name, sources: [] };
  let named: string | undefined;
  // A one-word name ("Adoniya") is easily someone else's: a map or social page must name the vendor's own
  // area, or both Chennai and the trade.
  const thin = tokens(name).length < 2;
  const [trade, area] = context.map((c) => plain(c));
  const placed = (text: string) => (area && area.trim() ? text.includes(area) : false) || (text.includes(" chennai ") && (!trade?.trim() || text.includes(trade)));
  for (const hit of hits) {
    const title = (hit.title ?? "").trim();
    if (!title || !nameMatches(name, title)) continue;
    const kind = linkKind(hit.url);
    if (kind === "blocked") continue;
    if (thin && kind !== "site" && !placed(plain(`${title} ${hit.description ?? ""}`))) continue;
    const page = profileUrl(hit.url, kind);
    if (!page) continue;
    if (kind === "maps" && !match.maps) match.maps = page;
    else if (kind === "instagram" && !match.instagram) match.instagram = page;
    else if (kind === "facebook" && !match.facebook) match.facebook = page;
    else if (kind === "site" && !match.website && ownSite(name, hit.url)) {
      match.website = hit.url;
      named ??= businessName(title);
    } else continue;
    match.sources.push(page);
  }
  if (!match.sources.length) return null;
  match.name = named && nameMatches(name, named) ? named : name;
  return match;
}

/**
 * The address worth keeping: a social account's own page, never one post or reel (whose
 * owner may be anyone), and no tracking parameters on any address.
 */
export function profileUrl(url: string, kind: LinkKind): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (kind === "instagram" || kind === "facebook") {
    const first = u.pathname.split("/").filter(Boolean)[0];
    if (!first || /^(p|reel|reels|stories|explore|watch|groups|events|posts|photos|videos|share|story\.php|photo\.php|permalink\.php)$/i.test(first)) return null;
    return `https://www.${kind}.com/${first}/`;
  }
  if (kind === "maps") return url;
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|srsltid|gclid|fbclid|hl$)/.test(k)) u.searchParams.delete(k);
  return u.toString();
}

/** A page title's business name: "Sri Ganesh Caterers | Best caterers in Chennai" → "Sri Ganesh Caterers". */
export function businessName(title: string): string {
  const first = title.split(/\s+[|–—-]\s+|\s*::\s*/)[0].trim().replace(/,?\s+(in\s+)?chennai$/i, "");
  return first.length >= 3 && first.length <= 80 ? first : title.slice(0, 80).trim();
}

/** Indian phone numbers a business publishes, as E.164: mobiles (6–9…) and Chennai landlines (044…). */
export function findPhones(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:\+?91[\s-]?)?(?:0?44[\s-]?\d{4}[\s-]?\d{4}|[6-9]\d{4}[\s-]?\d{5}|[6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4})/g;
  for (const m of text.match(re) ?? []) {
    const digits = m.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=44\d{8}$)/, "");
    if (digits.length !== 10) continue;
    // Placeholder numbers a template leaves in: runs (6789101112, 9876543210) and one digit over and over.
    if (/0123456789|1234567890|9876543210|6789101112|(\d)\1{6}/.test(digits)) continue;
    // A Chennai landline (44…) isn't a mobile, so it is written out here rather than by e164.
    const phone = /^44\d{8}$/.test(digits) ? `+91${digits}` : e164(digits);
    if (phone) out.add(phone);
  }
  return [...out].slice(0, 3);
}

/** The Chennai area a page names, matched against the areas PlusOne knows. */
export function areaIn(text: string): string | undefined {
  const words = plain(text);
  let best: string | undefined;
  for (const a of CHENNAI_AREAS) {
    const names = [a.name, ...(a.aliases ?? [])];
    if (names.some((n) => words.includes(plain(n))) && (!best || a.name.length > best.length)) best = a.name;
  }
  return best;
}
