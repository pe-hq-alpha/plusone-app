// The Glimmer photo-check evaluation. Reads scripts/eval-photos/key.json (the hand-marked
// key) and the image files beside it (`name` is the file name), sends each photo to
// evals:glimmerPhotos one at a time, writes the raw answers, then prints the summary.
// Glimmer's first call after idle can take close to four minutes, so each call waits
// however long the backend takes; progress prints as it goes.
//   node scripts/eval-photos.mjs [--systems glimmer,spark] [out.json]
// Needs CONVEX_DEPLOY_KEY set for a deployed backend, like the other eval runners.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIR = "scripts/eval-photos";
const cli = process.argv.slice(2);
const systems = cli.find((a) => a.startsWith("--systems="))?.slice("--systems=".length);
const key = JSON.parse(fs.readFileSync(path.join(DIR, "key.json"), "utf8"));
if (!Array.isArray(key) || key.length === 0) throw new Error(`${DIR}/key.json holds no photos`);
for (const k of key) {
  if (!k.name || !k.trade || !k.profileName) throw new Error(`key.json: every photo needs a name, a trade and a profileName (${JSON.stringify(k).slice(0, 80)})`);
}

// The next free run number, so past runs are never overwritten.
let n = 1;
while (fs.existsSync(`scripts/glimmer-photos-run${n}.json`)) n++;
const OUT = cli.find((a) => !a.startsWith("--")) ?? `scripts/glimmer-photos-run${n}.json`;

const mediaType = (name) => {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  throw new Error(`${name} is not a JPEG, PNG or WebP photo`);
};

const started = Date.now();
const answers = [];
let i = 0;
for (const k of key) {
  i++;
  const dataBase64 = fs.readFileSync(path.join(DIR, k.name)).toString("base64");
  const args = JSON.stringify({
    name: k.name,
    trade: k.trade,
    profileName: k.profileName,
    dataBase64,
    mediaType: mediaType(k.name),
    ...(systems ? { systems: systems.split(",") } : {}),
  });
  const out = execFileSync("npx", ["convex", "run", "evals:glimmerPhotos", args], { encoding: "utf8", maxBuffer: 1 << 26 });
  const a = JSON.parse(out);
  answers.push(a);
  const line = (s) => (s ? (s.ok ? `ok ${(s.ms / 1000).toFixed(1)}s $${s.costUsd.toFixed(4)}` : `FAILED ${String(s.error).slice(0, 100)}`) : "skipped");
  console.log(`${i}/${key.length} ${k.name}: glimmer ${line(a.glimmer)} · spark ${line(a.spark)}`);
}
fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), keys: key, answers }, null, 2) + "\n");
// The summary lives in convex/lib with the scoring, read here as is through jiti.
execFileSync("npx", ["jiti", "scripts/eval-photos-summary.ts", OUT], { stdio: "inherit" });
console.log("->", OUT);
