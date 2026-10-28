"use node";

import Firecrawl from "firecrawl";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { findEmails, hostOf, truncate } from "./lib/text";
import { linkPreviewValidator, vendorDetailValidator, vendorReviewValidator, type PriceUnit, type VendorDetail, type VendorReview } from "./lib/validators";
import { absoluteImage, previewFromScrape, type LinkPreview } from "./lib/links";
import { isDocumentUrl, mergeByHost, searchCountry } from "./lib/searchTerms";
import { isNoScrapeHost, robotsChecker } from "./lib/scrapePolicy";

const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

/** Big directories/marketplaces outrank real vendor sites; we want the vendors themselves. */
export const EXCLUDED_DOMAINS = [
  // Global wedding directories / marketplaces.
  "theknot.com",
  "weddingwire.com",
  "weddingwire.in",
  "zola.com",
  "wedmegood.com",
  "hitched.co.uk",
  "herecomestheguide.com",
  "onefabday.com",
  "bridebook.com",
  "mywedding.com",
  "weddingsutra.com",
  "weddingbazaar.com",
  "weddingplz.com",
  "venuelook.com",
  "wezoree.com",
  "eventective.com",
  "thebash.com",
  "gigsalad.com",
  "poptop.uk.com",
  // General listing sites that dominate Indian and mid-market results.
  "justdial.com",
  "sulekha.com",
  "indiamart.com",
  "shaadibaraati.com",
  "shaadisaga.com",
  "weddingz.in",
  "theweddingcompany.com",
  "5bestincity.com",
  "starofservice.in",
  "starofservice.com",
  "fearlessphotographers.com",
  "quora.com",
  "yelp.com",
  "trustpilot.com",
  "tripadvisor.com",
  // Job boards and professional networks: "photographers in Austin" returned a jobs page (eval, 20 Oct).
  "indeed.com",
  "ziprecruiter.com",
  "linkedin.com",
  "glassdoor.com",
  "glassdoor.co.in",
  "naukri.com",
  "monster.com",
  "simplyhired.com",
  // Stock imagery and general e-commerce marketplaces — never a local wedding vendor.
  "shutterstock.com",
  "istockphoto.com",
  "gettyimages.com",
  "alamy.com",
  "pexels.com",
  "unsplash.com",
  "fnp.com",
  "igp.com",
  "amazon.com",
  "amazon.in",
  "flipkart.com",
  "etsy.com",
  // Social / search.
  "facebook.com",
  "instagram.com",
  "pinterest.com",
  "reddit.com",
  "youtube.com",
  "tiktok.com",
  "google.com",
];

/**
 * Hosts that are never a vendor's own site. The eval (docs/research/firecrawl-eval.json)
 * surfaced portland.gov, university pages and blog platforms among the 40% non-vendor
 * candidates, so they are dropped before we spend a scrape on them.
 */
const NON_VENDOR_HOST_PATTERNS: RegExp[] = [
  /\.gov$/,
  /\.gov\./,
  /\.edu$/,
  /\.edu\./,
  /(^|\.)wikipedia\.org$/,
  /(^|\.)medium\.com$/,
  /(^|\.)substack\.com$/,
  /blogspot\./,
  /(^|\.)wordpress\.com$/,
];

/**
 * Review directories are excluded from discovery but are exactly where ratings live.
 * The second block was added after measuring: the first eight covered the US and India
 * and found nothing at all for Brighton caterers or Dublin florists.
 * See docs/research/reviews-eval.json.
 */
const ALL_REVIEW_DOMAINS = [
  "theknot.com",
  "weddingwire.com",
  "weddingwire.in",
  "yelp.com",
  "wedmegood.com",
  "hitched.co.uk",
  "trustpilot.com",
  "justdial.com",
  "zola.com",
  "bridebook.com",
  "guidesforbrides.co.uk",
  "weddingsonline.ie",
  "onefabday.com",
  "eventective.com",
  "weddingrule.com",
  "bark.com",
  "weddingz.in",
  "shaadisaga.com",
];

