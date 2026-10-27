import { decodeMaskToRLE, formats, recordsOfKind, type RLEObject } from "@meta-sam/parser";
import { MALFORMED, MetaError, RETRYABLE, retryAfterMs } from "./meta";

/**
 * SAM 3.1 through the Responses API (Meta's SAM docs, https://dev.meta.ai/docs/sam).
 * A call segments one image with either a single concept or up to 16
 * prompted objects, and the masks come back as special-token text that
 * @meta-sam/parser reads. Confidence is always requested and filtered here,
 * since the API has no threshold parameter of its own.
 */

const SAM_MODEL = "sam-3.1";
const BASE_URL = "https://api.meta.ai/v1";

/** The API tracks at most 16 prompted objects per frame. */
const MAX_OBJECTS = 16;

/** Records below this confidence are dropped when the caller names no floor. */
const DEFAULT_MIN_CONFIDENCE = 0.5;

/** An image SAM segments, with the displayed pixel size its prompts are given in. */
export type SamImage = { url: string; width: number; height: number };

/** A box in displayed pixels. */
export type SamBox = { x1: number; y1: number; x2: number; y2: number };

/** A point in displayed pixels; a negative point marks what the object is not. */
export type SamPoint = { x: number; y: number; negative?: boolean };

/** One thing to segment: at most one box and any number of points. */
export type SamObject = { id: number | string; box?: SamBox; points?: SamPoint[] };

/** What to segment: one concept or up to 16 objects, never both. */
export type SamPrompt = { concept: string } | { objects: SamObject[] };

export type SamOptions = {
  /** Smaller masks; the wire default is lossless. */
  maskEncoding?: "one_bit";
  /** Records below this confidence are dropped; defaults to 0.5. */
  minConfidence?: number;
};

/** What a call is asked for: the prompt, the image and the options. */
export type SamRequest = { prompt: SamPrompt; image: SamImage; options?: SamOptions };

/** One segmented object: its box, the pixel space it is in, and its mask as COCO RLE. */
export type SamSegment = {
  id: string;
  box: { x1: number; y1: number; x2: number; y2: number };
  size: { w: number; h: number };
  /** Absent when the API sent no score; absence never counts as zero. */
  confidence: number | undefined;
  mask: RLEObject;
};

