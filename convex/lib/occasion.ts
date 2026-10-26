import type { EventType } from "./validators";

/**
 * What kind of event is being planned, and how to talk about it.
 *
 * No Convex imports here, so the browser can use the same words the emails do.
 * Weddings are one quiet type among many: selectable, never the lead.
 */

type Occasion = { eventType?: EventType; host: string; coHost: string };

export type EventGroup = "family" | "work" | "other";

export const EVENT_TYPES: { id: EventType; name: string; blurb: string; group: EventGroup }[] = [
  { id: "birthday", name: "Birthday", blurb: "A milestone birthday, a sixtieth, a kids' party.", group: "family" },
  { id: "housewarming", name: "Housewarming", blurb: "A griha pravesam or a housewarming lunch.", group: "family" },
  { id: "naming_ceremony", name: "Naming ceremony", blurb: "Namakaranam, a cradle ceremony, a first-month do.", group: "family" },
  { id: "pooja", name: "Pooja at home", blurb: "A homam, a Satyanarayana pooja, a festival at home.", group: "family" },
  { id: "baby_shower", name: "Baby shower", blurb: "A valaikappu, a godh bharai, a shower.", group: "family" },
  { id: "anniversary", name: "Anniversary", blurb: "A dinner or a party for the years so far.", group: "family" },
  { id: "engagement", name: "Engagement", blurb: "A ring ceremony or a nischayathartham.", group: "family" },
  { id: "graduation", name: "Graduation", blurb: "A party for the graduate and their people.", group: "family" },
  { id: "office_party", name: "Office party", blurb: "A Diwali party, a year-end night, a team celebration.", group: "work" },
  { id: "team_offsite", name: "Team offsite", blurb: "A day or two away, with sessions, meals and travel.", group: "work" },
  { id: "product_launch", name: "Product launch", blurb: "A launch evening for customers and press.", group: "work" },
  { id: "conference", name: "Conference", blurb: "Talks, a venue, AV and a lot of lunches.", group: "work" },
  { id: "college_fest", name: "College fest", blurb: "Stages, sound, food stalls and a crowd.", group: "work" },
  { id: "community_festival", name: "Community festival", blurb: "A Ganesh pandal, a Durga Puja, a society festival.", group: "work" },
  { id: "party", name: "Something else", blurb: "Any other gathering, in your own words.", group: "other" },
  { id: "wedding", name: "Wedding", blurb: "One day or several, set out in your own words.", group: "other" },
];

/** The noun a vendor or guest would use: "a birthday party", "their housewarming". */
export const NOUN: Record<EventType, string> = {
  birthday: "birthday party",
  housewarming: "housewarming",
  naming_ceremony: "naming ceremony",
  pooja: "pooja",
  baby_shower: "baby shower",
  anniversary: "anniversary celebration",
  engagement: "engagement",
  graduation: "graduation party",
  office_party: "office party",
  team_offsite: "team offsite",
  product_launch: "product launch",
  conference: "conference",
  college_fest: "college fest",
  community_festival: "community festival",
  party: "event",
  wedding: "wedding",
};

/** Events with no type are treated as a general event. */
export function eventTypeOf(o: { eventType?: EventType }): EventType {
  return o.eventType ?? "party";
}

export function isWedding(o: { eventType?: EventType }): boolean {
  return o.eventType === "wedding";
}

/** Work events have attendees and an organisation; family ones have guests and hosts. */
export function isWorkEvent(o: { eventType?: EventType }): boolean {
  return EVENT_TYPES.find((t) => t.id === eventTypeOf(o))?.group === "work";
}

/** "wedding", "birthday party": the occasion in a sentence. */
export function occasionNoun(o: { eventType?: EventType }): string {
  return NOUN[eventTypeOf(o)];
}

/** "a birthday party", "an anniversary celebration", "an engagement party". */
export function anOccasion(o: { eventType?: EventType }): string {
  const noun = occasionNoun(o);
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

/** "Anita & Sam", or just "Anita" when one person is hosting. */
export function hostsLabel(o: Pick<Occasion, "host" | "coHost">): string {
  const a = o.host.trim();
  const b = o.coHost.trim();
  return a && b ? `${a} & ${b}` : a || b || "The host";
}

/** True when there is more than one name to sign an email with. */
export function hasCoHost(o: Pick<Occasion, "host" | "coHost">): boolean {
  return Boolean(o.host.trim() && o.coHost.trim());
}

/** What a part of the event is called: a wedding's ceremony, a work event's session, a family function's function. */
export function partWord(o: { eventType?: EventType }, plural = false): string {
  const word = isWedding(o) ? "ceremony" : isWorkEvent(o) ? "session" : "function";
  return plural ? (word === "ceremony" ? "ceremonies" : `${word}s`) : word;
}

/** Who comes: attendees at a work event, guests at everything else. */
export function peopleWord(o: { eventType?: EventType }): string {
  return isWorkEvent(o) ? "attendees" : "guests";
}

/** How the event is referred to in a sentence: "the event", "the wedding", "the offsite". */
export function theEvent(o: { eventType?: EventType }): string {
  return isWedding(o) ? "the wedding" : "the event";
}
