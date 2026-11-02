import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "../lib/session";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PlusOneLockup } from "../components/brand/Wordmarks";
import { DEMO_PAGES } from "./PlanLinkPage";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { settledRegion } from "../lib/region";

/**
 * /demo: straight into a fresh demo event, no sign-up.
 *
 * A guest arriving again gets a clean sample rather than whatever the last visitor
 * left behind, so the link can be handed to several people in a row. Someone with a
 * real account keeps theirs: they are only shown the sample, never signed out of it.
 * The birthday opens by default, in the visitor's own money and customs: Amma's 60th in
 * Chennai for visitors in India, Dad's 60th in Austin for everyone else (src/lib/region.ts;
 * `?region=US` or `?region=IN` picks one by hand). A link can pick another sample:
 * /demo?sample=housewarming, /demo?sample=office, or either birthday with
 * ?sample=birthday or ?sample=birthday-us.
 */
export function GuestPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const start = useMutation(api.demo.start);
  const kind = new URLSearchParams(window.location.search).get("sample")?.toLowerCase() ?? undefined;
  // A shared demo link reopens the same page in a fresh copy ("?to=decisions").
  const to = new URLSearchParams(window.location.search).get("to") ?? "";
  const page = DEMO_PAGES.has(to) ? `/${to}` : "";
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Each step happens once per visit, whatever React does with re-renders.
  const cleared = useRef(false);
  const signedIn = useRef(false);
  const opened = useRef(false);

  useEffect(() => {
    if (isLoading || opened.current) return;
    const failed = () => setError("We couldn't open the demo. Try again in a moment.");
    // Someone with a real account keeps it; only a leftover guest is cleared out.
    const isGuest = me !== null && me !== undefined && !me.email && !me.name;

    if (isAuthenticated && isGuest && !cleared.current) {
      cleared.current = true;
      void signOut().catch(failed);
      return;
    }
    if (!isAuthenticated && !signedIn.current) {
      signedIn.current = true;
      // The guest we are about to create is this visit's, not a leftover, so it must
      // never be cleared out by the branch above.
      cleared.current = true;
      void signIn("anonymous").catch(failed);
      return;
    }
    if (isAuthenticated && me !== undefined) {
      opened.current = true;
      // The region only matters for the birthday; a link's own sample wins.
      void settledRegion()
        .then((region) => start({ kind, region: region ?? "unknown" }))
        .then((eventId) => {
          record(EVENTS.demoOpened);
          navigate(`/e/${eventId}${page}`, { replace: true });
        })
        .catch(failed);
    }
  }, [isLoading, isAuthenticated, me, signIn, signOut, start, navigate, kind, page]);

  return (
    <main id="main" className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="text-4xl">
          <PlusOneLockup />
        </p>
        {error ? (
          <>
            <p role="alert" className="mt-4 text-bad">{error}</p>
            <Link to="/signin" className="btn-quiet mt-5">Back to sign in</Link>
          </>
        ) : (
          <p className="mt-4 text-muted">Setting up the demo…</p>
        )}
      </div>
    </main>
  );
}
