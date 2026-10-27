import type { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { claudeComplete } from "./claude";
import { MetaError, metaComplete } from "./meta";
import { callRecord } from "./modelCost";
import { type Completion, type CompletionRequest, type Effort, type Message, ModelAnswerError, type Part, type Provider, type Tier } from "./modelShared";

export { ModelAnswerError, type Completion, type Effort, type Message, type Part, type Provider, type Tier };

/**
 * Every model call goes through here. `MODEL_PROVIDER` on the deployment picks Meta's
 * models or Claude; call sites only name a tier. Meta is used only when its key is set,
 * and a Meta call that fails for a reason Claude can cover falls back to Claude.
 */

/** Tiers: fast for extraction and short drafts, smart for judgement and longer writing. */
export const MODEL_FAST: Tier = "fast";
export const MODEL_SMART: Tier = "smart";

/** The output ceiling for a call that does not ask for less. Reasoning counts against it on Meta. */
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
  "- Write naturally, as the hosts' assistant. Don't bring up AI unprompted, but never deny it: if anyone asks " +
  "whether they are dealing with a person, a bot or AI, say plainly that you are PlusOne's AI assistant helping " +
  "the hosts, by name. Never claim or imply to be a person. Never name the model or company behind it.\n" +
  "- When a response format is given, follow it exactly.";

type CallInput = {
  /** Where the call's cost row is written; the action's own context. */
  ctx: Pick<ActionCtx, "runMutation">;
  /** What the call is for, as it appears in Admin's spend view, e.g. "planSearch". */
  feature: string;
  /** The event it is for, when there is one, so the event's "Under the hood" view can list it. */
  eventId?: Id<"events">;
  /** The tier, `MODEL_FAST` or `MODEL_SMART`. */
  model: Tier;
  maxOutputTokens?: number;
  /** Instructions on top of the house style. */
  system?: string;
  prompt?: string;
  messages?: Message[];
  effort?: Effort;
};

function toRequest(input: CallInput, schema?: z.ZodType): CompletionRequest {
  return {
    tier: input.model,
    system: input.system ? `${HOUSE_STYLE}\n\n${input.system}` : HOUSE_STYLE,
    messages: input.messages?.length ? input.messages : [{ role: "user", content: input.prompt ?? "" }],
    maxOutputTokens: input.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
    effort: input.effort ?? (input.model === "fast" ? "low" : "medium"),
    schema,
  };
}

let warnedNoKey = false;

/** Meta when the deployment asks for it and has a key; Claude otherwise. */
export function chosenProvider(env: Record<string, string | undefined> = process.env): Provider {
  if (env.MODEL_PROVIDER !== "meta") return "claude";
  if (env.MODEL_API_KEY) return "meta";
  if (!warnedNoKey) {
    console.warn("MODEL_PROVIDER is meta but MODEL_API_KEY is not set; using Claude.");
    warnedNoKey = true;
  }
  return "claude";
}

type Providers = {
  meta: (req: CompletionRequest) => Promise<Completion>;
  claude: (req: CompletionRequest) => Promise<Completion>;
  sleep: (ms: number) => Promise<void>;
};

const defaults: Providers = {
  meta: metaComplete,
  claude: claudeComplete,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Attempts per Meta call, counting the first. */
const META_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 20_000;

/**
 * Run a request on the chosen provider. Meta calls retry on 429, 500 and 503 (and lost
 * connections), waiting as long as Retry-After asks. When Meta can't answer for a reason
 * Claude can cover (key, billing, access, timeouts, retries used up), that one call goes
 * to Claude and the switch is logged. A request Meta rejects as malformed is not retried
 * or moved: it is a bug to fix, and Claude would hide it.
 */
export async function complete(
  req: CompletionRequest,
  provider: Provider = chosenProvider(),
  deps: Providers = defaults,
): Promise<Completion> {
  if (provider === "claude") return deps.claude(req);
  let lastError: unknown;
  for (let attempt = 1; attempt <= META_ATTEMPTS; attempt++) {
    try {
      return await deps.meta(req);
    } catch (error) {
      lastError = error;
      if (!(error instanceof MetaError)) throw error;
      if (error.retryable && attempt < META_ATTEMPTS) {
        const backoff = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
        await deps.sleep(Math.min(error.retryAfterMs ?? backoff, MAX_RETRY_WAIT_MS));
        continue;
      }
      if (!error.fallback) throw error;
      break;
    }
  }
  console.warn(`Meta call fell back to Claude: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  return deps.claude(req);
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

/** Parse a structured answer and validate it against `schema` (see `withinLimits`). */
export function parseAnswer<S extends z.ZodType>(text: string, schema: S): z.infer<S> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ModelAnswerError("The model's answer was not valid JSON");
  }
  let parsed = schema.safeParse(data);
  if (!parsed.success) parsed = schema.safeParse(withinLimits(data, parsed.error.issues as Issue[]));
  if (!parsed.success) {
    throw new ModelAnswerError(`The model's answer did not match the expected shape: ${parsed.error.message.slice(0, 300)}`);
  }
  return parsed.data as z.infer<S>;
}

type Served = Pick<Completion, "provider" | "model" | "usage">;

/**
 * Run the call and write its cost row. The row is written before the answer is parsed,
 * since an answer that fails validation was still paid for. A failed write is logged and
 * never fails the call.
 */
async function completeAndRecord(input: CallInput, req: CompletionRequest): Promise<Completion> {
  const chosen = chosenProvider();
  const started = Date.now();
  const completion = await complete(req, chosen);
  try {
    await input.ctx.runMutation(
      internal.modelCalls.record,
      callRecord(input.feature, chosen, completion, { eventId: input.eventId, durationMs: Date.now() - started }),
    );
  } catch (error) {
    console.warn(`Could not record the ${input.feature} model call: ${error instanceof Error ? error.message : String(error)}`);
  }
  return completion;
}

/** A structured answer, validated against `schema`. */
export async function generateObject<S extends z.ZodType>(
  input: CallInput & { schema: S },
): Promise<{ object: z.infer<S> } & Served> {
  const { text, ...served } = await completeAndRecord(input, toRequest(input, input.schema));
  return { object: parseAnswer(text, input.schema), ...served };
}

/** A plain-text answer. */
export async function generateText(input: CallInput): Promise<{ text: string } & Served> {
  return completeAndRecord(input, toRequest(input));
}