/**
 * Hosts that carry a rating which has nothing to do with being a wedding vendor.
 * Measured: Portland Parks & Recreation came back 4.0/5 from Indeed — its staff rating —
 * and Tamale House East 4.5/5 from Uber Eats, which rates its takeaway, not its catering.
 */
/** The review directories actually searched: those we may read (lib/scrapePolicy). */
export const REVIEW_DOMAINS = ALL_REVIEW_DOMAINS.filter((d) => !isNoScrapeHost(d));

const NON_VENDOR_REVIEW_HOSTS = [
  "indeed.com",
  "ubereats.com",
  "doordash.com",
  "grubhub.com",
  "seamless.com",
  "postmates.com",
  "swiggy.com",
  "zomato.com",
  "glassdoor.com",
  "linkedin.com",
  "ziprecruiter.com",
  "simplyhired.com",
  "wikipedia.org",
  "youtube.com",
  "reddit.com",
  "pinterest.com",
  "tiktok.com",
];

const SEARCH_MD_CHARS = 8_000;
const PAGE_MD_CHARS = 12_000;
const MAX_PAGES_PER_VENDOR = 3;
const SCRAPE_TIMEOUT_MS = 60_000; // 45s lost two slow-but-fine sites in testing
/** A preview is a nice-to-have in the background; a page that slow won't give one. */
const PREVIEW_TIMEOUT_MS = 30_000;

const JUNK_EMAIL = /(@example\.(com|org|net)|sentry|wixpress|placeholder|\.png|\.jpg|@2x)/i;
const CONTACT_LINK = /contact|get-in-touch|getintouch|enquir|inquir|book-us|reach-us/i;
const PRICING_LINK = /pricing|prices|price|investment|package|rates|services|collections/i;

/** Rough USD equivalents, only used to sanity-check a scraped number. */
const USD_PER: Record<string, number> = {
  USD: 1, CAD: 0.73, AUD: 0.65, NZD: 0.6, EUR: 1.08, GBP: 1.26, CHF: 1.1,
  INR: 0.012, PKR: 0.0036, LKR: 0.0033, BDT: 0.0085, NPR: 0.0075,
  AED: 0.27, SAR: 0.27, SGD: 0.74, MYR: 0.21, THB: 0.028, PHP: 0.017, IDR: 0.000062,
  JPY: 0.0064, CNY: 0.14, HKD: 0.13, KRW: 0.00073,
  ZAR: 0.055, NGN: 0.00065, KES: 0.0077, MXN: 0.05, BRL: 0.18, ARS: 0.001,
  SEK: 0.094, NOK: 0.092, DKK: 0.14, PLN: 0.25, TRY: 0.029, ILS: 0.27, RUB: 0.011,
};
const SYMBOL_TO_CODE: Array<[RegExp, string]> = [
  [/₹|\bINR\b|\bRs\.?\s?\d/i, "INR"],
  [/£|\bGBP\b/i, "GBP"],
  [/€|\bEUR\b/i, "EUR"],
  [/₨|\bPKR\b/i, "PKR"],
  [/¥|\bJPY\b/i, "JPY"],
  [/\bAED\b|\bdirham/i, "AED"],
  [/\bCAD\b|\bC\$/i, "CAD"],
  [/\bAUD\b|\bA\$/i, "AUD"],
  [/\$|\bUSD\b/i, "USD"],
];
const MIN_USD = 50;
const MAX_USD = 1_000_000;
/** A per-head or per-hour rate is allowed to be small; a total is not. */
const MIN_RATE_USD = 5;

type Candidate = { url: string; title?: string; description?: string; markdown?: string };

export function isBlockedHost(host: string): boolean {
  if (isNoScrapeHost(host)) return true;
  if (EXCLUDED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  return NON_VENDOR_HOST_PATTERNS.some((re) => re.test(host));
}

/** Clean, dedupe and prefer an address on the vendor's own domain. */
function cleanEmails(raw: string[], host: string | null): string[] {
  const seen = new Set<string>();
  for (const candidate of raw) {
    const email = candidate.trim().toLowerCase().replace(/^mailto:/, "").split("?")[0];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) continue;
    if (JUNK_EMAIL.test(email)) continue;
    seen.add(email);
  }
  const list = [...seen];
  if (host) {
    const bare = host.replace(/^www\./, "");
    list.sort((a, b) => Number(b.endsWith(`@${bare}`)) - Number(a.endsWith(`@${bare}`)));
  }
  return list.slice(0, 5);
}

