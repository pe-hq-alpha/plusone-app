/**
 * The home page's line drawing behind a page that has no hero of its own. It fades out in the
 * middle, where the page's own content sits, so it frames the page without getting in the way.
 * `quiet` is for inside the app: the same drawing, fainter. `contained` keeps it to its parent
 * (which must then be positioned) instead of the whole window. The parent must be `isolate` so the
 * drawing sits above its background and below its content.
 */
export function Backdrop({ quiet = false, contained = false }: { quiet?: boolean; contained?: boolean }) {
  return <div aria-hidden="true" className={`backdrop no-print${quiet ? " backdrop--quiet" : ""}${contained ? " backdrop--contained" : ""}`} />;
}
