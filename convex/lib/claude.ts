import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/** Models, overridable per deployment: fast for extraction and short drafts, smart for judgement and longer writing. */
export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-5-5";
export const MODEL_SMART = process.env.ANTHROPIC_MODEL_SMART ?? "claude-sonnet-5-5";

/** The output ceiling for a call that does not ask for less. */
export const MAX_OUTPUT_TOKENS = 16_000;

/** Writing rules sent with every request, ahead of that request's own instructions. */
const HOUSE_STYLE =
  "You write for PlusOne, which helps people plan events in India: family functions such as birthdays, " +
  "housewarmings, naming ceremonies, poojas and anniversaries; work and community events such as office parties, " +
  "offsites, launches, conferences, college fests and festivals; and weddings. The people planning may live " +
  "anywhere. What you write may be read by them, by the family or colleagues planning with them, by their guests " +
  "or attendees, or by vendors.\n" +
  "Match the event in front of you: a pooja at home is not a wedding and an office party is not a family " +
  "function. Never bring in wedding words or customs unless the event is a wedding.\n" +
  "How to write:\n" +
  "- Use everyday words and short sentences. Say one thing at a time and get to the point.\n" +
  "- Be warm without gushing. Leave out clichés, hype and filler (\"magical\", \"dream day\", \"seamless\", " +
  "\"we're thrilled\", \"don't hesitate to reach out\").\n" +
  "- No exclamation marks and no emoji.\n" +
  "- Use British spelling (colour, organise, favourite, catalogue). Write money in the currency you are given, and " +
  "when you put a rupee amount into words, use lakh and crore.\n" +
  "- State only facts you were given. Never make up names, prices, dates, ratings, contact details or customs. If " +
  "something is not known, say so or leave it out.\n" +
  "- Never call yourself or the product AI, a model or a bot, and never name the technology behind it.\n" +
  "- When a response format is given, follow it exactly.";

type Effort = "low" | "medium" | "high";

/** One piece of message content: some text, or an image or PDF given as a URL or as bytes. */
export type Part =
  | { type: "text"; text: string }
  | { type: "file"; data: URL | ArrayBuffer | Uint8Array; mediaType: string; filename?: string };

export type Message = { role: "user" | "assistant"; content: string | Part[] };

type CallInput = {
  model: string;
  maxOutputTokens?: number;
  /** Instructions on top of the house style. */
  system?: string;
  prompt?: string;
  messages?: Message[];
  effort?: Effort;
};

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Base64 built in chunks, so a large file never passes too many arguments to String.fromCharCode. */
function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

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

function toMessages(input: CallInput): Anthropic.Beta.BetaMessageParam[] {
  if (input.messages?.length) {
    return input.messages.map((m) => ({
      role: m.role,
      // Files go before the text that refers to them.
      content: typeof m.content === "string"
        ? m.content
        : [...m.content.filter((p) => p.type === "file"), ...m.content.filter((p) => p.type === "text")].map(toBlock),
    }));
  }
  return [{ role: "user", content: input.prompt ?? "" }];
}

/**
 * The request body both calls share: the house style ahead of any system text, low
 * effort by default on the fast model, and server-side fallback where the model has it.
 */
function request(input: CallInput) {
  const fast = input.model === MODEL_FAST;
  const fallback = /^claude-(sonnet-5-5|opus-5|fable-5)/.test(input.model);
  return {
    model: input.model,
    max_tokens: input.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
    system: input.system ? `${HOUSE_STYLE}\n\n${input.system}` : HOUSE_STYLE,
    messages: toMessages(input),
    effort: input.effort ?? (fast ? "low" : "medium"),
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

/** Throw on a refused or truncated answer instead of parsing half of one. */
function assertFinished(response: { stop_reason: string | null; stop_details?: { category?: string | null } | null }) {
  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined this request (${response.stop_details?.category ?? "no category"})`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("The answer ran past its length limit and was cut off.");
}

type Issue = { code: string; path: PropertyKey[]; maximum?: number | bigint; minimum?: number | bigint };

/**
 * Bring an answer that breaks only a schema's size limits back inside them: cut long
 * arrays and strings to the maximum and clamp numbers to the range. Any other problem is
 * left alone, so a wrong answer still fails validation.
 */
export function withinLimits(data: unknown, issues: Issue[]): unknown {
  for (const issue of issues) {
    if (issue.code !== "too_big" && issue.code !== "too_small") continue;
    const path = issue.path;
    if (!path.length) continue;
    let parent: unknown = data;
    for (const key of path.slice(0, -1)) parent = (parent as Record<PropertyKey, unknown>)?.[key];
    if (parent === null || typeof parent !== "object") continue;
    const holder = parent as Record<PropertyKey, unknown>;
    const key = path[path.length - 1];
    const value = holder[key];
    const max = issue.maximum === undefined ? undefined : Number(issue.maximum);
    const min = issue.minimum === undefined ? undefined : Number(issue.minimum);
    if (issue.code === "too_big" && max !== undefined) {
      if (Array.isArray(value)) holder[key] = value.slice(0, max);
      else if (typeof value === "string") holder[key] = value.slice(0, max);
      else if (typeof value === "number") holder[key] = max;
    } else if (issue.code === "too_small" && min !== undefined && typeof value === "number") {
      holder[key] = min;
    }
  }
  return data;
}

/** A structured answer, validated against `schema` (see `withinLimits`). */
export async function generateObject<S extends z.ZodType>(
  input: CallInput & { schema: S },
): Promise<{ object: z.infer<S> }> {
  const { effort, ...rest } = request(input);
  const response = await anthropic().beta.messages.create({
    ...rest,
    output_config: { effort, format: betaZodOutputFormat(input.schema) },
  });
  assertFinished(response);
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Claude's answer was not valid JSON");
  }
  let parsed = input.schema.safeParse(data);
  if (!parsed.success) parsed = input.schema.safeParse(withinLimits(data, parsed.error.issues as Issue[]));
  if (!parsed.success) throw new Error(`Claude's answer did not match the expected shape: ${parsed.error.message.slice(0, 300)}`);
  return { object: parsed.data as z.infer<S> };
}

/** A plain-text answer. */
export async function generateText(input: CallInput): Promise<{ text: string }> {
  const { effort, ...rest } = request(input);
  const response = await anthropic().beta.messages.create({ ...rest, output_config: { effort } });
  assertFinished(response);
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { text };
}
