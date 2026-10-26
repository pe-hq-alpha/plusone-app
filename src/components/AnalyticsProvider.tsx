import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ANALYTICS_ENABLED, record, forgetVisitor } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { useHideEmails } from "../lib/privacy";

let started = false;

/**
 * PostHog, switched on by VITE_POSTHOG_KEY. Sent through /ingest on our own address so
 * blockers don't drop it; Cloudflare serves that (functions/ingest) and passes on where
 * each visit comes from, and in local dev Vite does. Recordings mask every input, and whole screens marked data-ph-mask
 * (the inbox, guests, the assistant), because they hold other people's details;
 * with "hide email addresses" on, nothing is recorded at all.
 */
/** Addresses with the secret part of invite, RSVP and share links replaced. */
export function scrubSecrets(url: string): string {
  return url.replace(/\/(join|r|p)\/[^/?#]+/g, "/$1/:token").replace(/([?&](?:token|t|u)=)[^&#]+/g, "$1:token");
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me);
  const hideEmails = useHideEmails();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!ANALYTICS_ENABLED || started) return;
    started = true;
    const region = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.includes("eu.") ? "eu" : "us";
    posthog.init(import.meta.env.VITE_POSTHOG_KEY as string, {
      api_host: `${window.location.origin}/ingest/${region}`,
      ui_host: `https://${region}.posthog.com`,
      autocapture: false,
      capture_pageview: true,
      person_profiles: "identified_only",
      session_recording: { maskAllInputs: true, maskTextSelector: "[data-ph-mask], [data-ph-mask] *" },
      // Invite, RSVP and share links carry a secret in the address: it never leaves the browser.
      before_send: (event) => {
        if (!event) return event;
        for (const key of ["$current_url", "$pathname", "$referrer", "$initial_current_url", "$initial_referrer"]) {
          const value = event.properties?.[key];
          if (typeof value === "string") event.properties[key] = scrubSecrets(value);
        }
        return event;
      },
    });
  }, []);

  useEffect(() => {
    if (!ANALYTICS_ENABLED) return;
    try {
      if (hideEmails) posthog.stopSessionRecording();
      else posthog.startSessionRecording();
    } catch {
      // never in the way
    }
  }, [hideEmails]);

  // Who they are, on every sign-in; forgotten on sign-out so the next person isn't merged in.
  useEffect(() => {
    if (!ANALYTICS_ENABLED) return;
    if (isAuthenticated && me?._id) {
      posthog.identify(me._id);
      wasSignedIn.current = true;
      try {
        if (!sessionStorage.getItem("plusone.active")) {
          sessionStorage.setItem("plusone.active", "1");
          record(EVENTS.appActive);
        }
      } catch {
        // storage blocked: count nothing rather than twice
      }
    } else if (!isAuthenticated && wasSignedIn.current) {
      wasSignedIn.current = false;
      forgetVisitor();
    }
  }, [isAuthenticated, me?._id]);

  return <>{children}</>;
}
