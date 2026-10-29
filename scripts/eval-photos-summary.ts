// Prints the Glimmer photo-check summary tables from a run file. Run through jiti,
// which reads convex/lib's TypeScript as it stands:
//   npx jiti scripts/eval-photos-summary.ts scripts/glimmer-photos-run1.json
import fs from "node:fs";
import { PHOTO_FIELDS, summarise, type EvalSummary, type PhotoKey, type SystemAnswer } from "../convex/lib/glimmerEval";

const [runFile] = process.argv.slice(2);
if (!runFile) throw new Error("Give the run file, e.g. scripts/glimmer-photos-run1.json");
const run = JSON.parse(fs.readFileSync(runFile, "utf8")) as {
  keys: PhotoKey[];
  answers: { name: string; glimmer?: SystemAnswer; spark?: SystemAnswer }[];
};

const summary: EvalSummary = summarise(
  run.keys,
  Object.fromEntries(run.answers.map((a) => [a.name, a])),
);

const num = (v: number | null) => (v === null ? "n/a" : v.toFixed(2));
const secs = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);

function systemTable(title: string, photos: number, s: EvalSummary["glimmer"]) {
  console.log(`${title} (photos ${photos}, failed ${s.failed}, median ${secs(s.medianMs)}, p95 ${secs(s.p95Ms)}, $${s.totalCostUsd.toFixed(4)})`);
  console.log("field      tp  fp  fn  tn  prec   rec");
  for (const field of PHOTO_FIELDS) {
    const c = s.confusion[field];
    console.log(
      `${field.padEnd(10)} ${String(c.tp).padStart(2)}  ${String(c.fp).padStart(2)}  ${String(c.fn).padStart(2)}  ${String(c.tn).padStart(2)}  ${num(c.precision).padStart(4)}  ${num(c.recall).padStart(4)}`,
    );
  }
  console.log(`tags       prec ${num(s.tags.precision)}  rec ${num(s.tags.recall)}  f1 ${num(s.tags.f1)}`);
}

systemTable("Glimmer", run.keys.length, summary.glimmer);
systemTable("Muse Spark", run.keys.length, summary.spark);
console.log(`agreement  ${PHOTO_FIELDS.map((f) => `${f} ${num(summary.agreement[f])}`).join("  ")}`);
