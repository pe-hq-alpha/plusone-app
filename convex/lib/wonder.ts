import { z } from "zod";
import { jsonSchemaFor, MALFORMED, MetaError, RETRYABLE, retryAfterMs } from "./meta";
import { ModelAnswerError } from "./modelShared";

/**
 * The vendor check for PlusOne Ops, on Muse Wonder through the Responses API: it searches the
 * web, reads the vendor's own pages and writes one finding per check, each with the sources
 * this run actually saw. It flags; a person in Ops decides.
 */

const BASE_URL = "https://api.meta.ai/v1";

/** What the vendor told us: public business facts only. */
export type VendorFacts = {
  name: string;
  categories: string[];
  city: string;
  website?: string;
  phone?: string;
  about?: string;
  offerings: { title: string; price: number; unit: string; currency: string }[];
};

export type Source = { title: string; url: string };

export type EvidenceCheck = {
  key: "identity" | "website" | "contact" | "location" | "prices" | "complaints";
  label: string;
  finding: "supports" | "concern" | "not_found";
  note: string;
  sources: Source[];
};

export type VerificationReport = { checks: EvidenceCheck[]; summary: string };

/** What a check has spent so far, reported after every turn so a run that fails part way is still costed. */
export type Spent = { model: string; inputTokens: number; outputTokens: number; searches: number; pagesRead: number; turns: number };

export type VerificationRun = Spent & { report: VerificationReport };

const sourceSchema = z.object({
  title: z.string(),
  url: z.string(),
});

const evidenceCheckSchema = z.object({
  key: z.enum(["identity", "website", "contact", "location", "prices", "complaints"]),
  label: z.string(),
  finding: z.enum(["supports", "concern", "not_found"]),
  note: z.string(),
  sources: z.array(sourceSchema),
});

const verificationReportSchema = z.object({
  checks: z.array(evidenceCheckSchema),
  summary: z.string(),
});

function wonderModel(env: Record<string, string | undefined> = process.env): string {
  const id = env.META_MODEL_AGENT ?? "muse-wonder-1.0";
  if (id.endsWith("-contributor")) throw new Error(`Refusing Contributor model ${id}: requests here hold personal data`);
  return id;
}

function vendorText(facts: VendorFacts): string {
  const lines: string[] = [];
  lines.push(`Vendor: ${facts.name}`);
  lines.push(`Categories: ${facts.categories.join(", ")}`);
  lines.push(`City: ${facts.city}`);
  if (facts.website) lines.push(`Website: ${facts.website}`);
  if (facts.phone) lines.push(`Phone: ${facts.phone}`);
  if (facts.about) lines.push(`About: ${facts.about}`);
  if (facts.offerings.length) {
    lines.push("Offerings:");
    for (const o of facts.offerings) {
      lines.push(`- ${o.title}: ${o.price} ${o.currency} per ${o.unit}`);
    }
  } else {
    lines.push("Offerings: none listed");
  }
  return lines.join("\n");
}

const CHECKS: { key: EvidenceCheck["key"]; label: string }[] = [
  { key: "identity", label: "The business exists" },
  { key: "website", label: "The website is theirs" },
  { key: "contact", label: "Their contact details" },
  { key: "location", label: "Where they work" },
  { key: "prices", label: "Their prices" },
  { key: "complaints", label: "Complaints" },
];

// Muse Wonder costs $4 in and $20 out per million tokens and a search $0.0025, and every
// turn re-reads the whole conversation, so one check gets a fixed budget.
const MAX_SEARCHES = 8;
const MAX_PAGES = 6;
const PAGE_CHARS = 12_000;
const ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 5_000;

const NOT_READ = "Could not read this page";
const OUT_OF_PAGES = "Not read: this check has read all the pages it may. Write the report from what you have.";
const OUT_OF_TURNS = "Not read: this check is out of turns.";
const WRITE_NOW = "Write the report now from what you have found, as JSON only, matching the required schema.";
const JSON_ONLY = "Give the report as JSON only, matching the required schema. No other text.";

const INSTRUCTIONS =
  "You check public business facts for PlusOne's team before a vendor is shown to customers (families and event managers). " +
  "Check six things, one EvidenceCheck each, in this order: " +
  "1) identity: the business exists under this name in this city; " +
  "2) website: the site is theirs and matches the name; " +
  "3) contact: the phone or email appears on their own pages or a business listing; " +
  "4) location: the area they serve is real and matches; " +
  "5) prices: their published prices, if any, match what they told us, within reason; " +
  "6) complaints: serious public complaints, fraud or closure reports. " +
  "Use only public business facts. Do not reveal personal data about individuals and do not guess. " +
  "Every claim needs a source URL you actually read or saw in search results. " +
  '"not_found" is a fine answer when nothing supports a check. You flag concerns; a person decides.';

/**
 * Everything a turn sends besides its input. It goes with every turn, since
 * previous_response_id carries the conversation but not the instructions, tools or format.
 */
