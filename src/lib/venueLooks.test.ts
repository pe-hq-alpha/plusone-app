import { describe, expect, it } from "vitest";
import { backdropArea, LOOKS } from "./venueLooks";

const path = "M0 0z";

describe("where the backdrop is drawn", () => {
  it("sits on the wall behind the stage, as wide as the stage and half its width high", () => {
    const area = backdropArea({ stage: { box: { x1: 400, y1: 600, x2: 1200, y2: 700 }, path }, backdrop: { box: { x1: 0, y1: 0, x2: 1600, y2: 650 }, path } });
    expect(area).toEqual({ x1: 448, x2: 1152, y1: 200, y2: 615 });
  });

  it("stays inside the wall SAM found", () => {
    const area = backdropArea({ stage: { box: { x1: 400, y1: 600, x2: 1200, y2: 700 }, path }, backdrop: { box: { x1: 500, y1: 300, x2: 1100, y2: 640 }, path } });
    expect(area).toEqual({ x1: 500, x2: 1100, y1: 300, y2: 615 });
  });

  it("uses the middle of the wall when there is no stage, and nothing when neither was found", () => {
    expect(backdropArea({ backdrop: { box: { x1: 0, y1: 100, x2: 1000, y2: 500 }, path } })).toEqual({ x1: 150, x2: 850, y1: 100, y2: 500 });
    expect(backdropArea({})).toBeNull();
  });

  it("has four looks, each with a drape and either flowers or lights", () => {
    expect(LOOKS).toHaveLength(4);
    for (const look of LOOKS) expect(look.flowers.length > 0 || look.lights).toBeTruthy();
  });
});
