import { VENDOR_NEEDS, VENDOR_NEED_KEYS, type VendorNeedKey } from "./vocab";
import type { EventType } from "./validators";

// The kinds of vendor an event books, named as the app shows them, and roughly how far
// ahead each is worth booking. Both come from the vendor needs in lib/vocab, so a new need
// added there shows up here.

/** Every vendor category the app knows, once each, in vocab's order. */
export const VENDOR_CATEGORIES: string[] = [...new Set(VENDOR_NEED_KEYS.map((k) => VENDOR_NEEDS[k].category))];

/**
 * Roughly how many weeks before the wedding each kind of vendor is worth securing, set
 * for the wedding season in Indian cities, when the best venues, caterers and
 * photographers are taken first. A guide for "This week", not a deadline.
 */
export const BOOK_AHEAD_WEEKS: Record<VendorNeedKey, number> = {
  venue: 40,
  catering: 32,
  photography: 30,
  videography: 26,
  decor: 22,
  attire: 20,
  live_band: 20,
  celebrant: 18,
  officiant: 16,
  music: 16,
  makeup_hair: 16,
  stationery: 12,
  mehndi_artist: 10,
  bar: 10,
  entertainment: 8,
  sound_lighting: 8,
  transport: 6,
  cake: 6,
  fireworks: 4,
  childcare: 4,
  rentals: 10,
  gifting: 8,
  accommodation: 30,
  event_staff: 8,
  emcee: 10,
};

/**
 * The same, for every other kind of event: a housewarming or an offsite is booked weeks
 * ahead, not months, outside the busiest venues.
 */
export const EVENT_WEEKS: Record<VendorNeedKey, number> = {
  venue: 8,
  catering: 4,
  photography: 3,
  videography: 3,
  decor: 3,
  attire: 3,
  live_band: 4,
  celebrant: 3,
  officiant: 2,
  music: 3,
  makeup_hair: 2,
  stationery: 3,
  mehndi_artist: 2,
  bar: 3,
  entertainment: 3,
  sound_lighting: 4,
  transport: 2,
  cake: 1,
  fireworks: 2,
  childcare: 2,
  rentals: 2,
  gifting: 3,
  accommodation: 6,
  event_staff: 2,
  emcee: 3,
};

/** The book-ahead weeks for a vendor need's category as stored on a slot, or null if unknown. */
export function bookAheadWeeks(category: string, eventType?: EventType): number | null {
  const key = VENDOR_NEED_KEYS.find((k) => VENDOR_NEEDS[k].category === category);
  if (!key) return null;
  return eventType === "wedding" ? BOOK_AHEAD_WEEKS[key] : EVENT_WEEKS[key];
}
