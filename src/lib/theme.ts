import { useEffect, useState, useSyncExternalStore } from "react";
import { BRAND } from "./brand";

/**
 * Dark by default; light, or whatever the device prefers, when the person picks it. The choice
 * is kept in this browser only: in a cookie shared by the home page and the app (they are two
 * addresses, plusoneevents.site and app.plusoneevents.site, whose storage is separate), and in
 * local storage as before.
 * index.html applies it before the first paint, so a dark page never flashes ivory;
 * this module keeps it in step afterwards and when the device switches at dusk.
 */
export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const KEY = "plusone.theme";
const DARK = "(prefers-color-scheme: dark)";
/** The page colour per theme, for the browser chrome on phones. */
const CHROME: Record<Theme, string> = { light: "#fefcf7", dark: "#11141c" };

const COOKIE = /(?:^|;\s*)plusone\.theme=(light|dark|system)(?:;|$)/;

/** The choice from the shared cookie first, then this address's own storage, else dark. */
export function choiceFrom(cookie: string, stored: string | null): ThemeChoice {
  const v = cookie.match(COOKIE)?.[1] ?? stored;
  return v === "light" || v === "system" ? v : "dark";
}

export function readChoice(): ThemeChoice {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    // storage blocked: the cookie alone decides
  }
  return choiceFrom(typeof document === "undefined" ? "" : document.cookie, stored);
}

/** The domain the cookie is shared across: the brand's, on its own addresses; this host otherwise. */
export function cookieDomain(hostname: string, domain: string): string | undefined {
  return hostname === domain || hostname.endsWith(`.${domain}`) ? domain : undefined;
}

function writeCookie(choice: ThemeChoice) {
  const domain = cookieDomain(window.location.hostname, BRAND.domain);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `plusone.theme=${choice}; Path=/; Max-Age=31536000; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${secure}`;
}

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.(DARK).matches ? "dark" : "light";
}

export function resolve(choice: ThemeChoice): Theme {
  return choice === "system" ? systemTheme() : choice;
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CHROME[theme]);
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();

export function setChoice(choice: ThemeChoice) {
  try {
    if (choice === "dark") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Private windows can refuse storage; the cookie still carries the choice.
  }
  // Dark is written too, not cleared, so it overrides a light choice left in the other address's storage.
  writeCookie(choice);
  current = choice;
  apply(resolve(choice));
}

let current: ThemeChoice = typeof window === "undefined" ? "dark" : readChoice();

if (typeof window !== "undefined") {
  window.matchMedia?.(DARK).addEventListener("change", () => {
    if (current === "system") apply(systemTheme());
  });
  // Paper is printed light whatever the screen shows.
  window.addEventListener("beforeprint", () => apply("light"));
  window.addEventListener("afterprint", () => apply(resolve(current)));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** The theme on screen right now. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"), () => "light");
}

/** The person's choice, and a way to change it. */
export function useThemeChoice(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, set] = useState<ThemeChoice>(current);
  useEffect(() => subscribe(() => set(current)), []);
  return [choice, setChoice];
}
