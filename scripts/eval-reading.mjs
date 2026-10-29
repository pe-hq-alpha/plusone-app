// The quote-reading evaluation. Renders each of the six quotes as a PDF and as a phone
// photo of the printed page (into scripts/eval-reading/, once), then reads every quote in
// all three forms on the deployment `npx convex run` reaches, and writes the scores.
//   node scripts/eval-reading.mjs [out.json]      (with CONVEX_DEPLOY_KEY set for production)
//   node scripts/eval-reading.mjs --render        (only make the PDFs and photos)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const DIR = "scripts/eval-reading";
const RENDER_ONLY = process.argv[2] === "--render";
const OUT = (!RENDER_ONLY && process.argv[2]) || "scripts/quote-reading-run1.json";
const cases = JSON.parse(
  execFileSync("npx", ["convex", "run", "evals:readingCases"], { encoding: "utf8" }),
);
const slug = (s) => s.toLowerCase().replace(/[^a-z]+/g, "-");

function page(c) {
  const lines = c.text.split(/(?<=\.)\s+/).map((l) => `<p>${l}</p>`).join("");
  return `<html><body style="margin:0;font:17px/1.6 Georgia,serif;color:#222;background:#fff">
  <div style="padding:56px 64px;width:640px;background:#fbfaf6">
    <div style="font:700 26px Georgia;color:#7a1f1f">${c.vendor}</div>
    <div style="font:13px Arial;color:#666;border-bottom:2px solid #7a1f1f;padding-bottom:10px;margin-bottom:24px">Chennai · Quotation for a 60th birthday lunch, 30 January</div>
    ${lines}
    <p style="margin-top:36px;font:13px Arial;color:#666">Thanking you, ${c.vendor}</p>
  </div></body></html>`;
}

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const c of cases) {
  const pdf = path.join(DIR, `${slug(c.vendor)}.pdf`);
  const jpg = path.join(DIR, `${slug(c.vendor)}.jpg`);
  if (fs.existsSync(pdf) && fs.existsSync(jpg)) continue;
  const p = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await p.setContent(page(c));
  await p.pdf({ path: pdf, format: "A5" });
  // The printed page photographed on a table: a little turned, shaded, slightly soft.
  await p.setContent(`<html><body style="margin:0;background:#6b4f3a;display:grid;place-items:center;height:900px">
    <div style="transform:rotate(-3deg);box-shadow:0 18px 40px #0008;filter:blur(.4px) brightness(.93) sepia(.12)">${page(c).replace(/<\/?(html|body)[^>]*>/g, "")}</div></body></html>`);
  await p.screenshot({ path: jpg, type: "jpeg", quality: 62 });
  await p.close();
}
await browser.close();
if (RENDER_ONLY) process.exit(0);

const scores = [];
const started = Date.now();
for (const c of cases) {
  for (const format of ["email", "pdf", "photo"]) {
    const file = format === "email" ? undefined : fs.readFileSync(path.join(DIR, `${slug(c.vendor)}.${format === "pdf" ? "pdf" : "jpg"}`)).toString("base64");
    const args = JSON.stringify({ vendor: c.vendor, format, ...(file ? { fileBase64: file } : {}) });
    const out = execFileSync("npx", ["convex", "run", "evals:readOne", args], { encoding: "utf8", maxBuffer: 1 << 24 });
    const s = JSON.parse(out);
    scores.push(s);
    console.log(`${s.totalRight ? "right" : "WRONG"}  ${format.padEnd(5)} ${c.vendor}: ${s.total} in ${(s.ms / 1000).toFixed(1)} s${s.lost.length ? `, lost ${s.lost.join(", ")}` : ""}`);
  }
}
const byFormat = Object.fromEntries(
  ["email", "pdf", "photo"].map((f) => {
    const r = scores.filter((s) => s.format === f);
    return [f, { right: r.filter((s) => s.totalRight).length, of: r.length, figuresKept: r.reduce((n, s) => n + s.kept.length, 0), figures: r.reduce((n, s) => n + s.figures.length, 0) }];
  }),
);
fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), byFormat, scores }, null, 2) + "\n");
console.log(byFormat, "->", OUT);
