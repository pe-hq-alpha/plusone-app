import { Link, useLocation } from "react-router-dom";
import { PlusOneLockup } from "../components/brand/Wordmarks";

/** The pages of a plan a demo can open at, by their first step after the event's id. */
export const DEMO_PAGES = new Set(["plan", "tasks", "budget", "spaces", "website", "gifts", "help", "decisions", "venue", "vendors", "inbox", "guests", "assistant"]);

/** "/e/abc/decisions/xyz" → "decisions", when the demo has that page; otherwise nothing. */
export function demoPageOf(pathname: string): string | null {
  const page = /^\/e\/[^/]+\/([a-z-]+)/.exec(pathname)?.[1];
  return page && DEMO_PAGES.has(page) ? page : null;
}

/**
 * A link to a plan, opened by someone who isn't signed in: a shared or reopened demo link,
 * or a private plan. Nobody signed out can tell which, so both ways in are offered, and the
 * demo opens on the same page the link was for.
 */
export function PlanLinkPage() {
  const { pathname } = useLocation();
  const page = demoPageOf(pathname);
  return (
    <main id="main" className="grid min-h-screen place-items-center px-5 text-center">
      <div className="max-w-sm">
        <p className="text-4xl">
          <PlusOneLockup />
        </p>
        <h1 className="mt-6 text-2xl">This plan is private</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to open it if it&rsquo;s yours or you&rsquo;ve been invited. Looking at the sample plan? Open a fresh copy of the demo.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href={`/demo${page ? `?to=${page}` : ""}`} className="btn-primary">Open the demo</a>
          <Link to="/signin" className="btn-quiet">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
