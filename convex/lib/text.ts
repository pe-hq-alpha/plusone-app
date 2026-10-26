/** Small pure helpers shared by default-runtime and node files. */

export const MAX_BODY_CHARS = 100_000;

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…[truncated]";
}

/** Cut at a word with an ellipsis, for a line people read (truncate is for model input). */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max - 1);
  return `${text.slice(0, cut > max / 2 ? cut : max - 1).replace(/[,;:.\s]+$/, "")}…`;
}

/** "Priya Shah <priya@example.com>" -> "priya@example.com" (lower-cased). */
export function extractEmail(input: string | undefined | null): string {
  if (!input) return "";
  const m = input.match(/<([^>]+)>/);
  const raw = (m ? m[1] : input).trim();
  const found = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (found ? found[0] : raw).toLowerCase();
}

export function findEmails(text: string): string[] {
  const seen = new Set<string>();
  const re = /(?:mailto:)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const e = m[1].toLowerCase();
    if (/\.(png|jpg|jpeg|gif|svg|webp)$/.test(e)) continue;
    if (e.includes("example.com") || e.includes("sentry") || e.includes("wixpress")) continue;
    seen.add(e);
  }
  return [...seen];
}

/** Normalised host for dedupe: lower-case, no leading "www.". */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** A web address safe to show as a link: http or https only, or nothing. */
export function safeHttpUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Only the addresses safe to link to, without repeats. */
export function safeHttpUrls(urls: readonly string[], max: number): string[] {
  return [...new Set(urls.map(safeHttpUrl).filter((u): u is string => u !== null))].slice(0, max);
}

/** Canonical website value stored on vendors (also the dedupe key). */
export function canonicalWebsite(url: string): string | null {
  const host = hostOf(url);
  return host ? `https://${host}` : null;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 4 Dec 2026" from "2026-12-04", the way a guest reads a date; anything else as given. */
export function dayDate(isoDate: string, withYear = true): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || Number.isNaN(d.getTime())) return isoDate;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

/** "Fri 4 Dec to Sun 6 Dec 2026", or a single day when they're the same. */
export function dayRange(start: string, end: string): string {
  if (!end || end === start) return dayDate(start);
  return `${dayDate(start, start.slice(0, 4) !== end.slice(0, 4))} to ${dayDate(end)}`;
}

export function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export const DAY_MS = 86_400_000;
export const FOLLOW_UP_DELAY_MS = 3 * DAY_MS;

/**
 * Find the thing a person meant by name: an exact match first, then either side
 * containing the other, so "the barn" finds "The Oak Barn at Driftwood".
 */
export function matchByName<T>(list: T[], wanted: string | null | undefined, key: (item: T) => string): T | undefined {
  const needle = wanted?.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    list.find((item) => key(item).trim().toLowerCase() === needle) ??
    list.find((item) => {
      const name = key(item).trim().toLowerCase();
      return name.includes(needle) || needle.includes(name);
    })
  );
}


// Festivals, faiths and places stay capitalised mid-sentence: "your Diwali hampers".
const PROPER = /^(Diwali|Deepavali|Holi|Onam|Pongal|Navratri|Durga|Ganesh|Ganesha|Eid|Christmas|Easter|Lohri|Baisakhi|Hindu|Muslim|Sikh|Christian|Jain|Parsi|Jewish|DJ|AV|MC)\b/;

/** A need's name as it reads inside a sentence: "Catering" becomes "catering", "Diwali hampers" stays. */
export function inSentence(name: string): string {
  return PROPER.test(name) || /^[A-Z]{2}/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);
}
