import { LEAD_TITLE } from "./templates";
import { hostOf } from "./text";

/**
 * Search terms for finding vendors: the short keyword searches a person would type
 * ("wedding venues in Kochi", "nadaswaram for Muhurtham in Mylapore", "venues in Kochi under 8 lakh"),
 * never the couple's sentence with its exact figure in it.
 *
 * No Convex imports, so the Vendors page writes its default search with the same words.
 */

const LAKH = 100_000;
const CRORE = 10_000_000;

/** Money written in lakhs and crores. */
const SOUTH_ASIAN = new Set(["INR", "PKR", "NPR", "LKR", "BDT"]);

const SIGN: Record<string, string> = {
  INR: "₹", PKR: "Rs ", NPR: "Rs ", LKR: "Rs ", BDT: "৳",
  USD: "$", CAD: "$", AUD: "$", NZD: "$", SGD: "S$", HKD: "HK$",
  GBP: "£", EUR: "€", JPY: "¥", CNY: "¥",
};

const signOf = (currency: string): string => SIGN[currency] ?? `${currency} `;

/** 45000 -> "45,000". */
const grouped = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 1.5 -> "1.5", 15 -> "15", never "1.50" or "4.199999". */
const short = (n: number): string => String(Number(n.toFixed(1)));

/** Up, never down: a budget rounded down would hide vendors the couple can afford. */
const ceilTo = (n: number, step: number): number => Math.ceil(n / step - 1e-9) * step;

/**
 * A budget the way people say it, rounded up.
 * - Rupees and the other lakh currencies: under 1 lakh to the next 5,000 ("₹45,000"),
 *   under 1 crore to the next whole lakh (7,15,000 is "8 lakh"), then to the next half
 *   crore (1.2 crore is "1.5 crore").
 * - Everything else: two significant figures, in thousands from 1,000 ("$15k", "£8k").
 *
 * Lakhs and crores carry no sign unless `sign` is set: "8 lakh" already says rupees in a
 * search, and "₹8 lakh" is how the couple reads it.
 */
export function roughBudget(amount: number, currency: string, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const code = currency.trim().toUpperCase();
  const sign = signOf(code);
  if (SOUTH_ASIAN.has(code)) {
    const thousands = ceilTo(amount, 5_000);
    if (thousands < LAKH) return `${sign}${grouped(thousands)}`;
    const lakhs = ceilTo(amount, LAKH) / LAKH;
    const prefix = opts.sign ? sign : "";
    if (lakhs < 100) return `${prefix}${lakhs} lakh`;
    return `${prefix}${short(ceilTo(amount, CRORE / 2) / CRORE)} crore`;
  }
  const step = 10 ** Math.max(0, Math.floor(Math.log10(amount)) - 1);
  const rounded = ceilTo(amount, step);
  if (rounded >= 1_000_000) return `${sign}${short(rounded / 1_000_000)}m`;
  if (rounded >= 1_000) return `${sign}${short(rounded / 1_000)}k`;
  return `${sign}${grouped(rounded)}`;
}

/** The country a search is aimed at, from the wedding's currency. The euro spans too many to pick one. */
const COUNTRY_BY_CURRENCY: Record<string, string> = {
  INR: "IN", USD: "US", CAD: "CA", GBP: "GB", AUD: "AU", NZD: "NZ",
  PKR: "PK", BDT: "BD", LKR: "LK", NPR: "NP",
  AED: "AE", SGD: "SG", CHF: "CH", HKD: "HK", JPY: "JP", CNY: "CN",
};

/** ISO 3166-1 alpha-2 code for Firecrawl's `country`, or nothing when the currency doesn't say. */
export function searchCountry(currency: string | undefined): string | undefined {
  return currency ? COUNTRY_BY_CURRENCY[currency.trim().toUpperCase()] : undefined;
}

/** Firecrawl's `location`: neighbourhood, then city. */
export function searchLocation(area: string | undefined, city: string): string {
  return [area?.trim(), city.trim()].filter(Boolean).join(", ");
}

