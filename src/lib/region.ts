import { useEffect, useState } from "react";

/**
 * Where a visitor is, as a country code with the state where known ("IN-DL", "IN", "US"),
 * so the first things they see (the examples, the demo, a new event's currency) come in
 * their own money and customs.
 *
 * Cloudflare knows the country and state of every visit, and functions/geo.ts says so.
 * Until that answers, and wherever it can't (local dev), the device's time zone is a
 * good guess for the country. Only the region is kept, never the address. `?region=IN-DL`
 * on any link picks one by hand and sticks, for checking how the other side looks;
 * `?region=auto` goes back to asking.
 */

const KEY = "plusone.region";
const CHOSEN_KEY = "plusone.region.chosen";

const ZONES: Record<string, string> = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Dubai": "AE",
  "Asia/Singapore": "SG",
  "Europe/London": "GB",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Edmonton": "CA",
  "America/Winnipeg": "CA",
  "America/Halifax": "CA",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Pacific/Auckland": "NZ",
  "Pacific/Honolulu": "US",
};

const US_ZONE = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/|Kentucky\/|North_Dakota\/)|US\/)/;

/** A country from an IANA time zone, for the few zones that clearly mean one. */
export function regionFromTimeZone(zone: string | undefined): string | undefined {
  if (!zone) return undefined;
  if (ZONES[zone]) return ZONES[zone];
  return US_ZONE.test(zone) ? "US" : undefined;
}

/** The region in /geo's answer ({ "region": "IN-DL" }), or nothing if it isn't one. */
export function regionFromGeo(body: unknown): string | undefined {
  const region = (body as { region?: unknown } | null)?.region;
  return typeof region === "string" && REGION.test(region) ? region : undefined;
}

const REGION = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

/** A hand-picked region from the address (`?region=in`), if there is a sensible one. */
export function regionFromLink(search: string): string | undefined {
  const code = new URLSearchParams(search).get("region")?.trim().toUpperCase();
  return code && REGION.test(code) ? code : undefined;
}

function stored(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the guess just isn't remembered
  }
}

function forget(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(CHOSEN_KEY);
  } catch {
    // nothing was remembered
  }
}

function deviceZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** The best answer available without waiting: a hand pick, the last answer, or the clock. */
export function guessRegion(): string | undefined {
  if (new URLSearchParams(window.location.search).get("region") === "auto") forget();
  const picked = regionFromLink(window.location.search);
  if (picked) {
    store(KEY, picked);
    store(CHOSEN_KEY, "1");
    return picked;
  }
  return stored(KEY) ?? regionFromTimeZone(deviceZone());
}

let asked: Promise<string | undefined> | undefined;

/** Cloudflare's answer, asked once per page load. */
function askCloudflare(): Promise<string | undefined> {
  asked ??= fetch("/geo")
    .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? r.json() : null))
    .then(regionFromGeo)
    .catch(() => undefined);
  return asked;
}

/**
 * The region to act on once, such as which sample to open: a hand pick at once, otherwise
 * Cloudflare's answer if it comes within `waitMs`, otherwise the best guess.
 */
export async function settledRegion(waitMs = 1500): Promise<string | undefined> {
  const guess = guessRegion();
  if (stored(CHOSEN_KEY)) return guess;
  const answer = await Promise.race([askCloudflare(), new Promise<undefined>((done) => setTimeout(() => done(undefined), waitMs))]);
  if (answer) store(KEY, answer);
  return answer ?? guess;
}

/** The visitor's region ("IN-DL", "IN", "US"), or undefined while nothing is known. */
export function useRegion(): string | undefined {
  const [region, setRegion] = useState(guessRegion);
  useEffect(() => {
    if (stored(CHOSEN_KEY)) return;
    let live = true;
    void askCloudflare().then((code) => {
      if (!code || !live) return;
      store(KEY, code);
      setRegion(code);
    });
    return () => {
      live = false;
    };
  }, []);
  return region;
}

/** The region's country, in English, as the onboarding country picker names it. */
export function countryName(region: string): string | undefined {
  try {
    const code = region.slice(0, 2);
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return name && name !== code ? name : undefined;
  } catch {
    return undefined;
  }
}
