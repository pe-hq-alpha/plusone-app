import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { extractJsonText, GLIMMER_DEADLINE_MS, glimmerBody, glimmerComplete } from "./glimmer";
import { MetaError } from "./meta";
import { parseAnswer } from "./models";

const env = { GLIMMER_BASE_URL: "https://glimmer.test", MODAL_PROXY_TOKEN: "wk-abc.ws-xyz", GLIMMER_MODEL: "inference-1" };

const schema = z.object({ realWork: z.boolean(), shows: z.string(), tags: z.array(z.string()) });

const image = { data: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), mediaType: "image/jpeg" };

const answer = (content: string) =>
  Response.json({
    model: "inference-1",
    choices: [{ finish_reason: "stop", message: { content, reasoning_content: "long thought" } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  });

describe("the Glimmer request", () => {
  it("puts the image before the text, with the reasoning line, sampling and response format", () => {
    const body = glimmerBody({ images: [image], prompt: "Tag this photo.", schema }, env);
    expect(body).toMatchObject({
      model: "inference-1",
      max_tokens: 4000,
      temperature: 1.0,
      top_p: 0.95,
      top_k: 64,
      response_format: { type: "json_schema", json_schema: { name: "photo" } },
    });
    const messages = body.messages as { role: string; content: unknown }[];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Reasoning strength: low");
    const content = messages[1].content as { type: string }[];
    expect(content[0].type).toBe("image_url");
    expect(content[1]).toEqual({ type: "text", text: "Tag this photo." });
  });
});

describe("a Glimmer reply", () => {
  it("reads only the content, cutting the JSON out of a fence past the reasoning", async () => {
    const json = JSON.stringify({ realWork: true, shows: "A banana-leaf lunch.", tags: ["banana-leaf-service"] });
    const fetchFn = vi.fn(async () => answer(`This looks like event work.\n\`\`\`json\n${json}\n\`\`\``));
    const result = await glimmerComplete({ images: [image], prompt: "Tag this photo.", schema }, env, fetchFn as typeof fetch);
    expect(result.model).toBe("inference-1");
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(typeof result.ms).toBe("number");
    expect(parseAnswer(extractJsonText(result.text), schema)).toEqual({
      realWork: true,
      shows: "A banana-leaf lunch.",
      tags: ["banana-leaf-service"],
    });
  });

  it("retries a 503 while the GPU starts, then succeeds", async () => {
    const json = JSON.stringify({ realWork: true, shows: "A stage.", tags: [] });
    // First the endpoint answers 503, then it answers.
    const fetchFn = vi.fn(async () => answer(json));
    fetchFn.mockResolvedValueOnce(new Response("starting", { status: 503 }));
    const wait = vi.fn(async () => {});
    const result = await glimmerComplete({ images: [image], prompt: "Tag this photo.", schema }, env, fetchFn as typeof fetch, wait);
    expect(parseAnswer(extractJsonText(result.text), schema).shows).toBe("A stage.");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(5000);
  });

  it("marks a 400 as malformed, with no fallback", async () => {
    const fetchFn = async () => new Response("bad schema", { status: 400 });
    const error = await glimmerComplete({ images: [image], prompt: "Tag this photo.", schema }, env, fetchFn as typeof fetch).catch((e) => e);
    expect(error).toBeInstanceOf(MetaError);
    expect(error).toMatchObject({ status: 400, retryable: false, fallback: false });
  });
});

describe("a request that never goes out", () => {
  it("needs its endpoint and token, naming which is missing", async () => {
    const fetchFn = vi.fn(async () => answer("{}"));
    await expect(glimmerComplete({ images: [image], prompt: "x", schema }, {}, fetchFn as typeof fetch)).rejects.toThrow(/GLIMMER_BASE_URL/);
    await expect(
      glimmerComplete({ images: [image], prompt: "x", schema }, { GLIMMER_BASE_URL: "https://glimmer.test" }, fetchFn as typeof fetch),
    ).rejects.toThrow(/MODAL_PROXY_TOKEN/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a GIF before any request", async () => {
    const fetchFn = vi.fn(async () => answer("{}"));
    await expect(
      glimmerComplete({ images: [{ data: new Uint8Array([1, 2]), mediaType: "image/gif" }], prompt: "x", schema }, env, fetchFn as typeof fetch),
    ).rejects.toThrow(/gif/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("a cold start that never ends", () => {
  it("gives up once the deadline has passed, as a failure Muse Spark can take over", async () => {
    let clock = 1_000_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
    // Each 503 asks for three minutes, so the second wait would pass the seven-minute deadline.
    const fetchFn = vi.fn(async () => new Response("starting", { status: 503, headers: { "retry-after": "180" } }));
    const wait = vi.fn(async (ms: number) => {
      clock += ms;
    });
    try {
      const error = await glimmerComplete({ images: [image], prompt: "Tag it.", schema }, env, fetchFn as unknown as typeof fetch, wait).catch((e) => e);
      expect(error).toBeInstanceOf(MetaError);
      expect(error).toMatchObject({ retryable: true, fallback: true });
      expect(fetchFn.mock.calls.length).toBeLessThan(5);
      expect(clock - 1_000_000).toBeLessThan(GLIMMER_DEADLINE_MS);
    } finally {
      now.mockRestore();
    }
  });
});
