/**
 * The looks "See it on your venue" draws on a hall photo. Each is drawn only inside the
 * parts SAM 3.1 cut out: a draped backdrop with garlands on the wall behind the stage,
 * and a skirt along the stage's front. It is a sketch to judge decorators' quotes
 * against, never a picture of their work.
 */

export type Look = {
  key: string;
  name: string;
  /** The drape, top colour to bottom. */
  drape: [string, string];
  /** Flower colours, strung in turn; empty for a look made of lights. */
  flowers: string[];
  leaf?: string;
  lights?: boolean;
  skirt: string;
};

export const LOOKS: Look[] = [
  { key: "marigold", name: "Marigold and mango leaf", drape: ["#8a2318", "#561109"], flowers: ["#f6a81c", "#f9c941", "#ea7d16"], leaf: "#3d7a35", skirt: "#f2a01e" },
  { key: "jasmine", name: "Jasmine and rose", drape: ["#f4ecdc", "#ddd0b6"], flowers: ["#fdfcf6", "#f1ede2", "#c3253c"], leaf: "#4c7c43", skirt: "#c3253c" },
  { key: "pastel", name: "Pastel flowers", drape: ["#f6e1e8", "#e3cad8"], flowers: ["#f6b6c7", "#d8c0ee", "#ffffff"], leaf: "#8db488", skirt: "#e8c3d2" },
  { key: "lights", name: "Fairy lights", drape: ["#2b2242", "#141022"], flowers: [], lights: true, skirt: "#3b2e5d" },
];

type Box = { x1: number; y1: number; x2: number; y2: number };
/** A cut-out part: its box, and its outline in the mask's own pixels, placed in `maskBox` (or `box`). */
export type DrawPart = { box: Box; path: string; rle: { size: number[] }; maskBox?: Box };

/**
 * Clip to a part. SAM's mask is cropped to its box and resized, so its outline is moved
 * into the box and stretched to fit, then the drawing goes back to the photo's pixels.
 */
