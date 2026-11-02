import type { Basis } from "./comparable";
import { basisUnitOf, priceUnitOf, quantitiesFor, sheetFor, timesFor, type LineStatus, type Sheet } from "./standardSheet";
import { hostOf, inSentence } from "./text";

/**
 * The rules behind PlusOne Partner's listings, kept pure so Events, Partner and Ops all
 * read the same answer and the tests pin it down: which city a listing counts in, where
 * a price sits in its city's range, and which badges a vendor has earned. Badges are
 * always worked out from status, source and prices, never stored by hand.
 */

/** A band is shown only once this many prices sit behind it; fewer would be one vendor's word. */
export const MIN_BAND_COUNT = 8;

export type Band = { count: number; p25: number; p50: number; p75: number; p90: number };
export type Tier = "Value" | "Standard" | "Premium" | "Luxury";
export type Level = "New" | "Trusted" | "Top";
export type Badge = "plusone_added" | "verified" | "transparent_pricing";
export type ProfileStatus = "pending" | "verified" | "rejected" | "suspended";
export type ProfileSource = "plusone_added" | "vendor_signup";

/** Older or local names a family might type, read as the city they mean. */
const CITY_ALIASES: Record<string, string> = {
  madras: "chennai",
  bangalore: "bengaluru",
  bombay: "mumbai",
  calcutta: "kolkata",
  gurgaon: "gurugram",
  "new delhi": "delhi",
};

/** The key a city is stored and searched under: "Chennai ", "chennai" and "Madras" are one city. */
export function cityKey(city: string): string {
  const key = city.trim().toLowerCase().replace(/\s+/g, " ");
  return CITY_ALIASES[key] ?? key;
}

/** Percentile by linear interpolation between the two nearest prices. */
function percentile(sorted: number[], p: number): number {
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo));
}

/** The range for a set of prices, or null when there are too few to call it a range. */
export function bandOf(prices: number[]): Band | null {
  const sorted = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (sorted.length < MIN_BAND_COUNT) return null;
  return {
    count: sorted.length,
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
  };
}

/** Where a price sits against its city's range. It places a price; it never calls one fair. */
export function tierFor(price: number, band: Band | null): Tier | undefined {
  if (!band || !(price > 0)) return undefined;
  if (price <= band.p25) return "Value";
  if (price <= band.p75) return "Standard";
  if (price <= band.p90) return "Premium";
  return "Luxury";
}

/** Events done through PlusOne before a vendor is Trusted, and then Top. */
export const TRUSTED_AFTER = 3;
export const TOP_AFTER = 10;

export function levelFor(completedEvents: number): Level {
  if (completedEvents >= TOP_AFTER) return "Top";
  if (completedEvents >= TRUSTED_AFTER) return "Trusted";
  return "New";
}

type OfferingLike = { price: number; unit: Basis; includes: string[] };

/**
 * Prices published itemised: a price, the unit it is for, and what it includes. A
 * vendor whose offerings all say this earns the Transparent pricing badge.
 */
export function isItemised(o: OfferingLike): boolean {
  return o.price > 0 && o.includes.some((i) => i.trim().length > 0);
}

export function badgesFor(
  profile: { status: ProfileStatus; source: ProfileSource },
  offerings: OfferingLike[],
): Badge[] {
  const badges: Badge[] = [];
  if (profile.status === "verified") badges.push("verified");
  else if (profile.source === "plusone_added") badges.push("plusone_added");
  if (profile.status === "verified" && offerings.length > 0 && offerings.every(isItemised)) {
    badges.push("transparent_pricing");
  }
  return badges;
}

/**
 * Whether a family may see a listing. Suspended and rejected never; a vendor's own
 * sign-up only once verified; a listing PlusOne added from public pages while it waits.
 */
export function isListed(profile: { status: ProfileStatus; source: ProfileSource }): boolean {
  if (profile.status === "verified") return true;
  return profile.status === "pending" && profile.source === "plusone_added";
}

/**
 * A demo guest's own sample business, made so they can try Partner from the vendor's
 * side. It answers only their own sample event, and never shows in a search or a range.
 */
export function isTrial(profile: { sample?: boolean; ownerUserId?: unknown }): boolean {
  return profile.sample === true && Boolean(profile.ownerUserId);
}

/**
 * Whether a published price belongs in its city's range: priced the way Compare reads its
 * category (lib/standardSheet basisUnitOf), so a rate per hour never sits among prices for
 * the whole event. A kind of service without a sheet has one way of pricing, so it does.
 */
export function inRangeUnit(o: { category: string; unit: Basis; priceUnit?: string }): boolean {
  const sheet = sheetFor(o.category);
  if (!sheet) return true;
  return o.unit === sheet.unit && priceUnitOf(sheet, o.priceUnit).key === basisUnitOf(sheet).key;
}

/**
 * The cheapest offering in a category: the "from" price a family sees on the card. One
 * priced the way the range is wins over a cheaper rate per hour, which isn't the same price.
 */
