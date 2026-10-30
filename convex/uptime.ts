import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { resend } from "./appEmails";
import { BRAND } from "./lib/brand";
import { changeOf, type Probe, problemsIn, uptimeUrls } from "./lib/uptime";

/**
 * The uptime check outside GitHub, every five minutes on production (convex/crons.ts):
 * the home page, both demos and /health, which also says whether model calls go to Meta.
 * Each check is kept a week and summed up at /uptime; the PlusOne team's admins get an
 * email when the site goes down and when it comes back. GitHub's own check stays too,
 * since it sees the backend from outside.
 */

const WEEK = 7 * 24 * 60 * 60 * 1000;

const problem = v.object({ url: v.string(), problem: v.string() });

async function probe(url: string): Promise<Probe> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "PlusOne uptime check" } });
      const body = url.endsWith("/health") ? await res.text() : undefined;
      if (res.status === 200 || attempt === 1) return { url, status: res.status, body };
    } catch (e) {
      if (attempt === 1) return { url, status: null, error: e instanceof Error ? e.name : "error" };
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return { url, status: null };
}

export const check = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Only production watches the live site; a dev deployment would only add noise.
    if (!(process.env.SITE_URL ?? "").includes(BRAND.domain) || !process.env.CONVEX_SITE_URL) return null;
    const started = Date.now();
    const probes = await Promise.all(uptimeUrls(process.env.CONVEX_SITE_URL).map(probe));
    const problems = problemsIn(probes);
    await ctx.runMutation(internal.uptime.record, { ok: problems.length === 0, ms: Date.now() - started, problems });
    return null;
  },
});

export const record = internalMutation({
  args: { ok: v.boolean(), ms: v.number(), problems: v.array(problem) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const previous = await ctx.db.query("uptimeChecks").withIndex("by_at").order("desc").first();
    await ctx.db.insert("uptimeChecks", { at: now, ...args });
    for (const old of await ctx.db.query("uptimeChecks").withIndex("by_at", (q) => q.lt("at", now - WEEK)).take(50)) await ctx.db.delete(old._id);

    const change = changeOf(previous ? previous.ok : null, args.ok);
    if (!change || !process.env.RESEND_API_KEY) return null;
    const admins = (await ctx.db.query("users").take(500)).filter((u) => u.staffRole === "admin" && u.email);
    const subject = change === "down" ? `${BRAND.name} is down: ${args.problems.length} of 4 checks failed` : `${BRAND.name} is back up`;
    const text =
      change === "down"
        ? `The uptime check at ${new Date(now).toISOString()} found:\n\n${args.problems.map((p) => `- ${p.url}: ${p.problem}`).join("\n")}\n\nIt checks again every five minutes and will write when it's back.`
        : `Every check passed again at ${new Date(now).toISOString()}.`;
    for (const admin of admins) {
      await resend.sendEmail(ctx, {
        from: process.env.EMAIL_FROM ?? `${BRAND.name} <hello@${BRAND.domain}>`,
        to: admin.email!,
        subject,
        text,
        idempotencyKey: `uptime:${change}:${now}:${admin._id}`,
      });
    }
    return null;
  },
});

/** The last day of checks, as yes-or-no facts and counts only. */
export const summary = internalQuery({
  args: { since: v.number() },
  returns: v.object({
    checks: v.number(),
    passed: v.number(),
    lastCheckAt: v.union(v.number(), v.null()),
    lastOk: v.union(v.boolean(), v.null()),
    lastFailureAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("uptimeChecks").withIndex("by_at", (q) => q.gte("at", args.since)).take(400);
    const last = rows[rows.length - 1] ?? null;
    const failures = rows.filter((r) => !r.ok);
    return {
      checks: rows.length,
      passed: rows.length - failures.length,
      lastCheckAt: last?.at ?? null,
      lastOk: last?.ok ?? null,
      lastFailureAt: failures[failures.length - 1]?.at ?? null,
    };
  },
});

