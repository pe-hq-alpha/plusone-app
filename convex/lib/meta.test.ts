import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MetaError, metaBody, metaComplete, metaModel } from "./meta";
import { callRecord } from "./modelCost";
import { chosenProvider, complete, type Completion, ModelAnswerError } from "./models";
import { SPARK_OPEN_MODEL, sparkOpenComplete } from "./sparkOpen";
import type { CompletionRequest } from "./modelShared";

const env = { MODEL_API_KEY: "LLM_1_test" };

const request = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  tier: "fast",
  system: "HOUSE STYLE",
  messages: [{ role: "user", content: "Hello" }],
  maxOutputTokens: 4000,
  effort: "low",
  ...over,
});

const reply = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });

const answer = (content: string, finish = "stop") => ({
  model: "muse-spark-1.3",
  choices: [{ finish_reason: finish, message: { content } }],
  usage: { prompt_tokens: 120, completion_tokens: 45 },
});

describe("the Meta request", () => {
  it("uses Muse Spark Standard for both tiers and refuses Contributor ids", () => {
    expect(metaModel("fast", {})).toBe("muse-spark-1.3");
    expect(metaModel("smart", { META_MODEL_SMART: "muse-wonder-1.0" })).toBe("muse-wonder-1.0");
    expect(() => metaModel("fast", { META_MODEL_FAST: "muse-spark-1.3-contributor" })).toThrow(/Contributor/);
  });

  it("puts the house style first and carries the effort and output ceiling", async () => {
    const body = await metaBody(request({ effort: "medium", tier: "smart" }), env);
    expect(body).toMatchObject({
      model: "muse-spark-1.3",
      max_tokens: 4000,
      reasoning_effort: "medium",
      messages: [{ role: "system", content: "HOUSE STYLE" }, { role: "user", content: "Hello" }],
    });
    expect(body.response_format).toBeUndefined();
  });

  it("asks for the schema's JSON shape without the $schema key", async () => {
    const schema = z.object({ name: z.string(), tasks: z.array(z.string()).max(3), note: z.string().optional() });
    const body = await metaBody(request({ schema }), env);
    const format = body.response_format as { type: string; json_schema: { name: string; schema: Record<string, unknown> } };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.schema.$schema).toBeUndefined();
    expect(format.json_schema.schema).toMatchObject({
      type: "object",
      required: ["name", "tasks"],
      properties: { tasks: { type: "array", maxItems: 3 } },
    });
  });

  it("sends images as data URLs and PDFs as file blocks, ahead of the text", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const fetchPdf = vi.fn(async () => new Response(pdf));
    const body = await metaBody(
      request({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Read these" },
              { type: "file", data: new Uint8Array([1, 2, 3]), mediaType: "image/png" },
              { type: "file", data: new URL("https://files.example/quote.pdf"), mediaType: "application/pdf", filename: "quote.pdf" },
            ],
          },
        ],
      }),
      env,
      fetchPdf as unknown as typeof fetch,
    );
    const content = (body.messages as { content: unknown[] }[])[1].content;
    expect(content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
      { type: "file", file: { filename: "quote.pdf", file_data: "data:application/pdf;base64,JVBERg==" } },
      { type: "text", text: "Read these" },
    ]);
    expect(fetchPdf).toHaveBeenCalledOnce();
  });

  it("rejects attachments Muse Spark can't read", async () => {
    const req = request({ messages: [{ role: "user", content: [{ type: "file", data: new Uint8Array([1]), mediaType: "text/csv" }] }] });
    await expect(metaBody(req, env)).rejects.toThrow(/text\/csv/);
  });
});

