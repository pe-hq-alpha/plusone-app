import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Cost per event and the legwork behind it, run by hand on production
 * (`npx convex run evalsCost:perEvent`): for each event with model calls, what the calls
 * cost at list price, and how many searches, emails, follow-ups and quotes PlusOne handled.
 * Names and contents are never read, only counts.
 */
export const perEvent = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const calls = await ctx.db.query("modelCalls").order("desc").take(8000);
    const byEvent = new Map<string, { usd: number; calls: number; features: Record<string, number> }>();
    let noEvent = 0;
    for (const c of calls) {
      if (!c.eventId) {
        noEvent += c.costUsd ?? 0;
        continue;
      }
      const row = byEvent.get(c.eventId) ?? { usd: 0, calls: 0, features: {} };
      row.usd += c.costUsd ?? 0;
      row.calls += 1;
      row.features[c.feature] = (row.features[c.feature] ?? 0) + 1;
      byEvent.set(c.eventId, row);
    }
    const events = [];
    for (const [id, row] of byEvent) {
      const eventId = ctx.db.normalizeId("events", id);
      const event = eventId ? await ctx.db.get(eventId) : null;
      if (!eventId || !event) continue;
      const messages = await ctx.db.query("messages").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(2000);
      const count = (kind: string, direction?: "in" | "out") => messages.filter((m) => m.kind === kind && (!direction || m.direction === direction)).length;
      const searches = (await ctx.db.query("researchRuns").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(500)).length;
      const quotes = (await ctx.db.query("quotes").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(500)).length;
      events.push({
        demo: event.demo === true,
        eventType: event.eventType,
        createdDaysAgo: Math.round((Date.now() - event._creationTime) / 86_400_000),
        modelUsd: Math.round(row.usd * 10000) / 10000,
        calls: row.calls,
        features: row.features,
        searches,
        inquiries: count("inquiry", "out"),
        followUps: count("follow_up", "out"),
        agentReplies: count("agent_reply", "out"),
        vendorReplies: count("vendor_reply", "in"),
        quotes,
      });
    }
    events.sort((a, b) => b.modelUsd - a.modelUsd);
    return { calls: calls.length, usdWithoutEvent: Math.round(noEvent * 10000) / 10000, events };
  },
});

/** The newest cost rows for one feature, without an event (`npx convex run evalsCost:recent '{"feature":"vendorCheckEval"}'`). */
export const recent = internalQuery({
  args: { feature: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("modelCalls").order("desc").take(300);
    return rows
      .filter((r) => r.feature === args.feature)
      .slice(0, 20)
      .map((r) => ({ at: new Date(r._creationTime).toISOString(), model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, durationMs: r.durationMs }));
  },
});
