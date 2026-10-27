import type { EventType } from "../../convex/lib/validators";

/**
 * The picture at the top of an event's card on Your events, by kind of event. They are the
 * celebration photos from the home page, so a new event never opens on a blank card.
 */
const COVER: Record<EventType, string> = {
  wedding: "wedding",
  engagement: "wedding",
  birthday: "birthday",
  graduation: "birthday",
  party: "birthday",
  anniversary: "anniversary",
  naming_ceremony: "firstbday",
  baby_shower: "firstbday",
  housewarming: "diwali",
  pooja: "diwali",
  community_festival: "diwali",
  college_fest: "sangeet",
  office_party: "office",
  team_offsite: "office",
  product_launch: "office",
  conference: "office",
};

export function eventCover(type: EventType | undefined): string {
  return `/photos/${COVER[type ?? "party"] ?? "birthday"}.jpg`;
}