/** Lower-case, alphanumerics to dashes: for comparing a business name against a directory url or title. */
const normalise = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function detectCurrency(text: string): string | undefined {
  for (const [re, code] of SYMBOL_TO_CODE) if (re.test(text)) return code;
  return undefined;
}

/**
 * A price is only kept when we know what currency it is in AND it is plausible.
 * The eval produced "$8" (per-hand henna) and "8.833" (a .gov table) as "prices";
 * both are rejected here and the raw `priceText` is kept instead.
 */
function sanePrice(
  price: number | undefined,
  currency: string | undefined,
  unit: PriceUnit | undefined,
): { startingPrice?: number; currency?: string } {
  if (price === undefined || !Number.isFinite(price) || price <= 0) return { currency };
  if (!currency) return { currency }; // never guess a currency for a bare number
  const code = currency.toUpperCase();
  const rate = USD_PER[code];
  if (rate === undefined) return { currency: undefined }; // an unrecognised code can't be sanity-checked
  const usd = price * rate;
  // A rate per head or per hour is legitimately small: $200 a plate is a real price,
  // it just is not a total. Only a total has to clear the "is this a wedding?" floor.
  const floor = unit && unit !== "total" ? MIN_RATE_USD : MIN_USD;
  if (usd < floor || usd > MAX_USD) return { currency };
  return { startingPrice: price, currency: code };
}

/** What the page said the price is for, believed only when it is one of ours. */
function readPriceUnit(raw: unknown, priceText: string | undefined): PriceUnit | undefined {
  const allowed: PriceUnit[] = ["total", "per_person", "per_hour", "per_day", "other"];
  if (typeof raw === "string" && (allowed as string[]).includes(raw)) return raw as PriceUnit;
  // The model sometimes leaves the field out but writes the unit into the price text.
  const text = (priceText ?? "").toLowerCase();
  if (/(per|a|each)\s*(person|guest|head|plate|pax)|pp\b|per-person/.test(text)) return "per_person";
  if (/per\s*hour|hourly|\/\s*hr\b/.test(text)) return "per_hour";
  if (/per\s*day|day rate/.test(text)) return "per_day";
  return undefined;
}

