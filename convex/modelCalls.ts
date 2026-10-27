import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { modelCallFields } from "./schema";

/**
 * The cost record: one row per model call, written by `convex/lib/models.ts`. Admin's
 * spend view sums it against the $150 of Meta credit and the $40 kept for judging.
 */
export const record = internalMutation({
  args: modelCallFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("modelCalls", args);
    return null;
  },
});
