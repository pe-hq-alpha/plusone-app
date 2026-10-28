import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PlusOneLockup } from "../components/brand/Wordmarks";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { onPartnerHost, partnerHref } from "../lib/hosts";
import { useAuthActions } from "../lib/session";

/**
 * The vendors' demo, on Partner's own address: straight in as a sample caterer, no
 * sign-up, with a customer's request to answer. It is its own demo, separate from the
 * customers' one in the app. Like that one, a guest arriving again starts clean, and
 * someone with a real account is never signed out of it.
 */
export function VendorDemoPage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const start = useMutation(api.demo.startVendor);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Each step happens once per visit, whatever React does with re-renders.
  const cleared = useRef(false);
  const signedIn = useRef(false);
  const opened = useRef(false);

  useEffect(() => {
    if (isLoading || opened.current) return;
    const failed = () => setError("We couldn't open the demo. Try again in a moment.");
    if (isAuthenticated && me === undefined) return;
    const isGuest = Boolean(me?.isGuest);

    if (isAuthenticated && !isGuest) {
      // A real account keeps it: their own Partner page, not a sample.
      opened.current = true;
      navigate(partnerHref("/"), { replace: true });
      return;
    }
    // On Partner's own address a leftover guest is cleared for a clean start. With everything
    // on one address, the guest may be in the customers' demo, so that one is kept.
    if (isAuthenticated && isGuest && !cleared.current && onPartnerHost()) {
      cleared.current = true;
      void signOut().catch(failed);
      return;
    }
    if (!isAuthenticated && !signedIn.current) {
      signedIn.current = true;
      // The guest about to be made is this visit's, so it is never cleared out above.
      cleared.current = true;
      void signIn("anonymous").catch(failed);
      return;
    }
    if (isAuthenticated && isGuest) {
      opened.current = true;
      void start({})
        .then(() => {
          record(EVENTS.vendorDemoOpened);
          navigate(partnerHref("/"), { replace: true });
        })
        .catch(failed);
    }
  }, [isLoading, isAuthenticated, me, signIn, signOut, start, navigate]);

  return (
    <main id="main" className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <p className="text-4xl">
          <PlusOneLockup />
        </p>
        {error ? (
          <>
            <p role="alert" className="mt-4 text-bad">{error}</p>
            <Link to={partnerHref("/")} className="btn-quiet mt-5">Back to PlusOne Partner</Link>
          </>
        ) : (
          <p className="mt-4 text-muted">Setting up your sample business…</p>
        )}
      </div>
    </main>
  );
}