/** Only ever follow a link on the vendor's own host: a footer link to a directory or a web designer is not their contact page. */
const pickLink = (links: string[], re: RegExp, exclude: Set<string>, host: string | null): string | undefined =>
  links.find((l) => re.test(l) && !exclude.has(l) && /^https?:\/\//.test(l) && (!host || hostOf(l) === host));

/** Searches per run, all at once. Each returns links and snippets only; the pages are read after merging. */
const MAX_SEARCHES = 5;
/** Reading a shortlisted page for its text; a slow one is skipped, not waited on. */
const CANDIDATE_SCRAPE_TIMEOUT_MS = 30_000;

export const searchVendors = internalAction({
  args: {
    queries: v.array(v.string()),
    city: v.string(),
    limit: v.optional(v.number()),
    /** Websites already found for this need, so "find more" turns up someone new. */
    excludeHosts: v.optional(v.array(v.string())),
    /** The wedding's currency, which says which country to search in. */
    currency: v.optional(v.string()),
    /** "<area>, <city>" for Firecrawl's `location`. */
    location: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      url: v.string(),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      markdown: v.optional(v.string()),
    }),
  ),
  handler: async (_ctx, args): Promise<Candidate[]> => {
    const limit = Math.max(1, Math.min(10, Math.floor(args.limit ?? 6)));
    const known = new Set(args.excludeHosts ?? []);
    const country = searchCountry(args.currency);
    const location = args.location?.trim() || undefined;
    // `city` is the full search location: "<area> <city>" when the couple gave a neighbourhood.
    const queries = args.queries
      .slice(0, MAX_SEARCHES)
      .map((query) => (query.toLowerCase().includes(args.city.toLowerCase()) ? query : `${query} ${args.city}`));

    // Several searches at once, links and snippets only: no page is read until the merged list is known.
    const settled = await Promise.allSettled(
      queries.map((q) =>
        fc.search(q, {
          limit,
          excludeDomains: EXCLUDED_DOMAINS,
          ...(country ? { country } : {}),
          ...(location ? { location } : {}),
        }),
      ),
    );
    const lists: Candidate[][] = settled.map((result, i) => {
      if (result.status === "rejected") {
        console.warn("firecrawl.search failed", queries[i], result.reason instanceof Error ? result.reason.message : result.reason);
        return [];
      }
      const list: Candidate[] = [];
      for (const item of result.value.web ?? []) {
        // Search returns either a bare result or a scraped Document.
        const meta = "metadata" in item ? item.metadata : undefined;
        const url = "url" in item && typeof item.url === "string" ? item.url : (meta?.sourceURL ?? meta?.url);
        if (!url) continue;
        const title = "title" in item && typeof item.title === "string" ? item.title : meta?.title;
        const description = "description" in item && typeof item.description === "string" ? item.description : meta?.description;
        list.push({ url, title: title ?? undefined, description: description ?? undefined });
      }
      return list;
    });

    const shortlist = mergeByHost(lists)
      .filter((c) => {
        const host = hostOf(c.url);
        return host !== null && !known.has(host) && !isBlockedHost(host) && !isDocumentUrl(c.url);
      })
      .slice(0, limit);

    // Now read only the pages that made the list, where the site's robots.txt allows it.
    // A page that fails or may not be read stays a candidate without text.
    const mayRead = robotsChecker();
    let scrapeCredits = 0;
    const candidates = await Promise.all(
      shortlist.map(async (candidate): Promise<Candidate> => {
        if (!(await mayRead(candidate.url))) return candidate;
        try {
          const doc = await fc.scrape(candidate.url, {
            formats: ["markdown"],
            onlyMainContent: true,
            timeout: CANDIDATE_SCRAPE_TIMEOUT_MS,
            // A PDF behind an ordinary address is billed by the page; two are plenty to judge it.
            parsers: [{ type: "pdf", maxPages: 2 }],
          });
          if (typeof doc.metadata?.creditsUsed === "number") scrapeCredits += doc.metadata.creditsUsed;
          return typeof doc.markdown === "string" && doc.markdown.trim()
            ? { ...candidate, markdown: truncate(doc.markdown, SEARCH_MD_CHARS) }
            : candidate;
        } catch (err) {
          console.warn("candidate page unread", candidate.url, err instanceof Error ? err.message : err);
          return candidate;
        }
      }),
    );
    // The SDK's search result carries no credit count; Firecrawl charges 2 credits per search of up to 10 results.
    console.log("searchVendors", {
      searches: queries.length,
      failedSearches: settled.filter((r) => r.status === "rejected").length,
      found: lists.reduce((n, l) => n + l.length, 0),
      kept: candidates.length,
      scraped: candidates.filter((c) => c.markdown).length,
      scrapeCreditsUsed: scrapeCredits,
      country,
      location,
    });
    return candidates;
  },
});

const VENDOR_JSON_SCHEMA = {
  type: "object",
  properties: {
    businessName: { type: "string" },
    contactEmail: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    hasContactFormOnly: {
      type: ["boolean", "null"],
      description: "true if the page offers only an enquiry form and no email address",
    },
    startingPrice: { type: ["number", "null"], description: "The lowest price this page publishes, as a plain number" },
    priceUnit: {
      type: ["string", "null"],
      enum: ["total", "per_person", "per_hour", "per_day", "other", null],
      description:
        "What startingPrice is for. 'total' for a whole package or event, 'per_person' for a per-head or per-plate rate, " +
        "'per_hour' for an hourly rate. Caterers usually publish per_person. Say what the page says, do not convert.",
    },
    priceText: { type: ["string", "null"], description: "Price exactly as written on the page, e.g. 'packages from $2,400' or '$200 per guest'" },
    currency: { type: ["string", "null"], description: "ISO code of the currency shown on the page, e.g. USD, INR" },
    packages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: ["number", "null"] },
          description: { type: ["string", "null"] },
        },
        required: ["name"],
      },
    },
    capacity: { type: ["string", "null"] },
    servesCity: { type: ["string", "null"], description: "The service area exactly as the page states it, e.g. 'Bandra West and all of Mumbai'" },
    address: { type: ["string", "null"], description: "The studio or office address exactly as printed on the page" },
  },
  required: ["businessName"],
};

