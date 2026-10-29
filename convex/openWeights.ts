import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { extractJsonText, glimmerComplete } from "./lib/glimmer";
import { glimmerCostUsd } from "./lib/modelCost";
import { generateObject, MODEL_FAST, parseAnswer } from "./lib/models";
import { tagsFor } from "./lib/photoTags";
import { photoCheckSchema, photoPrompt } from "./marketplace/photos";

/**
 * A live check that Muse Spark Open answers on Baseten with our structured output, run by
 * hand (`npx convex run openWeights:smoke`). One small call, a fraction of a cent from
 * Baseten's credit; its cost row is written like any other.
 */
export const smoke = internalAction({
  args: {},
  returns: v.object({ provider: v.string(), model: v.string(), answer: v.any(), inputTokens: v.number(), outputTokens: v.number(), ms: v.number() }),
  handler: async (ctx) => {
    const started = Date.now();
    const result = await generateObject({
      ctx,
      feature: "openWeightsSmoke",
      model: MODEL_FAST,
      provider: "spark_open",
      effort: "low",
      maxOutputTokens: 4000,
      system: "Read the photographer's quote into numbers. Use only what it says.",
      prompt: "Rs.45,000/- for the event, 8 hrs coverage, 2 photographers, 400 edited photos in 3 weeks. GST extra.",
      schema: z.object({ price: z.number(), hours: z.number(), photographers: z.number(), photos: z.number(), weeks: z.number(), gstIncluded: z.boolean() }),
    });
    return {
      provider: result.provider,
      model: result.model,
      answer: result.object,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      ms: Date.now() - started,
    };
  },
});

/**
 * A live check of Muse Glimmer on our Modal endpoint with one photo by URL, run by hand
 * (`npx convex run openWeights:glimmerSmoke '{"url": "…", "category": "Decor & Florals"}'`).
 * A cold endpoint takes minutes to start, which counts against Modal's credit.
 */
export const glimmerSmoke = internalAction({
  args: { url: v.string(), category: v.string() },
  returns: v.object({ answer: v.any(), model: v.string(), inputTokens: v.number(), outputTokens: v.number(), ms: v.number(), costUsd: v.number() }),
  handler: async (ctx, args) => {
    const res = await fetch(args.url);
    if (!res.ok) throw new Error(`Could not fetch the photo (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const allowed = tagsFor([args.category]);
    const result = await glimmerComplete({
      images: [{ data: bytes, mediaType: res.headers.get("content-type") ?? "image/jpeg" }],
      prompt: photoPrompt("Sample Decorators", allowed),
      schema: photoCheckSchema,
    });
    const costUsd = glimmerCostUsd(result.ms / 1000);
    await ctx.runMutation(internal.modelCalls.record, {
      feature: "openWeightsSmoke",
      provider: "glimmer",
      model: "muse-glimmer-30b",
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd,
      fellBack: false,
      durationMs: Math.round(result.ms),
    });
    return {
      answer: parseAnswer(extractJsonText(result.text), photoCheckSchema),
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      ms: result.ms,
      costUsd,
    };
  },
});
