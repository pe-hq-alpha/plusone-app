import type { EventType } from "../../convex/lib/validators";

/**
 * The picture at the top of an event's card on Your events, by kind of event. They are the
 * celebration photos from the home page, Western and Indian, so a new event never opens on a
 * blank card and the cards don't all look like one country.
 */
const COVER: Record<EventType, string> = {
  wedding: "first-dance",
  engagement: "wedding",
  birthday: "birthday",
  graduation: "backyard-birthday",
  party: "backyard-birthday",
  anniversary: "anniversary",
  naming_ceremony: "firstbday",
  baby_shower: "first-birthday",
  housewarming: "housewarming",
  pooja: "diwali",
  community_festival: "diwali",
  college_fest: "sangeet",
  office_party: "office",
  team_offsite: "office",
  product_launch: "rooftop-launch",
  conference: "rooftop-launch",
};

export function eventCover(type: EventType | undefined): string {
  return `/photos/${COVER[type ?? "party"] ?? "birthday"}.jpg`;
}
