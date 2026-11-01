import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { BRAND } from "../../lib/brand";
import { onPartnerHost, partnerHref } from "../../lib/hosts";
import { PlusOneLockup } from "../brand/Wordmarks";
import { ThemeSwitch } from "../ui/ThemeSwitch";
import "../../styles/running-status.css";
import "../../styles/public.css";

/**
 * The home page's top bar, for the other public pages: the lockup, How it works, Find vendors, Pricing, For vendors, Sign in and a
 * small theme switch. `brand={false}` hides the lockup on wide screens, where something beside it shows it. `wide` lets the bar
 * run the full width of the screen, for a page that fills it.
 */
export function PublicNav({ signIn = true, brand = true, wide = false }: { signIn?: boolean; brand?: boolean; wide?: boolean }) {
  const { pathname } = useLocation();
  const { isAuthenticated } = useConvexAuth();
  const here = (path: string) => (pathname === path ? "page" : undefined);
  return (
    <header className={`pub-nav${brand ? "" : " pub-nav--no-brand"}${wide ? " pub-nav--wide" : ""}`}>
      <Link to="/" className="pub-brand" aria-label={`${BRAND.name} Events home`}>
        <PlusOneLockup className="text-[1.9rem]" />
      </Link>
      <nav className="pub-links" aria-label="Main">
        <Link to="/how-it-works" className="pub-link rs__link pub-link--hide-sm" aria-current={here("/how-it-works")}>How it works</Link>
        <Link to="/vendors" className="pub-link rs__link pub-link--hide-sm" aria-current={here("/vendors")}>Find vendors</Link>
        <Link to="/pricing" className="pub-link rs__link" aria-current={here("/pricing")}>Pricing</Link>
        <Link to={partnerHref("/")} className="pub-link rs__link" aria-current={onPartnerHost() ? "page" : here("/partner")}>
          <span className="max-sm:hidden">For vendors</span>
          <span className="sm:hidden">Partner</span>
        </Link>
        {signIn && (isAuthenticated ? (
          <Link to="/" className="pub-link rs__link pub-link--accent rs__link--accent">Your events</Link>
        ) : (
          <Link to="/signin" className="pub-link rs__link pub-link--accent rs__link--accent">Sign in</Link>
        ))}
        {/* On a phone the bar keeps its links; the theme follows the device. */}
        <ThemeSwitch compact className="ml-2 max-sm:hidden" />
      </nav>
    </header>
  );
}

/** A centred page heading in the home page's type: a small label, the title with one italic phrase, a line under it. */
export function PublicHero({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="pub-hero">
      <p className="pub-eyebrow">{eyebrow}</p>
      <h1 className="pub-title">{title}</h1>
      {lede && <p className="pub-lede">{lede}</p>}
    </div>
  );
}
