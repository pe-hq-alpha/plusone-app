import type { z } from "zod";
import { jsonSchemaFor, MetaError, retryAfterMs, MALFORMED, RETRYABLE } from "./meta";
import { ModelAnswerError, toBase64 } from "./modelShared";
import { PHOTO_INSTRUCTIONS } from "./photoTags";

/**
 * Muse Glimmer 30B on our own Modal Dedicated Endpoint, OpenAI-compatible. Text and
 * images in, text out. It scales to zero, so after idle the first request can wait
 * minutes for the GPU and meet 502, 503 or 504 meanwhile. No Convex imports, so this
 * stays testable on its own.
 */

export const GLIMMER_TIMEOUT_MS = 240_000;
/**
 * All attempts together end by this, waits included, so a cold start can't outlast
 * Convex's ten-minute action limit and still leaves time for Muse Spark to take over.
 */
export const GLIMMER_DEADLINE_MS = 7 * 60_000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const SENDABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export type GlimmerImage = { data: Uint8Array | ArrayBuffer; mediaType: string };

export type GlimmerRequest = {
  images: GlimmerImage[];
  /** What the photo is from and which tags to choose, in plain words. */
  prompt: string;
  schema: z.ZodType;
};

export type GlimmerEnv = Record<string, string | undefined>;

/** The endpoint's model name, from env, defaulting to "inference-1". */
export function glimmerModel(env: GlimmerEnv = process.env): string {
  return env.GLIMMER_MODEL ?? "inference-1";
}

/** JPEG, PNG or WebP only, at most 5 MB: anything else is refused before any request. */
function assertSendable(images: GlimmerImage[]): void {
  for (const image of images) {
    if (!SENDABLE.has(image.mediaType)) throw new Error(`Glimmer can't read a ${image.mediaType} photo`);
    const bytes = image.data instanceof Uint8Array ? image.data.length : image.data.byteLength;
    if (bytes > MAX_PHOTO_BYTES) throw new Error("That photo is over 5 MB. Add a smaller one.");
  }
}

/**
 * The Chat Completions body: the instructions up front, then the image ahead of its text.
 * The JSON shape is asked for in words, not forced with `response_format`: forced from
 * the first token, Glimmer had nowhere to reason and wrote its thinking into the answer's
 * first text field (29 Oct, on production). Left free, the endpoint returns the reasoning
 * apart and the answer is cut out of the reply and checked against the schema.
 */
export function glimmerBody(req: GlimmerRequest, env: GlimmerEnv = process.env): Record<string, unknown> {
  assertSendable(req.images);
  const shape = JSON.stringify(jsonSchemaFor(req.schema));
  return {
    model: glimmerModel(env),
    messages: [
      {
        role: "system",
        content: `${PHOTO_INSTRUCTIONS}\nReply with one JSON object and nothing else, matching this JSON Schema: ${shape}\nReasoning strength: low`,
      },
      {
        role: "user",
        content: [
          ...req.images.map((image) => ({
            type: "image_url",
            image_url: { url: `data:${image.mediaType};base64,${toBase64(image.data)}` },
          })),
          { type: "text", text: req.prompt },
        ],
      },
    ],
    max_tokens: 4000,
    temperature: 1.0,
    top_p: 0.95,
    top_k: 64,
  };
}

export type GlimmerResult = {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** The wall time of the call that answered, in milliseconds. */
  ms: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ChatResponse = {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null; reasoning_content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function readText(json: ChatResponse, bodyModel: string): { text: string; model: string; usage: GlimmerResult["usage"] } {
  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length") throw new ModelAnswerError("The answer ran past its length limit and was cut off.");
  if (choice?.finish_reason === "content_filter") throw new ModelAnswerError("Muse Glimmer declined this photo");
  // Reasoning comes back in reasoning_content; only the content holds the answer.
  const text = choice?.message?.content ?? "";
  return {
    text,
    model: json.model ?? bodyModel,
    usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
  };
}

/**
 * Send the request, retrying 502, 503 and 504 ("no upstreams available") and lost
 * connections, since those are the GPU starting: about 3.6 minutes from cold on the H200
 * (measured 29 Oct), so the retries run until GLIMMER_DEADLINE_MS rather than for a count,
 * waiting 5 s, 15 s, then every 30 s, or as long as Retry-After asks. Anything else throws as it came back, marked the way meta.ts marks
 * its errors: retryable on 429, 500 and 503, and fallback for everything but a malformed
 * request.
 */
export async function glimmerComplete(
  req: GlimmerRequest,
  env: GlimmerEnv = process.env,
  fetchFn: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<GlimmerResult> {
  const base = env.GLIMMER_BASE_URL;
  if (!base) throw new Error("Set GLIMMER_BASE_URL to check photos with Muse Glimmer.");
  if (!env.MODAL_PROXY_TOKEN) throw new Error("Set MODAL_PROXY_TOKEN to check photos with Muse Glimmer.");
  assertSendable(req.images);
  const body = glimmerBody(req, env);
  const backoffs = [5_000, 15_000, 30_000];
  const deadline = Date.now() + GLIMMER_DEADLINE_MS;
  const outOfTime = () => new MetaError("Glimmer didn't answer in time", null, true, true);
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    if (deadline - started <= 0) throw outOfTime();
    let res: Response;
    try {
      res = await fetchFn(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.MODAL_PROXY_TOKEN}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.min(GLIMMER_TIMEOUT_MS, deadline - started)),
      });
    } catch (error) {
      const pause = backoffs[Math.min(attempt, backoffs.length - 1)];
      if (Date.now() + pause >= deadline) {
        throw new MetaError(`Glimmer request failed: ${error instanceof Error ? error.message : String(error)}`, null, true, true);
      }
      await wait(pause);
      continue;
    }
    if (res.ok) {
      const json = (await res.json()) as ChatResponse;
      const { text, model, usage } = readText(json, body.model as string);
      return { text, model, usage, ms: Date.now() - started };
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      const pause = retryAfterMs(res.headers.get("retry-after")) ?? backoffs[Math.min(attempt, backoffs.length - 1)];
      if (Date.now() + pause >= deadline) throw outOfTime();
      await res.body?.cancel();
      await wait(pause);
      continue;
    }
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new MetaError(
      `Glimmer returned ${res.status}: ${detail}`,
      res.status,
      RETRYABLE.has(res.status),
      !MALFORMED.has(res.status),
      retryAfterMs(res.headers.get("retry-after")),
    );
  }
}

/**
 * Cut the JSON object out of a reply that may wrap it in a code fence or put reasoning
 * ahead of it. `parseAnswer` only parses and validates, so the cutting happens here.
 */
export function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const inner = fenced ? fenced[1] : text;
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new ModelAnswerError("The model's answer held no JSON object");
  return inner.slice(start, end + 1);
}
