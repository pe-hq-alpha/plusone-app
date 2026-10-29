import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * What the uptime check reads through `/health`: the database answers, and whether model
 * calls go to Meta. Only yes-or-no facts, never a key or a count of anyone's data.
 */
export const status = internalQuery({
  args: {},
  returns: v.object({ database: v.boolean(), models: v.union(v.literal("meta"), v.literal("fallback")) }),
  handler: async (ctx) => {
    await ctx.db.query("vendorProfiles").take(1);
    const meta = process.env.MODEL_PROVIDER === "meta" && Boolean(process.env.MODEL_API_KEY);
    return { database: true, models: meta ? ("meta" as const) : ("fallback" as const) };
  },
});
