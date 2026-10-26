import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { isBotUserAgent, isLikelyProxy, VISITS_KEPT_FOR } from "./lib/visits";
import { rateLimiter } from "./rateLimits";

/**
 * Who visits the site: one row per page load, sent by the Cloudflare middleware
 * (functions/_middleware.ts) through POST /visit. Kept for 180 days, for security only:
 * to spot scraping, copying and abuse. Never sent to analytics or used for marketing.
 *
 * Each visit carries the browser's visitor id (a first-party cookie) and, when someone
 * is signed in, their Clerk user. A browser once seen signed in is linked to that
 * account (`visitorLinks`), so its visits from before sign-in resolve to the account's
 * email too. Read it from the command line (add --prod for production):
 *
 *   npx convex run visits:recent '{"limit":50}'
 *   npx convex run visits:recent '{"limit":50,"ip":"203.0.113.7"}'
 *   npx convex run visits:byIp '{"ip":"203.0.113.7"}'
 *   npx convex run visits:byUser '{"email":"someone@example.com"}'
 */

const visitArgs = {
  at: v.number(),
  ip: v.string(),
  host: v.string(),
  path: v.string(),
  method: v.string(),
  userAgent: v.optional(v.string()),
  referrer: v.optional(v.string()),
  country: v.optional(v.string()),
  city: v.optional(v.string()),
  region: v.optional(v.string()),
  asn: v.optional(v.number()),
  asOrganization: v.optional(v.string()),
  visitorId: v.optional(v.string()),
  clerkUserId: v.optional(v.string()),
};

/** How often a link's last-seen time is refreshed by later visits from the same browser. */
const LINK_REFRESH_MS = 60 * 60 * 1000;

/** Store one visit, unless this address or the whole log is over its allowance; link the browser. */
export const record = internalMutation({
  args: visitArgs,
  returns: v.object({ stored: v.boolean() }),
  handler: async (ctx, args) => {
    const all = await rateLimiter.limit(ctx, "visitsAll");
    if (!all.ok) return { stored: false };
    const mine = await rateLimiter.limit(ctx, "visitsPerIp", { key: args.ip });
    if (!mine.ok) return { stored: false };
    await ctx.db.insert("visits", {
      ...args,
      isBot: isBotUserAgent(args.userAgent),
      likelyProxy: isLikelyProxy(args),
    });

    if (args.visitorId) {
      const links = await ctx.db
        .query("visitorLinks")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", args.visitorId!))
        .take(20);
      for (const link of links) {
        if (args.at - link.lastSeen > LINK_REFRESH_MS) await ctx.db.patch(link._id, { lastSeen: args.at });
      }
      if (args.clerkUserId && !links.some((l) => l.clerkUserId === args.clerkUserId)) {
        await ctx.db.insert("visitorLinks", {
          visitorId: args.visitorId,
          clerkUserId: args.clerkUserId,
          firstSeen: args.at,
          lastSeen: args.at,
        });
      }
    }
    return { stored: true };
  },
});

/**
 * Turns Clerk users and visitor ids into account emails, remembering what it has looked
 * up within one query. A Clerk user with no PlusOne account shows as its Clerk id.
 */
function accountResolver(ctx: QueryCtx) {
  const emails = new Map<string, string>();
  const linked = new Map<string, string[]>();
  const emailOf = async (clerkUserId: string) => {
    let email = emails.get(clerkUserId);
    if (email === undefined) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkUserId))
        .unique();
      email = user?.email ?? clerkUserId;
      emails.set(clerkUserId, email);
    }
    return email;
  };
  return async (visit: Pick<Doc<"visits">, "clerkUserId" | "visitorId">): Promise<string[]> => {
    const ids = new Set<string>();
    if (visit.clerkUserId) ids.add(visit.clerkUserId);
    if (visit.visitorId) {
      let users = linked.get(visit.visitorId);
      if (!users) {
        const links = await ctx.db
          .query("visitorLinks")
          .withIndex("by_visitorId", (q) => q.eq("visitorId", visit.visitorId!))
          .take(20);
        users = links.map((l) => l.clerkUserId);
        linked.set(visit.visitorId, users);
      }
      users.forEach((u) => ids.add(u));
    }
    const out = new Set<string>();
    for (const id of ids) out.add(await emailOf(id));
    return [...out];
  };
}

