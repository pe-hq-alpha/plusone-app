import type { EventType } from "../../convex/lib/validators";
import { isWedding, isWorkEvent, partWord, peopleWord } from "../../convex/lib/occasion";

/**
 * The few words the screens need beyond `convex/lib/occasion`: capitalised forms for
 * headings, and examples that fit the kind of event being planned.
 */

type Kind = { eventType?: EventType };

export const capitalise = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** "Ceremony", "Sessions", "Function": for a heading or a label. */
export const PartWord = (o: Kind, plural = false) => capitalise(partWord(o, plural));

/** "Guests" or "Attendees". */
export const PeopleWord = (o: Kind) => capitalise(peopleWord(o));

/** "a guest" or "an attendee". */
export const aPerson = (o: Kind) => (isWorkEvent(o) ? "an attendee" : "a guest");

/** A placeholder for naming a new part of the event. */
export function partExamples(o: Kind): string {
  if (isWedding(o)) return "Haldi, sangeet, reception…";
  if (isWorkEvent(o)) return "Keynote, team lunch, awards night…";
  return "Lunch, cake cutting, evening party…";
}
