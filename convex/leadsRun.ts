"use node";

import Firecrawl from "firecrawl";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { areaIn, findPhones, matchLead, SEARCH_WORDS, type SearchHit } from "./lib/leads";
import { robotsChecker } from "./lib/scrapePolicy";
import { searchCountry } from "./lib/searchTerms";
import { findEmails, hostOf } from "./lib/text";
import { absoluteImage } from "./lib/links";

const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

/** Leads looked up at once, and the pause between rounds, so the job stays polite to every site and to Firecrawl. */
const AT_ONCE = 4;
const PAUSE_MS = 3_000;
const SCRAPE_TIMEOUT_MS = 20_000;
const JUNK_EMAIL = /(@example\.(com|org|net)|sentry|wixpress|placeholder|\.png|\.jpg|@2x)/i;

/** A business's own published email, preferring one at its own domain. */
function ownEmail(text: string, host: string | null): string | undefined {
  const all = findEmails(text)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !JUNK_EMAIL.test(e));
  const bare = host?.replace(/^www\./, "");
  return (bare && all.find((e) => e.endsWith(`@${bare}`))) || all[0];
}

/** One web search: links, titles and snippets only; no page is read here. */
async function search(query: string): Promise<SearchHit[]> {
  const country = searchCountry("INR");
  const res = await fc.search(query, { limit: 6, ...(country ? { country } : {}) });
  const hits: SearchHit[] = [];
  for (const item of res.web ?? []) {
    const meta = "metadata" in item ? item.metadata : undefined;
    const url = "url" in item && typeof item.url === "string" ? item.url : (meta?.sourceURL ?? meta?.url);
    if (!url) continue;
    const title = "title" in item && typeof item.title === "string" ? item.title : meta?.title;
    const description = "description" in item && typeof item.description === "string" ? item.description : meta?.description;
    hits.push({ url, title: title ?? undefined, description: description ?? undefined });
  }
  return hits;
}

/**
 * The preview image a business set on its own site for sharing its link (og:image or
 * twitter:image), as an https address on the web; an icon or a tracking pixel isn't one.
 */
function previewImage(meta: Record<string, unknown> | undefined, base: string): string | undefined {
  if (!meta) return undefined;
  const raw = [meta.ogImage, meta["og:image"], meta["twitter:image"]].map((x) => (Array.isArray(x) ? x[0] : x)).find((x): x is string => typeof x === "string" && x.length > 0);
  const url = absoluteImage(raw, base);
  if (!url || !url.startsWith("https://")) return undefined;
  if (/favicon|\.ico(\?|$)|\.svg(\?|$)|logo-?\d{1,2}x|pixel|spacer|blank\.(gif|png)/i.test(url)) return undefined;
  return url;
}

/**
 * Looks one lead up: a web search for its name, trade and area; the results that name it
 * kept as links; and, where its own site's robots.txt allows, that site read for the phone,
 * email and area it publishes. Nothing is kept from a directory, map or social page but the link.
 */
async function lookUp(lead: { name: string; area?: string; category: string }, mayRead: (url: string) => Promise<boolean>) {
  const word = SEARCH_WORDS[lead.category] ?? "";
  const context = [word, ...(lead.area ? [lead.area] : [])];
  // The exact name with its trade and area first; if that finds nothing, a looser search.
  let hits = await search([`"${lead.name}"`, word, lead.area ?? "", "Chennai"].filter(Boolean).join(" "));
  let match = matchLead(lead.name, hits, context);
  if (!match) {
    hits = await search([lead.name, word, "Chennai"].filter(Boolean).join(" "));
    match = matchLead(lead.name, hits, context);
  }
  if (!match) return null;
  // Only the snippets of results that name the business say where it is.
  const named = hits.filter((h) => match.sources.includes(h.url));
  let text = named.map((h) => `${h.title ?? ""} ${h.description ?? ""}`).join("\n");
  let phone: string | undefined;
  let email: string | undefined;
  let image: string | undefined;
  if (match.website && (await mayRead(match.website))) {
    try {
      const doc = await fc.scrape(match.website, { formats: ["markdown"], onlyMainContent: false, timeout: SCRAPE_TIMEOUT_MS });
      const page = (doc.markdown ?? "").slice(0, 60_000);
      text += `\n${page}`;
      phone = findPhones(page)[0];
      email = ownEmail(page, hostOf(match.website));
      image = previewImage(doc.metadata as Record<string, unknown> | undefined, match.website);
    } catch {
      // A site that won't load still leaves its link and the search's own facts.
    }
  }
  return {
    name: match.name,
    ...(areaIn(text) ? { area: areaIn(text) } : {}),
    ...(match.website ? { website: match.website } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(match.maps ? { maps: match.maps } : {}),
    ...(match.instagram ? { instagram: match.instagram } : {}),
    ...(match.facebook ? { facebook: match.facebook } : {}),
    ...(image ? { image } : {}),
    sources: match.sources,
  };
}

/**
 * The lead job: looks up the next few queued leads, saves what each found, and schedules
 * itself again until the queue is empty or `left` lookups have been spent. Run by hand:
 * `npx convex run leadsRun:run '{"left": 20}'`.
 */
export const run = internalAction({
  args: { left: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.left <= 0) return null;
    const leads = await ctx.runQuery(internal.leads.nextQueued, { limit: Math.min(AT_ONCE, args.left) });
    if (!leads.length) return null;
    const mayRead = robotsChecker();
    await Promise.all(
      leads.map(async (lead) => {
        try {
          const found = await lookUp(lead, mayRead);
          await ctx.runMutation(internal.leads.saveResult, found ? { leadId: lead._id, status: "found", found } : { leadId: lead._id, status: "not_found" });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await ctx.runMutation(internal.leads.saveResult, { leadId: lead._id, status: "error", reason });
        }
      }),
    );
    await ctx.scheduler.runAfter(PAUSE_MS, internal.leadsRun.run, { left: args.left - leads.length });
    return null;
  },
});

/**
 * Looks for the preview image of listings found before images were kept: their own site's
 * home page, read only where robots.txt allows, for its og:image. Schedules itself until
 * `left` is spent or none are left. `npx convex run leadsRun:covers '{"left": 3000}'`.
 */
export const covers = internalAction({
  args: { left: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.left <= 0) return null;
    const batch = await ctx.runQuery(internal.leads.needCovers, { limit: Math.min(AT_ONCE, args.left) });
    if (!batch.length) return null;
    const mayRead = robotsChecker();
    await Promise.all(
      batch.map(async (p) => {
        let url: string | undefined;
        try {
          if (await mayRead(p.website)) {
            const doc = await fc.scrape(p.website, { formats: ["markdown"], onlyMainContent: true, timeout: SCRAPE_TIMEOUT_MS });
            url = previewImage(doc.metadata as Record<string, unknown> | undefined, p.website);
          }
        } catch {
          // A site that won't load keeps its placeholder.
        }
        await ctx.runMutation(internal.leads.setCover, { profileId: p._id, ...(url ? { url } : {}) });
      }),
    );
    await ctx.scheduler.runAfter(PAUSE_MS, internal.leadsRun.covers, { left: args.left - batch.length });
    return null;
  },
});
