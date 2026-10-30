import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { currentUserId, requireAccount } from "./lib/auth";
import { e164 } from "./lib/marketplace";
import { GRAPH, templateBody } from "./lib/whatsapp";
import { rateLimiter } from "./rateLimits";

/**
 * Vendor updates on WhatsApp, through Meta's WhatsApp Cloud API. A host asks for them in
 * Account with their number; when a vendor's quote lands on their event, PlusOne sends an
 * approved template message ("Kaveri Feast Co. sent a quote for Catering…") with a link to
 * Compare. Replying STOP turns it off. Without the keys set, nothing is sent and nothing fails.
 */

const configured = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export const mine = query({
  args: {},
  returns: v.object({ number: v.union(v.string(), v.null()), available: v.boolean() }),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    return { number: user?.whatsappNumber ?? null, available: configured() };
  },
});

export const optIn = mutation({
  args: { number: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAccount(ctx);
    const number = e164(args.number.trim().slice(0, 30));
    if (!number) throw new ConvexError("That doesn't look like a WhatsApp number. Include the country code, like +91 98400 12345.");
    await ctx.db.patch(userId, { whatsappNumber: number, whatsappOptInAt: Date.now() });
    return number;
  },
});

export const optOut = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireAccount(ctx);
    await ctx.db.patch(userId, { whatsappNumber: undefined, whatsappOptInAt: undefined });
    return null;
  },
});

/** The people planning an event who asked for WhatsApp updates; never a viewer, never on a sample event. */
export const recipients = internalQuery({
  args: { eventId: v.id("events") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.demo) return [];
    const numbers = new Set<string>();
    for (const m of await ctx.db.query("members").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(50)) {
      if (m.role === "viewer") continue;
      const user = await ctx.db.get(m.userId);
      if (user?.whatsappNumber) numbers.add(user.whatsappNumber);
    }
    return [...numbers];
  },
});

export const notifyQuote = internalAction({
  args: { eventId: v.id("events"), vendorName: v.string(), needTitle: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!configured()) return null;
    const to: string[] = await ctx.runQuery(internal.whatsapp.recipients, { eventId: args.eventId });
    const base = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    const link = `${base}/e/${args.eventId}/decisions`;
    for (const number of to) {
      const allowed = await rateLimiter.limit(ctx, "whatsappAll");
      if (!allowed.ok) return null;
      const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(
          templateBody(number, process.env.WHATSAPP_TEMPLATE ?? "quote_received", process.env.WHATSAPP_TEMPLATE_LANG ?? "en", [args.vendorName, args.needTitle, link]),
        ),
        signal: AbortSignal.timeout(10_000),
      }).catch((e: unknown) => e);
      // A failed update is logged, never retried into a loop: the quote is already in Compare.
      if (!(res instanceof Response) || !res.ok) {
        const detail = res instanceof Response ? `${res.status} ${(await res.text()).slice(0, 300)}` : String(res);
        console.error(`WhatsApp update for event ${args.eventId} didn't send: ${detail}`);
      }
    }
    return null;
  },
});

/** "STOP" from a number: every account with it stops getting updates. */
export const stopNumbers = internalMutation({
  args: { numbers: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const number of args.numbers.slice(0, 20)) {
      for (const user of await ctx.db.query("users").withIndex("by_whatsappNumber", (q) => q.eq("whatsappNumber", number)).take(10)) {
        await ctx.db.patch(user._id, { whatsappNumber: undefined, whatsappOptInAt: undefined });
      }
    }
    return null;
  },
});
