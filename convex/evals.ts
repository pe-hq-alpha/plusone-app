import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { readVendorReply } from "./modelTasks";
import { internal } from "./_generated/api";
import { SAM_USD_PER_IMAGE, wonderCostUsd } from "./lib/modelCost";
import { verifyVendor } from "./lib/wonder";
import { samSegment } from "./lib/sam";
import { findParts } from "./venueView";
import { EVAL_GROUPS } from "./lib/evalQuotes";
import { ALL_READING_CASES, FORMATS, type ReadingScore, scoreReading } from "./lib/evalReading";
import { type QuoteScore, scoreQuote, totals } from "./lib/evalScore";
import { gapsIn, missingCharges as flagMissing, sheetFor, type Answer } from "./lib/standardSheet";
import { HELD_OUT_GROUPS } from "./lib/evalHeldOut";
import { keywordFlags } from "./lib/evalSystems";
import { answersFrom, CHARGES_INSTRUCTIONS, chargesPrompt, chargesSchema } from "./lib/charges";
import { generateObject, MODEL_FAST } from "./lib/models";
import { z } from "zod";
import type { EvalGroup } from "./lib/evalQuotes";
import type { QuoteLine } from "./lib/validators";

type Read = { total: number; currency: string; includes: string[]; excludes: string[]; lines: QuoteLine[]; headcountAssumed?: number; taxIncluded?: boolean };

/**
 * The missing-charge evaluation, run by hand on the deployment whose models it should
 * measure (`npx convex run evals:missingCharges` on production, for Muse Spark): each of
 * the 18 quotes in `lib/evalQuotes.ts` is read by the same reader real replies go through,
 * then the same fixed rules flag what it leaves unsettled against the others in its group,
 * and the flags are scored against the hand-marked answer key.
 */

// The hosts' side of the prompt: a 60th birthday lunch for 120 in Chennai. Not a stored
// event, so its calls are costed without one.
const EVENT = { startDate: "2027-01-30", endDate: "2027-01-30", currency: "INR", eventType: "birthday" } as unknown as Doc<"events">;

export const missingCharges = internalAction({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<{ ranAt: string; seconds: number; totals: ReturnType<typeof totals>; scores: QuoteScore[] }> => {
    const started = Date.now();
    const scores: QuoteScore[] = [];
    for (const group of EVAL_GROUPS) {
      const sheet = sheetFor(group.category);
      if (!sheet) throw new Error(`No standard sheet for ${group.category}`);
      // Read the group's quotes three at a time, then flag each against the rest of its group.
      const read: Read[] = [];
      for (let i = 0; i < group.quotes.length; i += 3) {
        read.push(
          ...(await Promise.all(
            group.quotes.slice(i, i + 3).map(async (q): Promise<Read> => {
              const r = await readVendorReply(ctx, { event: EVENT, slot: null, vendorName: q.vendor, subject: "Re: your enquiry", body: q.text });
              return {
                total: r.total ?? 0,
                currency: r.currency ?? "INR",
                includes: r.includes,
                excludes: r.excludes,
                lines: r.lines.map((l) => ({ item: l.item, kind: l.kind, unit: l.unit, quantity: l.quantity ?? undefined, unitPrice: l.unitPrice ?? undefined, amount: l.amount, optional: l.optional || undefined })),
                headcountAssumed: r.headcountAssumed ?? undefined,
                taxIncluded: r.taxIncluded ?? undefined,
              };
            }),
          )),
        );
      }
      group.quotes.forEach((q, i) => {
        const others = read.filter((_, j) => j !== i);
        const flagged = flagMissing(read[i], sheet, others).map((m) => m.key);
        scores.push(scoreQuote(q.vendor, group.category, q.expected, flagged));
      });
    }
    return { ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), totals: totals(scores), scores };
  },
});

/**
 * The venue view on a set of hall photos (`npx convex run evals:venueStage '{"photos": [...]}'`
 * on production): for each, the parts Muse Spark and SAM 3.1 found, with their boxes and
 * outlines, for a person to judge by eye against the photo.
 */
