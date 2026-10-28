import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MetaError } from "./meta";
import { ModelAnswerError } from "./modelShared";
import { verifyVendor, wonderBody } from "./wonder";
import type { VendorFacts } from "./wonder";

const env = { MODEL_API_KEY: "LLM_1_test" };

const facts: VendorFacts = {
  name: "Lakshmi Caterers",
  categories: ["Catering"],
  city: "Chennai",
  website: "https://lakshmi.example",
  phone: "9876543210",
  about: "Family caterers for weddings",
  offerings: [{ title: "Lunch", price: 400, unit: "per plate", currency: "INR" }],
};

function responseJson(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

function messageOutput(text: string, annotations: unknown[] = []) {
  return { type: "message", role: "assistant", content: [{ type: "output_text", text, annotations }] };
}

function functionCall(call_id: string, args: unknown) {
  return { type: "function_call", call_id, name: "read_page", arguments: JSON.stringify(args) };
}

function reportJson(): string {
  return JSON.stringify({
    checks: [
      { key: "identity", label: "Identity", finding: "supports", note: "Found name in city", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
      { key: "website", label: "Website", finding: "supports", note: "Site matches", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
      { key: "contact", label: "Contact", finding: "supports", note: "Phone seen", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
      { key: "location", label: "Location", finding: "supports", note: "Serves Chennai", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
      { key: "prices", label: "Prices", finding: "supports", note: "Prices match", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
      { key: "complaints", label: "Complaints", finding: "not_found", note: "No complaints", sources: [] },
    ],
    summary: "All checks look reasonable.",
  });
}

describe("the wonder request body", () => {
  it("uses muse-wonder-1.0, web_search with the city, read_page, include, text.format and max_tool_calls", () => {
    const body = wonderBody(facts, env);
    expect(body.model).toBe("muse-wonder-1.0");
    const tools = body.tools as { type: string; search_context_size?: string; user_location?: { city: string } }[];
    const web = tools.find((t) => t.type === "web_search");
    expect(web).toMatchObject({ search_context_size: "medium", user_location: { country: "IN", city: "Chennai" } });
    const fn = tools.find((t) => t.type === "function");
    expect(fn).toMatchObject({ name: "read_page" });
    expect(body.include).toEqual(["web_search_call.results"]);
    expect(body.reasoning).toEqual({ effort: "medium" });
    expect(body.max_tool_calls).toBe(8);
    const format = (body.text as { format: { type: string; schema: Record<string, unknown> } }).format;
    expect(format.type).toBe("json_schema");
    expect(format.schema).toBeDefined();
  });

  it("refuses a contributor id", () => {
    expect(() => wonderBody(facts, { META_MODEL_AGENT: "muse-wonder-1.0-contributor" })).toThrow(/Contributor/);
  });

  it("writes the facts as a labelled text block, not JSON", () => {
    const body = wonderBody(facts, env);
    const input = body.input as string;
    expect(input).toContain("Lakshmi Caterers");
    expect(input).toContain("Chennai");
    expect(input).not.toContain('"name"');
    expect(input).toContain("Lunch");
  });
});

describe("a wonder run", () => {
  it("runs two turns: search plus read_page, then the final JSON, summing tokens", async () => {
    const turn1 = {
      id: "resp_1",
      output: [
        { type: "web_search_call", id: "ws_1", status: "completed", results: [{ type: "text_result", title: "Lakshmi", url: "https://lakshmi.example", snippet: "caterers" }] },
        functionCall("call_1", { url: "https://lakshmi.example" }),
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const turn2 = {
      id: "resp_2",
      output: [messageOutput(reportJson())],
      usage: { input_tokens: 80, output_tokens: 120 },
    };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(turn1)).mockResolvedValueOnce(responseJson(turn2));
    const readPage = vi.fn(async (url: string) => `page text from ${url}`);

    const run = await verifyVendor(facts, { readPage, fetchFn: fetchFn as unknown as typeof fetch, env, maxTurns: 6 });

    expect(readPage).toHaveBeenCalledWith("https://lakshmi.example");
    // Second request carries previous_response_id and the function output
    const secondBody = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    expect(secondBody.previous_response_id).toBe("resp_1");
    const input = secondBody.input as { type: string; call_id: string }[];
    expect(input[0]).toMatchObject({ type: "function_call_output", call_id: "call_1" });
    expect(run.report.checks).toHaveLength(6);
    expect(run.searches).toBe(1);
    expect(run.pagesRead).toBe(1);
    expect(run.turns).toBe(2);
    expect(run.inputTokens).toBe(180);
    expect(run.outputTokens).toBe(170);
  });

  it("drops a source the model invented and turns supports with no sources into not_found", async () => {
    const turn = {
      id: "resp_1",
      output: [
        { type: "web_search_call", id: "ws_1", status: "completed", results: [{ type: "text_result", title: "Lakshmi", url: "https://lakshmi.example", snippet: "..." }] },
        messageOutput(
          JSON.stringify({
            checks: [
              { key: "identity", label: "Identity", finding: "supports", note: "Looks good", sources: [{ title: "Invented", url: "https://invented.example/bad" }] },
              { key: "website", label: "Website", finding: "supports", note: "Site matches", sources: [{ title: "Lakshmi", url: "https://lakshmi.example/" }] },
              { key: "contact", label: "Contact", finding: "not_found", note: "No phone", sources: [] },
              { key: "location", label: "Location", finding: "supports", note: "Chennai", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
              { key: "prices", label: "Prices", finding: "concern", note: "Price mismatch", sources: [{ title: "Bad", url: "https://invented.example/bad2" }] },
              { key: "complaints", label: "Complaints", finding: "not_found", note: "None", sources: [] },
            ],
            summary: "Summary",
          }),
        ),
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    };
    const fetchFn = vi.fn(async () => responseJson(turn));
    const run = await verifyVendor(facts, { readPage: async () => "text", fetchFn: fetchFn as unknown as typeof fetch, env });
    const identity = run.report.checks.find((c) => c.key === "identity")!;
    expect(identity.finding).toBe("not_found");
    expect(identity.sources).toEqual([]);
    expect(identity.note).toMatch(/No source/);
    const website = run.report.checks.find((c) => c.key === "website")!;
    // Trailing slash should be ignored, so this stays supports
    expect(website.finding).toBe("supports");
    expect(website.sources).toHaveLength(1);
    const prices = run.report.checks.find((c) => c.key === "prices")!;
    // concern with no valid sources keeps its finding but loses sources
    expect(prices.finding).toBe("concern");
    expect(prices.sources).toEqual([]);
  });

  it("repairs invalid JSON once, then succeeds; twice throws", async () => {
    const bad = {
      id: "resp_1",
      output: [messageOutput("not json")],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const good = {
      id: "resp_2",
      output: [messageOutput(reportJson())],
      usage: { input_tokens: 5, output_tokens: 5 },
    };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(bad)).mockResolvedValueOnce(responseJson(good));
    const run = await verifyVendor(facts, { readPage: async () => "x", fetchFn: fetchFn as unknown as typeof fetch, env });
    expect(run.report.checks).toHaveLength(6);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // Second call is the repair turn
    const repairBody = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    expect(repairBody.input.at(-1)).toMatchObject({ role: "user", content: expect.stringMatching(/JSON only/) });

    const fetchFn2 = vi.fn().mockResolvedValue(responseJson(bad));
    await expect(verifyVendor(facts, { readPage: async () => "x", fetchFn: fetchFn2 as unknown as typeof fetch, env })).rejects.toBeInstanceOf(ModelAnswerError);
  });

  it("stops at maxTurns", async () => {
    const turn1 = {
      id: "resp_1",
      output: [functionCall("call_1", { url: "https://lakshmi.example" })],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const turn2 = {
      id: "resp_2",
      output: [messageOutput(reportJson())],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(turn1)).mockResolvedValueOnce(responseJson(turn2));
    const run = await verifyVendor(facts, { readPage: async () => "page text", fetchFn: fetchFn as unknown as typeof fetch, env, maxTurns: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(run.turns).toBe(2);
    expect(run.pagesRead).toBe(1);
    expect(run.report.checks).toHaveLength(6);
  });

  it("cuts page text to 12,000 characters and handles read failures", async () => {
    const turn1 = {
      id: "resp_1",
      output: [functionCall("call_1", { url: "https://lakshmi.example" }), functionCall("call_2", { url: "https://bad.example" })],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const turn2 = {
      id: "resp_2",
      output: [messageOutput(reportJson())],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(turn1)).mockResolvedValueOnce(responseJson(turn2));
    const long = "a".repeat(20_000);
    const readPage = vi.fn(async (url: string) => {
      if (url.includes("bad")) throw new Error("fail");
      return long;
    });
    const run = await verifyVendor(facts, { readPage, fetchFn: fetchFn as unknown as typeof fetch, env });
    const secondBody = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    const outputs = secondBody.input as { output: string }[];
    expect(outputs[0].output.length).toBe(12_000);
    expect(outputs[1].output).toBe("Could not read this page");
    expect(run.pagesRead).toBe(1);
  });

  it("ignores non-http urls", async () => {
    const turn1 = {
      id: "resp_1",
      output: [functionCall("call_1", { url: "ftp://example.com/file" })],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const turn2 = {
      id: "resp_2",
      output: [messageOutput(reportJson())],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(turn1)).mockResolvedValueOnce(responseJson(turn2));
    const readPage = vi.fn(async () => "text");
    await verifyVendor(facts, { readPage, fetchFn: fetchFn as unknown as typeof fetch, env });
    expect(readPage).not.toHaveBeenCalled();
  });

  it("retries 429 and succeeds, marks 402 as fallback, 400 as malformed, and network failure as retryable", async () => {
    // 429 retried
    const okTurn = {
      id: "resp_ok",
      output: [messageOutput(reportJson())],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const fetch429 = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "0" } })).mockResolvedValueOnce(responseJson(okTurn));
    const run = await verifyVendor(facts, { readPage: async () => "x", fetchFn: fetch429 as unknown as typeof fetch, env });
    expect(run.turns).toBe(1);
    expect(fetch429).toHaveBeenCalledTimes(2);

    // 402 fallback true
    const fetch402 = vi.fn(async () => new Response("pay", { status: 402 }));
    await expect(verifyVendor(facts, { readPage: async () => "x", fetchFn: fetch402 as unknown as typeof fetch, env })).rejects.toMatchObject({ status: 402, fallback: true });

    // 400 malformed
    const fetch400 = vi.fn(async () => new Response("bad", { status: 400 }));
    await expect(verifyVendor(facts, { readPage: async () => "x", fetchFn: fetch400 as unknown as typeof fetch, env })).rejects.toMatchObject({ status: 400, fallback: false });

    // network failure retryable (3 attempts)
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(verifyVendor(facts, { readPage: async () => "x", fetchFn: down as unknown as typeof fetch, env, sleep: async () => {} })).rejects.toMatchObject({ status: null, retryable: true });
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("does not retry 504 unchanged", async () => {
    const fetch504 = vi.fn(async () => new Response("gateway", { status: 504 }));
    await expect(verifyVendor(facts, { readPage: async () => "x", fetchFn: fetch504 as unknown as typeof fetch, env })).rejects.toMatchObject({ status: 504, retryable: false });
    expect(fetch504).toHaveBeenCalledTimes(1);
  });

  it("counts citations and web results as seen urls, ignoring www and trailing slash", async () => {
    const turn = {
      id: "resp_1",
      output: [
        { type: "web_search_call", id: "ws_1", status: "completed", results: [{ type: "text_result", title: "Lakshmi", url: "https://www.lakshmi.example/", snippet: "x" }] },
        messageOutput(
          JSON.stringify({
            checks: [
              { key: "identity", label: "Identity", finding: "supports", note: "ok", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
              { key: "website", label: "Website", finding: "supports", note: "ok", sources: [{ title: "Lakshmi", url: "https://lakshmi.example#section" }] },
              { key: "contact", label: "Contact", finding: "supports", note: "ok", sources: [{ title: "Lakshmi", url: "https://lakshmi.example/" }] },
              { key: "location", label: "Location", finding: "supports", note: "ok", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
              { key: "prices", label: "Prices", finding: "supports", note: "ok", sources: [{ title: "Lakshmi", url: "https://lakshmi.example" }] },
              { key: "complaints", label: "Complaints", finding: "not_found", note: "none", sources: [] },
            ],
            summary: "Summary",
          }),
          [{ type: "url_citation", url: "https://lakshmi.example", title: "Lakshmi", start_index: 0, end_index: 10 }],
        ),
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    const fetchFn = vi.fn(async () => responseJson(turn));
    const run = await verifyVendor(facts, { readPage: async () => "x", fetchFn: fetchFn as unknown as typeof fetch, env });
    // All should remain supports because www/trailing slash/hash are ignored
    for (const c of run.report.checks.filter((c) => c.key !== "complaints")) {
      expect(c.finding).toBe("supports");
    }
  });

  it("sends the instructions, tools and format with every turn, and asks for the report on the last", async () => {
    const asks = { id: "resp_1", output: [functionCall("call_1", { url: "https://lakshmi.example" })], usage: { input_tokens: 1, output_tokens: 1 } };
    const done = { id: "resp_2", output: [messageOutput(reportJson())], usage: { input_tokens: 1, output_tokens: 1 } };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(asks)).mockResolvedValueOnce(responseJson(done));
    await verifyVendor(facts, { readPage: async () => "page", fetchFn: fetchFn as unknown as typeof fetch, env, maxTurns: 2 });
    const second = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    expect(second.instructions).toMatch(/six things/);
    expect(second.tools).toHaveLength(2);
    expect(second.text.format.type).toBe("json_schema");
    expect(second.input[0]).toMatchObject({ type: "function_call_output", call_id: "call_1", output: "page" });
    expect(second.input.at(-1)).toMatchObject({ role: "user", content: expect.stringMatching(/Write the report now/) });
  });

  it("closes calls still open before the repair turn, so the API accepts it", async () => {
    const asks = { id: "resp_1", output: [functionCall("call_9", { url: "https://lakshmi.example" })], usage: { input_tokens: 1, output_tokens: 1 } };
    const done = { id: "resp_2", output: [messageOutput(reportJson())], usage: { input_tokens: 1, output_tokens: 1 } };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(asks)).mockResolvedValueOnce(responseJson(done));
    const run = await verifyVendor(facts, { readPage: async () => "page", fetchFn: fetchFn as unknown as typeof fetch, env, maxTurns: 1 });
    const repair = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    expect(repair.input[0]).toMatchObject({ type: "function_call_output", call_id: "call_9" });
    expect(repair.input.at(-1).content).toMatch(/JSON only/);
    expect(run.turns).toBe(2);
  });

  it("reads at most 6 pages in a check and answers the rest without reading", async () => {
    const calls = Array.from({ length: 7 }, (_, i) => functionCall(`call_${i}`, { url: `https://lakshmi.example/p${i}` }));
    const asks = { id: "resp_1", output: calls, usage: { input_tokens: 1, output_tokens: 1 } };
    const done = { id: "resp_2", output: [messageOutput(reportJson())], usage: { input_tokens: 1, output_tokens: 1 } };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(asks)).mockResolvedValueOnce(responseJson(done));
    const readPage = vi.fn(async () => "page");
    const run = await verifyVendor(facts, { readPage, fetchFn: fetchFn as unknown as typeof fetch, env });
    expect(readPage).toHaveBeenCalledTimes(6);
    expect(run.pagesRead).toBe(6);
    const second = JSON.parse(fetchFn.mock.calls[1][1].body as string);
    expect(second.input[6].output).toMatch(/all the pages it may/);
  });

  it("a page that couldn't be read backs nothing, and the report comes back in our six checks, in order", async () => {
    const asks = { id: "resp_1", output: [functionCall("call_1", { url: "https://down.example" })], usage: { input_tokens: 1, output_tokens: 1 } };
    const done = {
      id: "resp_2",
      output: [
        messageOutput(
          JSON.stringify({
            checks: [
              { key: "complaints", label: "x", finding: "not_found", note: "None", sources: [] },
              { key: "identity", label: "y", finding: "supports", note: "Their page", sources: [{ title: "Down", url: "https://down.example" }] },
            ],
            summary: "Short",
          }),
        ),
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const fetchFn = vi.fn().mockResolvedValueOnce(responseJson(asks)).mockResolvedValueOnce(responseJson(done));
    const run = await verifyVendor(facts, {
      readPage: async () => {
        throw new Error("down");
      },
      fetchFn: fetchFn as unknown as typeof fetch,
      env,
    });
    expect(run.report.checks.map((c) => c.key)).toEqual(["identity", "website", "contact", "location", "prices", "complaints"]);
    expect(run.report.checks[0]).toMatchObject({ finding: "not_found", sources: [], label: "The business exists" });
    expect(run.report.checks[1]).toMatchObject({ finding: "not_found", note: "Not covered in this run." });
    expect(run.pagesRead).toBe(0);
  });
});