const visitRow = v.object({
  _id: v.id("visits"),
  _creationTime: v.number(),
  ...visitArgs,
  isBot: v.boolean(),
  likelyProxy: v.boolean(),
  /** The account emails this visit resolves to: its own sign-in, or its browser's links. */
  accounts: v.array(v.string()),
});

/** The latest visits, newest first, optionally from one address, each with its accounts. */
export const recent = internalQuery({
  args: { limit: v.optional(v.number()), ip: v.optional(v.string()) },
  returns: v.array(visitRow),
  handler: async (ctx, { limit, ip }) => {
    const n = Math.max(1, Math.min(Math.floor(limit ?? 50), 1000));
    const rows = ip
      ? await ctx.db
          .query("visits")
          .withIndex("by_ip_and_at", (q) => q.eq("ip", ip))
          .order("desc")
          .take(n)
      : await ctx.db.query("visits").withIndex("by_at").order("desc").take(n);
    const accounts = accountResolver(ctx);
    const out = [];
    for (const row of rows) out.push({ ...row, accounts: await accounts(row) });
    return out;
  },
});

/** Most a summary reads per source; `countCapped` says when there were more. */
const SCAN = 5000;
const USER_SCAN = 2000;

const tally = (keys: string[]) => {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

const placeOf = (r: Doc<"visits">) =>
  [r.city, r.region, r.country].filter(Boolean).join(", ") + (r.asOrganization ? ` (${r.asOrganization})` : "");

/** One address: visits, first and last seen, accounts, places, pages and browsers. */
export const byIp = internalQuery({
  args: { ip: v.string() },
  returns: v.object({
    ip: v.string(),
    count: v.number(),
    countCapped: v.boolean(),
    firstSeen: v.union(v.number(), v.null()),
    lastSeen: v.union(v.number(), v.null()),
    bot: v.boolean(),
    likelyProxy: v.boolean(),
    accounts: v.array(v.string()),
    places: v.array(v.string()),
    pages: v.array(v.object({ path: v.string(), count: v.number() })),
    userAgents: v.array(v.object({ userAgent: v.string(), count: v.number() })),
  }),
  handler: async (ctx, { ip }) => {
    const rows: Doc<"visits">[] = await ctx.db
      .query("visits")
      .withIndex("by_ip_and_at", (q) => q.eq("ip", ip))
      .order("desc")
      .take(SCAN + 1);
    const countCapped = rows.length > SCAN;
    const seen = rows.slice(0, SCAN);
    const first = await ctx.db
      .query("visits")
      .withIndex("by_ip_and_at", (q) => q.eq("ip", ip))
      .order("asc")
      .first();
    const resolve = accountResolver(ctx);
    const accounts = new Set<string>();
    const pairs = new Set<string>();
    for (const r of seen) {
      const key = `${r.clerkUserId ?? ""}|${r.visitorId ?? ""}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      (await resolve(r)).forEach((a) => accounts.add(a));
    }
    return {
      ip,
      count: seen.length,
      countCapped,
      firstSeen: first?.at ?? null,
      lastSeen: seen[0]?.at ?? null,
      bot: seen.some((r) => r.isBot),
      likelyProxy: seen.some((r) => r.likelyProxy),
      accounts: [...accounts],
      places: [...new Set(seen.map(placeOf))].filter(Boolean).slice(0, 20),
      pages: tally(seen.map((r) => `${r.host}${r.path}`)).slice(0, 200).map(([path, count]) => ({ path, count })),
      userAgents: tally(seen.map((r) => r.userAgent ?? "(none)")).slice(0, 50).map(([userAgent, count]) => ({ userAgent, count })),
    };
  },
});

/**
 * One account, by email: every address it has visited from, signed in or (through its
 * browsers) before signing in, with places and first and last seen.
 */
export const byUser = internalQuery({
  args: { email: v.string() },
  returns: v.object({
    email: v.string(),
    clerkUserIds: v.array(v.string()),
    visitorIds: v.array(v.string()),
    count: v.number(),
    countCapped: v.boolean(),
    firstSeen: v.union(v.number(), v.null()),
    lastSeen: v.union(v.number(), v.null()),
    ips: v.array(
      v.object({
        ip: v.string(),
        count: v.number(),
        firstSeen: v.number(),
        lastSeen: v.number(),
        likelyProxy: v.boolean(),
        places: v.array(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(10);
    const clerkUserIds = users.flatMap((u) => (u.clerkId ? [u.clerkId] : []));
    const visitorIds = new Set<string>();
    const byId = new Map<string, Doc<"visits">>();
    let countCapped = false;
    const add = (rows: Doc<"visits">[]) => {
      if (rows.length > USER_SCAN) countCapped = true;
      rows.slice(0, USER_SCAN).forEach((r) => byId.set(r._id, r));
    };
    for (const clerkUserId of clerkUserIds) {
      const links = await ctx.db
        .query("visitorLinks")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
        .take(100);
      links.forEach((l) => visitorIds.add(l.visitorId));
      add(
        await ctx.db
          .query("visits")
          .withIndex("by_clerkUserId_and_at", (q) => q.eq("clerkUserId", clerkUserId))
          .order("desc")
          .take(USER_SCAN + 1),
      );
    }
    for (const visitorId of visitorIds) {
      add(
        await ctx.db
          .query("visits")
          .withIndex("by_visitorId_and_at", (q) => q.eq("visitorId", visitorId))
          .order("desc")
          .take(USER_SCAN + 1),
      );
    }
    const visits = [...byId.values()];
    const ips = new Map<string, Doc<"visits">[]>();
    for (const r of visits) {
      const list = ips.get(r.ip);
      if (list) list.push(r);
      else ips.set(r.ip, [r]);
    }
    const times = visits.map((r) => r.at);
    return {
      email,
      clerkUserIds,
      visitorIds: [...visitorIds],
      count: visits.length,
      countCapped,
      firstSeen: times.length ? Math.min(...times) : null,
      lastSeen: times.length ? Math.max(...times) : null,
      ips: [...ips]
        .map(([ip, rows]) => ({
          ip,
          count: rows.length,
          firstSeen: Math.min(...rows.map((r) => r.at)),
          lastSeen: Math.max(...rows.map((r) => r.at)),
          likelyProxy: rows.some((r) => r.likelyProxy),
          places: [...new Set(rows.map(placeOf))].filter(Boolean).slice(0, 10),
        }))
        .sort((a, b) => b.lastSeen - a.lastSeen),
    };
  },
});

const PRUNE_BATCH = 500;

/** Daily: delete visits, and browser links not seen, for more than 180 days, a batch at a time. */
export const prune = internalMutation({
  args: {},
  returns: v.object({ visits: v.number(), links: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - VISITS_KEPT_FOR;
    const old = await ctx.db
      .query("visits")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(PRUNE_BATCH);
    for (const row of old) await ctx.db.delete(row._id);
    const oldLinks = await ctx.db
      .query("visitorLinks")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", cutoff))
      .take(PRUNE_BATCH);
    for (const row of oldLinks) await ctx.db.delete(row._id);
    if (old.length === PRUNE_BATCH || oldLinks.length === PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.visits.prune, {});
    }
    return { visits: old.length, links: oldLinks.length };
  },
});
