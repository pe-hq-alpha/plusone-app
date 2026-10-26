import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Dark by default; light, or whatever the device prefers, when the person picks it. The choice
 * is kept in this browser only.
 * index.html applies it before the first paint, so a dark page never flashes ivory;
 * this module keeps it in step afterwards and when the device switches at dusk.
 */
export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const KEY = "plusone.theme";
const DARK = "(prefers-color-scheme: dark)";
/** The page colour per theme, for the browser chrome on phones. */
const CHROME: Record<Theme, string> = { light: "#fefcf7", dark: "#11141c" };

export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
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
    // Private windows can refuse storage; the choice then lasts for this page only.
  }
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