function turnSettings(facts: VendorFacts, env: Record<string, string | undefined>, searchesLeft: number): Record<string, unknown> {
  return {
    model: wonderModel(env),
    instructions: INSTRUCTIONS,
    tools: [
      {
        type: "web_search",
        search_context_size: "medium",
        user_location: { type: "approximate", country: "IN", city: facts.city },
      },
      {
        type: "function",
        name: "read_page",
        description: "Read one public web page as text",
        parameters: {
          type: "object",
          properties: { url: { type: "string", description: "The URL to read" } },
          required: ["url"],
          additionalProperties: false,
        },
      },
    ],
    include: ["web_search_call.results"],
    reasoning: { effort: "medium" },
    // Built-in calls only; at least one, as a cap of zero may be refused.
    max_tool_calls: Math.max(1, searchesLeft),
    text: { format: { type: "json_schema", name: "verification_report", schema: jsonSchemaFor(verificationReportSchema), strict: true } },
  };
}

/**
 * The first Responses body for the check: six things to look into, one EvidenceCheck
 * each, with sources it actually read. It flags; a person decides.
 */
export function wonderBody(facts: VendorFacts, env: Record<string, string | undefined> = process.env): Record<string, unknown> {
  return { ...turnSettings(facts, env, MAX_SEARCHES), input: vendorText(facts) };
}

function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    // The same page cited with or without www, a trailing slash or a #section is one source.
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol.toLowerCase()}//${host}${path}${u.search}`;
  } catch {
    return null;
  }
}

function outputTextOf(json: unknown): string {
  if (typeof json !== "object" || json === null) return "";
  const out = (json as { output?: unknown }).output;
  if (typeof out === "string") return out;
  if (!Array.isArray(out)) {
    const t = (json as { output_text?: unknown }).output_text;
    return typeof t === "string" ? t : "";
  }
  const parts: string[] = [];
  for (const item of out) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === "output_text" && typeof p.text === "string") parts.push(p.text);
    }
  }
  return parts.join("");
}

function functionCallsOf(json: unknown): Call[] {
  if (typeof json !== "object" || json === null) return [];
  const out = (json as { output?: unknown }).output;
  if (!Array.isArray(out)) return [];
  const calls: Call[] = [];
  for (const item of out) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (o.type === "function_call" && typeof o.call_id === "string" && typeof o.name === "string" && typeof o.arguments === "string") {
      calls.push({ call_id: o.call_id, name: o.name, arguments: o.arguments });
    }
  }
  return calls;
}

function webSearchCallsOf(json: unknown): unknown[] {
  if (typeof json !== "object" || json === null) return [];
  const out = (json as { output?: unknown }).output;
  if (!Array.isArray(out)) return [];
  return out.filter((item) => typeof item === "object" && item !== null && (item as Record<string, unknown>).type === "web_search_call");
}

function seenUrlsFromResponse(json: unknown, into: Set<string>): void {
  if (typeof json !== "object" || json === null) return;
  const out = (json as { output?: unknown }).output;
  if (!Array.isArray(out)) return;
  for (const item of out) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (o.type === "web_search_call" && Array.isArray(o.results)) {
      for (const r of o.results as unknown[]) {
        if (typeof r === "object" && r !== null && typeof (r as Record<string, unknown>).url === "string") {
          const n = normalizeUrl((r as Record<string, unknown>).url as string);
          if (n) into.add(n);
        }
      }
    }
    if (o.type === "message" && Array.isArray(o.content)) {
      for (const part of o.content as unknown[]) {
        if (typeof part !== "object" || part === null) continue;
        const p = part as Record<string, unknown>;
        if (p.type === "output_text" && Array.isArray(p.annotations)) {
          for (const ann of p.annotations as unknown[]) {
            if (typeof ann === "object" && ann !== null && (ann as Record<string, unknown>).type === "url_citation" && typeof (ann as Record<string, unknown>).url === "string") {
              const n = normalizeUrl((ann as Record<string, unknown>).url as string);
              if (n) into.add(n);
            }
          }
        }
      }
    }
  }
}

