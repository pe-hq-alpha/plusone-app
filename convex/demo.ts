import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { rateLimiter } from "./rateLimits";
import { seedBirthday } from "./demoBirthday";
import { seedHousewarming } from "./demoHousewarming";
import { seedOfficeParty } from "./demoOfficeParty";

/**
 * The sample events a visitor can open without an account: Amma's 60th birthday in
 * Chennai, a griha pravesam in Bengaluru, and an office Diwali party in Gurugram. Each
 * is built exactly like a real event, then filled in as if PlusOne had been working on
 * it for a couple of weeks. Every vendor is made up, and email on a demo is simulated.
 */
export const DEMO_KINDS = ["birthday", "housewarming", "office"] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];

export const start = mutation({
  args: { kind: v.optional(v.string()) },
  returns: v.id("events"),
  handler: async (ctx, { kind }): Promise<Id<"events">> => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("members")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing.eventId;
    const room = await rateLimiter.limit(ctx, "demoStarts");
    if (!room.ok) throw new ConvexError("The demo is very busy right now. Try again in a little while.");
    if (kind === "housewarming") return await seedHousewarming(ctx, userId);
    if (kind === "office") return await seedOfficeParty(ctx, userId);
    return await seedBirthday(ctx, userId);
  },
});
