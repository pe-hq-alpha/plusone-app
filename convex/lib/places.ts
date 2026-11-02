import { VENDOR_CATEGORIES } from "./vendorNeeds";

/**
 * Where vendors and venues are, for the map: a point and how sure we are of it. Chennai's
 * areas are known here by name, so a vendor who says "Mylapore" is on the map without
 * sending anything anywhere; a street address goes to OpenStreetMap's lookup
 * (convex/places.ts) and is kept once found. The points are each area's middle, close
 * enough to say who is near a venue, never a door to knock on.
 */

export type Place = { lat: number; lng: number; label: string; precision: "address" | "area" | "city" };

type Known = { name: string; aliases?: string[]; lat: number; lng: number };

/** Chennai's areas, by the names people use for them. */
export const CHENNAI_AREAS: Known[] = [
  { name: "Adyar", lat: 13.0012, lng: 80.2565 },
  { name: "Alwarpet", lat: 13.0336, lng: 80.255 },
  { name: "Ambattur", lat: 13.1143, lng: 80.1548 },
  { name: "Anna Nagar", lat: 13.085, lng: 80.2101 },
  { name: "Ashok Nagar", lat: 13.0373, lng: 80.2123 },
  { name: "Besant Nagar", aliases: ["elliots beach"], lat: 13.0003, lng: 80.2668 },
  { name: "Boat Club", lat: 13.0255, lng: 80.2525 },
  { name: "Chetpet", lat: 13.0714, lng: 80.2417 },
  { name: "Chromepet", lat: 12.9516, lng: 80.1462 },
  { name: "Egmore", lat: 13.0732, lng: 80.2609 },
  { name: "Gopalapuram", lat: 13.048, lng: 80.255 },
  { name: "Guindy", lat: 13.0067, lng: 80.2206 },
  { name: "K.K. Nagar", aliases: ["kk nagar", "k k nagar"], lat: 13.041, lng: 80.199 },
  { name: "Kilpauk", lat: 13.0825, lng: 80.242 },
  { name: "Kodambakkam", lat: 13.05, lng: 80.224 },
  { name: "Kotturpuram", lat: 13.018, lng: 80.242 },
  { name: "Mandaveli", aliases: ["mandavelli"], lat: 13.027, lng: 80.262 },
  { name: "Medavakkam", lat: 12.92, lng: 80.192 },
  { name: "Mogappair", lat: 13.0837, lng: 80.175 },
  { name: "Mylapore", lat: 13.0339, lng: 80.2676 },
  { name: "Nungambakkam", lat: 13.06, lng: 80.242 },
  { name: "Pallavaram", lat: 12.9675, lng: 80.1491 },
  { name: "Perambur", lat: 13.121, lng: 80.233 },
  { name: "Perungudi", lat: 12.9654, lng: 80.2461 },
  { name: "Porur", lat: 13.0382, lng: 80.1565 },
  { name: "Purasawalkam", aliases: ["purasaiwakkam"], lat: 13.088, lng: 80.255 },
  { name: "R.A. Puram", aliases: ["ra puram", "r a puram", "raja annamalaipuram"], lat: 13.028, lng: 80.258 },
  { name: "Royapettah", lat: 13.054, lng: 80.264 },
  { name: "Saidapet", lat: 13.0213, lng: 80.2231 },
  { name: "Santhome", aliases: ["san thome"], lat: 13.033, lng: 80.278 },
  { name: "Sholinganallur", lat: 12.901, lng: 80.2279 },
  { name: "T. Nagar", aliases: ["t nagar", "thyagaraya nagar", "tnagar"], lat: 13.0418, lng: 80.2341 },
  { name: "Tambaram", lat: 12.9249, lng: 80.1 },
  { name: "Teynampet", lat: 13.0405, lng: 80.2503 },
  { name: "Thiruvanmiyur", lat: 12.983, lng: 80.2594 },
  { name: "Triplicane", lat: 13.0588, lng: 80.2756 },
  { name: "Vadapalani", lat: 13.05, lng: 80.2121 },
  { name: "Valasaravakkam", lat: 13.04, lng: 80.175 },
  { name: "Velachery", lat: 12.979, lng: 80.2209 },
  { name: "West Mambalam", aliases: ["mambalam"], lat: 13.0383, lng: 80.2209 },
];

/**
 * Austin's neighbourhoods, for the American sample event and its sample vendors: each one's
 * middle, from the city's own neighbourhood map, rounded like Chennai's.
 */