/** What people search for, by the need's category. Keys are lower-case, "&" read as "and". */
const PLURALS: Record<string, string> = {
  venue: "venues",
  catering: "caterers",
  caterer: "caterers",
  photographer: "photographers",
  photography: "photographers",
  "photography and video": "photographers",
  videographer: "videographers",
  videography: "videographers",
  "decor and florals": "decorators",
  decor: "decorators",
  decorations: "decorators",
  florist: "florists",
  florals: "florists",
  "music dj": "DJs",
  dj: "DJs",
  "live band": "live bands",
  cake: "cake makers",
  officiant: "officiants",
  celebrant: "celebrants",
  "mehndi artist": "mehndi artists",
  "mehndi henna artist": "mehndi artists",
  "makeup and hair": "makeup and hair artists",
  "bridal makeup artist": "bridal makeup artists",
  attire: "bridal boutiques",
  transport: "car rentals",
  stationery: "invitation designers",
  bar: "bar services",
  lighting: "lighting companies",
  "av and sound": "sound and AV companies",
  rentals: "tent and furniture rental companies",
  gifting: "return gift shops",
  accommodation: "resorts",
  "event staff": "event staffing agencies",
  emcee: "emcees and anchors",
  entertainment: "entertainers",
  planner: "planners",
  "wedding planner": "planners",
};

const categoryKey = (category: string): string =>
  category
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/^wedding\s+/, "");

/**
 * "Venue" -> "venues", "Catering" -> "caterers", "Music/DJ" -> "DJs". Anything unknown is
 * "<category> services". The family's own word for a need comes from its title (`ownTitle`).
 */
export function needPlural(category: string): string {
  const key = categoryKey(category);
  return PLURALS[key] ?? PLURALS[key.replace(/s$/, "")] ?? `${key || "event"} services`;
}

/** "photographers" -> "photographer", "sound and AV companies" -> "sound and AV company". */
export const singularNeed = (plural: string): string => plural.replace(/ies$/, "y").replace(/s$/, "");

const STOP = new Set(["and", "the", "for", "with"]);
const titleWords = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * The couple's own name for a need, when it says something its category doesn't:
 * "Iyer" for an Officiant, or "Ceremony musicians" for a Live band. "Photography" for a
 * Photographer, or "Cake & desserts" for Cake, is the same thing and gives nothing.
 */
export function ownTitle(title: string | undefined, category: string): string | undefined {
  const name = title?.trim();
  // The placeholder for someone to lead a ceremony is not a word anyone searches for.
  if (!name || name.toLowerCase() === LEAD_TITLE.toLowerCase()) return undefined;
  const kind = titleWords(category);
  const same = (a: string, b: string) => {
    const n = Math.min(5, a.length, b.length);
    return a.slice(0, n) === b.slice(0, n);
  };
  const overlaps = titleWords(name).some((w) => kind.some((k) => same(w, k)));
  return overlaps ? undefined : name;
}

/**
 * The part of the event a need is for, by name, when it serves exactly one of several
 * parts: "Muhurtham" for the nadaswaram rather than the whole wedding. Nothing otherwise,
 * since a need for every part, or an event of one part, is searched for by its occasion.
 */
export function partOfNeed(
  sessionIds: readonly string[],
  parts: readonly { _id: string; name: string }[],
): string | undefined {
  if (sessionIds.length !== 1 || parts.length < 2) return undefined;
  return parts.find((p) => p._id === sessionIds[0])?.name.trim() || undefined;
}

const KEEP = "\u0000";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CURRENCY_SIGNS = "₹$£€৳¥";
/** "₹7,15,000", "Rs. 50,000", "$4,200", "USD 4200", "£8k", "1.5 crore". */
const MONEY = new RegExp(
  `(?:[${CURRENCY_SIGNS}]|\\b(?:rs|inr|usd|gbp|eur|cad|aud|pkr|npr|lkr|bdt|aed|sgd|chf)\\b\\.?)\\s*\\d[\\d,.]*(?:\\s*(?:k|m|lakhs?|lacs?|crores?|cr)\\b)?`,
  "giu",
);
const AMOUNT_IN_WORDS = /\b\d[\d,.]*\s*(?:k|m|lakhs?|lacs?|crores?|cr|rupees|dollars|pounds|euros|bucks)\b/gi;
const DIGIT_GROUPS = /\b\d{1,3}(?:,\d{2,3})+\b|\b\d{4,}\b/g;
const PRICE_WORDS = /\b(?:under|below|within|up ?to|less than|max(?:imum)?|budget(?: of)?)\b(?!\s*\u0000)/gi;
const FILLER =
  /\b(?:that|which)\s+(?:feels?|looks?|is|are|has|have)\b|\bfeels?\s+like\b|\bfor\s+(?:a|an|our|my|the)\b|\b(?:we|i)\s+(?:want|need|would like|are looking for|am looking for)\b|\blooking\s+for\b|\bplease\b|\bsomething\b|\bnear me\b|\btop\s*\d*\b|\bbest\b/gi;
