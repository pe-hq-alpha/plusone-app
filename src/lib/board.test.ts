import { describe, expect, it } from "vitest";
import { ZONE, autoPlace, boundsOf, fit, toBoard, zoneAt, zoomAt, zonesFor, type Placeable } from "./board";

const parts = [
  { _id: "pooja", name: "Morning pooja" },
  { _id: "lunch", name: "Birthday lunch" },
  { _id: "moved", name: "Evening", zone: { x: 5000, y: 0, w: 400, h: 300 } },
  { _id: "fourth", name: "Day two" },
];

describe("zones on the board", () => {
  it("lays parts out three across in order, and keeps a zone someone moved", () => {
    const zones = zonesFor(parts);
    expect(zones[0].rect).toEqual({ x: 0, y: 0, w: ZONE.w, h: ZONE.h });
    expect(zones[1].rect.x).toBe(ZONE.w + ZONE.gap);
    expect(zones[2].rect).toEqual({ x: 5000, y: 0, w: 400, h: 300 });
    expect(zones[3].rect).toEqual({ x: 0, y: ZONE.h + ZONE.gap, w: ZONE.w, h: ZONE.h });
  });

  it("finds the zone a point falls in, and the whole event outside them all", () => {
    const zones = zonesFor(parts);
    expect(zoneAt({ x: 10, y: 10 }, zones)).toBe("pooja");
    expect(zoneAt({ x: 5100, y: 100 }, zones)).toBe("moved");
    expect(zoneAt({ x: -400, y: -400 }, zones)).toBeNull();
  });
});

describe("placing what has no place yet", () => {
  const zones = zonesFor(parts.slice(0, 2));
  const item = (id: string, sessionId: string | undefined, order: number, extra: Partial<Placeable> = {}): Placeable => ({
    _id: id,
    kind: "image",
    sessionId,
    order,
    ...extra,
  });

  it("puts a part's things inside its zone, in order, without overlapping", () => {
    const placed = autoPlace([item("b", "lunch", 2), item("a", "lunch", 1), item("c", "lunch", 3), item("d", "lunch", 4)], zones);
    const lunch = zones[1].rect;
    const a = placed.get("a")!;
    const b = placed.get("b")!;
    expect(a.x).toBe(lunch.x + ZONE.pad);
    expect(a.y).toBe(lunch.y + ZONE.title);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.w);
    // The fourth wraps to a new row inside the zone.
    expect(placed.get("d")!.y).toBeGreaterThan(a.y);
    for (const r of placed.values()) expect(r.x + r.w).toBeLessThanOrEqual(lunch.x + lunch.w);
  });

  it("keeps placed things where they are, and puts the whole event's above the zones", () => {
    const placed = autoPlace([item("fixed", "pooja", 1, { x: 900, y: 900, w: 300 }), item("loose", undefined, 1)], zones);
    expect(placed.get("fixed")).toMatchObject({ x: 900, y: 900, w: 300 });
    expect(placed.get("loose")!.y).toBeLessThan(0);
  });
});

describe("the view", () => {
  it("zooms around the pointer, keeping the point under it still", () => {
    const cam = { x: 100, y: 50, z: 1 };
    const at = { x: 400, y: 300 };
    const before = toBoard(cam, at);
    const after = toBoard(zoomAt(cam, 1.6, at), at);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("never zooms past its limits", () => {
    expect(zoomAt({ x: 0, y: 0, z: 1 }, 100, { x: 0, y: 0 }).z).toBe(2.5);
    expect(zoomAt({ x: 0, y: 0, z: 1 }, 0.001, { x: 0, y: 0 }).z).toBe(0.2);
  });

  it("fits a box in the viewport, centred, never above 100%", () => {
    const box = boundsOf([{ x: 0, y: 0, w: 2000, h: 1000 }, { x: -200, y: -100, w: 100, h: 100 }])!;
    expect(box).toEqual({ x: -200, y: -100, w: 2200, h: 1100 });
    const cam = fit(box, { w: 1200, h: 800 });
    expect(cam.z).toBeLessThan(1);
    const centre = toBoard(cam, { x: 600, y: 400 });
    expect(centre.x).toBeCloseTo(box.x + box.w / 2);
    expect(fit({ x: 0, y: 0, w: 10, h: 10 }, { w: 1200, h: 800 }).z).toBe(1);
  });
});
