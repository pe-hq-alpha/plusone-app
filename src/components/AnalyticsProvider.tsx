import { useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ANALYTICS_ENABLED, record, forgetVisitor, setAnalyticsLive } from "../lib/analytics/client";
import { useConsent } from "../lib/analytics/consent";
import { ConsentBar } from "./ConsentBar";
import { EVENTS } from "../lib/analytics/events";

let started = false;

/** Addresses with the secret part of invite, RSVP and share links replaced. */
export function scrubSecrets(url: string): string {
  return url.replace(/\/(join|r|p)\/[^/?#]+/g, "/$1/:token").replace(/([?&](?:token|t|u)=)[^&#]+/g, "$1:token");
}

/**
 * PostHog, switched on by VITE_POSTHOG_KEY and started only once the visitor presses
 * "Allow analytics" on the consent bar; until then, and after "Essential only", nothing
 * is sent. Sent through /ingest on our own address so blockers don't drop it; Cloudflare
 * serves that (functions/ingest) without passing on the visitor's IP address, and in
 * local dev Vite does. Session recordings are off.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me);
  const consent = useConsent();
  const allowed = consent === "analytics";
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!ANALYTICS_ENABLED) return;
    if (!allowed) {
      // "Essential only" after allowing: stop at once.
      if (started) {
        try {
          posthog.opt_out_capturing();
          posthog.reset();
        } catch {
          // never in the way
        }
      }
      setAnalyticsLive(false);
      return;
    }
    if (started) {
      try {
        posthog.opt_in_capturing();
      } catch {
        // never in the way
      }
      setAnalyticsLive(true);
      return;
    }
    started = true;
    const region = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.includes("eu.") ? "eu" : "us";
    posthog.init(import.meta.env.VITE_POSTHOG_KEY as string, {
      api_host: `${window.location.origin}/ingest/${region}`,
      ui_host: `https://${region}.posthog.com`,
      autocapture: false,
      capture_pageview: true,
      person_profiles: "identified_only",
      disable_session_recording: true,
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
    setAnalyticsLive(true);
  }, [allowed]);

  // Who they are, on every sign-in; forgotten on sign-out so the next person isn't merged in.
  useEffect(() => {
    if (!ANALYTICS_ENABLED || !allowed) return;
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
  }, [isAuthenticated, me?._id, allowed]);

  return (
    <>
      {children}
      {ANALYTICS_ENABLED && consent === null && <ConsentBar />}
    </>
  );
}
