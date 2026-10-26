/**
 * PostHog through our own address (/ingest), so blockers don't drop it. This runs on
 * Cloudflare, in front of both plusoneevents.site and app.plusoneevents.site. The
 * visitor's IP address is not passed on: PostHog sees only Cloudflare's, so a visit's
 * country is only as close as the nearest Cloudflare location.
 *
 * The first part of the path says which PostHog region the project lives in
 * (/ingest/eu/... or /ingest/us/...), so nothing needs configuring here.
 */

const HOSTS: Record<string, { api: string; assets: string }> = {
  eu: { api: "https://eu.i.posthog.com", assets: "https://eu-assets.i.posthog.com" },
  us: { api: "https://us.i.posthog.com", assets: "https://us-assets.i.posthog.com" },
};

/** Where a request to /ingest/<region>/<rest> goes upstream, or null for an unknown region. */
export function upstreamUrl(url: URL): string | null {
  const match = /^\/ingest\/(eu|us)(\/.*)?$/.exec(url.pathname);
  if (!match) return null;
  const host = HOSTS[match[1]];
  const path = match[2] ?? "/";
  return `${path.startsWith("/static/") ? host.assets : host.api}${path}${url.search}`;
}

/** Headers that carry the visitor's IP address; none of them goes to PostHog. */
const IP_HEADERS = [
  "cf-connecting-ip",
  "cf-connecting-ipv6",
  "cf-pseudo-ipv4",
  "true-client-ip",
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
];

/** The headers sent upstream: the visitor's own, without cookies or their IP address. */
export function upstreamHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");
  for (const name of IP_HEADERS) headers.delete(name);
  return headers;
}

export const onRequest = async ({ request }: { request: Request }): Promise<Response> => {
  const target = upstreamUrl(new URL(request.url));
  if (!target) return new Response("Not found", { status: 404 });
  const upstream = await fetch(target, {
    method: request.method,
    headers: upstreamHeaders(request),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  });
  const headers = new Headers(upstream.headers);
  headers.delete("set-cookie");
  return new Response(upstream.body, { status: upstream.status, headers });
};
