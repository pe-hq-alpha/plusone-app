import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { requireStaff } from "../lib/auth";
import { wonderCostUsd } from "../lib/modelCost";
import { verifyVendor, type Spent, type VendorFacts } from "../lib/wonder";
import { rateLimiter } from "../rateLimits";
import { vendorCheckFields, vendorCheckStatus, verificationReport } from "../schema";
import { chosenProvider } from "../lib/models";

/**
 * The vendor check for Ops: a reviewer presses a button, the check runs in the
 * background, and its six findings with their sources land beside the reviewer's
 * own checklist. Software gathers evidence; a person decides.
 */

const RUNNING_MS = 10 * 60_000;
const FAILED_MESSAGE = "The check couldn't finish. Try again in a while.";

/** VendorFacts from the listing and up to 20 offerings, in the vendor's own price unit. */
export function vendorFacts(
  profile: Pick<Doc<"vendorProfiles">, "name" | "categories" | "city" | "website" | "phone" | "about">,
  offerings: Pick<Doc<"vendorOfferings">, "title" | "price" | "unit" | "priceUnit" | "currency">[],
): VendorFacts {
  return {
    name: profile.name,
    categories: profile.categories,
    city: profile.city,
    ...(profile.website ? { website: profile.website } : {}),
    ...(profile.phone ? { phone: profile.phone } : {}),
    ...(profile.about ? { about: profile.about } : {}),
    offerings: offerings.slice(0, 20).map((o) => ({
      title: o.title,
      price: o.price,
      unit: o.priceUnit ?? o.unit,
      currency: o.currency,
    })),
  };
}

