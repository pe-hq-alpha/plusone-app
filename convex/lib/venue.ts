import { z } from "zod";
import type { SamBox, SamObject, SamSegment } from "./sam";

/**
 * "See it on your venue": Muse Spark finds the stage and the wall behind it in a hall
 * photo, SAM 3.1 cuts both out, and the app dresses them in a look. Muse Image can't be
 * used from India (Meta Geographic Use Policy), so the dressing is our own drawing on the
 * masks, never a generated picture. The rules here are pure and tested.
 */

/** The parts of a hall the look dresses: the wall behind the stage, and the stage itself. */
export const VENUE_PARTS = ["backdrop", "stage"] as const;
export type VenuePart = (typeof VENUE_PARTS)[number];

/** SAM reports each object back under a numeric id. */
export const PART_IDS: Record<VenuePart, number> = { backdrop: 1, stage: 2 };

/** The sample hall a family or a judge can try it on: our own generated photo, labelled as a sample. */
export const SAMPLE_HALL = {
  key: "sample-hall",
  url: "https://plusoneevents.site/photos/sample-hall.jpg",
  width: 1600,
  height: 1200,
} as const;

/** A hall photo a family adds: JPEG, PNG or WebP, at most 8 MB, at most 6,000 pixels a side. */
export const VENUE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_VENUE_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_VENUE_SIDE = 6000;

/** A box on a 0–1000 grid over the image, as Muse Spark is asked for it. */
const gridBox = z.object({
  x1: z.number().min(0).max(1000),
  y1: z.number().min(0).max(1000),
  x2: z.number().min(0).max(1000),
  y2: z.number().min(0).max(1000),
});

export const stageFinding = z.object({
  /** The raised platform or the area at the front where the guest of honour sits; null when there is none. */
  stage: gridBox.nullable(),
  /** The wall or surface behind it, where a backdrop goes; null when there is none. */
  backdrop: gridBox.nullable(),
});
export type StageFinding = z.infer<typeof stageFinding>;

export const FIND_STAGE_INSTRUCTIONS =
  "You look at one photo of an empty hall or room that a family has booked for a function. Find two things, " +
  "as boxes on a 0 to 1000 grid over the whole image (x from the left edge, y from the top edge): the stage " +
  "(the raised platform, or the area at the front where the guest of honour will sit) and the backdrop (the " +
  "part of the wall or surface directly behind the stage, where a decorated backdrop would go, from the stage " +
  "up to about the ceiling or a sensible height). Keep each box tight to what you see. If there is no stage or " +
  "no wall behind it, give null for that one. Never guess at a part you can't see.";

/** A 0–1000 grid box in the image's pixels, ordered and inside the image; null when it has no area. */
export function gridToPixels(box: z.infer<typeof gridBox>, width: number, height: number): SamBox | null {
  const clampTo = (v: number, max: number) => Math.min(max, Math.max(0, Math.round((v / 1000) * max)));
  const x1 = clampTo(Math.min(box.x1, box.x2), width);
  const x2 = clampTo(Math.max(box.x1, box.x2), width);
  const y1 = clampTo(Math.min(box.y1, box.y2), height);
  const y2 = clampTo(Math.max(box.y1, box.y2), height);
  // Smaller than 2% of a side is a slip, not a stage.
  if (x2 - x1 < width * 0.02 || y2 - y1 < height * 0.02) return null;
  return { x1, y1, x2, y2 };
}

/** The SAM objects for what Muse Spark found: one per part it boxed, under that part's id. */
export function objectsFor(finding: StageFinding, width: number, height: number): SamObject[] {
  const objects: SamObject[] = [];
  for (const part of VENUE_PARTS) {
    const grid = finding[part];
    const box = grid ? gridToPixels(grid, width, height) : null;
    if (box) objects.push({ id: PART_IDS[part], box });
  }
  return objects;
}

/** A tap on the photo, in the image's pixels, as one SAM object for the chosen part. */
export function tapObject(part: VenuePart, x: number, y: number, width: number, height: number): SamObject {
  const px = Math.min(width, Math.max(0, Math.round(x)));
  const py = Math.min(height, Math.max(0, Math.round(y)));
  return { id: PART_IDS[part], points: [{ x: px, y: py }] };
}

/** A part's mask as it is kept: its box in pixels, the COCO RLE, the score and how it was found. */
export type PartMask = {
  box: SamBox;
  rle: { size: [number, number]; counts: string };
  /** The outline as an SVG path in the image's pixels, which the page clips its drawing to. */
  path: string;
  confidence?: number;
};

/** SAM's segments sorted back into parts, keeping the most confident one per part. */
export function partsFrom(segments: SamSegment[]): Partial<Record<VenuePart, PartMask>> {
  const parts: Partial<Record<VenuePart, PartMask>> = {};
  for (const part of VENUE_PARTS) {
    const mine = segments.filter((s) => s.id === String(PART_IDS[part]));
    if (mine.length === 0) continue;
    const best = mine.reduce((a, b) => ((b.confidence ?? 0) > (a.confidence ?? 0) ? b : a));
    parts[part] = {
      box: best.box,
      rle: { size: [best.mask.size[0], best.mask.size[1]], counts: best.mask.counts },
      path: best.path,
      ...(best.confidence === undefined ? {} : { confidence: best.confidence }),
    };
  }
  return parts;
}

/** Taps land on a 2% grid for the cache, so a tap a few pixels from the last one reuses its masks. */
export function tapKey(part: VenuePart, x: number, y: number, width: number, height: number): string {
  const gx = Math.round((x / width) * 50);
  const gy = Math.round((y / height) * 50);
  return `tap:${part}:${gx}:${gy}`;
}
