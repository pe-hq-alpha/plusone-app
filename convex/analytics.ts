import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type MutationCtx } from "./_generated/server";

/**
 * Events only the server sees (a reply landing, a quote read, a plan generated), with
 * the same rules as the app's: names and safe scalars, never content. Off until
 * POSTHOG_KEY is set on the deployment; never in a mutation's way. Sent from Convex,
 * so no visitor's IP address goes with them.
 */
export const capture = internalAction({
  args: { event: v.string(), distinctId: v.string(), properties: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))) },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const key = process.env.POSTHOG_KEY;
    if (!key) return null;
    try {
      await fetch(`${process.env.POSTHOG_HOST ?? "https://us.i.posthog.com"}/i/v0/e/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: key, event: args.event, distinct_id: args.distinctId, properties: { ...args.properties, source: "server" } }),
      });
    } catch (err) {
      console.warn("analytics not sent", err instanceof Error ? err.message : err);
    }
    return null;
  },
});

/** Schedule an event from a mutation; a no-op without a key. */
export async function track(ctx: MutationCtx, name: string, distinctId: string, properties?: Record<string, string | number | boolean>) {
  if (!process.env.POSTHOG_KEY) return;
  await ctx.scheduler.runAfter(0, internal.analytics.capture, { event: name, distinctId, properties });
}

/** Something that happened with no one signed in behind it (a reply landing), counted for the event's owner. */
export async function trackForEvent(ctx: MutationCtx, name: string, eventId: Id<"events">, properties?: Record<string, string | number | boolean>) {
  if (!process.env.POSTHOG_KEY) return;
  const event = await ctx.db.get(eventId);
  if (event && !event.demo) await track(ctx, name, event.createdBy, properties);
}
