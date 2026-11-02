/**
 * The line drawing for an event that has no picture of its own: a festival's when its name says
 * one (a Diwali party gets lamps, not a generic party), else its kind of event's. Marigold on
 * ink, no people. Files live in public/covers.
 */
const FESTIVALS: Array<[RegExp, string]> = [
  [/\b(diwali|deepavali|deepawali)\b/i, "festival_diwali"],
  [/\b(christmas|xmas)\b/i, "festival_christmas"],
  [/\b(eid|ramzan|ramadan|iftar)\b/i, "festival_eid"],
  [/\b(pongal|sankranti|sankranthi|lohri)\b/i, "festival_pongal"],
  [/\bholi\b/i, "festival_holi"],
  [/\bnew year'?s?\b/i, "festival_new_year"],
];

const TYPES = new Set([
  "anniversary", "baby_shower", "birthday", "college_fest", "community_festival", "conference", "engagement", "graduation",
  "housewarming", "naming_ceremony", "office_party", "party", "pooja", "product_launch", "team_offsite", "wedding",
]);

export function coverName(eventType: string | undefined, ...words: Array<string | undefined>): string {
  const text = words.filter(Boolean).join(" ");
  for (const [re, name] of FESTIVALS) if (re.test(text)) return name;
  return eventType && TYPES.has(eventType) ? eventType : "party";
}

export function coverPath(eventType: string | undefined, ...words: Array<string | undefined>): string {
  return `/covers/${coverName(eventType, ...words)}.jpg`;
}

/**
 * The drawing for one part of the day, on an invitation's card: a pooja's when its name says so,
 * a festival's when it names one, else the event's own.
 */
export function partCoverPath(eventType: string | undefined, partName: string, eventName?: string): string {
  if (/\b(pooja|puja|homam|havan|aarti|satyanarayan)\b/i.test(partName)) return "/covers/pooja.jpg";
  return coverPath(eventType, partName, eventName);
}
