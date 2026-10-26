import posthog from "posthog-js";
import type { EventName } from "./events";

export const ANALYTICS_ENABLED = Boolean(import.meta.env.VITE_POSTHOG_KEY);

type Detail = Record<string, string | number | boolean>;

/** Runs an analytics call only when analytics is set up, and never lets it reach the page. */
function quietly(call: () => void): void {
  if (!ANALYTICS_ENABLED) return;
  try {
    call();
  } catch {
    // a lost data point is fine; a broken click is not
  }
}

export const record = (event: EventName, detail?: Detail): void => quietly(() => posthog.capture(event, detail));

/** On sign-out, so the next person on this browser starts as a new visitor. */
export const forgetVisitor = (): void => quietly(() => posthog.reset());
