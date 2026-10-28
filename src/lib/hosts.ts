/**
 * Three addresses, one build. The home page lives on the bare domain
 * (plusoneevents.site); everything inside the app lives on app.plusoneevents.site;
 * PlusOne Partner, for vendors, has its own, partner.plusoneevents.site, with its own
 * demo. Set at build time; with none set (local dev), everything stays on one address
 * and Partner sits at /partner.
 */
const HOME = (import.meta.env.VITE_HOME_ORIGIN as string | undefined)?.replace(/\/$/, "");
const APP = (import.meta.env.VITE_APP_ORIGIN as string | undefined)?.replace(/\/$/, "");
const PARTNER = (import.meta.env.VITE_PARTNER_ORIGIN as string | undefined)?.replace(/\/$/, "");

/** The pages the home address serves itself. Anything else belongs to the app. */
export const HOME_PATHS = new Set(["/", "/how-it-works", "/pricing", "/privacy", "/terms"]);

/** The pages Partner's address serves itself. Anything else belongs to the app. */
export const PARTNER_PATHS = new Set(["/", "/demo", "/privacy", "/terms"]);

/** A Partner page on the one-address setup: /partner, /partner/demo. */
export const ON_PARTNER_PATH = /^\/partner(\/|$)/;

export function onHomeHost(): boolean {
  if (!HOME || !APP) return false;
  const origin = window.location.origin.replace("://www.", "://");
  return origin === HOME;
}

export function onAppHost(): boolean {
  return Boolean(HOME && APP && window.location.origin === APP);
}

export function onPartnerHost(): boolean {
  return Boolean(PARTNER && window.location.origin === PARTNER);
}

/**
 * Where a Partner page is from here: a path on Partner's own address, its full URL from
 * the home page or the app (a router Link opens it as a new page), or /partner… when
 * everything is on one address.
 */
export function partnerHref(path: "/" | "/demo" | `/?${string}`): string {
  if (onPartnerHost()) return path;
  if (PARTNER) return `${PARTNER}${path}`;
  return path === "/" ? "/partner" : path.startsWith("/?") ? `/partner${path.slice(1)}` : `/partner${path}`;
}

/** Leave for the app's address, keeping the path, query and anchor. */
export function goToApp(path: string): void {
  window.location.replace(`${APP}${path}`);
}

/** Leave for Partner's address, keeping the query and anchor: /partner/demo here is /demo there. */
export function goToPartner(pathname: string, rest = ""): void {
  window.location.replace(`${PARTNER}${pathname.replace(ON_PARTNER_PATH, "/")}${rest}`);
}

export function hasPartnerHost(): boolean {
  return Boolean(PARTNER);
}

/** Back to the home page on the bare domain. */
export function goHome(): void {
  window.location.replace(`${HOME}/`);
}