export function startingOffering<T extends OfferingLike & { category: string; priceUnit?: string }>(offerings: T[], category: string): T | undefined {
  const priced = offerings.filter((o) => o.category === category && o.price > 0).sort((a, b) => a.price - b.price);
  return priced.find(inRangeUnit) ?? priced[0];
}

/**
 * Whether an email address is at a listing's own website, so a claim can be approved
 * without a person checking: owner@anjalicaterers.example claims anjalicaterers.example.
 * Free mail domains never match, whatever the website says.
 */
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com", "icloud.com", "rediffmail.com", "proton.me", "protonmail.com"]);

export function emailMatchesWebsite(email: string | undefined, website: string | undefined): boolean {
  if (!email || !website) return false;
  const domain = email.trim().toLowerCase().split("@")[1];
  const host = hostOf(website);
  if (!domain || !host || FREE_MAIL.has(domain)) return false;
  return domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`);
}

export type OfferLine = { key: string; status: LineStatus; amount?: number };

/**
 * An offer's answers checked against its sheet, in the sheet's order. Every line must be
 * answered (included, priced inside the total, or extra), since an offer made on PlusOne
 * Partner should leave nothing unsaid; a priced line needs its amount. Returns the lines
 * to store, or the first problem in words the vendor reads.
 */
export function checkOfferLines(sheet: Sheet | null, lines: OfferLine[]): { lines: OfferLine[] } | { problem: string } {
  if (!sheet) return { lines: [] };
  const out: OfferLine[] = [];
  for (const line of sheet.lines) {
    const answer = lines.find((l) => l.key === line.key);
    if (!answer || answer.status === "unstated") return { problem: `Say whether ${inSentence(line.label)} is included, priced in, or extra.` };
    const amount = answer.amount === undefined ? undefined : Math.round(answer.amount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0 || amount > 1e9)) return { problem: `The amount for ${inSentence(line.label)} doesn't look right.` };
    if (answer.status === "priced" && !amount) return { problem: `Give the amount for ${inSentence(line.label)}, or mark it included.` };
    out.push({ key: line.key, status: answer.status, ...(answer.status === "included" || amount === undefined ? {} : { amount }) });
  }
  return { lines: out };
}

/** Above any real event's plates, hours or photos; a bigger number is a slip of the keyboard. */
export const MAX_QUANTITY = 100_000;

export type PriceTerms = { priceUnit: string; quantities: Record<string, number>; times: number | null };

/**
 * A price's way of charging and what it includes, checked against its sheet: a way the
 * trade charges, and quantities the sheet names, each a number not below zero. Those that
 * go with another way of charging are dropped, since a form switched between ways may still
 * hold them. `need`: an offer's total is its price times the quantities its way of charging
 * counts, so they must be given; a published price is a rate, so it needn't say them.
 */
export function checkPriceTerms(sheet: Sheet, priceUnit: string | undefined, quantities: Record<string, number> | undefined, need: boolean): PriceTerms | { problem: string } {
  if (priceUnit !== undefined && !sheet.units.some((u) => u.key === priceUnit)) return { problem: "Choose one of the ways this service is priced." };
  const unit = priceUnitOf(sheet, priceUnit);
  const shown = quantitiesFor(sheet, unit.key);
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(quantities ?? {})) {
    const q = sheet.quantities.find((x) => x.key === key);
    if (!q) return { problem: "That isn't something this kind of price can include." };
    if (!Number.isFinite(n) || n < 0 || n > MAX_QUANTITY) return { problem: `The number for ${inSentence(q.label)} doesn't look right.` };
    // Plates and pieces are whole; hours and kg may be halves.
    if (shown.includes(q)) out[key] = q.fromBrief ? Math.round(n) : Math.round(n * 100) / 100;
  }
  if (need) {
    for (const key of unit.times) {
      if ((out[key] ?? 0) > 0) continue;
      const q = sheet.quantities.find((x) => x.key === key)!;
      return { problem: q.fromBrief ? `Say how many ${q.label.toLowerCase()} the price is for.` : `A price ${unit.label} needs the ${inSentence(q.label)}.` };
    }
  }
  return { priceUnit: unit.key, quantities: out, times: timesFor(unit, out) };
}

/** What the family pays for an offer as made: the main price for its quantity, plus every line priced inside it. */
export function offerTotal(price: number, quantity: number, lines: OfferLine[]): number {
  return Math.round(price * quantity + lines.filter((l) => l.status === "priced").reduce((sum, l) => sum + (l.amount ?? 0), 0));
}

/** A phone or WhatsApp number in E.164 (+919840012345), or undefined if it can't be read as one. */
export function e164(raw: string | undefined, defaultCountry = "+91"): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const bare = digits.replace(/\D/g, "").replace(/^0+/, "");
  if (defaultCountry === "+91" && /^[6-9]\d{9}$/.test(bare)) return `+91${bare}`;
  return undefined;
}