/**
 * Phase 2b: research ONE vendor properly. Map the site to find its own contact and
 * pricing pages, scrape up to three pages, and merge what they say. Nothing here is
 * inferred: every field comes from a page we actually fetched (`pagesRead`).
 */
export const researchVendorDetail = internalAction({
  args: {
    url: v.string(),
    need: v.string(),
    city: v.string(),
    /** The wedding's currency, used only as a fallback when the page shows no symbol. */
    currency: v.optional(v.string()),
  },
  returns: vendorDetailValidator,
  handler: async (_ctx, args): Promise<VendorDetail> => {
    const startedAt = Date.now();
    const host = hostOf(args.url);
    const origin = host ? `https://${host}` : args.url;
    const mayRead = robotsChecker();
    const nothing = (): VendorDetail => ({ url: args.url, emails: [], packages: [], pagesRead: [], markdown: "", ms: Date.now() - startedAt });
    // A listing site we don't read, or a vendor whose robots.txt turns crawlers away.
    if (!(await mayRead(args.url))) return nothing();

    // 1. Find the vendor's own contact and pricing pages.
    let links: string[] = [];
    try {
      const mapped = await fc.map(origin, { limit: 60 });
      links = (mapped.links ?? [])
        .map((l: unknown) => (typeof l === "string" ? l : ((l as { url?: string })?.url ?? "")))
        .filter((l): l is string => Boolean(l));
    } catch (err) {
      console.warn("firecrawl.map failed, falling back to homepage links", origin, err instanceof Error ? err.message : err);
    }

    const chosen = new Set<string>([args.url]);
    const targets: string[] = [args.url];
    const addFrom = (pool: string[]) => {
      const contact = pickLink(pool, CONTACT_LINK, chosen, host);
      if (contact && targets.length < MAX_PAGES_PER_VENDOR) { targets.push(contact); chosen.add(contact); }
      const pricing = pickLink(pool, PRICING_LINK, chosen, host);
      if (pricing && targets.length < MAX_PAGES_PER_VENDOR) { targets.push(pricing); chosen.add(pricing); }
    };
    addFrom(links);

    // 2. Scrape each target and merge.
    const detail: VendorDetail = {
      url: args.url,
      emails: [],
      packages: [],
      pagesRead: [],
      markdown: "",
      ms: 0,
    };
    const rawEmails: string[] = [];
    const markdownParts: string[] = [];
    let contactFormUrl: string | undefined;
    let currencyFromPages: string | undefined;
    let rawPrice: number | undefined;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (i > 0 && !(await mayRead(target))) continue;
      let doc;
      try {
        doc = await fc.scrape(target, {
          formats: [
            "markdown",
            "links",
            {
              type: "json",
              schema: VENDOR_JSON_SCHEMA,
              prompt:
                `Extract this ${args.need} vendor's details as shown on the page: business name, contact email, phone, ` +
                `starting price with its currency, packages, the city they serve, and whether only a contact form is offered. ` +
                `Use null for anything the page does not state. Do not guess.`,
            },
          ],
          onlyMainContent: false,
          timeout: SCRAPE_TIMEOUT_MS,
        });
      } catch (err) {
        console.warn("firecrawl.scrape failed", target, err instanceof Error ? err.message : err);
        continue;
      }
      const markdown = doc.markdown ?? "";
      const pageLinks = (doc.links ?? []).filter((l): l is string => typeof l === "string");
      detail.pagesRead.push(doc.metadata?.sourceURL ?? target);
      markdownParts.push(truncate(markdown, PAGE_MD_CHARS));
      if (i === 0) detail.title = doc.metadata?.title ?? undefined;
      if (!detail.image) {
        const meta = (doc.metadata ?? {}) as Record<string, unknown>;
        const og = [meta.ogImage, meta["og:image"], meta["twitter:image"]].find((x): x is string => typeof x === "string" && x.length > 0);
        detail.image = absoluteImage(og, doc.metadata?.sourceURL ?? target);
      }

      const json = (doc.json ?? {}) as Record<string, unknown>;
      rawEmails.push(
        ...findEmails(markdown),
        ...pageLinks.filter((l) => l.startsWith("mailto:")).map((l) => l.slice(7)),
        ...(typeof json.contactEmail === "string" ? [json.contactEmail] : []),
      );
      if (!detail.businessName && typeof json.businessName === "string") detail.businessName = json.businessName.slice(0, 120);
      if (!detail.phone && typeof json.phone === "string") detail.phone = json.phone.slice(0, 40);
      if (!detail.servesCity && typeof json.servesCity === "string") detail.servesCity = json.servesCity.slice(0, 200);
      if (!detail.address && typeof json.address === "string") detail.address = json.address.slice(0, 300);
      // The price and the currency must come from the same page, or a stray "$" in a
      // homepage footer relabels a pricing page's "₹" figures.
      const pageCurrency =
        (typeof json.currency === "string" ? json.currency.toUpperCase().slice(0, 3) : undefined) ??
        detectCurrency(`${typeof json.priceText === "string" ? json.priceText : ""} ${markdown.slice(0, 20_000)}`);
      if (rawPrice === undefined && typeof json.startingPrice === "number") {
        rawPrice = json.startingPrice;
        currencyFromPages = pageCurrency;
        // A caterer's "$200" is per head. Kept as what it is, so nothing downstream
        // compares it to the budget for the whole function.
        detail.priceUnit = readPriceUnit(json.priceUnit, typeof json.priceText === "string" ? json.priceText : undefined);
      }
      if (!detail.priceText && typeof json.priceText === "string") {
        detail.priceText = json.priceText.slice(0, 200);
        currencyFromPages = currencyFromPages ?? pageCurrency;
      }
      currencyFromPages = currencyFromPages ?? pageCurrency;
      if (typeof json.hasContactFormOnly === "boolean") {
        detail.hasContactFormOnly = detail.hasContactFormOnly === false ? false : json.hasContactFormOnly;
      }
      if (Array.isArray(json.packages)) {
        for (const p of json.packages as Array<Record<string, unknown>>) {
          if (typeof p?.name !== "string" || detail.packages.length >= 10) continue;
          detail.packages.push({
            name: p.name.slice(0, 120),
            price: typeof p.price === "number" && Number.isFinite(p.price) ? p.price : undefined,
            description: typeof p.description === "string" ? p.description.slice(0, 300) : undefined,
          });
        }
      }
      if (!contactFormUrl && CONTACT_LINK.test(target)) contactFormUrl = target;
      if (!contactFormUrl) {
        const formLink = pickLink(pageLinks, CONTACT_LINK, new Set(), host);
        if (formLink) contactFormUrl = formLink;
      }
      // Pages discovered on the homepage rescue sites where `map` is unsupported.
      if (i === 0 && targets.length === 1) addFrom(pageLinks);
    }

    detail.emails = cleanEmails(rawEmails, host);
    const currency = currencyFromPages ?? (args.currency ? args.currency.toUpperCase() : undefined);
    const priced = sanePrice(rawPrice, currency, detail.priceUnit);
    detail.startingPrice = priced.startingPrice;
    detail.currency = priced.currency;
    detail.contactFormUrl = contactFormUrl;
    if (detail.emails.length === 0 && contactFormUrl && detail.hasContactFormOnly === undefined) {
      detail.hasContactFormOnly = true;
    }
    detail.markdown = markdownParts.join("\n\n---\n\n");
    detail.ms = Date.now() - startedAt;
    return detail;
  },
});

const REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    rating: { type: ["number", "null"], description: "Average rating out of 5 shown on this page for this exact business" },
    reviewCount: { type: ["number", "null"], description: "Number of reviews shown on this page" },
  },
};

/**
 * Look the vendor up on the review directories we deliberately exclude from discovery.
 *
 * Two searches, narrowing: the need and the city, then the need alone, both only on
 * review directories we may read. Only the rating, the number of reviews and the page
 * they came from are kept, never reviewers' words. Every result is read before one is
 * chosen, because a rating is only worth the reviews behind it — 4.7 from
 * 19 reviews is better evidence than 5.0 from 2, and taking the first hit picked the
 * wrong one for two of sixteen vendors in testing. A rating is never invented, never
 * taken from the vendor's own site, and never taken from a page rating them as an
 * employer. Measured in docs/research/reviews-eval.json.
 */
export const lookupReviews = internalAction({
  args: {
    businessName: v.string(),
    need: v.string(),
    city: v.string(),
    /** The vendor's own site, so its own stars can never become its public rating. */
    ownWebsite: v.optional(v.string()),
  },
  returns: vendorReviewValidator,
  handler: async (_ctx, args): Promise<VendorReview> => {
    const startedAt = Date.now();
    const empty = (): VendorReview => ({ highlights: [], ms: Date.now() - startedAt });
    const name = args.businessName.trim();
    if (name.length < 2) return empty();
    const ownHost = args.ownWebsite ? hostOf(args.ownWebsite) : null;

    type Candidate = {
      rating: number;
      reviewCount?: number;
      reviewSource?: string;
      order: number;
    };
    const candidates: Candidate[] = [];

    const queries = [`"${name}" ${args.need} ${args.city} reviews`, `"${name}" ${args.need} reviews`];

    for (let qi = 0; qi < queries.length; qi++) {
      let results;
      try {
        results = await fc.search(queries[qi], {
          limit: 3,
          includeDomains: REVIEW_DOMAINS,
          scrapeOptions: {
            formats: [
              {
                type: "json",
                schema: REVIEW_JSON_SCHEMA,
                prompt:
                  `Find the average rating out of 5 and the number of reviews shown for "${name}". ` +
                  `If this page is about a different business, return null for every field.`,
              },
            ],
          },
        });
      } catch (err) {
        console.warn("firecrawl review search failed", queries[qi], err instanceof Error ? err.message : err);
        continue;
      }

      for (const item of results.web ?? []) {
        const json = ("json" in item ? (item.json as Record<string, unknown> | undefined) : undefined) ?? {};
        const rating = typeof json.rating === "number" ? json.rating : undefined;
        if (rating === undefined || !Number.isFinite(rating) || rating <= 0 || rating > 5) continue;
        const count = typeof json.reviewCount === "number" && Number.isFinite(json.reviewCount) ? json.reviewCount : undefined;
        if (count === 0) continue; // stars on a listing nobody has reviewed yet
        const meta = "metadata" in item ? item.metadata : undefined;
        const url = "url" in item && typeof item.url === "string" ? item.url : (meta?.sourceURL ?? undefined);
        const host = url ? hostOf(url) : null;
        if (!host) continue;
        if (ownHost && host === ownHost) continue;
        if (isNoScrapeHost(host)) continue;
        if (NON_VENDOR_REVIEW_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) continue;
        // The rating is the heaviest ranking signal, so only accept a page that names this business.
        const haystack = normalise(`${url ?? ""} ${meta?.title ?? ""} ${"title" in item && typeof item.title === "string" ? item.title : ""}`);
        if (!haystack.includes(normalise(name)) && !normalise(name).split("-").filter((w) => w.length > 3).some((w) => haystack.includes(w))) {
          continue;
        }
        candidates.push({
          rating: Math.round(rating * 10) / 10,
          reviewCount: count,
          reviewSource: url,
          order: qi,
        });
      }

      // Enough evidence already: don't pay for searches we don't need.
      if (candidates.some((c) => (c.reviewCount ?? 0) >= 10)) break;
    }

    if (candidates.length === 0) return empty();
    // Most reviews wins; between equals, the more specific search wins.
    candidates.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0) || a.order - b.order);
    const best = candidates[0];
    return {
      rating: best.rating,
      reviewCount: best.reviewCount,
      reviewSource: best.reviewSource,
      highlights: [],
      ms: Date.now() - startedAt,
    };
  },
});

