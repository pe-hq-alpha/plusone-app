/**
 * Where this visit comes from, as Cloudflare sees it: the country and, where known, the
 * state ({ "region": "IN-DL" }). The app uses it to show the right sample wedding and
 * money. Only the region is returned; the address itself is never read or kept.
 */

type Geo = { country?: string; regionCode?: string };

/** "IN-DL", "IN", or null when Cloudflare doesn't know (XX) or the visit is through Tor (T1). */
export function regionOf(cf: Geo | undefined): string | null {
  const country = cf?.country?.toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country) || country === "XX" || country === "T1") return null;
  const state = cf?.regionCode?.toUpperCase();
  return state && /^[A-Z0-9]{1,3}$/.test(state) ? `${country}-${state}` : country;
}

// Readable from any origin: the home page's request is redirected here from plusoneevents.site,
// and the answer only ever describes the caller's own region.
export const onRequest = async ({ request }: { request: Request & { cf?: Geo } }): Promise<Response> =>
  new Response(JSON.stringify({ region: regionOf(request.cf) }), {
    headers: { "content-type": "application/json", "cache-control": "private, no-store", "access-control-allow-origin": "*" },
  });
