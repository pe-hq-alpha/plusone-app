#!/usr/bin/env node
/**
 * Queues vendor names to look up on the open web (convex/leads.ts, convex/leadsRun.ts).
 * Reads only three columns from a CSV list of businesses (name, category, locality) and
 * sends nothing else: every fact a listing shows is found afresh from public pages. The
 * trades are interleaved, so a run cut short still covers every one.
 *
 *   node scripts/vendor-leads-seed.mjs <file.csv> [--limit N] [--dry]
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const LEAD_CATEGORIES = {
  hair_makeup: "Makeup & Hair", venue: "Venue", photographer: "Photographer", videographer: "Videographer",
  decor: "Decor & Florals", florist: "Decor & Florals", caterer: "Catering", attire: "Attire",
  mehndi_artist: "Mehndi artist", cake: "Cake", favours_gifts: "Gifting", invitations: "Stationery",
  accommodations: "Accommodation", dj: "Music/DJ", live_music: "Live band", officiant: "Officiant",
  entertainment: "Entertainment", choreographer: "Entertainment", transport: "Transport", rentals: "Rentals",
};

/** A small CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: node scripts/vendor-leads-seed.mjs <file.csv> [--limit N] [--dry]");
  process.exit(1);
}
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const dry = args.includes("--dry");

const [head, ...rows] = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name);
const iName = col("name"), iCat = col("category"), iArea = col("locality");
if (iName < 0 || iCat < 0) throw new Error("The CSV needs name and category columns.");

// Trade by trade, then one from each in turn.
const byTrade = new Map();
for (const r of rows) {
  const category = LEAD_CATEGORIES[(r[iCat] ?? "").trim()];
  const name = (r[iName] ?? "").trim();
  if (!category || !name) continue;
  const area = iArea >= 0 ? (r[iArea] ?? "").trim() : "";
  if (!byTrade.has(category)) byTrade.set(category, []);
  byTrade.get(category).push({ name, category, ...(area ? { area } : {}) });
}
const seeds = [];
for (let i = 0; seeds.length < limit; i++) {
  let any = false;
  for (const list of byTrade.values()) {
    if (i < list.length && seeds.length < limit) { seeds.push(list[i]); any = true; }
  }
  if (!any) break;
}
console.log(`${seeds.length} leads across ${byTrade.size} trades:`, Object.fromEntries([...byTrade].map(([k, l]) => [k, l.length])));
if (dry) process.exit(0);

let added = 0, skipped = 0;
for (let i = 0; i < seeds.length; i += 200) {
  const out = execFileSync("npx", ["convex", "run", "leads:addSeeds", JSON.stringify({ seeds: seeds.slice(i, i + 200) })], { encoding: "utf8" });
  const res = JSON.parse(out.slice(out.indexOf("{")));
  added += res.added;
  skipped += res.skipped;
  process.stdout.write(`\r${Math.min(i + 200, seeds.length)} / ${seeds.length} sent`);
}
console.log(`\nQueued ${added}, already there ${skipped}.`);
