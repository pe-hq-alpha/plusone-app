import { BRAND } from "../../lib/brand";

/**
 * PlusOne's mark: EB Garamond, "One" in italic, in the accent ink. It is typographic on
 * purpose, so the name can change without redrawing anything. Every size comes
 * from the surrounding font size.
 */
export function PlusOneMark({ className = "" }: { className?: string }) {
  return (
    <span className={`po-mark ${className}`}>
      <span className="sr-only">{BRAND.name}</span>
      <span aria-hidden="true">
        Plus<em>One</em>
      </span>
    </span>
  );
}

/**
 * The site's logo: "Plus" in heading ink, "One" in the italic accent, and EVENTS in small capitals
 * under "One", as at the top of the home page. Used wherever the logo stands for the site, so it
 * reads the same on every page. Sized from the surrounding font size.
 */
export function PlusOneLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`po-lockup ${className}`}>
      <span className="sr-only">{BRAND.name} Events</span>
      <span aria-hidden="true" className="po-lockup__mark">
        Plus<em>One</em>
      </span>
      <span aria-hidden="true" className="po-lockup__events">Events</span>
    </span>
  );
}

/** The stroked plus (M14 33h20 M24 23v20 on a 64 grid), cropped to its own box. */
export function PlusGlyph({ className = "" }: { className?: string }) {
  return (
    <svg className={`plus-glyph ${className}`} viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <path d="M3 13h20M13 3v20" pathLength={1} />
    </svg>
  );
}
