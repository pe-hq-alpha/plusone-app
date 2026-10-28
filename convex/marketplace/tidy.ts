import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internal } from "../_generated/api";
import { action, internalQuery } from "../_generated/server";
import { requireActionUserId } from "../lib/auth";
import { MODEL_FAST, generateObject } from "../lib/models";
import { contactIn, keepsFacts, TIDY_INSTRUCTIONS } from "../lib/tidy";
import { rateLimiter } from "../rateLimits";

/**
 * Tidying what a vendor writes before it is saved: the browser sends the free
 * text, Muse Spark fixes the writing, and fixed rules throw a tidy away when it
 * changed a number or grew too long. Saving never depends on it.
 */

/**
 * Whether the caller is a demo guest, for the smaller allowance. Anyone signed in may ask,
 * since a vendor's first description is written before their listing exists.
 */
export const callerKind = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({ isGuest: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return { isGuest: Boolean(user?.isAnonymous) };
  },
});

const fieldValidator = v.object({ key: v.string(), text: v.string() });
const MAX_KEY = 40;

const tidySchema = z.object({
  fields: z.array(z.object({ key: z.string(), text: z.string() })),
});

function unchanged(fields: { key: string; text: string }[]) {
  return fields.map((f) => ({ key: f.key, before: f.text, after: f.text, changed: false, contact: contactIn(f.text) }));
}

export const tidy = action({
  args: { fields: v.array(fieldValidator) },
  returns: v.array(
    v.object({
      key: v.string(),
      before: v.string(),
      after: v.string(),
      changed: v.boolean(),
      contact: v.array(v.union(v.literal("phone"), v.literal("email"), v.literal("link"))),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.fields.length > 40) throw new ConvexError("Keep it to 40 fields at a time.");
    for (const f of args.fields) {
      if (f.text.length > 2000) throw new ConvexError("Keep each field under 2,000 characters.");
      if (f.key.length > MAX_KEY) throw new ConvexError("That field's name is too long.");
    }
    const userId = await requireActionUserId(ctx);
    const caller = await ctx.runQuery(internal.marketplace.tidy.callerKind, { userId });

    // When the allowance is spent the tidy is skipped, so saving never waits on it. The
    // shared total is only spent once the person's own allowance has let them through.
    const mine = await rateLimiter.limit(ctx, caller.isGuest ? "vendorTidyDemo" : "vendorTidy", { key: userId });
    if (!mine.ok) return unchanged(args.fields);
    const all = await rateLimiter.limit(ctx, "vendorTidyAll");
    if (!all.ok) return unchanged(args.fields);

    const active = args.fields.filter((f) => f.text.trim() !== "");
    if (!active.length) return unchanged(args.fields);
    const numbered = active.map((f, i) => `${i + 1}. [${f.key}] ${f.text}`).join("\n");

    let tidied: { key: string; text: string }[] | null = null;
    try {
      const { object } = await generateObject({
        ctx,
        feature: "vendorTidy",
        model: MODEL_FAST,
        effort: "low",
        system: TIDY_INSTRUCTIONS,
        prompt:
          "Tidy each field below and return it with the same key. Field text follows its key in brackets.\n\n" +
          numbered,
        schema: tidySchema,
      });
      tidied = object.fields;
    } catch {
      return unchanged(args.fields);
    }

    const byKey = new Map((tidied ?? []).map((f) => [f.key, f.text]));
    return args.fields.map((f) => {
      if (!f.text.trim()) return { key: f.key, before: f.text, after: f.text, changed: false, contact: contactIn(f.text) };
      const candidate = byKey.get(f.key);
      const after = candidate !== undefined && keepsFacts(f.text, candidate) ? candidate : f.text;
      return { key: f.key, before: f.text, after, changed: after !== f.text, contact: contactIn(f.text) };
    });
  },
});
