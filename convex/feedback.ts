import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireMember, requireUserId } from "./lib/auth";
import { rateLimiter } from "./rateLimits";

/** Tell the team something. Write-only: it lands in the dashboard, never back in the app. */
export const send = mutation({
  args: {
    category: v.union(v.literal("bug"), v.literal("idea"), v.literal("general")),
    message: v.string(),
    eventId: v.optional(v.id("events")),
    page: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.eventId) await requireMember(ctx, args.eventId);
    const message = args.message.trim().slice(0, 4000);
    if (!message) throw new ConvexError("Write a few words first.");
    const room = await rateLimiter.limit(ctx, "feedback", { key: userId });
    if (!room.ok) throw new ConvexError("Thank you, that's a lot of notes at once. Try again in a little while.");
    await ctx.db.insert("feedback", { userId, eventId: args.eventId, category: args.category, message, page: args.page?.slice(0, 200) });
    return null;
  },
});