/** Single-page scrape. Kept for callers that only need one URL (e.g. a manually added vendor). */
export const scrapeVendor = internalAction({
  args: { url: v.string() },
  returns: v.object({
    url: v.string(),
    title: v.optional(v.string()),
    markdown: v.string(),
    json: v.optional(v.any()),
    emails: v.array(v.string()),
    links: v.array(v.string()),
  }),
  handler: async (_ctx, args): Promise<{ url: string; title?: string; markdown: string; json?: unknown; emails: string[]; links: string[] }> => {
    if (!(await robotsChecker()(args.url))) return { url: args.url, markdown: "", emails: [], links: [] };
    const doc = await fc.scrape(args.url, {
      formats: [
        "markdown",
        "links",
        {
          type: "json",
          schema: VENDOR_JSON_SCHEMA,
          prompt: "Extract this vendor's business name, contact email, phone, starting price, packages, capacity and service area.",
        },
      ],
      onlyMainContent: false,
      timeout: SCRAPE_TIMEOUT_MS,
    });
    const markdown = doc.markdown ?? "";
    const emails = cleanEmails(findEmails(`${markdown}\n${JSON.stringify(doc.json ?? {})}`), hostOf(args.url));
    return {
      url: doc.metadata?.sourceURL ?? args.url,
      title: doc.metadata?.title ?? undefined,
      markdown: truncate(markdown, PAGE_MD_CHARS),
      json: doc.json,
      emails,
      links: (doc.links ?? []).slice(0, 50),
    };
  },
});

