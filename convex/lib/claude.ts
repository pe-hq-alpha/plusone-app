import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { type Completion, type CompletionRequest, type Part, type Tier, filesFirst, ModelAnswerError, toBase64 } from "./modelShared";

/** Claude, the fallback provider. Models are overridable per deployment. */
export function claudeModel(tier: Tier): string {
  return tier === "fast"
    ? (process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-5-5")
    : (process.env.ANTHROPIC_MODEL_SMART ?? "claude-sonnet-5-5");
}

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function toBlock(part: Part): Anthropic.Beta.BetaContentBlockParam {
  if (part.type === "text") return { type: "text", text: part.text };
  const isPdf = part.mediaType === "application/pdf";
  if (part.data instanceof URL) {
    const url = part.data.toString();
    return isPdf
      ? { type: "document", source: { type: "url", url } }
      : { type: "image", source: { type: "url", url } };
  }
  if (isPdf) {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: toBase64(part.data) },
      ...(part.filename ? { title: part.filename } : {}),
    };
  }
  if (!IMAGE_TYPES.has(part.mediaType)) throw new Error(`Claude cannot read a ${part.mediaType} attachment`);
  return {
    type: "image",
    source: { type: "base64", media_type: part.mediaType as "image/png", data: toBase64(part.data) },
  };
}

/** Throw on a refused or truncated answer instead of parsing half of one. */
function assertFinished(response: { stop_reason: string | null; stop_details?: { category?: string | null } | null }) {
  if (response.stop_reason === "refusal") {
    throw new ModelAnswerError(`Claude declined this request (${response.stop_details?.category ?? "no category"})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new ModelAnswerError("The answer ran past its length limit and was cut off.");
  }
}

export async function claudeComplete(req: CompletionRequest): Promise<Completion> {
  const model = claudeModel(req.tier);
  const fallback = /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);
  const response = await anthropic().beta.messages.create({
    model,
    max_tokens: req.maxOutputTokens,
    system: req.system,
    messages: req.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : filesFirst(m.content).map(toBlock),
    })),
    output_config: { effort: req.effort, ...(req.schema ? { format: betaZodOutputFormat(req.schema) } : {}) },
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  assertFinished(response);
  return {
    text: response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""),
    provider: "claude",
    model: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
