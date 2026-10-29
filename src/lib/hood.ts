/**
 * Opening "Under the hood" from anywhere in an event: the panel lives in the event's
 * layout, so a page asks for it with a window event rather than threading state through.
 */
const OPEN = "plusone:open-hood";
const SEEN = "plusone.hoodSeen";

export function openHood() {
  window.dispatchEvent(new Event(OPEN));
}

export function onOpenHood(handler: () => void): () => void {
  window.addEventListener(OPEN, handler);
  return () => window.removeEventListener(OPEN, handler);
}

/** Whether this browser has opened the panel before; storage can be blocked, so it fails quiet. */
export function hoodSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
}

export function markHoodSeen() {
  try {
    window.localStorage.setItem(SEEN, "1");
  } catch {
    // A private window keeps no record; the dot simply shows again next time.
  }
}