/** The check, its listing and up to 20 offerings, for the background run which has no db. */
export const load = internalQuery({
  args: { checkId: v.id("vendorChecks") },
  returns: v.object({
    checkId: v.id("vendorChecks"),
    status: vendorCheckStatus,
    profile: v.object({
      name: v.string(),
      categories: v.array(v.string()),
      city: v.string(),
      website: v.optional(v.string()),
      phone: v.optional(v.string()),
      about: v.optional(v.string()),
    }),
    offerings: v.array(
      v.object({
        title: v.string(),
        price: v.number(),
        unit: v.string(),
        priceUnit: v.optional(v.string()),
        currency: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) throw new ConvexError("That check is no longer there.");
    const profile = await ctx.db.get(check.profileId);
    if (!profile) throw new ConvexError("That listing is no longer there.");
    const offerings = await ctx.db
      .query("vendorOfferings")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .take(20);
    return {
      checkId: check._id,
      status: check.status,
      profile: {
        name: profile.name,
        categories: profile.categories,
        city: profile.city,
        website: profile.website,
        phone: profile.phone,
        about: profile.about,
      },
      offerings: offerings.map((o) => ({
        title: o.title,
        price: o.price,
        unit: o.unit,
        priceUnit: o.priceUnit ?? undefined,
        currency: o.currency,
      })),
    };
  },
});

/** Mark a check done and keep the cost record beside it. */
export const complete = internalMutation({
  args: {
    checkId: v.id("vendorChecks"),
    report: verificationReport,
    model: v.string(),
    searches: v.number(),
    pagesRead: v.number(),
    turns: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    durationMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) return null;
    await ctx.db.patch(args.checkId, {
      status: "done",
      finishedAt: Date.now(),
      report: args.report,
      model: args.model,
      searches: args.searches,
      pagesRead: args.pagesRead,
      turns: args.turns,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      error: undefined,
    });
    await ctx.db.insert("modelCalls", {
      feature: "vendorCheck",
      provider: "meta",
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      fellBack: false,
      durationMs: Math.round(args.durationMs),
    });
    return null;
  },
});

/** Mark a check failed, keeping a cost row only when the run spent tokens. */
export const fail = internalMutation({
  args: {
    checkId: v.id("vendorChecks"),
    error: v.string(),
    model: v.optional(v.string()),
    searches: v.optional(v.number()),
    pagesRead: v.optional(v.number()),
    turns: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const check = await ctx.db.get(args.checkId);
    if (!check) return null;
    await ctx.db.patch(args.checkId, {
      status: "failed",
      finishedAt: Date.now(),
      error: args.error,
      ...(args.model ? { model: args.model } : {}),
      ...(args.searches !== undefined ? { searches: args.searches } : {}),
      ...(args.pagesRead !== undefined ? { pagesRead: args.pagesRead } : {}),
      ...(args.turns !== undefined ? { turns: args.turns } : {}),
      ...(args.inputTokens !== undefined ? { inputTokens: args.inputTokens } : {}),
      ...(args.outputTokens !== undefined ? { outputTokens: args.outputTokens } : {}),
      ...(args.costUsd !== undefined ? { costUsd: args.costUsd } : {}),
    });
    // A run that failed before any turn came back spent nothing, so it keeps no cost row.
    if (args.model && args.inputTokens !== undefined && args.outputTokens !== undefined && args.costUsd !== undefined) {
      await ctx.db.insert("modelCalls", {
        feature: "vendorCheck",
        provider: "meta",
        model: args.model,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        costUsd: args.costUsd,
        fellBack: false,
        ...(args.durationMs !== undefined ? { durationMs: Math.round(args.durationMs) } : {}),
      });
    }
    return null;
  },
});

/** Start a check on a listing. The run happens in the background. */
export const start = mutation({
  args: { profileId: v.id("vendorProfiles") },
  returns: v.id("vendorChecks"),
  handler: async (ctx, args): Promise<Id<"vendorChecks">> => {
    const { userId } = await requireStaff(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new ConvexError("That listing is no longer there.");
    if (chosenProvider() !== "meta") {
      throw new ConvexError("Checks aren't available right now.");
    }
    const recent = await ctx.db
      .query("vendorChecks")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .order("desc")
      .take(1);
    if (recent[0]?.status === "running" && Date.now() - recent[0].startedAt < RUNNING_MS) {
      throw new ConvexError("A check is already running for this listing. Give it a minute.");
    }
    const mine = await rateLimiter.limit(ctx, "vendorChecks", { key: userId });
    if (!mine.ok) throw new ConvexError("That's as many checks as we run today. Try again tomorrow.");
    const all = await rateLimiter.limit(ctx, "vendorChecksAll");
    if (!all.ok) throw new ConvexError("That's as many checks as we run today. Try again tomorrow.");
    const checkId = await ctx.db.insert("vendorChecks", {
      profileId: profile._id,
      requestedBy: userId,
      status: "running",
      startedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.marketplace.checks.run, { checkId });
    return checkId;
  },
});

/** The newest check on a listing, or null when it has never been checked. */
export const latest = query({
  args: { profileId: v.id("vendorProfiles") },
  returns: v.union(v.null(), v.object({ _id: v.id("vendorChecks"), _creationTime: v.number(), ...vendorCheckFields })),
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const rows = await ctx.db
      .query("vendorChecks")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

/** The background run: search, read pages, write the report and its cost. No other provider. */
export const run = internalAction({
  args: { checkId: v.id("vendorChecks") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const started = Date.now();
    let loaded: { status: string; profile: Parameters<typeof vendorFacts>[0]; offerings: Parameters<typeof vendorFacts>[1] };
    try {
      loaded = await ctx.runQuery(internal.marketplace.checks.load, { checkId: args.checkId });
    } catch {
      await ctx.runMutation(internal.marketplace.checks.fail, { checkId: args.checkId, error: FAILED_MESSAGE });
      return null;
    }
    // A check that already finished keeps its report: running it again would pay Muse Wonder twice.
    if (loaded.status !== "running") return null;
    const facts = vendorFacts(loaded.profile, loaded.offerings);
    // What the run has spent so far, so a check that fails part way still writes its cost.
    const progress: { spent?: Spent } = {};
    let result: Awaited<ReturnType<typeof verifyVendor>>;
    try {
      result = await verifyVendor(facts, {
        readPage: (url: string) => ctx.runAction(internal.firecrawl.readPage, { url }).then((r) => r.text),
        onTurn: (spent) => {
          progress.spent = spent;
        },
      });
    } catch (error) {
      console.error(`Vendor check ${args.checkId} failed: ${error instanceof Error ? error.message : String(error)}`);
      const spent = progress.spent;
      await ctx.runMutation(internal.marketplace.checks.fail, {
        checkId: args.checkId,
        error: FAILED_MESSAGE,
        durationMs: Date.now() - started,
        ...(spent ? { ...spent, costUsd: wonderCostUsd(spent, spent.searches) } : {}),
      });
      return null;
    }
    const durationMs = Date.now() - started;
    const costUsd = wonderCostUsd({ inputTokens: result.inputTokens, outputTokens: result.outputTokens }, result.searches);
    await ctx.runMutation(internal.marketplace.checks.complete, {
      checkId: args.checkId,
      report: result.report,
      model: result.model,
      searches: result.searches,
      pagesRead: result.pagesRead,
      turns: result.turns,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      durationMs,
    });
    return null;
  },
});
