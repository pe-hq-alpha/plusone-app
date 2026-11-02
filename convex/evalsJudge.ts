import { v } from "convex/values";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { chatBody, chatComplete } from "./lib/meta";
import { parseAnswer, withMetaRetries } from "./lib/models";
import { callRecord } from "./lib/modelCost";

/**
 * A blind judge on Meta's own models, for the submission itself: it reads the form's answers,
 * the video's plan and narration, and the public README, and scores each surface on the
 * hackathon's four criteria and every section on its own, so the parts that already hold at 9
 * can be kept as they are and only the rest rewritten. Meta only, never a fallback: a judge
 * that quietly became another model would measure the wrong thing. Run from
 * `scripts/judge-muse.mjs`, several times, since one run's score is noise.
 */

const MODELS = ["muse-spark-1.3", "muse-wonder-1.0"] as const;

const section = v.object({ id: v.string(), text: v.string() });

const verdict = z.object({
  surfaces: z.array(
    z.object({
      surface: z.enum(["form", "video", "repo"]),
      impact: z.number(),
      metaTooling: z.number(),
      technical: z.number(),
      demo: z.number(),
      sections: z.array(z.object({ id: z.string(), score: z.number(), why: z.string(), fix: z.string() })),
    }),
  ),
  topGaps: z.array(z.string()),
});

const JUDGE = [
  "You are an experienced, fair judge for a hackathon run by Meta. You score one entry from what is in front of you: its submission form answers, its demo video's plan and narration (the video is recorded as written), and its public README.",
  "Score blind and strictly, as a judge comparing it with the best entries you have seen. 10 is exceptional and rare; 9 is outstanding with no real gaps; 7 is good with clear gaps.",
  "For each surface give a score from 0 to 10 (one decimal) on each criterion, then score every section listed for that surface on its own (0 to 10, one decimal), with one sentence on why and one concrete fix (the replacement wording when it is text). Score each section on how well it serves the criteria for a judge reading it.",
  "Do not reward length. Penalise claims without evidence, numbers that disagree between surfaces, anything older presented as new, and anything a sceptical judge would not believe.",
  "End with the five gaps that cost the most points, most costly first.",
].join("\n");

export const judge = internalAction({
  args: {
    model: v.union(...MODELS.map((m) => v.literal(m))),
    rules: v.string(),
    surfaces: v.array(v.object({ surface: v.union(v.literal("form"), v.literal("video"), v.literal("repo")), context: v.optional(v.string()), sections: v.array(section) })),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const prompt = [
      `# The hackathon's rules and criteria\n\n${args.rules}`,
      ...args.surfaces.map(
        (s) =>
          `# Surface: ${s.surface}\n\n${s.context ? `${s.context}\n\n` : ""}` +
          s.sections.map((x) => `## Section ${x.id}\n\n${x.text}`).join("\n\n"),
      ),
    ].join("\n\n");
    const body = await chatBody(
      { tier: "smart", system: JUDGE, messages: [{ role: "user", content: prompt }], maxOutputTokens: 24_000, effort: "high", schema: verdict },
      args.model,
    );
    const started = Date.now();
    const completion = await withMetaRetries(() =>
      chatComplete({ name: "Meta", url: process.env.META_BASE_URL ?? "https://api.meta.ai/v1", key: process.env.MODEL_API_KEY, provider: "meta" }, body),
    );
    const record = callRecord("submissionJudge", "meta", completion, { durationMs: Date.now() - started });
    await ctx.runMutation(internal.modelCalls.record, record);
    return { model: completion.model, ms: Date.now() - started, costUsd: record.costUsd, usage: completion.usage, verdict: parseAnswer(completion.text, verdict) };
  },
});