export const venueStage = internalAction({
  args: { photos: v.array(v.object({ name: v.string(), url: v.string(), width: v.number(), height: v.number() })) },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const out = [];
    for (const photo of args.photos) {
      const started = Date.now();
      try {
        const parts = await findParts(ctx, photo);
        out.push({ name: photo.name, ms: Date.now() - started, parts });
      } catch (error) {
        out.push({ name: photo.name, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return out;
  },
});

/** The reading evaluation's quotes and their hand-marked totals, for the runner script. No model call. */
export const readingCases = internalAction({
  args: {},
  returns: v.any(),
  handler: async () => ALL_READING_CASES,
});

/**
 * The quote-reading evaluation, one quote in one form at a time
 * (`node scripts/eval-reading.mjs` runs all eighteen on production): the quote as an
 * email's text, or as a PDF or phone photo of it, read by the same reader replies go
 * through, and scored against its hand-marked total and the figures it states.
 */
export const readOne = internalAction({
  args: {
    vendor: v.string(),
    format: v.union(v.literal("email"), v.literal("pdf"), v.literal("photo")),
    fileBase64: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<ReadingScore & { ms: number }> => {
    const c = ALL_READING_CASES.find((x) => x.vendor === args.vendor);
    if (!c || !FORMATS.includes(args.format)) throw new Error(`No reading case for ${args.vendor}`);
    if (args.format !== "email" && !args.fileBase64) throw new Error("A PDF or photo needs its file.");
    const started = Date.now();
    const file = args.fileBase64 ? Uint8Array.from(atob(args.fileBase64), (ch) => ch.charCodeAt(0)) : null;
    const r = await readVendorReply(ctx, {
      event: EVENT,
      slot: null,
      vendorName: c.vendor,
      subject: "Re: your enquiry",
      body: args.format === "email" ? c.text : "Please find our quotation attached.",
      ...(file
        ? { pdf: { bytes: file.buffer as ArrayBuffer, filename: args.format === "pdf" ? "quotation.pdf" : "quotation.jpg", mediaType: args.format === "pdf" ? "application/pdf" : "image/jpeg" } }
        : {}),
    });
    const score = scoreReading(c, args.format, { total: r.total ?? 0, lines: r.lines.map((l) => ({ amount: l.amount, unitPrice: l.unitPrice ?? undefined, quantity: l.quantity ?? undefined })) });
    return { ...score, ms: Date.now() - started };
  },
});

/**
 * Muse Wonder's vendor check on given facts, outside Ops (`npx convex run evals:vendorCheck`
 * on production): real businesses' public facts, a made-up vendor, or a planted page. The
 * same check Ops runs, with its pages read through Firecrawl under the same rules, and a
 * cost row for each run.
 */
export const vendorCheck = internalAction({
  args: {
    label: v.string(),
    facts: v.object({ name: v.string(), categories: v.array(v.string()), city: v.string(), website: v.optional(v.string()), phone: v.optional(v.string()) }),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const started = Date.now();
    const run = await verifyVendor(
      { ...args.facts, offerings: [] },
      { readPage: (url: string) => ctx.runAction(internal.firecrawl.readPage, { url }).then((r) => r.text) },
    );
    const costUsd = wonderCostUsd({ inputTokens: run.inputTokens, outputTokens: run.outputTokens }, run.searches);
    await ctx.runMutation(internal.modelCalls.record, {
      feature: "vendorCheckEval",
      provider: "meta",
      model: run.model,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      costUsd,
      fellBack: false,
      durationMs: Date.now() - started,
    });
    return {
      label: args.label,
      seconds: Math.round((Date.now() - started) / 1000),
      costUsd: Math.round(costUsd * 10000) / 10000,
      searches: run.searches,
      pagesRead: run.pagesRead,
      turns: run.turns,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      findings: Object.fromEntries(run.report.checks.map((c) => [c.key, c.finding])),
      checks: run.report.checks,
      summary: run.report.summary,
    };
  },
});

/**
 * SAM 3.1 on its own, from one word (`npx convex run evals:samConcept` on production): every
 * region it finds for the concept in each photo, to compare with the boxes Muse Spark draws
 * for the venue view.
 */
export const samConcept = internalAction({
  args: { concept: v.string(), photos: v.array(v.object({ name: v.string(), url: v.string(), width: v.number(), height: v.number() })) },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const out = [];
    for (const photo of args.photos) {
      const started = Date.now();
      try {
        const segments = await samSegment({ prompt: { concept: args.concept }, image: { url: photo.url, width: photo.width, height: photo.height } });
        await ctx.runMutation(internal.modelCalls.record, {
          feature: "samConceptEval",
          provider: "meta",
          model: "sam-3.1",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: SAM_USD_PER_IMAGE,
          fellBack: false,
          durationMs: Date.now() - started,
        });
        out.push({ name: photo.name, ms: Date.now() - started, found: segments.map((s) => ({ box: s.box, confidence: s.confidence })) });
      } catch (error) {
        out.push({ name: photo.name, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return out;
  },
});

const groupsFor = (set: "tuned" | "heldout"): EvalGroup[] => (set === "tuned" ? EVAL_GROUPS : HELD_OUT_GROUPS);
// "unit" (how many plates) is the pipeline's own check, not a charge; it is left out so every system is scored on the same charges.
const chargesOnly = (keys: string[]) => keys.filter((k) => k !== "unit");

const DIRECT_INSTRUCTIONS =
  "You help a family planning an event compare vendors' quotes. From the list, name every charge a careful planner " +
  "would still have to ask this vendor about: ones the quote never mentions that are usually charged on top, ones other " +
  "quotes for the same need charge for while this one is silent, and ones it calls extra without an amount or rate. " +
  "A charge the quote prices, includes, gives a rate for or says isn't offered is settled.";

/**
 * The missing-charge evaluation by one system on one set (`npx convex run evals:compare
 * '{"set":"heldout","system":"pipeline"}'` on production). Every system is scored on the
 * sheet's charges against the same hand-marked keys.
 */
export const compare = internalAction({
  args: {
    set: v.union(v.literal("tuned"), v.literal("heldout")),
    system: v.union(v.literal("pipeline"), v.literal("charges"), v.literal("direct"), v.literal("keywords")),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<{ set: string; system: string; seconds: number; totals: ReturnType<typeof totals>; scores: QuoteScore[] }> => {
    const started = Date.now();
    const scores: QuoteScore[] = [];
    for (const group of groupsFor(args.set)) {
      const sheet = sheetFor(group.category);
      if (!sheet) throw new Error(`No standard sheet for ${group.category}`);
      const keys = sheet.lines.map((l) => l.key) as [string, ...string[]];
      let flagged: string[][];
      if (args.system === "keywords") {
        flagged = group.quotes.map((q) => keywordFlags(q.text, sheet));
      } else if (args.system === "pipeline") {
        const read = await Promise.all(group.quotes.map((q) => readVendorReply(ctx, { event: EVENT, slot: null, vendorName: q.vendor, subject: "Re: your enquiry", body: q.text })));
        const quotes = read.map((r) => ({
          total: r.total ?? 0,
          currency: r.currency ?? "INR",
          includes: r.includes,
          excludes: r.excludes,
          lines: r.lines.map((l) => ({ item: l.item, kind: l.kind, unit: l.unit, quantity: l.quantity ?? undefined, unitPrice: l.unitPrice ?? undefined, amount: l.amount, optional: l.optional || undefined })),
          headcountAssumed: r.headcountAssumed ?? undefined,
          taxIncluded: r.taxIncluded ?? undefined,
        }));
        flagged = quotes.map((q, i) => flagMissing(q, sheet, quotes.filter((_, j) => j !== i)).map((m) => m.key));
      } else if (args.system === "charges") {
        const schema = chargesSchema(sheet);
        const answers: Answer[][] = await Promise.all(
          group.quotes.map(async (q) => {
            const { object } = await generateObject({
              ctx,
              feature: "evalCharges",
              model: MODEL_FAST,
              effort: "low",
              system: CHARGES_INSTRUCTIONS,
              prompt: chargesPrompt(group.category, sheet, q.vendor, q.text),
              schema,
            });
            return answersFrom(object.charges, sheet);
          }),
        );
        flagged = answers.map((a, i) => gapsIn(a, sheet, answers.filter((_, j) => j !== i), "INR").map((m) => m.key));
      } else {
        const schema = z.object({ toAsk: z.array(z.enum(keys)) });
        const all = group.quotes.map((q) => `${q.vendor}: ${q.text}`).join("\n\n");
        flagged = await Promise.all(
          group.quotes.map(async (q) => {
            const { object } = await generateObject({
              ctx,
              feature: "evalDirect",
              model: MODEL_FAST,
              effort: "low",
              system: DIRECT_INSTRUCTIONS,
              prompt: `The charges for ${group.category}: ${keys.join(", ")}.\n\nAll the quotes for this need:\n${all}\n\nWhich charges should the planner still ask ${q.vendor} about?`,
              schema,
            });
            return [...new Set(object.toAsk)];
          }),
        );
      }
      group.quotes.forEach((q, i) => scores.push(scoreQuote(q.vendor, group.category, chargesOnly(q.expected), chargesOnly(flagged[i]))));
    }
    return { set: args.set, system: args.system, seconds: Math.round((Date.now() - started) / 1000), totals: totals(scores), scores };
  },
});

/**
 * The product's charge reading on one given text (`npx convex run evals:chargesFor` on
 * production), so the demo's sample quotes can carry a real reading, as their lines do.
 */
export const chargesFor = internalAction({
  args: { category: v.string(), vendor: v.string(), text: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const sheet = sheetFor(args.category);
    if (!sheet) throw new Error(`No standard sheet for ${args.category}`);
    const started = Date.now();
    const { object } = await generateObject({
      ctx,
      feature: "readCharges",
      model: MODEL_FAST,
      effort: "low",
      system: CHARGES_INSTRUCTIONS,
      prompt: chargesPrompt(args.category, sheet, args.vendor, args.text),
      schema: chargesSchema(sheet),
    });
    return { vendor: args.vendor, ms: Date.now() - started, charges: object.charges };
  },
});

