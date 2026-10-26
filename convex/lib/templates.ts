import type { EventType } from "./validators";

export type TemplateEvent = {
  name: string;
  /** Relative share of the total budget. */
  weight: number;
  /** Default guest count. */
  guestCount: number;
  description?: string;
};

export type TemplateSlot = {
  category: string;
  title: string;
  /** Percent of totalBudget planned for this slot. */
  pct: number;
  /** Restrict to events whose name matches one of these; all events when omitted. */
  sessionNames?: string[];
};

export const SESSION_COLORS = [
  "#e11d48", // rose
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

/**
 * What a need for someone to lead a ceremony, pooja or homam is called until the family
 * names that person themselves ("Iyer", "Pandit ji", "Celebrant"). Its category is always
 * "Officiant"; the title is theirs to change.
 */
export const LEAD_TITLE = "Who leads the ceremony";

/** The sessions every kind of event starts with. Most are one; all can be added to. */
export const TYPE_SESSIONS: Record<EventType, TemplateEvent[]> = {
  birthday: [{ name: "Birthday lunch", weight: 1, guestCount: 80 }],
  housewarming: [
    { name: "Griha pravesam", weight: 1, guestCount: 30, description: "The early-morning homam and entry into the house, for close family." },
    { name: "Lunch", weight: 2, guestCount: 120, description: "Lunch for family, friends and neighbours." },
  ],
  naming_ceremony: [{ name: "Naming ceremony", weight: 1, guestCount: 50 }],
  pooja: [{ name: "Pooja", weight: 1, guestCount: 40 }],
  baby_shower: [{ name: "Baby shower", weight: 1, guestCount: 60 }],
  anniversary: [{ name: "Anniversary dinner", weight: 1, guestCount: 60 }],
  engagement: [{ name: "Engagement", weight: 1, guestCount: 100 }],
  graduation: [{ name: "Graduation party", weight: 1, guestCount: 50 }],
  office_party: [{ name: "Office party", weight: 1, guestCount: 80 }],
  team_offsite: [
    { name: "Day one", weight: 1, guestCount: 40, description: "Arrival, sessions and a team dinner." },
    { name: "Day two", weight: 1, guestCount: 40, description: "Activities, lunch and the trip home." },
  ],
  product_launch: [{ name: "Launch evening", weight: 1, guestCount: 150 }],
  conference: [{ name: "Conference day", weight: 1, guestCount: 200 }],
  college_fest: [
    { name: "Day one", weight: 1, guestCount: 1500 },
    { name: "Day two", weight: 1, guestCount: 2000 },
  ],
  community_festival: [{ name: "Festival day", weight: 1, guestCount: 500 }],
  party: [{ name: "The event", weight: 1, guestCount: 50 }],
  // One part to start; the family's own description sets out the rest, in their words.
  wedding: [{ name: "Ceremony", weight: 1, guestCount: 100 }],
};

/** Who each kind of event usually needs, with a share of the budget for each. */
export const TYPE_SLOTS: Record<EventType, TemplateSlot[]> = {
  birthday: [
    { category: "Venue", title: "Venue", pct: 25 },
    { category: "Catering", title: "Catering", pct: 35 },
    { category: "Decor & Florals", title: "Decorations", pct: 12 },
    { category: "Cake", title: "Cake", pct: 6 },
    { category: "Photographer", title: "Photography", pct: 10 },
    { category: "Entertainment", title: "Music or entertainment", pct: 7 },
    { category: "Gifting", title: "Return gifts", pct: 5 },
  ],
  housewarming: [
    { category: "Officiant", title: LEAD_TITLE, pct: 8, sessionNames: ["Griha pravesam"] },
    { category: "Catering", title: "Catering", pct: 45 },
    { category: "Decor & Florals", title: "Flowers & decoration", pct: 14 },
    { category: "Rentals", title: "Tents, chairs & rentals", pct: 13 },
    { category: "Photographer", title: "Photography", pct: 10 },
    { category: "Gifting", title: "Return gifts", pct: 10 },
  ],
  naming_ceremony: [
    { category: "Officiant", title: LEAD_TITLE, pct: 10 },
    { category: "Catering", title: "Catering", pct: 45 },
    { category: "Decor & Florals", title: "Decoration", pct: 15 },
    { category: "Photographer", title: "Photography", pct: 15 },
    { category: "Gifting", title: "Return gifts", pct: 15 },
  ],
  pooja: [
    { category: "Officiant", title: LEAD_TITLE, pct: 20 },
    { category: "Catering", title: "Catering", pct: 45 },
    { category: "Decor & Florals", title: "Flowers", pct: 20 },
    { category: "Gifting", title: "Return gifts", pct: 15 },
  ],
  baby_shower: [
    { category: "Venue", title: "Venue", pct: 25 },
    { category: "Catering", title: "Catering", pct: 35 },
    { category: "Decor & Florals", title: "Decoration", pct: 15 },
    { category: "Photographer", title: "Photography", pct: 12 },
    { category: "Gifting", title: "Return gifts", pct: 13 },
  ],
  anniversary: [
    { category: "Venue", title: "Venue", pct: 30 },
    { category: "Catering", title: "Catering", pct: 35 },
    { category: "Decor & Florals", title: "Decor & florals", pct: 12 },
    { category: "Photographer", title: "Photography", pct: 10 },
    { category: "Music/DJ", title: "Music", pct: 8 },
    { category: "Cake", title: "Cake", pct: 5 },
  ],
  engagement: [
    { category: "Venue", title: "Venue", pct: 30 },
    { category: "Catering", title: "Catering", pct: 30 },
    { category: "Photographer", title: "Photography", pct: 12 },
    { category: "Decor & Florals", title: "Decor & florals", pct: 12 },
    { category: "Officiant", title: LEAD_TITLE, pct: 6 },
    { category: "Music/DJ", title: "Music", pct: 10 },
  ],
  graduation: [
    { category: "Venue", title: "Venue", pct: 30 },
    { category: "Catering", title: "Catering", pct: 35 },
    { category: "Decor & Florals", title: "Decorations", pct: 10 },
    { category: "Music/DJ", title: "Music / DJ", pct: 10 },
    { category: "Photographer", title: "Photography", pct: 10 },
    { category: "Cake", title: "Cake", pct: 5 },
  ],
  office_party: [
    { category: "Venue", title: "Venue", pct: 30 },
    { category: "Catering", title: "Catering", pct: 30 },
    { category: "Music/DJ", title: "DJ", pct: 10 },
    { category: "AV & sound", title: "Sound & lighting", pct: 8 },
    { category: "Decor & Florals", title: "Decor", pct: 8 },
    { category: "Emcee", title: "Emcee", pct: 6 },
    { category: "Photographer", title: "Photography", pct: 8 },
  ],
  team_offsite: [
    { category: "Accommodation", title: "Resort & rooms", pct: 45 },
    { category: "Catering", title: "Meals", pct: 15 },
    { category: "Transport", title: "Buses", pct: 12 },
    { category: "AV & sound", title: "AV for sessions", pct: 8 },
    { category: "Entertainment", title: "Team activities", pct: 12 },
    { category: "Gifting", title: "Team merchandise", pct: 8 },
  ],
  product_launch: [
    { category: "Venue", title: "Venue", pct: 30 },
    { category: "AV & sound", title: "Stage, AV & lighting", pct: 22 },
    { category: "Catering", title: "Catering", pct: 20 },
    { category: "Decor & Florals", title: "Stage & branding", pct: 10 },
    { category: "Emcee", title: "Emcee", pct: 6 },
    { category: "Photographer", title: "Photo & video", pct: 12 },
  ],
  conference: [
    { category: "Venue", title: "Venue", pct: 35 },
    { category: "AV & sound", title: "AV", pct: 18 },
    { category: "Catering", title: "Catering", pct: 25 },
    { category: "Event staff", title: "Registration & staff", pct: 8 },
    { category: "Stationery", title: "Badges & printing", pct: 6 },
    { category: "Photographer", title: "Photography", pct: 8 },
  ],
  college_fest: [
    { category: "AV & sound", title: "Stage, sound & lighting", pct: 35 },
    { category: "Entertainment", title: "Performers", pct: 30 },
    { category: "Rentals", title: "Tents & barricades", pct: 15 },
    { category: "Event staff", title: "Security & volunteers", pct: 10 },
    { category: "Photographer", title: "Photography", pct: 10 },
  ],
  community_festival: [
    { category: "Rentals", title: "Pandal & rentals", pct: 30 },
    { category: "Decor & Florals", title: "Decoration", pct: 20 },
    { category: "AV & sound", title: "Sound & lighting", pct: 15 },
    { category: "Catering", title: "Prasadam & food", pct: 25 },
    { category: "Officiant", title: LEAD_TITLE, pct: 10 },
  ],
  party: [
    { category: "Venue", title: "Venue", pct: 30 },
    { category: "Catering", title: "Catering", pct: 35 },
    { category: "Music/DJ", title: "Music / DJ", pct: 15 },
    { category: "Decor & Florals", title: "Decorations", pct: 12 },
    { category: "Photographer", title: "Photography", pct: 8 },
  ],
  wedding: [
    { category: "Venue", title: "Venue", pct: 30 },
    { category: "Catering", title: "Catering", pct: 22 },
    { category: "Photographer", title: "Photography & Video", pct: 10 },
    { category: "Decor & Florals", title: "Decor & Florals", pct: 10 },
    { category: "Music/DJ", title: "Music / DJ", pct: 4 },
    { category: "Live band", title: "Live band", pct: 4 },
    { category: "Attire", title: "Attire", pct: 7 },
    { category: "Makeup & Hair", title: "Makeup & Hair", pct: 3 },
    { category: "Officiant", title: LEAD_TITLE, pct: 1, sessionNames: ["Ceremony"] },
  ],
};

/** A sensible starting budget in US dollars for each kind of event; the host changes it freely. */
export const DEFAULT_BUDGET: Record<EventType, number> = {
  birthday: 2500,
  housewarming: 2000,
  naming_ceremony: 1500,
  pooja: 800,
  baby_shower: 1500,
  anniversary: 3000,
  engagement: 5000,
  graduation: 2500,
  office_party: 6000,
  team_offsite: 15000,
  product_launch: 12000,
  conference: 25000,
  college_fest: 20000,
  community_festival: 8000,
  party: 2000,
  wedding: 40000,
};

/** The parts an occasion starts with, from its type alone. */
export function sessionsFor(eventType: EventType | undefined): TemplateEvent[] {
  return TYPE_SESSIONS[eventType ?? "party"];
}

/** The vendor needs an occasion starts with, from its type alone. */
export function slotsFor(eventType: EventType | undefined): TemplateSlot[] {
  return TYPE_SLOTS[eventType ?? "party"];
}

/** Spread N events across [startDate..endDate] by day index. */
/**
 * One function per day where they fit, so a five-function celebration over three
 * days no longer lands two functions on the same date by accident. When there are
 * more functions than days, the extras share the last day.
 */
export function spreadDayIndexes(count: number, totalDays: number): number[] {
  if (count <= 1) return [0];
  if (count <= totalDays + 1) return Array.from({ length: count }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.min(totalDays, i));
}

/**
 * Splits one event's budget across the vendor needs that serve it, so every
 * need's budget adds up to its events' budgets and to the wedding total.
 * Without this, event budgets and slot budgets were two independent guesses.
 */
export function allocateSlotBudgets(
  sessionBudgets: number[],
  slots: { pct: number; sessionIndexes: number[] }[],
): number[] {
  const alloc = slots.map(() => 0);
  sessionBudgets.forEach((budget, sessionIndex) => {
    const serving = slots
      .map((slot, slotIndex) => ({ slotIndex, pct: slot.pct, serves: slot.sessionIndexes.includes(sessionIndex) }))
      .filter((x) => x.serves);
    const totalPct = serving.reduce((sum, x) => sum + x.pct, 0);
    if (serving.length === 0 || totalPct <= 0) return;
    const shares = splitByWeights(budget, serving.map((x) => x.pct));
    serving.forEach((x, i) => { alloc[x.slotIndex] += shares[i]; });
  });
  return alloc;
}

/** The rounding a person would use for a budget this size: $40,000 splits in hundreds, ₹25,00,000 in thousands. */
export function niceStep(total: number): number {
  if (total >= 1_000_000) return 1000;
  if (total >= 100_000) return 500;
  if (total >= 10_000) return 100;
  if (total >= 1_000) return 50;
  if (total >= 100) return 10;
  return 1;
}

/**
 * Split `total` by weights into round numbers that still sum exactly to `total`.
 * Each share is rounded to a sensible step; whatever rounding leaves over goes to the
 * largest share, where it is least noticeable.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const whole = Math.round(total);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  // Too little to round across this many shares: fall back to whole units.
  const step = whole >= niceStep(whole) * weights.length * 2 ? niceStep(whole) : 1;
  const shares = weights.map((w) => Math.round((whole * w) / sum / step) * step);
  const left = whole - shares.reduce((a, b) => a + b, 0);
  const largest = shares.indexOf(Math.max(...shares));
  shares[largest] += left;
  return shares;
}

/**
 * Extra vendor needs a host can add themselves, beyond what their kind of occasion
 * starts with. Shown as suggestions on the vendors screen.
 */
export const SUGGESTED_CATEGORIES: { category: string; title: string; hint: string }[] = [
  { category: "Live band", title: "Live band", hint: "A band for the reception or party" },
  { category: "Live band", title: "Ceremony musicians", hint: "Strings, harp, choir or a singer for the ceremony" },
  { category: "Music/DJ", title: "DJ", hint: "A DJ for dancing" },
  { category: "Cake", title: "Cake & desserts", hint: "A cake or a dessert table" },
  { category: "Transport", title: "Transport", hint: "Cars or coaches for you and your guests" },
  { category: "Stationery", title: "Invitations & stationery", hint: "Invites, menus, signage" },
  { category: "Celebrant", title: "Celebrant or officiant", hint: "Who leads the ceremony" },
  { category: "Videographer", title: "Videographer", hint: "Film of the day, separate from photography" },
  { category: "Bar", title: "Bar & drinks", hint: "Bar service, bartenders, drinks packages" },
  { category: "Lighting", title: "Lighting & sound", hint: "Uplighting, dance floor, PA" },
  { category: "Childcare", title: "Childcare", hint: "Someone to mind the little ones" },
  { category: "Fireworks", title: "Fireworks or sparklers", hint: "A send-off moment" },
];
