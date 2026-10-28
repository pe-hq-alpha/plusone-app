import { MALFORMED, MetaError, RETRYABLE, retryAfterMs } from "./meta";
import { ModelAnswerError } from "./modelShared";
import { wavInfo } from "./wav";

/**
 * Muse Voice Transcribe through POST /v1/asr/transcribe (Meta docs,
 * https://dev.meta.ai/docs/speech-to-text). The browser decodes WebM/MP4
 * and encodeWav supplies a mono 16-bit WAV; this module validates it,
 * posts it as multipart/form-data and reads the buffered JSON reply.
 */

const VOICE_MODEL = "muse-voice-transcribe-1.0";
const BASE_URL = "https://api.meta.ai/v1";

export type VoiceMode = "PUSH_TO_TALK" | "ENDPOINTING" | "DIARIZATION";

export type VoiceOptions = {
  mode?: VoiceMode;
  languageBias?: string[];
  keywords?: string[];
};

export type VoiceTurn = {
  text: string;
  start: number;
  end: number;
  speaker?: string;
};

export type VoiceResult = {
  text: string;
  turns: VoiceTurn[];
  seconds: number;
  model: string;
};

const VALID_MODES = new Set<string>(["PUSH_TO_TALK", "ENDPOINTING", "DIARIZATION"]);

function voiceRequestJson(options: VoiceOptions = {}): Record<string, unknown> {
  const mode = options.mode ?? "PUSH_TO_TALK";
  if (!VALID_MODES.has(mode)) throw new Error(`Unknown voice mode ${JSON.stringify(mode)}.`);
  const body: Record<string, unknown> = {
    model: VOICE_MODEL,
    audioEncoding: "WAV",
    mode,
  };
  if (options.languageBias !== undefined) {
    if (!Array.isArray(options.languageBias)) throw new Error("languageBias must be an array of language names.");
    if (options.languageBias.length > 0) body.languageBias = [...options.languageBias];
  }
  if (options.keywords !== undefined) {
    if (!Array.isArray(options.keywords)) throw new Error("keywords must be an array of strings.");
    if (options.keywords.length > 0) body.keywords = [...options.keywords];
  }
  return body;
}

/**
 * Build the multipart body for POST /v1/asr/transcribe. The WAV is checked
 * first so a file the API would reject never leaves the device.
 */
export function voiceForm(audio: Uint8Array, options: VoiceOptions = {}): FormData {
  wavInfo(audio);
  const requestJson = voiceRequestJson(options);
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(requestJson)], { type: "application/json" }));
  form.append("audio", new Blob([audio as unknown as BlobPart], { type: "audio/wav" }), "audio.wav");
  return form;
}

function parseTranscribeResponse(json: unknown): { text: string; turns: VoiceTurn[] } {
  if (typeof json !== "object" || json === null) {
    throw new ModelAnswerError("Voice reply was not an object.");
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.transcript !== "string") {
    throw new ModelAnswerError("Voice reply is missing its transcript.");
  }
  if (!Array.isArray(obj.turns)) {
    throw new ModelAnswerError("Voice reply is missing its turns.");
  }
  const turns: VoiceTurn[] = [];
  for (const t of obj.turns) {
    if (typeof t !== "object" || t === null) throw new ModelAnswerError("Voice reply has a malformed turn.");
    const turn = t as Record<string, unknown>;
    if (typeof turn.transcript !== "string") throw new ModelAnswerError("Voice reply has a malformed turn.");
    if (typeof turn.startMs !== "number" || typeof turn.endMs !== "number") {
      throw new ModelAnswerError("Voice reply has a malformed turn.");
    }
    const entry: VoiceTurn = {
      text: turn.transcript,
      start: turn.startMs / 1000,
      end: turn.endMs / 1000,
    };
    if (typeof turn.speaker === "string") entry.speaker = turn.speaker;
    turns.push(entry);
  }
  return { text: obj.transcript, turns };
}

/**
 * Transcribe a mono 16-bit WAV. Seconds are taken from the WAV header
 * itself, since billing is per second and the cost record needs it even
 * when the reply omits a duration. MetaError's `fallback` follows the other
 * adapters, but no other provider transcribes, so a caller retries or says so.
 */
export async function transcribe(
  audio: Uint8Array,
  options: VoiceOptions = {},
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<VoiceResult> {
  const info = wavInfo(audio);
  const seconds = info.seconds;
  const form = voiceForm(audio, options);

  let res: Response;
  try {
    res = await fetchFn(`${env.META_BASE_URL ?? BASE_URL}/asr/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MODEL_API_KEY}`,
      },
      body: form as unknown as BodyInit,
    });
  } catch (error) {
    throw new MetaError(`Voice request failed: ${error instanceof Error ? error.message : String(error)}`, null, true, true);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new MetaError(
      `Voice returned ${res.status}: ${detail}`,
      res.status,
      RETRYABLE.has(res.status),
      !MALFORMED.has(res.status),
      retryAfterMs(res.headers.get("retry-after")),
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ModelAnswerError("Voice reply wasn't JSON.");
  }
  const parsed = parseTranscribeResponse(json);
  return { text: parsed.text, turns: parsed.turns, seconds, model: VOICE_MODEL };
}
