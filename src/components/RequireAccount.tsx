import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "../lib/session";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";

/**
 * Planning an event of your own needs an account. A demo guest who gets here is
 * offered one before they type anything, rather than refused at the very end.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  if (me === undefined) return <main id="main" className="grid min-h-screen place-items-center text-muted">Loading…</main>;
  if (!me?.isGuest) return <>{children}</>;
  return (
    <main id="main" className="grid min-h-screen place-items-center px-5">
      <div className="card max-w-md px-7 py-8 text-center">
        <h1 className="text-[2rem] leading-tight">Plan your own event</h1>
        <p className="mt-2 text-muted">
          The demo is yours to click around. To plan your own event, make a free account first, so your plan is saved and only you and the people you invite can see it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn-primary" onClick={() => void signOut().then(() => navigate("/signin"))}>
            Create an account
          </button>
          <Link to="/" className="btn-quiet">Back to the demo</Link>
        </div>
      </div>
    </main>
  );
}
