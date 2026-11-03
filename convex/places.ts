import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, type ActionCtx } from "./_generated/server";
import { requireActionUserId, requireMember } from "./lib/auth";
import {
  addressTries,
  cityPlace,
  isGoogleMapsHost,
  isShortLinkHost,
  isShortMapLink,
  linkIn,
  pastConsent,
  placeFor,
  placeFromLink,
  placeWordsFromLink,
  plain,
  type Place,
} from "./lib/places";
import { placeValidator } from "./schema";
import { rateLimiter } from "./rateLimits";

/**
 * Places for the map. A Chennai area is known by name (lib/places) and costs nothing; a
 * venue's name or street address goes to OpenStreetMap's lookup (Nominatim), once: the
 * answer, found or not, is kept, so the same words never go out twice.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Nominatim's terms ask every app to say who it is.
const UA = "PlusOne/1.0 (hello@plusoneevents.site)";

const BUSY = "That's as many places as we can look up for now. Drop the pin on the map instead.";
const UNREAD = "We couldn't read a place from that link. Type your area, or tap the map where you are.";

export const cached = internalQuery({
  args: { query: v.string() },
  returns: v.union(v.null(), v.object({ place: v.optional(placeValidator) })),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("placeLookups").withIndex("by_query", (q) => q.eq("query", args.query)).unique();
    return row ? { ...(row.place ? { place: row.place } : {}) } : null;
  },
});

export const remember = internalMutation({
  args: { query: v.string(), place: v.optional(placeValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("placeLookups").withIndex("by_query", (q) => q.eq("query", args.query)).unique();
    if (!row) await ctx.db.insert("placeLookups", { query: args.query, ...(args.place ? { place: args.place } : {}), at: Date.now() });
    return null;
  },
});

/** "Narada Gana Sabha, TTK Road, Alwarpet, Chennai, …" → "Narada Gana Sabha, TTK Road". */
export function shortLabel(displayName: string): string {
  return displayName.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2).join(", ").slice(0, 80);
}

/**
 * Where a venue is, from its name or address: a Chennai area by name first, then
 * OpenStreetMap. Null when nothing is found; the person can drop the pin instead.
 */
export const find = action({
  args: { text: v.string(), city: v.optional(v.string()) },
  returns: v.union(v.null(), placeValidator),
  handler: async (ctx, args): Promise<Place | null> => {
    const userId = await requireActionUserId(ctx);
    const said = args.text.trim();
    const city = args.city?.trim().slice(0, 60);
    const near = cityPlace(city);
    // A Google Maps link, as a vendor copies it from their Google profile, even with their shop's name pasted before it.
    const url = linkIn(said);
    if (!url) {
      // Plain coordinates, a dropped pin's degrees or a Plus Code; else a place name, cut short.
      const text = said.slice(0, 160);
      if (!text) return null;
      const pinned = placeFromLink(text, near);
      if (pinned) return { lat: pinned.lat, lng: pinned.lng, label: "Your pin", precision: "address" };
      return lookUp(ctx, userId, text, city);
    }
    let link = url.slice(0, 2000);
    if (isShortMapLink(link)) {
      const mine = await rateLimiter.limit(ctx, "placeLookup", { key: userId });
      if (!mine.ok) throw new ConvexError(BUSY);
      const full = await followMapLink(link);
      if (!full) throw new ConvexError(UNREAD);
      link = full;
    }
    const pinned = placeFromLink(link, near);
    if (pinned) return { lat: pinned.lat, lng: pinned.lng, label: pinned.name ?? "Your pin", precision: "address" };
    // Many share links carry no point, only the shop's name and address: look the address up.
    const words = placeWordsFromLink(link);
    if (!words) throw new ConvexError(UNREAD);
    const found = await fromAddress(ctx, userId, words, city);
    if (!found) {
      throw new ConvexError(`That link says "${shortLabel(words)}", but we couldn't find it on the map. Type your area, or tap the map where you are.`);
    }
    return found;
  },
});

