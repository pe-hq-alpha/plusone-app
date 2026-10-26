/**
 * The event's board, as geometry: where each part's zone sits, where something not yet
 * placed goes, which zone a point falls in, and how the view pans and zooms. Pure, so
 * it is tested without a browser.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
/** The view onto the board: the screen position of the board's origin, and the zoom. */
export type Camera = { x: number; y: number; z: number };

export type ItemKind = "image" | "link" | "note" | "swatch" | "vendor";
export type Placeable = { _id: string; kind: ItemKind; sessionId?: string; order: number; x?: number; y?: number; w?: number };
export type ZoneSource = { _id: string; name: string; zone?: Rect };
export type Zone = { sessionId: string; name: string; rect: Rect };

export const ZONE = { w: 760, h: 600, gap: 96, title: 52, pad: 24 } as const;
export const ZOOM = { min: 0.2, max: 2.5 } as const;

/** How wide each kind of thing starts. Heights follow the content. */
export const DEFAULT_WIDTH: Record<ItemKind, number> = { image: 224, link: 264, note: 224, swatch: 104, vendor: 248 };
/** Roughly how tall each kind is, for laying things out before they have been measured. */
const ROUGH_HEIGHT: Record<ItemKind, number> = { image: 260, link: 250, note: 150, swatch: 132, vendor: 150 };

/** Every part's zone: where it was put, or a place in a grid of three across, in the order of the days. */
export function zonesFor(parts: ZoneSource[]): Zone[] {
  return parts.map((p, i) => ({
    sessionId: p._id,
    name: p.name,
    rect: p.zone ?? { x: (i % 3) * (ZONE.w + ZONE.gap), y: Math.floor(i / 3) * (ZONE.h + ZONE.gap), w: ZONE.w, h: ZONE.h },
  }));
}

/**
 * Where everything not yet placed goes: inside its part's zone in rows, in the order it
 * was kept, or, for the whole event, in a band above the zones. Placed things stay put.
 */
export function autoPlace(items: Placeable[], zones: Zone[]): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const byZone = new Map(zones.map((z) => [z.sessionId, z.rect]));
  const top = zones.length ? Math.min(...zones.map((z) => z.rect.y)) : 0;
  const left = zones.length ? Math.min(...zones.map((z) => z.rect.x)) : 0;
  const groups = new Map<string, Placeable[]>();
  for (const it of items) {
    const key = it.sessionId && byZone.has(it.sessionId) ? it.sessionId : "";
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  for (const [key, group] of groups) {
    const area: Rect = key
      ? (() => {
          const r = byZone.get(key)!;
          return { x: r.x + ZONE.pad, y: r.y + ZONE.title, w: r.w - ZONE.pad * 2, h: r.h - ZONE.title - ZONE.pad };
        })()
      : { x: left, y: top - 360, w: Math.max(ZONE.w, 3 * ZONE.w + 2 * ZONE.gap), h: 300 };
    let cx = area.x;
    let cy = area.y;
    let rowH = 0;
    for (const it of [...group].sort((a, b) => a.order - b.order)) {
      const w = it.w ?? DEFAULT_WIDTH[it.kind];
      const h = ROUGH_HEIGHT[it.kind] * (w / DEFAULT_WIDTH[it.kind]);
      if (it.x !== undefined && it.y !== undefined) {
        out.set(it._id, { x: it.x, y: it.y, w, h });
        continue;
      }
      if (cx > area.x && cx + w > area.x + area.w) {
        cx = area.x;
        cy += rowH + 16;
        rowH = 0;
      }
      out.set(it._id, { x: cx, y: cy, w, h });
      cx += w + 16;
      rowH = Math.max(rowH, h);
    }
  }
  return out;
}

/** The part whose zone holds a point: the last drawn, so a zone laid over another wins. Null for the whole event. */
export function zoneAt(p: Point, zones: Zone[]): string | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const r = zones[i].rect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return zones[i].sessionId;
  }
  return null;
}

export const clampZoom = (z: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, z));

/** A screen point as a board point. */
export const toBoard = (cam: Camera, p: Point): Point => ({ x: (p.x - cam.x) / cam.z, y: (p.y - cam.y) / cam.z });

/** Zoom by a factor, keeping the board point under the pointer exactly where it was. */
export function zoomAt(cam: Camera, factor: number, at: Point): Camera {
  const z = clampZoom(cam.z * factor);
  const k = z / cam.z;
  return { x: at.x - (at.x - cam.x) * k, y: at.y - (at.y - cam.y) * k, z };
}

/** The smallest box around a set of rectangles. */
export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const r = Math.max(...rects.map((r) => r.x + r.w));
  const b = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: r - x, h: b - y };
}

/** A view that shows the whole of a box in a viewport, with a margin, never zoomed past 100%. */
export function fit(box: Rect, view: { w: number; h: number }, margin = 48): Camera {
  const z = clampZoom(Math.min(1, (view.w - margin * 2) / Math.max(1, box.w), (view.h - margin * 2) / Math.max(1, box.h)));
  return { x: (view.w - box.w * z) / 2 - box.x * z, y: (view.h - box.h * z) / 2 - box.y * z, z };
}
