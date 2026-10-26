import { useEffect, useRef, useState } from "react";
import { onAppHost } from "../lib/hosts";
import { BRAND } from "../lib/brand";
import { PlusGlyph, PlusOneMark } from "./brand/Wordmarks";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";

const SEEN_KEY = "plusone.splash.seen";

/** When the paper starts to lift, and when the overlay is gone, in milliseconds. */
const LIFT_AT = 1150;
const DONE_AT = 1600;
const REDUCED_LIFT_AT = 450;
const REDUCED_DONE_AT = 700;

function alreadySeen(): boolean {
  // The splash greets people at the front door, the home page; never again inside the app.
  if (onAppHost()) return true;
  try {
    if (new URLSearchParams(window.location.search).has("splash")) return false;
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Storage can be blocked (private windows, previews). Skipping the splash is the safe outcome.
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // nothing to do
  }
}

/**
 * The first-visit splash: the PlusOne mark settles onto ivory paper, a hairline
 * draws out beneath it with the stroked plus inked at its centre, and the paper
 * lifts away. About 1.6s. It plays once per browser (`?splash` replays it), any
 * click or key skips it, and reduced motion shows the finished mark and goes.
 */
export function Splash() {
  const [show] = useState(() => !alreadySeen());
  const [phase, setPhase] = useState<"play" | "lift" | "gone">("play");
  const reduced = useRef(
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (!show) return;
    markSeen();
    record(EVENTS.introSeen);
    const lift = window.setTimeout(() => setPhase("lift"), reduced.current ? REDUCED_LIFT_AT : LIFT_AT);
    const done = window.setTimeout(() => setPhase("gone"), reduced.current ? REDUCED_DONE_AT : DONE_AT);
    const skip = () => setPhase("gone");
    window.addEventListener("keydown", skip);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(done);
      window.removeEventListener("keydown", skip);
    };
  }, [show]);

  if (!show || phase === "gone") return null;
  return (
    <div
      className={`splash${phase === "lift" ? " is-lifting" : ""}${reduced.current ? " is-reduced" : ""}`}
      onClick={() => setPhase("gone")}
      role="presentation"
    >
      <p className="sr-only" role="status">{BRAND.name}</p>
      <div className="splash__stage" aria-hidden="true">
        <PlusOneMark className="splash__mark" />
        <span className="splash__flourish">
          <span className="splash__rule splash__rule--l" />
          <PlusGlyph className="splash__plus" />
          <span className="splash__rule splash__rule--r" />
        </span>
      </div>
    </div>
  );
}