function usageOf(json: unknown): { input: number; output: number } {
  if (typeof json !== "object" || json === null) return { input: 0, output: 0 };
  const usage = (json as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return { input: 0, output: 0 };
  const u = usage as Record<string, unknown>;
  const input = typeof u.input_tokens === "number" ? u.input_tokens : typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const output = typeof u.output_tokens === "number" ? u.output_tokens : typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  return { input, output };
}

type Call = { call_id: string; name: string; arguments: string };
type CallOutput = { type: "function_call_output"; call_id: string; output: string };

/** The report in our six checks, in order, whatever order or labels the model used. */
function inOrder(report: VerificationReport): VerificationReport {
  const checks = CHECKS.map(({ key, label }) => {
    const found = report.checks.find((c) => c.key === key);
    return found
      ? { ...found, label }
      : { key, label, finding: "not_found" as const, note: "Not covered in this run.", sources: [] };
  });
  return { checks, summary: report.summary };
}

/**
 * Run the check: search, read pages through `readPage`, and return the report with what it
 * cost. Every tool call the model makes is answered, since the API won't take a turn that
 * leaves one open.
 */
export async function verifyVendor(
  facts: VendorFacts,
  deps: {
    readPage: (url: string) => Promise<string>;
    fetchFn?: typeof fetch;
    env?: Record<string, string | undefined>;
    maxTurns?: number;
    sleep?: (ms: number) => Promise<void>;
    onTurn?: (spent: Spent) => void;
  },
): Promise<VerificationRun> {
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetchFn ?? fetch;
  const maxTurns = Math.max(1, deps.maxTurns ?? 6);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const model = wonderModel(env);

  const seen = new Set<string>();
  let searches = 0;
  let pagesRead = 0;
  let pagesAsked = 0;
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let previousId: string | null = null;

  async function post(body: Record<string, unknown>): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      let error: MetaError;
      try {
        const res = await fetchFn(`${env.META_BASE_URL ?? BASE_URL}/responses`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.MODEL_API_KEY}` },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          try {
            return await res.json();
          } catch {
            throw new ModelAnswerError("Muse Wonder's reply wasn't JSON.");
          }
        }
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        // A 504 means the turn was too big to finish in time; the same turn would time out again.
        error = new MetaError(
          `Muse Wonder returned ${res.status}: ${detail}`,
          res.status,
          RETRYABLE.has(res.status),
          !MALFORMED.has(res.status),
          retryAfterMs(res.headers.get("retry-after")),
        );
      } catch (thrown) {
        if (thrown instanceof ModelAnswerError) throw thrown;
        error = new MetaError(`Muse Wonder request failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`, null, true, true);
      }
      if (!error.retryable || attempt >= ATTEMPTS) throw error;
      const backoff = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(Math.min(error.retryAfterMs ?? backoff, MAX_RETRY_WAIT_MS));
    }
  }

  /** One turn: send, then count what came back. */
  async function turn(input: unknown): Promise<unknown> {
    const json = await post({
      ...turnSettings(facts, env, MAX_SEARCHES - searches),
      ...(previousId ? { previous_response_id: previousId } : {}),
      input,
    });
    turns++;
    const usage = usageOf(json);
    inputTokens += usage.input;
    outputTokens += usage.output;
    const id = (json as { id?: unknown }).id;
    if (typeof id === "string") previousId = id;
    searches += webSearchCallsOf(json).length;
    seenUrlsFromResponse(json, seen);
    deps.onTurn?.({ model, inputTokens, outputTokens, searches, pagesRead, turns });
    return json;
  }

  async function answer(call: Call): Promise<CallOutput> {
    const reply = (output: string): CallOutput => ({ type: "function_call_output", call_id: call.call_id, output });
    if (call.name !== "read_page") return reply(`There is no tool called ${call.name}.`);
    let url: unknown;
    try {
      url = (JSON.parse(call.arguments) as { url?: unknown }).url;
    } catch {
      return reply(NOT_READ);
    }
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return reply(NOT_READ);
    if (pagesAsked >= MAX_PAGES) return reply(OUT_OF_PAGES);
    pagesAsked++;
    const text = await deps.readPage(url).then((page) => page.slice(0, PAGE_CHARS), () => "");
    if (!text) return reply(NOT_READ);
    pagesRead++;
    // Only a page that was actually read can back a finding.
    const normalised = normalizeUrl(url);
    if (normalised) seen.add(normalised);
    return reply(text);
  }

  const closing = (calls: Call[], note: string): CallOutput[] =>
    calls.map((c) => ({ type: "function_call_output", call_id: c.call_id, output: note }));

  let json = await turn(vendorText(facts));
  for (;;) {
    const calls = functionCallsOf(json);
    if (calls.length === 0 || turns >= maxTurns) break;
    const outputs: CallOutput[] = [];
    for (const call of calls) outputs.push(await answer(call));
    // The last turn brings the pages it asked for and asks for the report.
    json = await turn(turns === maxTurns - 1 ? [...outputs, { role: "user", content: WRITE_NOW }] : outputs);
  }

  let report = parseReport(json);
  if (!report) {
    // One repair turn, closing any call still open so the API accepts it.
    json = await turn([...closing(functionCallsOf(json), OUT_OF_TURNS), { role: "user", content: JSON_ONLY }]);
    report = parseReport(json);
    if (!report) throw new ModelAnswerError("Muse Wonder's report didn't match the schema.");
  }

  // Never trust a URL the model typed: a source stays only if this run saw it.
  const checks = inOrder(report).checks.map((check) => {
    const sources = check.sources.filter((source) => {
      const n = normalizeUrl(source.url);
      return n !== null && seen.has(n);
    });
    if (sources.length === 0 && check.finding === "supports") {
      return { ...check, finding: "not_found" as const, sources, note: `No source from this run backed this, so it is marked not found. ${check.note}` };
    }
    return { ...check, sources };
  });

  return { report: { checks, summary: report.summary }, model, inputTokens, outputTokens, searches, pagesRead, turns };
}

function parseReport(json: unknown): VerificationReport | null {
  const text = outputTextOf(json).trim();
  if (!text) return null;
  try {
    const parsed = verificationReportSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
