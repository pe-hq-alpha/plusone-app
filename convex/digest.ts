import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { digestEmail, type DigestData } from "./lib/emailTemplates";
import { formatMoney } from "./lib/text";
import { digestUnsubscribeLink, resend } from "./appEmails";
import { BRAND, isAppActor } from "./lib/brand";

/**
 * The Friday update: what needs this person, what's on the calendar and what moved in
 * the last seven days, read from the plan. Nothing goes out on a quiet week. On by default for
 * the owners and off for everyone else; one tap stops it. Sent only once email is live.
 */

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Whether this person gets the weekly update: their choice, or on for owners by default. */
export const wantsDigest = (m: Doc<"members">) => m.digest ?? m.role === "owner";

/** Everything the update says for one event at `now`, before it's addressed to anyone. */
export async function weekFor(ctx: QueryCtx, event: Doc<"events">, now: number): Promise<Omit<DigestData, "firstName" | "unsubscribeUrl" | "appUrl">> {
  const today = isoDay(now);
  const in14 = isoDay(now + 14 * DAY);
  const in21 = isoDay(now + 21 * DAY);
  const [dues, sessions, threads, quotes, activity] = await Promise.all([
    ctx.db.query("dues").withIndex("by_eventId_and_dueDate", (q) => q.eq("eventId", event._id).lte("dueDate", in14)).take(100),
    ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(50),
    ctx.db.query("threads").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(200),
    ctx.db.query("quotes").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).order("desc").take(100),
    ctx.db.query("activity").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).order("desc").take(200),
  ]);
  const vendorName = async (id?: Id<"vendors">) => (id ? (await ctx.db.get(id))?.name : undefined);

  const waiting: string[] = [];
  const comingUp: string[] = [];
  for (const d of dues.filter((x) => !x.doneAt)) {
    const who = await vendorName(d.vendorId);
    const what = d.kind === "payment" ? `${d.label} payment${who ? ` to ${who}` : ""}${d.amount ? `, ${formatMoney(d.amount, event.currency)}` : ""}` : `${d.label}${who ? ` (${who})` : ""}`;
    if (d.dueDate < today) waiting.push(`${what}: was due ${nice(d.dueDate)}`);
    else comingUp.push(`${what}: due ${nice(d.dueDate)}`);
  }
  for (const t of threads) {
    if (t.status === "needs_attention" || t.pendingQuestion) {
      const name = await vendorName(t.vendorId);
      if (name) waiting.push(`${name} is waiting for your reply`);
    }
  }
  for (const q of quotes.filter((x) => x.state === "waiting")) {
    const name = await vendorName(q.vendorId);
    if (name) waiting.push(`Look over the quote from ${name} (${formatMoney(q.total, q.currency)})`);
  }
  for (const e of sessions.filter((x) => x.date >= today && x.date <= in21).sort((a, b) => a.date.localeCompare(b.date))) {
    comingUp.push(`${e.name}, ${nice(e.date)}`);
  }

  const since = now - 7 * DAY;
  const worth = new Set(["quote_received", "booked", "guest_rsvp", "space", "member_joined", "vendor_replied", "task_done"]);
  const recent = activity.filter((a) => a._creationTime >= since && worth.has(a.type));
  const changed = recent.slice(0, 6).map((a) => (isAppActor(a) ? a.text : `${a.actorLabel} ${a.text.charAt(0).toLowerCase()}${a.text.slice(1)}`));
  if (recent.length > 6) changed.push(`Plus ${recent.length - 6} more in your activity`);
  return {
    eventName: event.name,
    eventType: event.eventType,
    daysToGo: Math.max(0, Math.round((Date.parse(`${event.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY)),
    waiting: waiting.slice(0, 6),
    comingUp: comingUp.slice(0, 6),
    changed,
  };
}

/** This week's update as it would reach the person asking, so they can see it before any is sent. */
export const preview = query({
  args: { eventId: v.id("events"), now: v.number() },
  returns: v.object({ on: v.boolean(), email: v.union(v.object({ subject: v.string(), html: v.string() }), v.null()) }),
  handler: async (ctx, args) => {
    const { member, event, userId } = await requireMember(ctx, args.eventId, "viewer");
    const user = await ctx.db.get(userId);
    const week = await weekFor(ctx, event, args.now);
    const email = digestEmail({
      ...week,
      firstName: (user?.name ?? "").trim().split(/\s+/)[0] ?? "",
      appUrl: `${process.env.SITE_URL ?? ""}/e/${event._id}`,
      unsubscribeUrl: "#",
    });
    return { on: wantsDigest(member), email: email ? { subject: email.subject, html: email.html } : null };
  },
});

/** Turn your own weekly update on or off. */
export const setDigest = mutation({
  args: { eventId: v.id("events"), on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args.eventId, "viewer");
    await ctx.db.patch(member._id, { digest: args.on });
    return null;
  },
});

/** From the email's own link: stop the weekly update for that one membership. */
export const stop = internalMutation({
  args: { memberId: v.id("members") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.memberId);
    if (m) await ctx.db.patch(m._id, { digest: false });
    return null;
  },
});

/** Weekly, by cron: one update per person who wants it, events a page at a time. */
export const weekly = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!process.env.RESEND_API_KEY || !process.env.SITE_URL) return null;
    const now = Date.now();
    const page = await ctx.db.query("events").paginate({ numItems: 25, cursor: args.cursor ?? null });
    for (const event of page.page) {
      if (event.demo || event.endDate < isoDay(now - 30 * DAY)) continue;
      const members = (await ctx.db.query("members").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).take(50)).filter(wantsDigest);
      if (members.length === 0) continue;
      const week = await weekFor(ctx, event, now);
      for (const m of members) {
        if (m.lastDigestAt && now - m.lastDigestAt < 6 * DAY) continue;
        const user = await ctx.db.get(m.userId);
        if (!user?.email || user.isAnonymous) continue;
        const unsubscribeUrl = await digestUnsubscribeLink(m._id);
        const email = digestEmail({ ...week, firstName: (user.name ?? "").trim().split(/\s+/)[0] ?? "", appUrl: `${process.env.SITE_URL}/e/${event._id}`, unsubscribeUrl });
        if (!email) continue; // a quiet week
        await resend.sendEmail(ctx, {
          from: process.env.EMAIL_FROM ?? `${BRAND.name} <hello@${BRAND.domain}>`,
          to: user.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: [
            { name: "List-Unsubscribe", value: `<${unsubscribeUrl}>` },
            { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
          ],
          idempotencyKey: `digest:${m._id}:${isoDay(now)}`,
        });
        await ctx.db.patch(m._id, { lastDigestAt: now });
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.digest.weekly, { cursor: page.continueCursor });
    return null;
  },
});
