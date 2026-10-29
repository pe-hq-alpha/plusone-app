// A browser walk of the live demos, at phone and laptop width: every page opens, with no
// page errors and no sideways scroll. Screenshots go to test/shots/ (not committed).
//   node test/walk.mjs [base]        base defaults to https://app.plusoneevents.site
import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "https://app.plusoneevents.site";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EVENT_PAGES = ["", "/plan", "/tasks", "/budget", "/vendors", "/decisions", "/venue", "/inbox", "/guests", "/gifts", "/website", "/spaces", "/members", "/settings", "/history"];
const SAMPLES = ["", "?sample=housewarming", "?sample=office"];
const WIDTHS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "laptop", width: 1440, height: 900, mobile: false },
];
fs.mkdirSync("test/shots", { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const failures = [];
let checked = 0;

async function check(page, label, width) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (scroll > client) failures.push(`${label} @${width}: sideways scroll (${scroll} > ${client})`);
  await page.screenshot({ path: `test/shots/${label.replace(/[^a-z0-9]+/gi, "-")}-${width}.png` });
  checked++;
}

for (const w of WIDTHS) {
  for (const sample of SAMPLES) {
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, isMobile: w.mobile, hasTouch: w.mobile });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${BASE}/demo${sample}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/e\/[^/]+/, { timeout: 90_000 });
    const event = new URL(page.url()).pathname.match(/\/e\/[^/]+/)[0];
    await page.getByRole("button", { name: "Essential only" }).click({ timeout: 5000 }).catch(() => {});
    for (const p of EVENT_PAGES) {
      await page.goto(`${BASE}${event}${p}`, { waitUntil: "domcontentloaded" });
      await check(page, `demo${sample || "-birthday"}${p || "-today"}`, w.name);
    }
    if (errors.length) failures.push(`demo${sample} @${w.name}: ${errors.length} console or page errors: ${errors.slice(0, 3).join(" | ")}`);
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, isMobile: w.mobile, hasTouch: w.mobile });
  const page = await ctx.newPage();
  for (const url of ["https://plusoneevents.site", "https://plusoneevents.site/pricing", "https://partner.plusoneevents.site/demo"]) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await check(page, new URL(url).host + new URL(url).pathname, w.name);
  }
  await ctx.close();
}
await browser.close();

console.log(`${checked} pages checked, ${failures.length} problems`);
for (const f of failures) console.log(`- ${f}`);
process.exit(failures.length ? 1 : 0);
