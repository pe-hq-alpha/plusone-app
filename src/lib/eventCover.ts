import type { EventType } from "../../convex/lib/validators";

/**
 * The picture at the top of an event's card on Your events, and in its shared links' previews,
 * when the host hasn't set their own: a line drawing for its kind of event (a mandap, a cake,
 * a kalash), marigold on ink like the home page, never anyone's photo.
 */
export function eventCover(type: EventType | undefined): string {
  return `/covers/${type ?? "party"}.jpg`;
}
