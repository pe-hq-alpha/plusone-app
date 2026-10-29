import { describe, expect, it } from "vitest";
import type { SamSegment } from "./sam";
import { gridToPixels, objectsFor, partsFrom, tapKey, tapObject } from "./venue";

const seg = (id: string, confidence: number | undefined): SamSegment => ({
  id,
  box: { x1: 1, y1: 2, x2: 3, y2: 4 },
  size: { w: 100, h: 100 },
  confidence,
  mask: { size: [100, 100], counts: `c${id}${confidence}` },
  path: `p${id}${confidence}`,
  maskBox: { x1: 1, y1: 2, x2: 3, y2: 4 },
});

describe("the stage's boxes", () => {
  it("turns Muse Spark's 0–1000 grid into the photo's pixels, ordered and inside it", () => {
    expect(gridToPixels({ x1: 250, y1: 500, x2: 750, y2: 1000 }, 1600, 1200)).toEqual({ x1: 400, y1: 600, x2: 1200, y2: 1200 });
    expect(gridToPixels({ x1: 750, y1: 900, x2: 250, y2: 100 }, 1000, 1000)).toEqual({ x1: 250, y1: 100, x2: 750, y2: 900 });
  });

  it("drops a box too small to be a stage", () => {
    expect(gridToPixels({ x1: 500, y1: 500, x2: 505, y2: 900 }, 1600, 1200)).toBeNull();
  });

  it("asks SAM for each part Muse Spark found, under its id, and skips one it didn't", () => {
    const objects = objectsFor({ stage: { x1: 0, y1: 500, x2: 1000, y2: 700 }, backdrop: null }, 1000, 1000);
    expect(objects).toEqual([{ id: 2, box: { x1: 0, y1: 500, x2: 1000, y2: 700 } }]);
  });

  it("puts a tap inside the photo as a point for the part chosen", () => {
    expect(tapObject("backdrop", 812.6, -4, 1600, 1200)).toEqual({ id: 1, points: [{ x: 813, y: 0 }] });
  });
});

describe("SAM's answer", () => {
  it("keeps the most confident mask per part and ignores ids that aren't ours", () => {
    const parts = partsFrom([seg("1", 0.6), seg("1", 0.9), seg("2", undefined), seg("7", 0.99)]);
    expect(parts.backdrop?.confidence).toBe(0.9);
    expect(parts.backdrop?.path).toBe("p10.9");
    expect(parts.stage).toMatchObject({ path: "p2undefined" });
    expect(parts.stage).not.toHaveProperty("confidence");
  });

  it("gives taps a few pixels apart the same cache key, and different parts different keys", () => {
    expect(tapKey("backdrop", 800, 400, 1600, 1200)).toBe(tapKey("backdrop", 806, 404, 1600, 1200));
    expect(tapKey("backdrop", 800, 400, 1600, 1200)).not.toBe(tapKey("stage", 800, 400, 1600, 1200));
    expect(tapKey("backdrop", 800, 400, 1600, 1200)).not.toBe(tapKey("backdrop", 900, 400, 1600, 1200));
  });
});
