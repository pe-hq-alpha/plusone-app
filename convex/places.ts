import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, type ActionCtx } from "./_generated/server";
import { requireActionUserId, requireMember } from "./lib/auth";
import { isGoogleMapsHost, isShortMapLink, placeFor, placeFromLink, plain, type Place } from "./lib/places";
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
    // Full map links run long; anything else is a place name and is cut short.
    const text = /^https?:\/\//i.test(args.text.trim()) ? args.text.trim().slice(0, 2000) : args.text.trim().slice(0, 160);
    const city = args.city?.trim().slice(0, 60);
    if (!text) return null;
    // A Google Maps link or plain coordinates, as a vendor copies them from their Google profile.
    let link = text;
    if (isShortMapLink(link)) {
      const mine = await rateLimiter.limit(ctx, "placeLookup", { key: userId });
      if (!mine.ok) throw new ConvexError(BUSY);
      link = (await followMapLink(link)) ?? link;
    }
    const pinned = placeFromLink(link);
    if (pinned) return { lat: pinned.lat, lng: pinned.lng, label: pinned.name ?? "Your pin", precision: "address" };
    const named = /^https?:\/\//i.test(link) ? /\/maps\/place\/([^/@?]+)/.exec(decodeURIComponent(link))?.[1]?.replace(/\+/g, " ") : undefined;
    if (/^https?:\/\//i.test(text) && !named) return null;
    return lookUp(ctx, userId, named ?? text, city);
  },
});

/** Follows a short map link to its full address, through Google's own addresses only, in at most four steps. */
async function followMapLink(url: string): Promise<string | null> {
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isGoogleMapsHost(at)) return null;
    try {
      const res = await fetch(at, { redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
      const next = res.headers.get("location");
      if (!next) return at;
      const full = new URL(next, at).toString();
      // Google's consent page carries the real address in its continue parameter.
      const cont = new URL(full).searchParams.get("continue");
      at = /^consent\./.test(new URL(full).hostname) && cont ? cont : full;
      if (placeFromLink(at)) return at;
    } catch {
      return null;
    }
  }
  return at;
}

async function lookUp(ctx: ActionCtx, userId: string, raw: string, city: string | undefined): Promise<Place | null> {
  const text = raw.trim().slice(0, 160);
  // A bare area name is answered here, without anything leaving PlusOne.
  const known = placeFor(text, city);
  if (known?.precision === "area" && plain(text).trim().split(" ").length <= 3) return known;

  const words = city && !plain(text).includes(plain(city)) ? `${text}, ${city}` : text;
  const query = plain(words).trim();
  const seen = await ctx.runQuery(internal.places.cached, { query });
  if (seen) return seen.place ?? known;

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
        place = { lat, lng, label: shortLabel(hit.display_name ?? text), precision: "address" };
      }
    }
  } catch {
    // A slow or failed lookup reads as not found; the area's middle or a dropped pin still works.
    return known;
  }
  await ctx.runMutation(internal.places.remember, { query, ...(place ? { place } : {}) });
  return place ?? known;
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
