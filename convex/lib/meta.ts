import { z } from "zod";
import { type Completion, type CompletionRequest, type Part, type Provider, type Tier, filesFirst, ModelAnswerError, toBase64 } from "./modelShared";

/**
 * Meta's Model API through Chat Completions, where structured output is
 * `response_format: json_schema` (https://dev.meta.ai/docs, Structured output).
 * Both tiers default to Muse Spark Standard; reasoning can't be turned off, so the
 * effort is the only dial: low for fast, medium for smart.
 */

const BASE_URL = "https://api.meta.ai/v1";

export function metaModel(tier: Tier, env: Record<string, string | undefined> = process.env): string {
  const id = (tier === "fast" ? env.META_MODEL_FAST : env.META_MODEL_SMART) ?? "muse-spark-1.3";
  // Contributor ids train on what they're sent, and our requests carry people's names,
  // messages and prices (Meta ToS §6.2), so they are never used here.
  if (id.endsWith("-contributor")) throw new Error(`Refusing Contributor model ${id}: requests here hold personal data`);
  return id;
}

/** A failed Meta call, with what the caller should do about it (Meta's error docs, https://dev.meta.ai/docs). */
export class MetaError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Worth trying again unchanged: 429, 500, 503, or the connection dropped. */
    readonly retryable: boolean,
    /** Claude can take this call instead: anything but a request Meta found malformed. */
    readonly fallback: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export const RETRYABLE = new Set([429, 500, 503]);
/** Our request was wrong; moving it to Claude would only hide the bug. */
export const MALFORMED = new Set([400, 413, 415, 422]);

export function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatPart[] };

/** Chat Completions takes PDFs only inline, so a PDF given by URL is fetched first. */
async function toChatPart(part: Part, fetchFn: typeof fetch): Promise<ChatPart> {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.mediaType === "application/pdf") {
    let bytes: ArrayBuffer | Uint8Array;
    if (part.data instanceof URL) {
      const res = await fetchFn(part.data);
      if (!res.ok) throw new Error(`Could not fetch the PDF to send (${res.status})`);
      bytes = await res.arrayBuffer();
    } else {
      bytes = part.data;
    }
    return {
      type: "file",
      file: { filename: part.filename ?? "document.pdf", file_data: `data:application/pdf;base64,${toBase64(bytes)}` },
    };
  }
  if (!part.mediaType.startsWith("image/")) throw new Error(`Muse Spark cannot read a ${part.mediaType} attachment`);
  const url = part.data instanceof URL ? part.data.toString() : `data:${part.mediaType};base64,${toBase64(part.data)}`;
  return { type: "image_url", image_url: { url } };
}

/** The JSON schema Meta constrains decoding to, from the same Zod schema the answer is checked against. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
  return rest;
}

/** The Chat Completions body for a request. */
export async function metaBody(
  req: CompletionRequest,
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  return chatBody(req, metaModel(req.tier, env), fetchFn);
}

/** A Chat Completions body for any OpenAI-compatible host: Meta's API, or Baseten for Muse Spark Open. */
export async function chatBody(req: CompletionRequest, model: string, fetchFn: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const messages: ChatMessage[] = [{ role: "system", content: req.system }];
  for (const m of req.messages) {
    messages.push({
      role: m.role,
      content:
        typeof m.content === "string"
          ? m.content
          : await Promise.all(filesFirst(m.content).map((p) => toChatPart(p, fetchFn))),
    });
  }
  return {
    model,
    messages,
    max_tokens: req.maxOutputTokens,
    reasoning_effort: req.effort,
    ...(req.schema
      ? { response_format: { type: "json_schema", json_schema: { name: "answer", schema: jsonSchemaFor(req.schema) } } }
      : {}),
  };
}

/** Reasoning, where a host returns it, comes back in `reasoning_content` and is never read: only `content` is the answer. */
type ChatResponse = {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | { type: string; text?: string }[] | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export async function metaComplete(
  req: CompletionRequest,
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<Completion> {
  const body = await metaBody(req, env, fetchFn);
  return chatComplete({ name: "Meta", url: env.META_BASE_URL ?? BASE_URL, key: env.MODEL_API_KEY, provider: "meta" }, body, fetchFn);
}

/** Where a Chat Completions request goes, and how its errors and cost row name it. */
export type ChatHost = { name: string; url: string; key: string | undefined; provider: Provider };

/** Send a Chat Completions body and read the answer, with errors classed as Meta's docs class them. */
export async function chatComplete(host: ChatHost, body: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<Completion> {
  let res: Response;
  try {
    res = await fetchFn(`${host.url}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.key}` },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new MetaError(`${host.name} request failed: ${error instanceof Error ? error.message : String(error)}`, null, true, true);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new MetaError(
      `${host.name} returned ${res.status}: ${detail}`,
      res.status,
      RETRYABLE.has(res.status),
      !MALFORMED.has(res.status),
      retryAfterMs(res.headers.get("retry-after")),
    );
  }
  const json = (await res.json()) as ChatResponse;
  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new ModelAnswerError("The answer ran past its length limit and was cut off.");
  }
  if (choice?.finish_reason === "content_filter") throw new ModelAnswerError("Muse Spark declined this request");
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : (content ?? []).map((c) => c.text ?? "").join("");
  return {
    text,
    provider: host.provider,
    model: json.model ?? (body.model as string),
    usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 },
  };
}