/**
 * Follows a short map link to the full address it stands for, through Google's own
 * addresses only, one step at a time. It stops at the first full map address and never
 * opens the map page itself: everything the link says about the place is in that address.
 * Null when the link leads nowhere readable.
 */
export async function followMapLink(url: string): Promise<string | null> {
  let at = url;
  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetch(at, { redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
    } catch {
      return null;
    }
    const location = res.headers.get("location");
    // Where a runtime follows redirects itself, the address it ended on is the answer.
    const next = location ? new URL(location, at).toString() : res.url && res.url !== at ? res.url : null;
    if (!next) return null;
    at = pastConsent(next);
    if (!isGoogleMapsHost(at)) return null;
    if (!isShortLinkHost(at)) return at;
  }
  return null;
}

/** OpenStreetMap's answer for some words, asked once: found or not, the answer is kept. `asked` says it went out. */
async function nominatim(ctx: ActionCtx, userId: string, words: string): Promise<{ place?: Place; asked: boolean }> {
  const query = plain(words).trim();
  const seen = await ctx.runQuery(internal.places.cached, { query });
  if (seen) return { ...(seen.place ? { place: seen.place } : {}), asked: false };

  const mine = await rateLimiter.limit(ctx, "placeLookup", { key: userId });
  if (!mine.ok) throw new ConvexError(BUSY);
  const all = await rateLimiter.limit(ctx, "placeLookupAll");
  if (!all.ok) throw new ConvexError(BUSY);

  let place: Place | undefined;
  try {
    const url = `${NOMINATIM}?${new URLSearchParams({ q: words, format: "jsonv2", limit: "1", countrycodes: "in" })}`;
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const [hit] = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
      const lat = Number(hit?.lat);
      const lng = Number(hit?.lon);
      if (hit && Number.isFinite(lat) && Number.isFinite(lng)) {
        place = { lat, lng, label: shortLabel(hit.display_name ?? words), precision: "address" };
      }
    }
  } catch {
    // A slow or failed lookup reads as not found, and isn't kept, so it can be asked again.
    return { asked: true };
  }
  await ctx.runMutation(internal.places.remember, { query, ...(place ? { place } : {}) });
  return { ...(place ? { place } : {}), asked: true };
}

async function lookUp(ctx: ActionCtx, userId: string, raw: string, city: string | undefined): Promise<Place | null> {
  const text = raw.trim().slice(0, 160);
  // A bare area name is answered here, without anything leaving PlusOne.
  const known = placeFor(text, city);
  if (known?.precision === "area" && plain(text).trim().split(" ").length <= 3) return known;

  const words = city && !plain(text).includes(plain(city)) ? `${text}, ${city}` : text;
  const { place } = await nominatim(ctx, userId, words);
  return place ?? known;
}

/**
 * Where a link's address is: the whole address first, then its road or locality. Only the
 * whole address counts as the place itself; a road or locality is marked "area", so the
 * vendor is told to tap their door on the map. Null when even the city is all that's known.
 */
async function fromAddress(ctx: ActionCtx, userId: string, words: string, city: string | undefined): Promise<Place | null> {
  let asked = false;
  for (const [i, q] of addressTries(words).entries()) {
    // Nominatim's terms allow one request a second.
    if (asked) await new Promise((r) => setTimeout(r, 1100));
    const found = await nominatim(ctx, userId, q);
    asked = found.asked;
    if (found.place) return i === 0 ? found.place : { ...found.place, precision: "area" };
  }
  const known = placeFor(words, city);
  return known?.precision === "area" ? known : null;
}

/** Pins the event's venue on the map, or takes the pin away (the area's middle stands in again). */
export const setVenue = mutation({
  args: { eventId: v.id("events"), place: v.optional(placeValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    if (args.place && (Math.abs(args.place.lat) > 90 || Math.abs(args.place.lng) > 180)) throw new ConvexError("That isn't a place on the map.");
    await ctx.db.patch(args.eventId, { venuePlace: args.place ? { ...args.place, label: args.place.label.slice(0, 80) } : undefined });
    return null;
  },
});
