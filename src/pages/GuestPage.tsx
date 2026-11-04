import { useEffect, useRef, useState } from "react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { likelySignedOut, useAuthActions } from "../lib/session";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PlusOneLockup } from "../components/brand/Wordmarks";
import { DEMO_PAGES } from "./PlanLinkPage";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { settledRegion } from "../lib/region";
import { localToday } from "../lib/format";
import type { Id } from "../../convex/_generated/dataModel";

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
  const convex = useConvex();
  // Started at once rather than after sign-in: where the visitor is (for which sample), and
  // the Overview's own code, so neither is waited on later.
  const [region] = useState(() => settledRegion());
  useEffect(() => {
    if (!page) void import("./TodayPage").catch(() => {});
  }, [page]);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Each step happens once per visit, whatever React does with re-renders.
  const cleared = useRef(false);
  const signedIn = useRef(false);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    // A browser with no account and no demo yet needn't wait for Clerk to load: the guest
    // is signed in straight away (the branch below). Anyone else waits as before.
    const early = isLoading && !isAuthenticated && likelySignedOut();
    if (isLoading && !early) return;
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
    // A guest made on this visit is known to be fresh, so it needn't wait for `me`.
    if (isAuthenticated && (signedIn.current || me !== undefined)) {
      opened.current = true;
      // The region only matters for the birthday; a link's own sample wins.
      void region
        .then((code) => start({ kind, region: code ?? "unknown" }))
        .then((eventId) => {
          // The event's first screen asks for these; asking now means they arrive together.
          const id = eventId as Id<"events">;
          convex.prewarmQuery({ query: api.events.get, args: { eventId: id } });
          convex.prewarmQuery({ query: api.threads.inboxCount, args: { eventId: id } });
          if (!page) {
            convex.prewarmQuery({ query: api.copilot.route, args: { eventId: id, today: localToday() } });
            convex.prewarmQuery({ query: api.tasks.list, args: { eventId: id } });
          }
          record(EVENTS.demoOpened);
          navigate(`/e/${eventId}${page}`, { replace: true });
        })
        .catch(failed);
    }
  }, [isLoading, isAuthenticated, me, signIn, signOut, start, navigate, kind, page, region, convex]);

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
          <>
            {/* Making a fresh sample event takes a few seconds: say what is being made, so the wait reads as work. */}
            <p className="mt-4 text-muted">Setting up a sample event for you…</p>
            <p className="mt-1.5 text-sm text-quiet">Its plan and budget, vendors, quotes on one sheet, and guests. A few seconds.</p>
            <div className="mx-auto mt-5 h-1 w-40 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div className="h-full w-1/3 animate-[demo-load_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
