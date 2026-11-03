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

/**
 * The first web address in what a vendor pastes. A share from a phone often puts the shop's
 * name before the link ("Pink Bridles https://maps.app.goo.gl/…"), so the link is picked out.
 */
export function linkIn(text: string): string | null {
  return /https?:\/\/[^\s<>"]+/i.exec(text)?.[0] ?? null;
}

/** A short Google Maps share link (maps.app.goo.gl/…), which has to be followed to its full address first. */
export function isShortMapLink(text: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|g\.page)\//i.test(text.trim());
}

/** Google's short-link addresses: followed one step at a time until they reach a full map address. */
export function isShortLinkHost(url: string): boolean {
  try {
    return /^(maps\.app\.goo\.gl|goo\.gl|g\.co|g\.page)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Whether a link may be followed while reading a map link: Google's own map and short-link addresses only. */
export function isGoogleMapsHost(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (/^(maps\.app\.goo\.gl|goo\.gl|g\.co|g\.page)$/i.test(hostname)) return true;
    if (/^consent\.google\.[a-z.]+$/i.test(hostname)) return true;
    return /^(www\.|maps\.)?google\.[a-z.]+$/i.test(hostname) && (hostname.startsWith("maps.") || pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

/** Google's cookie-consent page, where some countries are sent first, carries the real address in its continue parameter. */
export function pastConsent(url: string): string {
  try {
    const u = new URL(url);
    const next = u.searchParams.get("continue");
    return /^consent\.google\.[a-z.]+$/i.test(u.hostname) && next ? next : url;
  } catch {
    return url;
  }
}

const inRange = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

const COORDS = /^\s*-?\d{1,3}\.\d+\s*,\s*\+?-?\d{1,3}\.\d+\s*$/;

/** A path part of a link as words: "+" is a space there, "%2F" a slash inside the name, not a new part. */
function pathWords(part: string): string {
  const spaced = part.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

/**
 * The words a Google Maps link names its place by, when it carries no point: the
 * /maps/place/ or /maps/search/ part, the last stop of a directions link, or what it
 * searched for (q=) or gave directions to (daddr=). A shop's share link is often only this:
 * "16, 1st floor, Shop Name, CTA Garden Main Rd, …, Chennai, Tamil Nadu 600056, India".
 */
export function placeWordsFromLink(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const at = parts.findIndex((p) => p === "place" || p === "search");
  let words = at >= 0 && parts[at + 1] && !parts[at + 1].startsWith("@") ? pathWords(parts[at + 1]) : undefined;
  const dir = parts.indexOf("dir");
  if (!words && dir >= 0) {
    // The last stop is where the directions go; the first is often where the person sharing stood.
    const stops = parts.slice(dir + 1).filter((p) => !p.startsWith("@") && !p.startsWith("data="));
    words = stops.length > 1 ? pathWords(stops[stops.length - 1]) : undefined;
  }
  words ??= ["q", "query", "daddr", "destination"].map((k) => u.searchParams.get(k)).find(Boolean) ?? undefined;
  words = words?.replace(/^loc:/i, "").replace(/\s+/g, " ").trim();
  return words && !COORDS.test(words) ? words.slice(0, 200) : undefined;
}

/**
 * What to ask the map lookup for, from a link's address, most exact first: the whole of it,
 * then its last four parts (road or locality, city, state), then its last three. The shop's
 * name and floor at the front are what usually stop a lookup finding the street.
 */
export function addressTries(words: string): string[] {
  const parts = words.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && /^india$/i.test(parts[parts.length - 1])) parts.pop();
  return [...new Set([parts.join(", "), parts.slice(-4).join(", "), parts.slice(-3).join(", ")])].filter(Boolean);
}

const OLC = "23456789CFGHJMPQRVWX";
const OLC_PAIR = [20, 1, 0.05, 0.0025, 0.000125];

/** The middle of a full Plus Code's square ("7M52JC7X+XQ"), or null if it isn't one. */
function plusCodeMiddle(code: string): { lat: number; lng: number } | null {
  const d = code.toUpperCase().replace("+", "");
  if (d.length < 10) return null;
  let lat = -90;
  let lng = -180;
  for (let p = 0; p < 5; p++) {
    const a = OLC.indexOf(d[p * 2]);
    const b = OLC.indexOf(d[p * 2 + 1]);
    if (a < 0 || b < 0) return null;
    lat += a * OLC_PAIR[p];
    lng += b * OLC_PAIR[p];
  }
  let latCell = OLC_PAIR[4];
  let lngCell = OLC_PAIR[4];
  if (d.length > 10) {
    const g = OLC.indexOf(d[10]);
    if (g < 0) return null;
    latCell /= 5;
    lngCell /= 4;
    lat += Math.floor(g / 4) * latCell;
    lng += (g % 4) * lngCell;
  }
  lat += latCell / 2;
  lng += lngCell / 2;
  return lat < 90 && lng < 180 ? { lat, lng } : null;
}

/** The first digits of the Plus Code of a point, to complete a short code found near it. */
function plusCodePrefix(lat: number, lng: number, length: number): string {
  let la = Math.min(Math.max(lat + 90, 0), 179.999999);
  let ln = (((lng + 180) % 360) + 360) % 360;
  let out = "";
  for (let p = 0; p < length / 2; p++) {
    const a = Math.floor(la / OLC_PAIR[p]);
    const b = Math.floor(ln / OLC_PAIR[p]);
    out += OLC[a] + OLC[b];
    la -= a * OLC_PAIR[p];
    ln -= b * OLC_PAIR[p];
  }
  return out;
}

/**
 * A Plus Code in some words: a full one ("7M52JC7X+XQ") anywhere, or a short one
 * ("JC7X+XQ Chennai") completed from the city it names, else the vendor's city. A short code
 * with no city to place it near gives nothing rather than a guess.
 */
export function plusCodePlace(words: string, near?: { lat: number; lng: number } | null): { lat: number; lng: number } | null {
  const m = /(?<![0-9A-Z])([23456789CFGHJMPQRVWX]{4,8})\+([23456789CFGHJMPQRVWX]{2,3})(?![0-9A-Z])/i.exec(words);
  if (!m || m[1].length % 2) return null;
  if (m[1].length === 8) return plusCodeMiddle(`${m[1]}+${m[2]}`);
  const ref = cityPlace(words.replace(m[0], " ")) ?? near;
  if (!ref) return null;
  const pad = 8 - m[1].length;
  const mid = plusCodeMiddle(`${plusCodePrefix(ref.lat, ref.lng, pad)}${m[1]}+${m[2]}`);
  if (!mid) return null;
  // The short code repeats every `size` degrees; take the copy nearest the city.
  const size = 20 ** (2 - pad / 2);
  let { lat, lng } = mid;
  if (ref.lat + size / 2 < lat && lat - size >= -90) lat -= size;
  else if (ref.lat - size / 2 > lat && lat + size <= 90) lat += size;
  if (ref.lng + size / 2 < lng) lng -= size;
  else if (ref.lng - size / 2 > lng) lng += size;
  return { lat, lng };
}

/** 13°01'59.3"N 80°15'38.6"E, as Google writes a dropped pin. */
function degrees(s: string): { lat: number; lng: number } | null {
  const m = /(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]\s*([NS])[\s+,]*(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]\s*([EW])/i.exec(s);
  if (!m) return null;
  const lat = (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * (/s/i.test(m[4]) ? -1 : 1);
  const lng = (Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600) * (/w/i.test(m[8]) ? -1 : 1);
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/**
 * The destination's point in an iPhone directions link's geocode= parameter: each stop is
 * a small base64 record holding latitude and longitude in millionths, the last stop last.
 */
function geocodeParam(url: string): { lat: number; lng: number } | null {
  let stops: string[];
  try {
    stops = (new URL(url).searchParams.get("geocode") ?? "").split(";").filter(Boolean);
  } catch {
    return null;
  }
  const last = stops[stops.length - 1];
  if (!last) return null;
  let bytes: string;
  try {
    bytes = atob(last.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  const int32 = (i: number) => (bytes.charCodeAt(i) | (bytes.charCodeAt(i + 1) << 8) | (bytes.charCodeAt(i + 2) << 16) | (bytes.charCodeAt(i + 3) << 24)) / 1e6;
  // Field 2 (latitude) then field 3 (longitude), each a four-byte number.
  if (bytes.length < 10 || bytes.charCodeAt(0) !== 0x15 || bytes.charCodeAt(5) !== 0x1d) return null;
  return { lat: int32(1), lng: int32(6) };
}

/**
 * A point from what a vendor pastes: a Google Maps link (the place's own marker first, then
 * a search, a directions link's destination or the map's middle), plain coordinates
 * ("13.0339, 80.2619"), a dropped pin's degrees or a Plus Code. The place's name comes with
 * it when the link has one. Null when there is no point in it: a link that only names its
 * place is read by placeWordsFromLink instead.
 */
export function placeFromLink(text: string, near?: { lat: number; lng: number } | null): { lat: number; lng: number; name?: string } | null {
  const raw = text.trim();
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  const isUrl = /^https?:\/\//i.test(raw);
  const directions = isUrl && /\/maps\/dir\//.test(raw);
  const placePart = /\/maps\/place\/([^/?#]+)/.exec(raw)?.[1];
  const named = placePart ? pathWords(placePart).trim() : undefined;
  const name = named && !/°|^-?\d{1,3}\.\d+\s*,/.test(named) && !/^@/.test(named) ? named.slice(0, 80) : undefined;
  const words = isUrl ? placeWordsFromLink(raw) : raw;
  const pin = (lat: number, lng: number) => (inRange(lat, lng) ? { lat, lng, ...(name ? { name } : {}) } : null);

  // The place's own marker. A directions link holds one per stop; its destination is the last.
  const markers = [...s.matchAll(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/g)];
  const marker = directions ? markers[markers.length - 1] : markers[0];
  if (marker) {
    const p = pin(Number(marker[1]), Number(marker[2]));
    if (p) return p;
  }
  const tries = [
    /[?&](?:q|query|ll|center|destination|daddr)=(?:loc:)?(-?\d{1,3}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/,
    /\/maps\/(?:search|place)\/(-?\d{1,3}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const re of tries) {
    const m = re.exec(s);
    const p = m && pin(Number(m[1]), Number(m[2]));
    if (p) return p;
  }
  const exact = (isUrl && geocodeParam(raw)) || degrees(words ?? "") || (words ? plusCodePlace(words, near) : null);
  if (exact) {
    const p = pin(exact.lat, exact.lng);
    if (p) return p;
  }
  // The map's middle, last: close to a place it was opened on, but never a route's.
  const middle = directions ? null : /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(s);
  return middle ? pin(Number(middle[1]), Number(middle[2])) : null;
}
