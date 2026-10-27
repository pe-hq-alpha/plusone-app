/**
 * Two addresses, one build. The home page lives on the bare domain
 * (plusoneevents.site); everything inside the app lives on app.plusoneevents.site.
 * Set at build time; with neither set (local dev), everything stays on one address.
 */
const HOME = (import.meta.env.VITE_HOME_ORIGIN as string | undefined)?.replace(/\/$/, "");
const APP = (import.meta.env.VITE_APP_ORIGIN as string | undefined)?.replace(/\/$/, "");

/** The pages the home address serves itself. Anything else belongs to the app. */
export const HOME_PATHS = new Set(["/", "/how-it-works", "/pricing", "/privacy", "/terms"]);

export function onHomeHost(): boolean {
  if (!HOME || !APP) return false;
  const origin = window.location.origin.replace("://www.", "://");
  return origin === HOME;
}

export function onAppHost(): boolean {
  return Boolean(HOME && APP && window.location.origin === APP);
}

/** Leave for the app's address, keeping the path, query and anchor. */
export function goToApp(path: string): void {
  window.location.replace(`${APP}${path}`);
}

/** Back to the home page on the bare domain. */
export function goHome(): void {
  window.location.replace(`${HOME}/`);
}