export const readInspiration = internalAction({
  args: { url: v.string() },
  returns: v.string(),
  handler: async (_ctx, args): Promise<string> => {
    const doc = await fc.scrape(args.url, { formats: ["markdown"], onlyMainContent: true, timeout: SCRAPE_TIMEOUT_MS });
    return truncate(doc.markdown ?? "", 20_000);
  },
});

/**
 * One page of a vendor's own site as text, for the vendor check. Refuses
 * anything we may not read, scrapes markdown only, and cuts to 12,000
 * characters so a long page stays cheap. No JSON: the check only needs text.
 */
export const readPage = internalAction({
  args: { url: v.string() },
  returns: v.object({ text: v.string() }),
  handler: async (_ctx, args): Promise<{ text: string }> => {
    if (!/^https?:\/\//i.test(args.url.trim())) return { text: "" };
    const host = hostOf(args.url);
    if (!host || isBlockedHost(host) || isNoScrapeHost(host)) return { text: "" };
    if (!(await robotsChecker()(args.url))) return { text: "" };
    let markdown = "";
    try {
      const doc = await fc.scrape(args.url, { formats: ["markdown"], onlyMainContent: true, timeout: SCRAPE_TIMEOUT_MS });
      markdown = doc.markdown ?? "";
    } catch (err) {
      console.warn("firecrawl.readPage failed", args.url, err instanceof Error ? err.message : err);
      return { text: "" };
    }
    return { text: markdown.slice(0, 12_000) };
  },
});

/**
 * The preview for a link kept in a Space, from a page that hides it from a plain fetch: one that
 * turns away anything but a browser, or builds itself with scripts. One scrape reads
 * the page's own preview picture and takes a screenshot, which is used only when the
 * page names no picture at all. The caller limits how often this runs.
 */
export const previewViaFirecrawl = internalAction({
  args: { url: v.string() },
  returns: v.union(linkPreviewValidator, v.null()),
  handler: async (_ctx, args): Promise<LinkPreview | null> => {
    if (!process.env.FIRECRAWL_API_KEY) return null;
    let doc;
    try {
      doc = await fc.scrape(args.url, {
        formats: ["rawHtml", { type: "screenshot", viewport: { width: 1200, height: 900 } }],
        onlyMainContent: false,
        timeout: PREVIEW_TIMEOUT_MS,
      });
    } catch (err) {
      console.warn("firecrawl.scrape failed for a preview", args.url, err instanceof Error ? err.message : err);
      return null;
    }
    const preview = previewFromScrape(
      { metadata: doc.metadata as Record<string, unknown> | undefined, html: doc.rawHtml?.slice(0, 1_500_000), screenshot: doc.screenshot },
      args.url,
    );
    return Object.keys(preview).length ? preview : null;
  },
});
