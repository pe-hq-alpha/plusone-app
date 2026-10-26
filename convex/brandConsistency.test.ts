/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Keeps the colours, typefaces and feature names consistent across the app, its
// emails and its docs: only PlusOne's own palette and faces. The words it guards
// against are stored as [length, FNV-1a hash] pairs, so this file names none of
// them; every word (and, where a rule asks, every pair of neighbouring words run
// together) is checked for any slice of those lengths.
const RULES: { label: string; hashes: [number, number][]; pairs?: boolean }[] = [
  { label: "an off-palette brand colour", hashes: [[6, 0x59cd5ddf], [10, 0x86b7339c]] },
  { label: "an off-system typeface", hashes: [[8, 0x57aeb8a1]] },
  { label: "the old name for Spaces", hashes: [[9, 0xa7114216]], pairs: true },
];

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function matches(line: string, hashes: [number, number][], pairs = false): boolean {
  const words = line.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
  const chunks = pairs ? [...words, ...words.slice(1).map((w, i) => words[i] + w)] : words;
  for (const chunk of chunks) {
    for (const [len, hash] of hashes) {
      for (let i = 0; i + len <= chunk.length; i++) if (fnv1a(chunk.slice(i, i + len)) === hash) return true;
    }
  }
  return false;
}

const files = {
  ...import.meta.glob<string>(["../src/**/*.{ts,tsx,css,html,json}"], { eager: true, query: "?raw", import: "default" }),
  ...import.meta.glob<string>(["./**/*.ts", "!./_generated/**"], { eager: true, query: "?raw", import: "default" }),
  ...import.meta.glob<string>(["../public/**/*.{json,webmanifest,html,txt,svg}"], { eager: true, query: "?raw", import: "default" }),
  ...import.meta.glob<string>(["../index.html", "../README.md", "../DESIGN.md", "../PRODUCT.md", "../docs/*.md"], { eager: true, query: "?raw", import: "default" }),
};

describe("brand consistency", () => {
  it("scans the app, backend, public files and docs", () => {
    expect(Object.keys(files).length).toBeGreaterThan(150);
  });

  it("recognises a guarded word", () => {
    // Built from character codes so the word itself never appears in the source.
    const word = String.fromCharCode(112, 108, 97, 121, 102, 97, 105, 114);
    expect(matches(`set in ${word} Display`, RULES[1].hashes)).toBe(true);
    expect(matches("set in a Garamond", RULES[1].hashes)).toBe(false);
  });

  for (const { label, hashes, pairs } of RULES) {
    it(`has no ${label}`, () => {
      const hits: string[] = [];
      for (const [path, text] of Object.entries(files)) {
        text.split("\n").forEach((line, i) => {
          if (matches(line, hashes, pairs)) hits.push(`${path}:${i + 1}`);
        });
      }
      expect(hits).toEqual([]);
    });
  }
});
