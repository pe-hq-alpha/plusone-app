import { describe, expect, it, vi } from "vitest";
import { parseSamOutput, samBody, samSegment, type SamImage } from "./sam";

// A handwritten base85 mask is impractical, so the parser is stubbed and these
// tests cover our mapping around it: pairing, confidence and the RLE shape.
const { parserState } = vi.hoisted(() => ({ parserState: { records: [] as unknown[] } }));

vi.mock("@meta-sam/parser", () => ({
  formats: {
    segmentation: {
      image: () => ({
        createParser: () => ({
          push: (_chunk: string) => [],
          finish: () => ({ events: [], result: { records: parserState.records } }),
        }),
      }),
    },
  },
  recordsOfKind: (records: { kind: string }[], kind: string) => records.filter((r) => r.kind === kind),
  decodeMaskToRLE: (mask: { width: number; height: number }) => ({
    size: [mask.height, mask.width],
    counts: `rle:${mask.width}x${mask.height}`,
  }),
  decodeMaskToSVGPath: (mask: { width: number; height: number }) => `M0 0h${mask.width}v${mask.height}h-${mask.width}z`,
}));

const env = { MODEL_API_KEY: "LLM_1_test" };
const image: SamImage = { url: "https://venue.example/hall.jpg", width: 640, height: 480 };

const textOf = (body: Record<string, unknown>): string => {
  const input = body.input as { content: { type: string; text?: string }[] }[];
  return input[0].content.find((c) => c.type === "input_text")?.text ?? "";
};

const boxRecord = (objectId: string, confidence?: number) => ({
  kind: "box",
  objectId,
  left: 10,
  top: 20,
  right: 100,
  bottom: 200,
  ...(confidence === undefined ? {} : { confidence }),
});

const maskRecord = (objectId: string, confidence?: number) => ({
  kind: "mask",
  objectId,
  bounds: { left: 10, top: 20, right: 100, bottom: 200 },
  mask: { encoding: "one_bit", payload: "!", width: 8, height: 4 },
  ...(confidence === undefined ? {} : { confidence }),
});

const responsesReply = (text: string, init: ResponseInit = {}) =>
  new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

describe("the SAM request body", () => {
  it("sends a concept as plain words with confidence asked for", () => {
    const body = samBody({ concept: "stage" }, image);
    expect(textOf(body)).toBe("stage");
    expect(body).toMatchObject({ model: "sam-3.1", stream: false, metadata: { include_confidence: "true" } });
  });

  it("writes boxes and points in the reference syntax", () => {
    const body = samBody(
      {
        objects: [
          { id: 1, box: { x1: 10, y1: 20, x2: 100, y2: 200 } },
          {
            id: 2,
            points: [
              { x: 30, y: 40 },
              { x: 50, y: 60, negative: true },
            ],
          },
        ],
      },
      image,
    );
    expect(textOf(body)).toBe(
      "<0f>1<|box;x1=10;y1=20;x2=100;y2=200;w=640;h=480|>" +
        ",2<|point;x=30;y=40;w=640;h=480|>-<|point;x=50;y=60;w=640;h=480|>",
    );
  });

  it("asks for one-bit masks when told to", () => {
    const body = samBody({ concept: "flowers" }, image, { maskEncoding: "one_bit" });
    expect(body).toMatchObject({ metadata: { include_confidence: "true", mask_encoding: "one_bit" } });
  });

  it("refuses a concept together with objects", () => {
    const both = { concept: "stage", objects: [{ id: 1 }] } as unknown as { concept: string };
    expect(() => samBody(both, image)).toThrow(/never both/);
  });

  it("refuses several concepts in one call", () => {
    expect(() => samBody({ concept: "flowers, lights" }, image)).toThrow(/one concept per call/);
    expect(() => samBody({ concept: "chairs and tables" }, image)).toThrow(/one concept per call/);
  });
});

describe("a SAM reply", () => {
  it("posts to /responses with the key and returns typed segments", async () => {
    parserState.records = [boxRecord("1", 0.9), maskRecord("1", 0.9)];
    const fetchFn = vi.fn(async () => responsesReply("<0f>ignored"));
    try {
      const segments = await samSegment({ prompt: { concept: "stage" }, image }, env, fetchFn as unknown as typeof fetch);
      const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.meta.ai/v1/responses");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer LLM_1_test");
      expect(JSON.parse(init.body as string).model).toBe("sam-3.1");
      expect(segments).toEqual([
        {
          id: "1",
          box: { x1: 10, y1: 20, x2: 100, y2: 200 },
          size: { w: 640, h: 480 },
          confidence: 0.9,
          mask: { size: [4, 8], counts: "rle:8x4" },
          path: "M0 0h8v4h-8z",
        },
      ]);
    } finally {
      parserState.records = [];
    }
  });

  it("marks 429 as retryable, 402 as a fallback, and 400 as neither", async () => {
    const fail = (status: number) => async () => new Response("{}", { status });
    const rate = await samSegment({ prompt: { concept: "stage" }, image }, env, fail(429) as typeof fetch).catch((e) => e);
    expect(rate).toMatchObject({ status: 429, retryable: true, fallback: true });
    const billing = await samSegment({ prompt: { concept: "stage" }, image }, env, fail(402) as typeof fetch).catch((e) => e);
    expect(billing).toMatchObject({ status: 402, retryable: false, fallback: true });
    const bad = await samSegment({ prompt: { concept: "stage" }, image }, env, fail(400) as typeof fetch).catch((e) => e);
    expect(bad).toMatchObject({ status: 400, retryable: false, fallback: false });
  });

  it("treats a lost connection as retryable", async () => {
    const down = async () => {
      throw new TypeError("fetch failed");
    };
    const error = await samSegment({ prompt: { concept: "stage" }, image }, env, down as typeof fetch).catch((e) => e);
    expect(error).toMatchObject({ status: null, retryable: true, fallback: true });
  });

  it("drops records below the confidence floor and keeps unscored ones", () => {
    parserState.records = [boxRecord("1", 0.9), maskRecord("1", 0.9), boxRecord("2", 0.1), maskRecord("2", 0.1)];
    try {
      expect(parseSamOutput("<0f>ignored", image).map((s) => s.id)).toEqual(["1"]);
      expect(parseSamOutput("<0f>ignored", image, 0.05).map((s) => s.id)).toEqual(["1", "2"]);
    } finally {
      parserState.records = [];
    }
  });

  it("falls back to the box score when the mask carries none", () => {
    parserState.records = [boxRecord("3", 0.8), maskRecord("3")];
    try {
      expect(parseSamOutput("<0f>ignored", image)).toMatchObject([{ id: "3", confidence: 0.8 }]);
    } finally {
      parserState.records = [];
    }
  });

  it("reads no match as an empty array, not an error", () => {
    parserState.records = [];
    try {
      expect(parseSamOutput("", image)).toEqual([]);
    } finally {
      parserState.records = [];
    }
  });
});
