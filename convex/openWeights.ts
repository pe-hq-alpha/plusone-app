import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { generateObject, MODEL_FAST } from "./lib/models";

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
