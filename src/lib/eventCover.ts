import type { EventType } from "../../convex/lib/validators";
import { coverPath } from "../../convex/lib/covers";

/**
 * The picture at the top of an event's card on Your events, its event page and its shared links'
 * previews, when the host hasn't set their own: a line drawing for its festival or kind of event,
 * marigold on ink like the home page, never anyone's photo.
 */
export function eventCover(type: EventType | undefined, ...words: Array<string | undefined>): string {
  return coverPath(type, ...words);
}