export const AUSTIN_AREAS: Known[] = [
  { name: "Allandale", lat: 30.34, lng: -97.745 },
  { name: "Barton Hills", lat: 30.253, lng: -97.785 },
  { name: "Bouldin Creek", aliases: ["bouldin"], lat: 30.254, lng: -97.758 },
  { name: "Brentwood", lat: 30.332, lng: -97.74 },
  { name: "Cherrywood", lat: 30.29, lng: -97.713 },
  { name: "Clarksville", lat: 30.281, lng: -97.76 },
  { name: "Crestview", lat: 30.348, lng: -97.731 },
  { name: "Downtown Austin", aliases: ["downtown"], lat: 30.2672, lng: -97.7431 },
  { name: "East Austin", aliases: ["east side", "eastside"], lat: 30.264, lng: -97.72 },
  { name: "Holly", lat: 30.255, lng: -97.727 },
  { name: "Hyde Park", lat: 30.306, lng: -97.729 },
  { name: "Montopolis", lat: 30.233, lng: -97.7 },
  { name: "Mueller", lat: 30.298, lng: -97.705 },
  { name: "North Loop", lat: 30.318, lng: -97.724 },
  { name: "Rainey Street", aliases: ["rainey"], lat: 30.2585, lng: -97.7385 },
  { name: "Rosedale", lat: 30.317, lng: -97.747 },
  { name: "South Congress", aliases: ["soco"], lat: 30.2489, lng: -97.7501 },
  { name: "South Lamar", aliases: ["south lamar boulevard"], lat: 30.245, lng: -97.779 },
  { name: "Tarrytown", lat: 30.296, lng: -97.772 },
  { name: "Travis Heights", lat: 30.247, lng: -97.742 },
  { name: "Windsor Park", lat: 30.315, lng: -97.695 },
  { name: "Zilker", lat: 30.262, lng: -97.77 },
];

/** Cities whose areas are known here by name. */
const AREAS_OF: Record<string, Known[]> = { Chennai: CHENNAI_AREAS, Austin: AUSTIN_AREAS };

/** Each city's middle, for centring the map when nothing nearer is known. */
export const CITIES: Known[] = [
  { name: "Chennai", aliases: ["madras"], lat: 13.0827, lng: 80.2707 },
  { name: "Bengaluru", aliases: ["bangalore"], lat: 12.9716, lng: 77.5946 },
  { name: "Mumbai", aliases: ["bombay"], lat: 19.076, lng: 72.8777 },
  { name: "Delhi", aliases: ["new delhi"], lat: 28.6139, lng: 77.209 },
  { name: "Hyderabad", lat: 17.385, lng: 78.4867 },
  { name: "Coimbatore", lat: 11.0168, lng: 76.9558 },
  { name: "Madurai", lat: 9.9252, lng: 78.1198 },
  { name: "Kolkata", aliases: ["calcutta"], lat: 22.5726, lng: 88.3639 },
  { name: "Pune", lat: 18.5204, lng: 73.8567 },
  { name: "Austin", lat: 30.2672, lng: -97.7431 },
];