/** A coordinate in displayed pixels; preview taps must be scaled up to the image first. */
function pixel(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} is a non-negative integer in displayed pixels.`);
  }
  return value;
}

function imageSize(image: SamImage): { w: number; h: number } {
  const w = pixel(image.width, "width");
  const h = pixel(image.height, "height");
  if (w === 0 || h === 0) throw new Error("The image needs a positive displayed size for its prompts.");
  return { w, h };
}

function imageUrl(url: unknown): string {
  if (typeof url !== "string" || !(url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:image/"))) {
    throw new Error("The SAM image is a public URL or a base64 image data URL.");
  }
  return url;
}

/** A comma, semicolon, "and" or "or" joins concepts SAM would only read as one. */
const MULTI_CONCEPT = /[,;]|\s+(and|or)\s+|&/i;

function conceptText(concept: unknown): string {
  if (typeof concept !== "string" || concept.trim().length === 0) {
    throw new Error('A concept prompt is one short noun phrase, such as "stage".');
  }
  if (MULTI_CONCEPT.test(concept)) {
    throw new Error(`SAM takes one concept per call, so split ${JSON.stringify(concept)} into one call each.`);
  }
  return concept;
}

/** Ids are ours; the response reports each object back under its id. */
function objectId(id: unknown): string {
  if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) return String(id);
  if (typeof id === "string" && /^(0|[1-9][0-9]*)$/.test(id)) return id;
  throw new Error(`An object id is a non-negative integer for SAM to report back under; got ${JSON.stringify(id)}.`);
}

function boxToken(box: SamBox, w: number, h: number): string {
  const x1 = pixel(box?.x1, "x1");
  const y1 = pixel(box?.y1, "y1");
  const x2 = pixel(box?.x2, "x2");
  const y2 = pixel(box?.y2, "y2");
  if (x1 > x2 || y1 > y2) throw new Error("A box needs x1 <= x2 and y1 <= y2.");
  // The upper bound is lenient: the API owns range checks, this only catches taps
  // that were never scaled up to the image.
  if (x2 > w || y2 > h) throw new Error("Prompt coordinates are in displayed pixels; scale preview taps up to the image first.");
  return `<|box;x1=${x1};y1=${y1};x2=${x2};y2=${y2};w=${w};h=${h}|>`;
}

function pointToken(point: SamPoint, w: number, h: number): string {
  const x = pixel(point?.x, "x");
  const y = pixel(point?.y, "y");
  if (x > w || y > h) throw new Error("Prompt coordinates are in displayed pixels; scale preview taps up to the image first.");
  return `${point?.negative ? "-" : ""}<|point;x=${x};y=${y};w=${w};h=${h}|>`;
}

function objectText(object: SamObject, w: number, h: number, seen: Set<string>): string {
  const id = objectId(object?.id);
  if (seen.has(id)) throw new Error(`Object ${id} is listed twice; give each object once.`);
  seen.add(id);
  const tokens = [...(object?.box === undefined ? [] : [boxToken(object.box, w, h)]), ...(object?.points ?? []).map((p) => pointToken(p, w, h))];
  if (tokens.length === 0) throw new Error(`Object ${id} has neither a box nor points.`);
  return `${id}${tokens.join("")}`;
}

function objectsText(objects: unknown, w: number, h: number): string {
  if (!Array.isArray(objects) || objects.length === 0) throw new Error("An objects prompt names at least one object.");
  if (objects.length > MAX_OBJECTS) throw new Error(`SAM tracks at most ${MAX_OBJECTS} objects per call; got ${objects.length}.`);
  const seen = new Set<string>();
  // An image is frame zero; every object prompt carries its own id.
  return `<0f>${objects.map((o) => objectText(o as SamObject, w, h, seen)).join(",")}`;
}

/** The Responses body for a SAM call. */
export function samBody(prompt: SamPrompt, image: SamImage, options: SamOptions = {}): Record<string, unknown> {
  const { w, h } = imageSize(image);
  const shaped = prompt as { concept?: unknown; objects?: unknown };
  let text: string;
  if (shaped.concept !== undefined && shaped.objects !== undefined) {
    throw new Error("A SAM call takes either a concept or objects, never both.");
  } else if (shaped.concept !== undefined) {
    text = conceptText(shaped.concept);
  } else if (shaped.objects !== undefined) {
    text = objectsText(shaped.objects, w, h);
  } else {
    throw new Error("A SAM call takes either a concept or objects, never both.");
  }
  if (options.maskEncoding !== undefined && options.maskEncoding !== "one_bit") {
    throw new Error('The only mask encoding on offer is "one_bit".');
  }
  return {
    model: SAM_MODEL,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text },
          { type: "input_image", image_url: imageUrl(image.url) },
        ],
      },
    ],
    stream: false,
    // Confidence arrives as strings on the wire, so the API wants the string "true".
    metadata: {
      include_confidence: "true",
      ...(options.maskEncoding === "one_bit" ? { mask_encoding: "one_bit" } : {}),
    },
  };
}

/** The segmentation text of a non-streamed Responses reply. */
function outputTextOf(json: unknown): string {
  if (typeof json !== "object" || json === null) return "";
  const output = (json as { output?: unknown }).output;
  if (typeof output === "string") return output;
  if (!Array.isArray(output)) {
    const text = (json as { output_text?: unknown }).output_text;
    return typeof text === "string" ? text : "";
  }
  const parts: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const text = part as { type?: unknown; text?: unknown };
      if (text.type === "output_text" && typeof text.text === "string") parts.push(text.text);
    }
  }
  return parts.join("");
}

/**
 * Read segmentation text into typed records. Malformed lines carry no usable
 * record and read as no match; use samSegment for the whole call.
 */
export function parseSamOutput(text: string, image: SamImage, minConfidence: number = DEFAULT_MIN_CONFIDENCE): SamSegment[] {
  if (typeof text !== "string" || text.length === 0) return [];
  if (!(minConfidence >= 0 && minConfidence <= 1)) throw new Error("The confidence floor is a number from 0 to 1.");
  const { w, h } = imageSize(image);
  const parsing = formats.segmentation.image().createParser();
  parsing.push(text);
  const { result } = parsing.finish({ status: "completed" });
  const boxes = recordsOfKind(result.records, "box");
  const segments: SamSegment[] = [];
  for (const mask of recordsOfKind(result.records, "mask")) {
    const box = boxes.find((b) => b.objectId === mask.objectId);
    const confidence = mask.confidence ?? box?.confidence;
    // The API omits the score rather than sending zero, so an unscored record
    // is kept and only a score below the floor is dropped.
    if (confidence !== undefined && confidence < minConfidence) continue;
    const bounds = box ?? mask.bounds;
    segments.push({
      id: mask.objectId,
      box: { x1: bounds.left, y1: bounds.top, x2: bounds.right, y2: bounds.bottom },
      size: { w, h },
      confidence,
      mask: decodeMaskToRLE(mask.mask),
    });
  }
  return segments;
}

/**
 * Segment one image: post the body, read the output text and parse it. Errors
 * classify like metaComplete: 429, 500, 503 and lost connections may be
 * retried, malformed requests must be fixed, and the rest may fall back.
 */
export async function samSegment(
  request: SamRequest,
  env: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<SamSegment[]> {
  const body = samBody(request.prompt, request.image, request.options);
  let res: Response;
  try {
    res = await fetchFn(`${env.META_BASE_URL ?? BASE_URL}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.MODEL_API_KEY}` },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new MetaError(`SAM request failed: ${error instanceof Error ? error.message : String(error)}`, null, true, true);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new MetaError(
      `SAM returned ${res.status}: ${detail}`,
      res.status,
      RETRYABLE.has(res.status),
      !MALFORMED.has(res.status),
      retryAfterMs(res.headers.get("retry-after")),
    );
  }
  return parseSamOutput(outputTextOf(await res.json()), request.image, request.options?.minConfidence);
}
