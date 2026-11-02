import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { rateLimiter } from "./rateLimits";
import { seedBirthday } from "./demoBirthday";
import { seedBirthdayUS } from "./demoBirthdayUS";
import { birthdayFor } from "./lib/regions";
import { seedHousewarming } from "./demoHousewarming";
import { seedOfficeParty } from "./demoOfficeParty";
import { ensureSampleBusiness } from "./marketplace/partner";

/**
 * The sample events a visitor can open without an account: Amma's 60th birthday in
 * Chennai (Dad's 60th in Austin for visitors outside India), a griha pravesam in
 * Bengaluru, and an office Diwali party in Gurugram. Each is built exactly like a real
 * event, then filled in as if PlusOne had been working on it for a couple of weeks.
 * Every vendor is made up, and email on a demo is simulated.
 */
export const DEMO_KINDS = ["birthday", "birthday-us", "housewarming", "office"] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];

/** The birthday for a visitor: a link's `?sample=birthday` or `birthday-us` wins, else where they are (lib/regions). */
async function seedBirthdayFor(ctx: MutationCtx, userId: Id<"users">, kind: string | undefined, region: string | undefined) {
  const which = kind === "birthday" || kind === "birthday-us" ? kind : birthdayFor(region);
  return which === "birthday-us" ? await seedBirthdayUS(ctx, userId) : await seedBirthday(ctx, userId);
}

export const start = mutation({
  // `region` is the visitor's country, with the state where known ("IN-TN", "US"), from src/lib/region.ts.
  args: { kind: v.optional(v.string()), region: v.optional(v.string()) },
  returns: v.id("events"),
  handler: async (ctx, { kind, region }): Promise<Id<"events">> => {
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
    return await seedBirthdayFor(ctx, userId, kind, region);
  },
});

/**
 * The vendors' demo, on Partner's own address: the guest is a sample caterer answering
 * a customer's request. The customer's side is the sample birthday (Chennai or Austin, by region), made for the guest
 * as the customers' demo would be, since a sample business answers only its own guest's
 * sample event; the vendors' demo never opens it as a customer.
 */
export const startVendor = mutation({
  // Outside India the customer is Dad's 60th in Austin, and the sample caterer is in Austin too.
  args: { region: v.optional(v.string()) },
  returns: v.id("vendorProfiles"),
  handler: async (ctx, { region }): Promise<Id<"vendorProfiles">> => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user?.isAnonymous) throw new ConvexError("The vendors' demo is for visitors without an account.");
    const existing = await ctx.db
      .query("members")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!existing) {
      const room = await rateLimiter.limit(ctx, "demoStarts");
      if (!room.ok) throw new ConvexError("The demo is very busy right now. Try again in a little while.");
      await seedBirthdayFor(ctx, userId, undefined, region);
    }
    return await ensureSampleBusiness(ctx, userId);
  },
});