function clipTo(ctx: CanvasRenderingContext2D, part: DrawPart, scale: number) {
  const frame = part.maskBox ?? part.box;
  const [maskH, maskW] = part.rle.size;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.translate(frame.x1, frame.y1);
  ctx.scale((frame.x2 - frame.x1) / maskW, (frame.y2 - frame.y1) / maskH);
  ctx.clip(new Path2D(part.path));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function outline(ctx: CanvasRenderingContext2D, part: DrawPart, scale: number, width: number) {
  const frame = part.maskBox ?? part.box;
  const [maskH, maskW] = part.rle.size;
  const sx = (frame.x2 - frame.x1) / maskW;
  const sy = (frame.y2 - frame.y1) / maskH;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.translate(frame.x1, frame.y1);
  ctx.scale(sx, sy);
  ctx.lineWidth = width / Math.max(sx, sy);
  ctx.strokeStyle = "rgba(244,181,58,0.95)";
  ctx.stroke(new Path2D(part.path));
  ctx.restore();
}
export type DrawParts = { backdrop?: DrawPart; stage?: DrawPart };

/**
 * Where the backdrop goes: the wall behind the stage, as wide as the stage and up to
 * about half its width above it, kept inside the wall SAM found. Without a stage, the
 * middle of the wall.
 */
export function backdropArea(parts: DrawParts): Box | null {
  const wall = parts.backdrop?.box;
  const stage = parts.stage?.box;
  if (!wall && !stage) return null;
  if (wall && !stage) {
    const w = wall.x2 - wall.x1;
    return { x1: wall.x1 + w * 0.15, x2: wall.x2 - w * 0.15, y1: wall.y1, y2: wall.y2 };
  }
  const s = stage as Box;
  const width = s.x2 - s.x1;
  const top = s.y1 - width * 0.5;
  const area = { x1: s.x1 + width * 0.06, x2: s.x2 - width * 0.06, y1: top, y2: s.y1 + (s.y2 - s.y1) * 0.15 };
  if (!wall) return area;
  // Kept within the wall's sides and top, but always down to the stage: SAM's wall often
  // stops short at a shadow above the stage, and a drape hangs to the floor of the stage.
  const clipped = { x1: Math.max(area.x1, wall.x1), x2: Math.min(area.x2, wall.x2), y1: Math.max(area.y1, wall.y1), y2: area.y2 };
  return clipped.x2 - clipped.x1 > 10 && clipped.y2 - clipped.y1 > 10 ? clipped : area;
}

/** A steady sequence, so the lights sit in the same places on every redraw. */
function seeded(seed: number) {
  let n = seed;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
}

function bead(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  ctx.beginPath();
  ctx.fillStyle = colour;
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.arc(x + r * 0.25, y + r * 0.3, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
  g.addColorStop(0, "rgba(255,236,170,1)");
  g.addColorStop(0.25, "rgba(255,214,120,0.55)");
  g.addColorStop(1, "rgba(255,200,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
}

function drawBackdrop(ctx: CanvasRenderingContext2D, area: Box, look: Look) {
  const w = area.x2 - area.x1;
  const h = area.y2 - area.y1;
  const fill = ctx.createLinearGradient(0, area.y1, 0, area.y2);
  fill.addColorStop(0, look.drape[0]);
  fill.addColorStop(1, look.drape[1]);
  ctx.fillStyle = fill;
  ctx.fillRect(area.x1, area.y1, w, h);
  // Pleats: light and shade in turn, so it reads as cloth.
  const pleats = 28;
  for (let i = 0; i < pleats; i++) {
    const x = area.x1 + (w / pleats) * i;
    const shade = ctx.createLinearGradient(x, 0, x + w / pleats, 0);
    shade.addColorStop(0, "rgba(255,255,255,0.10)");
    shade.addColorStop(0.5, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.16)");
    ctx.fillStyle = shade;
    ctx.fillRect(x, area.y1, w / pleats, h);
  }
  const r = Math.max(2, w / 150);
  if (look.lights) {
    const next = seeded(7);
    const strands = 22;
    for (let i = 0; i <= strands; i++) {
      const x = area.x1 + (w / strands) * i;
      const drop = h * (0.55 + next() * 0.4);
      for (let y = area.y1 + r * 2; y < area.y1 + drop; y += r * 5) glow(ctx, x + Math.sin(y / 30) * r, y, r * 0.6);
    }
    return;
  }
  // Swags along the top, then strands hanging from them.
  const swags = 5;
  for (let s = 0; s < swags; s++) {
    const sx = area.x1 + (w / swags) * s;
    const sw = w / swags;
    for (let t = 0; t <= 1; t += 1 / 22) {
      const x = sx + sw * t;
      const y = area.y1 + r * 2 + Math.sin(Math.PI * t) * h * 0.12;
      bead(ctx, x, y, r * 1.15, look.flowers[Math.round(t * 22) % look.flowers.length]);
    }
  }
  const strands = 14;
  for (let i = 0; i <= strands; i++) {
    const x = area.x1 + (w / strands) * i;
    const drop = h * (i % 2 === 0 ? 0.62 : 0.48);
    let k = 0;
    for (let y = area.y1 + r * 3; y < area.y1 + drop; y += r * 2.1) {
      const leafHere = look.leaf && k % 6 === 5;
      bead(ctx, x, y, r, leafHere ? (look.leaf as string) : look.flowers[k % look.flowers.length]);
      k++;
    }
    // A tassel of three at the end of each strand.
    bead(ctx, x, area.y1 + drop + r * 1.4, r * 1.4, look.flowers[0]);
  }
}

function drawStageSkirt(ctx: CanvasRenderingContext2D, stage: Box, look: Look) {
  const h = stage.y2 - stage.y1;
  const top = stage.y1 + h * 0.55;
  const band = stage.y2 - top;
  ctx.fillStyle = look.skirt;
  ctx.globalAlpha = 0.88;
  ctx.fillRect(stage.x1, top, stage.x2 - stage.x1, band);
  ctx.globalAlpha = 1;
  // Frills along the band, so it reads as gathered cloth.
  const folds = Math.max(12, Math.round((stage.x2 - stage.x1) / 22));
  for (let i = 0; i < folds; i++) {
    const x = stage.x1 + ((stage.x2 - stage.x1) / folds) * i;
    const fold = ctx.createLinearGradient(x, 0, x + (stage.x2 - stage.x1) / folds, 0);
    fold.addColorStop(0, "rgba(255,255,255,0.18)");
    fold.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = fold;
    ctx.fillRect(x, top, (stage.x2 - stage.x1) / folds, band);
  }
}

/**
 * Draw the photo, and when `after` is on, the look inside the cut-out parts. The canvas
 * is the photo's own size scaled by `scale`; the parts are in the photo's pixels.
 */
export function drawVenue(
  ctx: CanvasRenderingContext2D,
  photo: CanvasImageSource,
  size: { width: number; height: number; scale: number },
  parts: DrawParts,
  look: Look,
  after: boolean,
  showOutline: boolean,
) {
  const { width, height, scale } = size;
  ctx.clearRect(0, 0, width * scale, height * scale);
  ctx.drawImage(photo, 0, 0, width * scale, height * scale);
  ctx.save();
  ctx.scale(scale, scale);
  if (after) {
    const area = backdropArea(parts);
    // The drape is a clean panel within the wall's bounds, not clipped to SAM's wall mask,
    // whose edge is ragged where light falls; the stage skirt keeps its mask, so chairs in
    // front of the stage stay in front of it.
    if (area) drawBackdrop(ctx, area, look);
    if (parts.stage) {
      ctx.save();
      clipTo(ctx, parts.stage, scale);
      drawStageSkirt(ctx, parts.stage.box, look);
      ctx.restore();
    }
  }
  if (showOutline) {
    for (const part of [parts.backdrop, parts.stage]) if (part) outline(ctx, part, scale, Math.max(2, width / 400));
  }
  ctx.restore();
}