/** Lower case, dots and commas as spaces, single spaces: "R.A. Puram," reads as "r a puram". */
export function plain(text: string): string {
  return ` ${text.toLowerCase().replace(/[.,;:()/\\|\-–—]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** The known place named in a text, the longest name first so "West Mambalam" beats "Mambalam". */
function named(text: string, list: Known[]): Known | null {
  const hay = plain(text);
  let best: { known: Known; length: number } | null = null;
  for (const known of list) {
    for (const name of [known.name, ...(known.aliases ?? [])]) {
      const needle = plain(name);
      if (hay.includes(needle) && (!best || needle.length > best.length)) best = { known, length: needle.length };
    }
  }
  return best?.known ?? null;
}

export function cityPlace(city: string | undefined): Place | null {
  const known = city ? named(city, CITIES) : null;
  return known ? { lat: known.lat, lng: known.lng, label: known.name, precision: "city" } : null;
}

/**
 * Where a text about a place points: a known area, else the city's middle. Areas are known
 * for Chennai and Austin, so an area is matched only in its own city; with no city given,
 * Chennai's are read.
 */
export function placeFor(text: string | undefined, city?: string): Place | null {
  const areas = city ? AREAS_OF[named(city, CITIES)?.name ?? ""] : CHENNAI_AREAS;
  const area = text && areas ? named(text, areas) : null;
  if (area) return { lat: area.lat, lng: area.lng, label: area.name, precision: "area" };
  return cityPlace(city) ?? (text ? cityPlace(text) : null);
}

/** Kilometres between two points, along the ground. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "under 1 km", "1.2 km", "8 km": tenths only where they matter, and two points in one area never read as "0 km". */
export function kmText(km: number): string {
  if (km < 1) return "under 1 km";
  return km < 10 ? `${(Math.round(km * 10) / 10).toString()} km` : `${Math.round(km)} km`;
}

/** The words people use for each trade, as VENDOR_CATEGORIES names it. */
const TRADE_WORDS: Record<string, string[]> = {
  Venue: ["venue", "venues", "hall", "halls", "mandapam", "mandapams", "marriage hall", "banquet", "banquets", "party hall", "lawn"],
  Catering: ["caterer", "caterers", "catering", "cook", "cooks", "food", "meals", "saapadu", "lunch", "dinner"],
  Photographer: ["photographer", "photographers", "photography", "photos", "photo", "candid"],
  Videographer: ["videographer", "videographers", "videography", "video"],
  "Decor & Florals": ["decor", "decorator", "decorators", "decoration", "decorations", "flowers", "florist", "florists", "stage"],
  "Music/DJ": ["dj", "djs", "music"],
  "Live band": ["band", "bands", "nadaswaram", "live music"],
  Entertainment: ["entertainment", "magician", "magicians", "entertainer", "entertainers"],
  "AV & sound": ["sound", "lighting", "lights", "av"],
  "Makeup & Hair": ["makeup", "make up", "hair", "beautician", "bridal makeup"],
  "Mehndi artist": ["mehndi", "mehendi", "henna"],
  Cake: ["cake", "cakes", "baker", "bakers", "bakery", "desserts"],
  Stationery: ["invitations", "invitation", "cards"],
  Transport: ["transport", "cars", "car rental", "bus"],
  Fireworks: ["fireworks", "crackers"],
  Rentals: ["rentals", "tent", "tents", "chairs", "shamiana"],
  Gifting: ["return gifts", "gifts", "gifting"],
  Emcee: ["emcee", "anchor"],
  Celebrant: ["celebrant"],
  Officiant: ["officiant", "priest", "purohit", "vadhyar"],
};

/** What a search like "veg caterers near Adyar under 400" asks for. Every part is optional. */
export type Asked = { category?: string; city?: string; area?: string; maxPrice?: number };

/**
 * Reads a plain search without a model: the trade from its everyday words, a Chennai
 * area or a city by name, and a price after "under", "below" or "within". Most searches
 * are this simple; only one it can't place a trade in goes to Muse Spark.
 */
export function readSearch(text: string): Asked {
  const hay = plain(text);
  let category: string | undefined;
  let longest = 0;
  for (const [trade, words] of Object.entries(TRADE_WORDS)) {
    if (!VENDOR_CATEGORIES.includes(trade)) continue;
    for (const word of words) {
      const needle = plain(word);
      if (hay.includes(needle) && needle.length > longest) {
        category = trade;
        longest = needle.length;
      }
    }
  }
  const city = named(text, CITIES)?.name;
  const area = !city || city === "Chennai" ? named(text, CHENNAI_AREAS)?.name : city === "Austin" ? named(text, AUSTIN_AREAS)?.name : undefined;
  const price = /(?:under|below|within|upto|up to|less than|max)\s*(?:rs\.?|₹|inr)?\s*([\d,]+)\s*(k|thousand|lakh|lakhs|l)?\b/i.exec(text);
  let maxPrice: number | undefined;
  if (price) {
    const n = Number(price[1].replace(/,/g, ""));
    const unit = price[2]?.toLowerCase();
    const scaled = unit === "k" || unit === "thousand" ? n * 1_000 : unit?.startsWith("l") ? n * 100_000 : n;
    if (Number.isFinite(scaled) && scaled > 0) maxPrice = scaled;
  }
  return {
    ...(category ? { category } : {}),
    ...(city ? { city } : area ? { city: "Chennai" } : {}),
    ...(area ? { area } : {}),
    ...(maxPrice ? { maxPrice } : {}),
  };
}

/** A short Google Maps share link (maps.app.goo.gl/…), which has to be followed to its full address first. */
export function isShortMapLink(text: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(text.trim());
}

/** Whether a link may be followed while reading a map link: Google's own map and short-link addresses only. */
export function isGoogleMapsHost(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (/^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/i.test(hostname)) return true;
    if (/^consent\.google\.[a-z.]+$/i.test(hostname)) return true;
    return /^(www\.|maps\.)?google\.[a-z.]+$/i.test(hostname) && (hostname.startsWith("maps.") || pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

const inRange = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/**
 * A point from what a vendor pastes: a Google Maps link (the place's own marker first, then
 * a search or the map's middle) or plain coordinates ("13.0339, 80.2619"). The place's name
 * comes with it when the link has one. Null when there is no point in it.
 */
export function placeFromLink(text: string): { lat: number; lng: number; name?: string } | null {
  const raw = text.trim();
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  const name = /\/maps\/place\/([^/@?]+)/.exec(s)?.[1]?.replace(/\+/g, " ").trim();
  const tries = [
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|center|destination|daddr)=(?:loc:)?(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
    /\/maps\/search\/(-?\d{1,3}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const re of tries) {
    const m = re.exec(s);
    if (m && inRange(Number(m[1]), Number(m[2]))) return { lat: Number(m[1]), lng: Number(m[2]), ...(name ? { name: name.slice(0, 80) } : {}) };
  }
  return null;
}
