import { useSyncExternalStore } from "react";

/**
 * The visitor's choice about usage analytics, kept in this browser. Until they choose,
 * nothing is sent; "essential" keeps it that way. The `po_vid` security cookie is
 * essential and is not covered by this choice (see the Privacy page).
 */
export type Consent = "essential" | "analytics";

const KEY = "plusone.analyticsConsent";
const CHANGED = "plusone:consent";

export function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "essential" || value === "analytics" ? value : null;
  } catch {
    return null;
  }
}

/** Save a choice, or forget it (null) so the bar asks again. */
export function setConsent(value: Consent | null): void {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  memory = value;
  window.dispatchEvent(new Event(CHANGED));
}

// The last choice made on this page, for browsers that refuse storage.
let memory: Consent | null | undefined;

function current(): Consent | null {
  return readConsent() ?? memory ?? null;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useConsent(): Consent | null {
  return useSyncExternalStore(subscribe, current, () => null);
}