const EDGE_WORDS = /^(?:in|for|with|at|of|and|or|to|that|which|a|an|the)\s+|\s+(?:in|for|with|at|of|and|or|to|that|which|a|an|the|under|below|around|about)$/i;

function tidy(text: string): string {
  let s = text
    .replace(/[,;:!?()[\]{}|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(EDGE_WORDS, "").trim();
  }
  return s;
}

const MAX_WORDS = 8;
const MAX_CHARS = 70;

/**
 * Turn whatever was written into a short search: no amounts (except the budget words
 * passed in, kept exactly), no sentence filler ("that feels", "for a"), no quotes, at
 * most 8 words and 70 characters, and always the place. Returns "" when nothing is left.
 *
 * "Venue in Kochi for a wedding that feels intimate under ₹7,15,000"
 *   -> "Venue in Kochi wedding intimate"
 */
export function cleanQuery(q: string, place: string, budgetWords?: string): string {
  let s = ` ${q} `;
  if (budgetWords) {
    // "8 lakhs" is still the budget words; the plural is dropped with them.
    s = s.replace(new RegExp(`${escape(budgetWords)}s?(?![\\p{L}\\p{N}])`, "iu"), ` ${KEEP} `);
  }
  s = s
    .replace(/["“”‘’`]|(?<![a-z])'|'(?![a-z])/gi, " ")
    .replace(MONEY, " ")
    .replace(AMOUNT_IN_WORDS, " ")
    .replace(DIGIT_GROUPS, " ")
    .replace(new RegExp(`[${CURRENCY_SIGNS}]`, "gu"), " ")
    .replace(PRICE_WORDS, " ")
    .replace(FILLER, " ");
  s = tidy(s);
  const where = place.replace(/\s+/g, " ").trim();
  const restore = (text: string) => text.replace(KEEP, budgetWords ?? "").replace(/\s+/g, " ").trim();
  const fits = (text: string) => text.split(" ").length <= MAX_WORDS && text.length <= MAX_CHARS;
  if (!where) {
    const words = restore(s).split(" ").filter(Boolean).slice(0, MAX_WORDS);
    while (words.join(" ").length > MAX_CHARS && words.length > 1) words.pop();
    return tidy(words.join(" "));
  }
  if (s.toLowerCase().includes(where.toLowerCase()) && fits(restore(s))) return restore(s);

  // Take the place out (or the part of it that is there, such as the city without its
  // neighbourhood), then put the whole place back at the end.
  const placeWords = where.split(" ");
  let core = s;
  for (let i = 0; i < placeWords.length; i++) {
    const tail = `(?:\\bin\\s+)?(?<![\\p{L}\\p{N}])${escape(placeWords.slice(i).join(" "))}(?![\\p{L}\\p{N}])`;
    if (new RegExp(tail, "iu").test(core)) {
      core = core.replace(new RegExp(tail, "giu"), " ");
      break;
    }
  }
  core = tidy(core);
  if (!core.replace(KEEP, "").trim()) return "";
  const words = core.split(" ").slice(0, Math.max(1, MAX_WORDS - placeWords.length - 1));
  while (restore(words.join(" ")).length + where.length + 4 > MAX_CHARS && words.length > 1) words.pop();
  const head = tidy(words.join(" "));
  return head ? restore(`${head} in ${where}`) : "";
}

/**
 * The searches PlusOne runs without help, and fills any gap the planner leaves with. Every
 * one names the occasion: "venues in Kochi under 8 lakh" found used Hyundai Venue cars, and
 * "photographers in Austin" found family photographers and job boards (eval, 20 Oct).
 * - `<their word, or needs> for <part> in <place>` when the need is for one part ("nadaswaram for Muhurtham in Mylapore")
 * - `wedding <needs> in <place>`, or `<their word> for wedding in <place>` when the couple renamed the need
 * - `<vibe> wedding <needs> in <place>`
 * - `wedding <needs> in <place> under <budget words>`
 * - `<need> <place> wedding packages pricing`: a page that shows numbers is usually the vendor's own
 * "wedding" is the occasion's own word for anything else: "birthday party venues in Austin".
 */
export function fallbackQueries(args: {
  need: string;
  title?: string;
  place: string;
  /** The one part of the event this need is for, in the family's words ("Muhurtham"). */
  part?: string;
  vibe?: string;
  budgetWords?: string;
  /** What is being planned, in words: "birthday party", "wedding"; "event" when not given. */
  occasion?: string;
}): string[] {
  const occasion = (args.occasion ?? "event").toLowerCase();
  const needs = needPlural(args.need);
  const own = ownTitle(args.title, args.need);
  const place = args.place.trim();
  // "wedding venues in Kochi", or "Iyer for wedding in Chennai" in the couple's own word.
  const lead = own ? `${own} for ${occasion} in ${place}` : `${occasion} ${needs} in ${place}`;
  const part = args.part?.trim();
  // No price and no mood in a search: "under 15,000" and "relaxed" pull in directories and
  // listicles, not vendors' own sites. The budget and the feel are used when ranking instead.
  const queries = [part ? `${own ?? needs} for ${part} in ${place}` : "", lead, `${own ?? singularNeed(needs)} ${place} ${occasion} packages pricing`];
  return uniqueQueries(queries.map((q) => (q ? cleanQuery(q, place) : ""))).slice(0, 3);
}

/** Put the occasion in a search that left it out: "venues in Kochi" -> "wedding venues in Kochi". */
export function withOccasion(q: string, occasion: string): string {
  const word = occasion.trim().toLowerCase();
  if (!word) return q;
  // "beach wedding venues" already says wedding; so does "weddings".
  return new RegExp(`(?<![\\p{L}])${escape(word)}`, "iu").test(q) ? q : `${word} ${q}`;
}

/**
 * What the search box says before anyone types, and what "find them all" searches:
 * "Venues in Kochi for a wedding, intimate, under ₹8 lakh", or "Nadaswaram for Muhurtham in
 * Mylapore, Chennai, under ₹50,000" for a need that serves one part.
 */
export function defaultSearchText(args: {
  category: string;
  title?: string;
  area?: string;
  city: string;
  /** "a wedding", "a birthday party". */
  occasion: string;
  /** The one part of the event this need is for, in the family's words (`partOfNeed`). */
  part?: string;
  /** Kept for the callers; a mood is never searched. */
  vibes?: readonly string[];
  /** Kept for the callers; a price is never searched. */
  amount?: number;
  currency?: string;
}): string {
  const who = ownTitle(args.title, args.category) ?? needPlural(args.category);
  const area = args.area?.trim();
  const place = area ? `${area}, ${args.city}` : args.city;
  const Who = `${who.charAt(0).toUpperCase()}${who.slice(1)}`;
  const part = args.part?.trim();
  // The trade, the place and the occasion: a mood or a price in a search brings back directories and blogs.
  return part ? `${Who} for ${part} in ${place}` : `${Who} in ${place} for ${args.occasion}`;
}

/** Drop blanks and repeats, ignoring case. */
export function uniqueQueries(queries: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q.trim());
  }
  return out;
}

/**
 * A PDF, Word or slide file is never a vendor's own website, and reading one is billed by
 * the page: a 300-page magazine PDF from a search cost 303 credits in the 20 Oct eval.
 */
export function isDocumentUrl(url: string): boolean {
  try {
    return /\.(pdf|docx?|pptx?|xlsx?)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** True for a search shaped to land on a vendor's own prices page. */
export const isPricingQuery = (q: string): boolean => /packages|pricing|price/i.test(q);

/**
 * One list from several searches, one entry per website, by reciprocal-rank fusion:
 * each search adds 1 / (60 + position), so a site several searches found outranks one
 * that a single search put first. Ties go to the better position, then the earlier
 * search. A site's best-placed page is the one kept.
 */
export function mergeByHost<T extends { url: string }>(lists: readonly (readonly T[])[]): T[] {
  const K = 60;
  const byHost = new Map<string, { item: T; score: number; best: number; first: number }>();
  let seenOrder = 0;
  for (const list of lists) {
    const inThisList = new Set<string>();
    list.forEach((item, i) => {
      const host = hostOf(item.url);
      if (!host || inThisList.has(host)) return;
      inThisList.add(host);
      const rank = i + 1;
      const entry = byHost.get(host);
      if (!entry) {
        byHost.set(host, { item, score: 1 / (K + rank), best: rank, first: seenOrder++ });
        return;
      }
      entry.score += 1 / (K + rank);
      if (rank < entry.best) {
        entry.best = rank;
        entry.item = item;
      }
    });
  }
  return [...byHost.values()]
    .sort((a, b) => b.score - a.score || a.best - b.best || a.first - b.first)
    .map((e) => e.item);
}
