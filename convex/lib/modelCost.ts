import type { Id } from "../_generated/dataModel";
import type { Completion, Provider } from "./modelShared";

/**
 * List prices per million tokens, in US dollars. Meta's are from https://dev.meta.ai/docs/pricing-rate-limits
 * (re-read 27 Oct); reasoning tokens are billed as output there. Claude's are
 * Anthropic's first-party rates. A model that isn't listed is recorded without a cost.
 */
type Price = { input: number; output: number; /** Above this many input tokens, `long` applies. */ longAfter?: number; long?: { input: number; output: number } };

const PRICES: [prefix: string, price: Price][] = [
  ["muse-spark-1.3-contributor", { input: 0.1, output: 0.2 }],
  ["muse-spark-1.2-contributor", { input: 0.1, output: 0.2 }],
  ["muse-spark-1.", { input: 1.25, output: 4.25 }],
  ["muse-wonder-1.0", { input: 4, output: 20 }],
  // Baseten's per-token price for Muse Spark Open (re-read 29 Oct), paid from Baseten's credit, not the Meta key.
  ["meta-models/muse-spark-open", { input: 1.25, output: 4.25 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, longAfter: 100_000, long: { input: 0.5, output: 2.5 } }],
  ["claude-sonnet-5-5", { input: 2, output: 10 }],
];

/** What a call cost at list price, or undefined for a model we have no price for. */
export function costUsd(model: string, usage: Completion["usage"]): number | undefined {
  const price = PRICES.find(([prefix]) => model.startsWith(prefix))?.[1];
  if (!price) return undefined;
  const rate = price.long && price.longAfter !== undefined && usage.inputTokens > price.longAfter ? price.long : price;
  return (usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000;
}

/**
 * What a voice transcription cost, billed in whole seconds at $0.18 an hour:
 * a clip of 0.1 seconds bills as one second, 1.1 as two.
 */
export function voiceCostUsd(seconds: number): number {
  const billed = Math.ceil(Math.max(0, seconds));
  return (billed * 0.18) / 3600;
}

/**
 * What a vendor check cost: Muse Wonder's tokens plus $2.50 per 1,000 web searches, which
 * are billed apart. Every input token counts at the full rate, though later turns are mostly
 * cached at $0.20, so this errs high.
 */
export function wonderCostUsd(usage: { inputTokens: number; outputTokens: number }, searches: number): number {
  const tokens = costUsd("muse-wonder-1.0", usage) ?? 0;
  return tokens + (Math.max(0, searches) * 2.5) / 1000;
}

/**
 * What the GPU behind our Glimmer endpoint costs an hour: Modal's H200 at $0.001261 a
 * second ($4.54 an hour, modal.com/pricing, read 29 Oct), plus about $0.11 for the CPU
 * and memory that come with it. A check's row counts only its own seconds; the start-up
 * and the idle minutes before Modal scales to zero are billed too, and are measured apart.
 */
export const GLIMMER_GPU_USD_PER_HOUR = 4.65;

/**
 * What a Glimmer photo check cost, billed in whole seconds of the call's wall time,
 * like voice: a call of 0.1 seconds bills as one second, 1.1 as two.
 */
export function glimmerCostUsd(seconds: number): number {
  const billed = Math.ceil(Math.max(0, seconds));
  return (billed * GLIMMER_GPU_USD_PER_HOUR) / 3600;
}

/** The `modelCalls` row for a finished call. */
export function callRecord(
  feature: string,
  chosen: Provider,
  served: Completion,
  extra: { eventId?: Id<"events">; durationMs?: number } = {},
) {
  const cost = costUsd(served.model, served.usage);
  return {
    feature,
    provider: served.provider,
    model: served.model,
    inputTokens: served.usage.inputTokens,
    outputTokens: served.usage.outputTokens,
    ...(cost === undefined ? {} : { costUsd: cost }),
    fellBack: served.provider !== chosen,
    ...(extra.eventId ? { eventId: extra.eventId } : {}),
    ...(extra.durationMs !== undefined ? { durationMs: Math.round(extra.durationMs) } : {}),
  };
}
