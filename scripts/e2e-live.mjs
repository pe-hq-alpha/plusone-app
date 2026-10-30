#!/usr/bin/env node
/**
 * The demo path, end to end, on the live site, the way a judge walks it: the home page, the
 * customers' demo (Today, Compare, Vendors, Under the hood), the vendors' demo, Find vendors
 * and a broken guest link, on a phone (390 px) and a laptop (1440 px). Each step must load
 * with no page errors and no sideways scroll. Exits 1 on any failure.
 *
 * Usage: node scripts/e2e-live.mjs [--app https://app.plusoneevents.site] [--home https://plusoneevents.site] [--partner https://partner.plusoneevents.site]
 * Needs Google Chrome installed (GitHub's Ubuntu runners have it). Run by .github/workflows/e2e.yml.
 */
import { chromium } from "playwright-core";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const APP = arg("app", "https://app.plusoneevents.site").replace(/\/$/, "");
const HOME = arg("home", "https://plusoneevents.site").replace(/\/$/, "");
const PARTNER = arg("partner", "https://partner.plusoneevents.site").replace(/\/$/, "");

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const results = [];
const browser = await chromium.launch({ channel: "chrome" });

async function newPage(device) {
  const context = await browser.newContext({ ...DEVICES[device], userAgent: undefined });
  // Skip the first-visit splash and tour, answer the cookie question, and keep test visits out of usage numbers.
  await context.addInitScript(() => {
    for (const [k, v] of [["plusone.splash.seen", "1"], ["plusone.walkthrough.seen", "1"], ["plusone.region", "IN-TN"], ["plusone.region.chosen", "1"], ["plusone.analyticsConsent", "essential"]]) localStorage.setItem(k, v);
  });
  await context.route(/\/ingest\//, (r) => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}

async function step(device, name, page, errors, run) {
  const started = Date.now();
  const before = errors.length;
  let problem = null;
  try {
    await run();
    const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (scroll > client) problem = `sideways scroll (${scroll} > ${client})`;
    const text = await page.evaluate(() => document.body.innerText);
    if (/\bundefined\b|\bNaN\b/.test(text)) problem = "the page shows undefined or NaN";
  } catch (e) {
    problem = String(e.message ?? e).split("\n")[0];
  }
  if (!problem && errors.length > before) problem = `page error: ${errors[errors.length - 1]}`;
  results.push({ device, name, ok: !problem, ms: Date.now() - started, problem });
}

const sees = (page, text) => page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 20_000 });

for (const device of Object.keys(DEVICES)) {
  {
    const { context, page, errors } = await newPage(device);
    await step(device, "Home page", page, errors, async () => {
      await page.goto(`${HOME}/`, { waitUntil: "domcontentloaded" });
      await sees(page, "See the demo");
    });
    let event = "";
    await step(device, "Customers' demo opens on Today", page, errors, async () => {
      await page.goto(`${APP}/demo`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/e\/[a-z0-9]+/, { timeout: 30_000 });
      event = page.url().match(/(\/e\/[a-z0-9]+)/)[1];
      await sees(page, "Tell PlusOne");
    });
    await step(device, "Compare: quotes on the same lines", page, errors, async () => {
      await page.goto(`${APP}${event}/decisions`, { waitUntil: "domcontentloaded" });
      await sees(page, "Per plate");
      await sees(page, "Kaveri Feast Co.");
    });
    await step(device, "Vendors", page, errors, async () => {
      await page.goto(`${APP}${event}/vendors`, { waitUntil: "domcontentloaded" });
      await sees(page, "Catering");
    });
    if (device === "laptop") {
      await step(device, "Under the hood shows recorded runs", page, errors, async () => {
        await page.goto(`${APP}${event}`, { waitUntil: "domcontentloaded" });
        await page.locator('button.shell-tool[aria-label="Under the hood"]').click();
        await sees(page, "Muse Spark 1.3");
      });
    }
    await step(device, "Find vendors", page, errors, async () => {
      await page.goto(`${APP}/vendors`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /with prices you can compare/ }).waitFor({ timeout: 20_000 });
    });
    await step(device, "A broken RSVP link leads home", page, errors, async () => {
      await page.goto(`${APP}/r/not-a-real-link`, { waitUntil: "domcontentloaded" });
      await sees(page, "isn't valid");
      await sees(page, "Go to PlusOne Events");
    });
    await context.close();
  }
  {
    const { context, page, errors } = await newPage(device);
    await step(device, "Vendors' demo: a customer's request to answer", page, errors, async () => {
      await page.goto(`${PARTNER}/demo`, { waitUntil: "domcontentloaded" });
      await sees(page, "Customers asking");
      await sees(page, "Answer on the sheet");
    });
    await context.close();
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.device.padEnd(6)}  ${r.name.padEnd(48)} ${String(r.ms).padStart(6)} ms${r.problem ? `  — ${r.problem}` : ""}`);
console.log(`\n${results.length - failed.length} of ${results.length} steps passed.`);
process.exit(failed.length ? 1 : 0);
