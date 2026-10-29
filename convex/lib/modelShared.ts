import type { z } from "zod";

/** Types and helpers shared by the model wrapper (`models.ts`) and its providers. */

/** Tiers: fast for extraction and short drafts, smart for judgement and longer writing. */
export type Tier = "fast" | "smart";

export type Effort = "low" | "medium" | "high";

/** One piece of message content: some text, or an image or PDF given as a URL or as bytes. */
export type Part =
  | { type: "text"; text: string }
  | { type: "file"; data: URL | ArrayBuffer | Uint8Array; mediaType: string; filename?: string };

export type Message = { role: "user" | "assistant"; content: string | Part[] };

/** What a provider is asked for: the call input with the house style and messages resolved. */
export type CompletionRequest = {
  tier: Tier;
  system: string;
  messages: Message[];
  maxOutputTokens: number;
  effort: Effort;
  schema?: z.ZodType;
};

/** Who answered: Claude, Meta's API (Muse Spark), or Muse Spark Open on Baseten. */
export type Provider = "claude" | "meta" | "spark_open";

export type Completion = {
  text: string;
  provider: Provider;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

/** Base64 built in chunks, so a large file never passes too many arguments to String.fromCharCode. */
export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Files go before the text that refers to them. */
export function filesFirst(parts: Part[]): Part[] {
  return [...parts.filter((p) => p.type === "file"), ...parts.filter((p) => p.type === "text")];
}

/** An answer that was cut off, refused or malformed. */
export class ModelAnswerError extends Error {}
