import { describe, expect, it, vi } from "vitest";
import { ModelAnswerError } from "./modelShared";
import { transcribe, voiceForm } from "./voice";
import { encodeWav } from "./wav";

const env = { MODEL_API_KEY: "LLM_1_test" };

function wav(seconds = 0.05, sampleRate: 16_000 | 24_000 = 16_000): Uint8Array {
  const ch = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < ch.length; i++) ch[i] = Math.sin((2 * Math.PI * 200 * i) / sampleRate) * 0.3;
  return encodeWav([ch], sampleRate, sampleRate);
}

function voiceReply(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("voiceForm", () => {
  it("builds a multipart body with the request JSON and the WAV part", async () => {
    const audio = wav(0.05, 16_000);
    const form = voiceForm(audio, { mode: "DIARIZATION", languageBias: ["Tamil", "English"], keywords: ["homam"] });

    expect(form.has("request")).toBe(true);
    expect(form.has("audio")).toBe(true);

    const requestBlob = form.get("request") as Blob;
    const requestJson = JSON.parse(await requestBlob.text());
    expect(requestJson).toMatchObject({
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      mode: "DIARIZATION",
      languageBias: ["Tamil", "English"],
      keywords: ["homam"],
    });

    const audioBlob = form.get("audio") as Blob;
    expect(audioBlob.type).toBe("audio/wav");
  });

  it("defaults to PUSH_TO_TALK", async () => {
    const audio = wav();
    const form = voiceForm(audio, {});
    const blob = form.get("request") as Blob;
    const json = JSON.parse(await blob.text()) as Record<string, unknown>;
    expect(json.mode).toBe("PUSH_TO_TALK");
  });

  it("refuses a bad WAV before fetch is called", () => {
    const bad = new TextEncoder().encode("not wav");
    const fetchFn = vi.fn(async () => voiceReply({ transcript: "hi", audioDurationMs: 100, turns: [] }));
    expect(() => voiceForm(bad as unknown as Uint8Array)).toThrow(/Not a valid WAV/i);
    // transcribe would also refuse before calling fetch
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("transcribe", () => {
  it("parses transcript, turns and seconds with speaker labels", async () => {
    const audio = wav(0.1, 16_000);
    const fetchFn = vi.fn(async () =>
      voiceReply({
        sessionId: "s1",
        transcript: "Hello world",
        audioDurationMs: 100,
        turns: [
          { turnId: 1, startMs: 0, endMs: 50, transcript: "Hello", speaker: "A" },
          { turnId: 2, startMs: 60, endMs: 100, transcript: "world", speaker: "B" },
        ],
      }),
    );
    const result = await transcribe(audio, { mode: "DIARIZATION" }, env, fetchFn as unknown as typeof fetch);
    expect(result.text).toBe("Hello world");
    expect(result.turns).toEqual([
      { text: "Hello", start: 0, end: 0.05, speaker: "A" },
      { text: "world", start: 0.06, end: 0.1, speaker: "B" },
    ]);
    expect(result.seconds).toBeCloseTo(0.1, 2);
    expect(result.model).toBe("muse-voice-transcribe-1.0");
    // posts to the right URL without a Content-Type boundary override
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${env.MODEL_API_KEY}`);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("parses turns without speaker labels", async () => {
    const audio = wav(0.05);
    const fetchFn = async () =>
      voiceReply({
        sessionId: "s1",
        transcript: "Hi",
        audioDurationMs: 50,
        turns: [{ turnId: 1, startMs: 10, endMs: 40, transcript: "Hi" }],
      });
    const result = await transcribe(audio, { mode: "ENDPOINTING" }, env, fetchFn as typeof fetch);
    expect(result.turns).toEqual([{ text: "Hi", start: 0.01, end: 0.04 }]);
    expect(result.turns[0].speaker).toBeUndefined();
  });

  it("throws ModelAnswerError on an unexpected reply shape", async () => {
    const audio = wav();
    const fetchFn = async () => voiceReply({ nope: true });
    await expect(transcribe(audio, {}, env, fetchFn as typeof fetch)).rejects.toBeInstanceOf(ModelAnswerError);
  });

  it("throws ModelAnswerError when the reply isn't JSON", async () => {
    const fetchFn = async () => new Response("<html>gateway</html>", { status: 200 });
    await expect(transcribe(wav(), {}, env, fetchFn as typeof fetch)).rejects.toBeInstanceOf(ModelAnswerError);
  });

  it("marks 429 as retryable honouring Retry-After", async () => {
    const audio = wav();
    const fetchFn = async () => new Response("busy", { status: 429, headers: { "retry-after": "2" } });
    const error = await transcribe(audio, {}, env, fetchFn as typeof fetch).catch((e) => e);
    expect(error).toMatchObject({ status: 429, retryable: true, fallback: true, retryAfterMs: 2000 });
  });

  it("marks 402 as a fallback", async () => {
    const audio = wav();
    const fetchFn = async () => new Response("billing", { status: 402 });
    const error = await transcribe(audio, {}, env, fetchFn as typeof fetch).catch((e) => e);
    expect(error).toMatchObject({ status: 402, retryable: false, fallback: true });
  });

  it("marks 400 as malformed with no fallback", async () => {
    const audio = wav();
    const fetchFn = async () => new Response("bad", { status: 400 });
    const error = await transcribe(audio, {}, env, fetchFn as typeof fetch).catch((e) => e);
    expect(error).toMatchObject({ status: 400, retryable: false, fallback: false });
  });

  it("treats a lost connection as retryable", async () => {
    const audio = wav();
    const fetchFn = async () => {
      throw new TypeError("fetch failed");
    };
    const error = await transcribe(audio, {}, env, fetchFn as typeof fetch).catch((e) => e);
    expect(error).toMatchObject({ status: null, retryable: true, fallback: true });
  });
});
