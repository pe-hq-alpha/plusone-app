#!/usr/bin/env node
/**
 * Capture the README's screens from the demo wedding on a running deployment.
 * Usage: node scripts/readme-shots.mjs [--url http://localhost:5173] [--out assets/screens] [--region US]
 * --region picks the sample wedding and the money shown (US: Austin in dollars; IN-TN: Chennai; IN-DL: Delhi),
 * whatever country the machine taking the screens is in.
 * Writes PNGs; convert with: for f in assets/screens/*.png; do sips -s format jpeg -s formatOptions 82 "$f" --out "${f%.png}.jpg" && rm "$f"; done
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const url = arg("url", "http://localhost:5173").replace(/\/$/, "");
const out = arg("out", "assets/screens");
const region = arg("region", "US");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
// The first-visit splash and the guided tour would cover the screens, and usage
// analytics should not count a capture as a visit.
await context.addInitScript((r) => {
  localStorage.setItem("plusone.splash.seen", "1");
  localStorage.setItem("plusone.walkthrough.seen", "1");
  localStorage.setItem("plusone.region", r);
  localStorage.setItem("plusone.region.chosen", "1");
}, region);
await context.route(/\/ingest\//, (route) => route.abort());
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: url });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const shot = async (name) => {
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`  ${name}.png  ${page.url()}`);
};

await page.goto(`${url}/`, { waitUntil: "networkidle" });
await shot("landing");

await page.goto(`${url}/demo`);
await page.waitForURL(/\/w\/[^/]+/, { timeout: 60000 });
const id = page.url().split("/e/")[1].split(/[/?#]/)[0];
await page.evaluate((w) => localStorage.setItem(`plusone.welcome.closed.${w}`, "1"), id);
const go = async (path) => { await page.goto(`${url}/e/${id}${path}`, { waitUntil: "networkidle" }); };

// A new demo wedding celebrates each milestone it has already reached, one toast at a
// time. Close them all once, so they are marked seen, then load the page again.
await go("");
for (let quiet = 0, i = 0; quiet < 4 && i < 60; i++) {
  await page.waitForTimeout(700);
  const close = page.locator('[role="status"] button[aria-label="Close"]');
  if (await close.count()) { quiet = 0; await close.first().click().catch(() => {}); } else quiet++;
}
await go("");
await shot("overview");

// Ceremony cards open on click rather than being plain links.
await page.getByText("Ceremony", { exact: true }).first().click().catch(() => {});
await page.waitForURL(/\/sessions\//, { timeout: 15000 }).then(() => shot("ceremony"), () => console.log("  ceremony: card did not open"));

await go("/vendors");
await shot("vendors");
await go("/decisions");
await shot("decisions");

await go("/inbox");
const thread = await page.$$eval('a[href*="/inbox/"]', (as) => as[0]?.getAttribute("href"));
if (thread) await page.goto(`${url}${thread}`, { waitUntil: "networkidle" });
await shot("inbox");

for (const name of ["budget", "guests"]) { await go(`/${name}`); await shot(name); }

await go("/spaces");
await shot("spaces");

// A quote that waits for the couple: the late venue offer, after the venue was booked.
await go("/inbox");
await page.getByText("Riverside Pavilion").first().click();
await shot("quote");

await go("/budget");
await page.locator('[data-tour="whats-due"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
await shot("due");

// The assistant opens beside any page; here, the budget.
await page.getByRole("button", { name: /^Ask$/ }).first().click();
await shot("assistant");
await page.keyboard.press("Escape");

await go("/gifts");
await shot("gifts");

await go("/website");
const site = await page.locator('a[href*="/s/"]').first().getAttribute("href");
await page.goto(`${url}${site}`, { waitUntil: "networkidle" });
await shot("website");

// A guest's own RSVP link, and a read-only link to the plan: both copied to the clipboard.
await go("/guests");
await page.locator('[data-tour="rsvp-link"]').first().click();
await page.waitForTimeout(800);
const rsvp = (await page.evaluate(() => navigator.clipboard.readText())).match(/\/r\/[^/?#\s]+/)?.[0];
if (rsvp) { await page.goto(`${url}${rsvp}`, { waitUntil: "networkidle" }); await shot("rsvp"); }

await go("/print");
await page.getByPlaceholder("Mum and Dad").fill("Emma's parents");
await page.getByRole("button", { name: "Make a link" }).click();
await page.waitForTimeout(1200);
const shared = (await page.evaluate(() => navigator.clipboard.readText())).match(/\/p\/[^/?#\s]+/)?.[0];
if (shared) { await page.goto(`${url}${shared}`, { waitUntil: "networkidle" }); await shot("shared"); }

await browser.close();
console.log(errors.length ? `page errors:\n${errors.join("\n")}` : "no page errors");
