import posthog from "posthog-js";
import type { EventName } from "./events";

export const ANALYTICS_ENABLED = Boolean(import.meta.env.VITE_POSTHOG_KEY);

type Detail = Record<string, string | number | boolean>;

// True only while PostHog is running, which is only after the visitor allowed analytics.
let live = false;

/** Set by AnalyticsProvider when PostHog starts or stops. */
export function setAnalyticsLive(value: boolean): void {
  live = value;
}

/** Runs an analytics call only when analytics is set up and allowed, and never lets it reach the page. */
function quietly(call: () => void): void {
  if (!ANALYTICS_ENABLED || !live) return;
  try {
    call();
  } catch {
    // a lost data point is fine; a broken click is not
  }
}

export const record = (event: EventName, detail?: Detail): void => quietly(() => posthog.capture(event, detail));

/** On sign-out, so the next person on this browser starts as a new visitor. */
export const forgetVisitor = (): void => quietly(() => posthog.reset());