describe("a Meta reply", () => {
  it("returns the text, model and token counts", async () => {
    const fetchFn = vi.fn(async () => reply(answer("Done.")));
    const result = await metaComplete(request(), env, fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ text: "Done.", provider: "meta", model: "muse-spark-1.3", usage: { inputTokens: 120, outputTokens: 45 } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.meta.ai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer LLM_1_test");
  });

  it("treats a cut-off answer as an error, not half an answer", async () => {
    const fetchFn = async () => reply(answer('{"name": "Ra', "length"));
    await expect(metaComplete(request(), env, fetchFn as typeof fetch)).rejects.toBeInstanceOf(ModelAnswerError);
  });

  it("marks 429 as retryable with its Retry-After, 402 as a fallback, and 400 as neither", async () => {
    const fail = (status: number, headers: Record<string, string> = {}) => async () =>
      new Response("{}", { status, headers });
    const rate = await metaComplete(request(), env, fail(429, { "retry-after": "3" }) as typeof fetch).catch((e) => e);
    expect(rate).toMatchObject({ status: 429, retryable: true, fallback: true, retryAfterMs: 3000 });
    const billing = await metaComplete(request(), env, fail(402) as typeof fetch).catch((e) => e);
    expect(billing).toMatchObject({ status: 402, retryable: false, fallback: true });
    const bad = await metaComplete(request(), env, fail(400) as typeof fetch).catch((e) => e);
    expect(bad).toMatchObject({ status: 400, retryable: false, fallback: false });
  });
});

describe("Muse Spark Open on Baseten", () => {
  it("sends the hackathon model id to Baseten with Baseten's key, not Meta's", async () => {
    const fetchFn = vi.fn(async () => reply({ ...answer("{}"), model: SPARK_OPEN_MODEL }));
    await sparkOpenComplete(request(), { BASETEN_API_KEY: "bt_test", MODEL_API_KEY: "LLM_1_test" }, fetchFn as unknown as typeof fetch);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://inference.baseten.co/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer bt_test");
    expect(JSON.parse(init.body as string).model).toBe("meta-models/muse-spark-open-1026");
  });

  it("returns only the answer, never the reasoning Baseten sends beside it", async () => {
    const body = {
      model: SPARK_OPEN_MODEL,
      choices: [{ finish_reason: "stop", message: { reasoning_content: "Let me think about plates.", content: '{"ok":true}' } }],
      usage: { prompt_tokens: 50, completion_tokens: 300 },
    };
    const fetchFn = vi.fn(async () => reply(body));
    const result = await sparkOpenComplete(request(), { BASETEN_API_KEY: "bt_test" }, fetchFn as unknown as typeof fetch);
    expect(result).toMatchObject({ text: '{"ok":true}', provider: "spark_open", usage: { inputTokens: 50, outputTokens: 300 } });
  });

  it("is priced at Baseten's rate, and a call Muse Spark had to take counts as a fallback", () => {
    const served: Completion = { text: "", provider: "meta", model: "muse-spark-1.3", usage: { inputTokens: 1_000_000, outputTokens: 0 } };
    expect(callRecord("priceUnits", "spark_open", served).fellBack).toBe(true);
    expect(callRecord("priceUnits", "spark_open", { ...served, provider: "spark_open", model: SPARK_OPEN_MODEL })).toMatchObject({ fellBack: false, costUsd: 1.25 });
  });
});

describe("choosing and falling back", () => {
  const ok = (provider: "meta" | "claude" | "spark_open"): Completion => ({
    text: "ok",
    provider,
    model: provider === "meta" ? "muse-spark-1.3" : provider === "spark_open" ? SPARK_OPEN_MODEL : "claude-haiku-5-5",
    usage: { inputTokens: 1, outputTokens: 1 },
  });

  it("moves a Spark Open call to Muse Spark when Baseten is down, not straight to Claude", async () => {
    const sparkOpen = vi.fn().mockRejectedValue(new MetaError("Baseten returned 503", 503, true, true));
    const meta = vi.fn(async () => ok("meta"));
    const claude = vi.fn();
    const result = await complete(request(), "spark_open", { meta, claude, sparkOpen, sleep: async () => {} }, "meta");
    expect(sparkOpen).toHaveBeenCalledTimes(3);
    expect(result.provider).toBe("meta");
    expect(claude).not.toHaveBeenCalled();
  });

  it("surfaces a Spark Open request Baseten finds malformed", async () => {
    const sparkOpen = vi.fn().mockRejectedValue(new MetaError("bad schema", 400, false, false));
    const meta = vi.fn();
    await expect(complete(request(), "spark_open", { meta, claude: vi.fn(), sparkOpen, sleep: async () => {} }, "meta")).rejects.toThrow("bad schema");
    expect(meta).not.toHaveBeenCalled();
  });

  it("uses Meta only when asked for and its key is set", () => {
    // Meta is the default: a key is all it needs; Claude only when asked for, or with no Meta key.
    expect(chosenProvider({ MODEL_API_KEY: "LLM_1_x" })).toBe("meta");
    expect(chosenProvider({ MODEL_PROVIDER: "meta", MODEL_API_KEY: "LLM_1_x" })).toBe("meta");
    expect(chosenProvider({ MODEL_PROVIDER: "claude", MODEL_API_KEY: "LLM_1_x" })).toBe("claude");
    expect(chosenProvider({ MODEL_PROVIDER: "meta" })).toBe("claude");
    expect(chosenProvider({})).toBe("claude");
  });

  it("retries a rate limit, waiting as asked, then succeeds on Meta", async () => {
    const meta = vi
      .fn()
      .mockRejectedValueOnce(new MetaError("busy", 429, true, true, 5000))
      .mockResolvedValueOnce(ok("meta"));
    const claude = vi.fn();
    const sleep = vi.fn(async () => {});
    const result = await complete(request(), "meta", { meta, claude, sleep });
    expect(result.provider).toBe("meta");
    expect(sleep).toHaveBeenCalledWith(5000);
    expect(claude).not.toHaveBeenCalled();
  });

  it("moves the call to Claude after three failed attempts", async () => {
    const meta = vi.fn().mockRejectedValue(new MetaError("down", 503, true, true));
    const claude = vi.fn(async () => ok("claude"));
    const result = await complete(request(), "meta", { meta, claude, sleep: async () => {} });
    expect(meta).toHaveBeenCalledTimes(3);
    expect(result.provider).toBe("claude");
  });

  it("moves to Claude straight away when billing or the key fails", async () => {
    const meta = vi.fn().mockRejectedValue(new MetaError("no credit", 402, false, true));
    const claude = vi.fn(async () => ok("claude"));
    const result = await complete(request(), "meta", { meta, claude, sleep: async () => {} });
    expect(meta).toHaveBeenCalledOnce();
    expect(result.provider).toBe("claude");
  });

  it("surfaces a malformed request instead of hiding it behind Claude", async () => {
    const meta = vi.fn().mockRejectedValue(new MetaError("bad schema", 400, false, false));
    const claude = vi.fn();
    await expect(complete(request(), "meta", { meta, claude, sleep: async () => {} })).rejects.toThrow("bad schema");
    expect(claude).not.toHaveBeenCalled();
  });

  it("never touches Meta when Claude is chosen", async () => {
    const meta = vi.fn();
    const claude = vi.fn(async () => ok("claude"));
    await complete(request(), "claude", { meta, claude, sleep: async () => {} });
    expect(meta).not.toHaveBeenCalled();
  });
});
