// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

/** The colour tokens of one block of index.css: `@theme` for light, `:root[data-theme="dark"]` for dark. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = tokens("@theme {");
const dark = { ...light, ...tokens(':root[data-theme="dark"] {') };

/** [text, ground, minimum]: body text 4.5:1, focus rings and edges of controls 3:1. */
const PAIRS: [string, string, number][] = [
  ["ink", "paper", 4.5],
  ["ink", "cream", 4.5],
  ["muted", "paper", 4.5],
  ["muted", "cream", 4.5],
  ["quiet", "paper", 4.5],
  ["quiet", "cream", 4.5],
  ["quiet", "wash", 4.5],
  ["accent", "paper", 4.5],
  ["accent", "cream", 4.5],
  ["accent", "wash", 4.5],
  ["accent", "accent-soft", 4.5],
  ["on-accent", "accent", 4.5],
  ["on-accent", "accent-deep", 4.5],
  ["on-highlight", "highlight", 4.5],
  ["ink", "field", 4.5],
  ["ok", "ok-bg", 4.5],
  ["warn", "warn-bg", 4.5],
  ["bad", "bad-bg", 4.5],
  ["bad", "paper", 4.5],
  ["paper", "bad", 4.5],
  ["ink-deep", "sun", 4.5],
  ["ink-deep", "sage", 4.5],
  ["done", "paper", 3],
  ["done", "cream", 3],
  ["highlight-core", "highlight", 1.3],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("the %s theme", (_name, t) => {
  it.each(PAIRS)("%s on %s reads at %s:1 or more", (fg, bg, min) => {
    expect(t[fg], `--color-${fg}`).toBeDefined();
    expect(t[bg], `--color-${bg}`).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("marigold", () => {
  it("is never the text colour on the light page", () => {
    expect(ratio(light.highlight, light.paper)).toBeLessThan(4.5);
    expect(light.accent).not.toBe(light.highlight);
  });

  it("is the ink of the brand at night", () => {
    expect(ratio(dark.accent, dark.paper)).toBeGreaterThanOrEqual(7);
  });
});
