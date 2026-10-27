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
    fellBack: chosen === "meta" && served.provider === "claude",
    ...(extra.eventId ? { eventId: extra.eventId } : {}),
    ...(extra.durationMs !== undefined ? { durationMs: Math.round(extra.durationMs) } : {}),
  };
}
