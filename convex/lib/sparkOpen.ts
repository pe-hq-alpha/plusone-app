import { chatBody, chatComplete } from "./meta";
import type { Completion, CompletionRequest } from "./modelShared";

/**
 * Muse Spark Open, Meta's open-weights model, on Baseten's OpenAI-compatible API
 * (https://docs.baseten.co/inference/model-apis/reasoning), paid from Baseten's own
 * hackathon credit rather than the Meta key. The hackathon key works only with the
 * `-1026` id; Baseten's docs name the model without it. The model always reasons, and
 * Baseten returns the reasoning in `reasoning_content`, apart from the answer.
 */

const BASE_URL = "https://inference.baseten.co/v1";
export const SPARK_OPEN_MODEL = "meta-models/muse-spark-open-1026";

/** Only when the deployment has Baseten's key; a call asking for Spark Open goes to Muse Spark otherwise. */
export function sparkOpenReady(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BASETEN_API_KEY);
}

export async function sparkOpenComplete(
  req: CompletionRequest,
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<Completion> {
  const body = await chatBody(req, env.SPARK_OPEN_MODEL ?? SPARK_OPEN_MODEL, fetchFn);
  return chatComplete(
    { name: "Baseten", url: env.BASETEN_BASE_URL ?? BASE_URL, key: env.BASETEN_API_KEY, provider: "spark_open" },
    body,
    fetchFn,
  );
}
