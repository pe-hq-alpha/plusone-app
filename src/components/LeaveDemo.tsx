import { useEffect, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "../lib/session";
import { api } from "../../convex/_generated/api";

/**
 * A demo visitor is signed in as a guest so the sample event works. Once they leave
 * it for the home page or sign-in, the guest session ends, so they see the public home
 * page (or the sign-in form) like anyone else rather than a "my events" page that
 * only holds the demo. People with real accounts pass straight through.
 */
export function LeaveDemo({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const guest = me?.isGuest === true;
  useEffect(() => {
    if (guest) void signOut();
  }, [guest, signOut]);
  if (me === undefined || guest) return <div className="grid min-h-[100dvh] place-items-center bg-paper text-sm text-muted">Loading…</div>;
  return <>{children}</>;
}

/**
 * Where a demo guest goes back to: their own sample event (at `page` inside it), never
 * "/", which would end the guest session and lose what they did. Null while it loads,
 * and for anyone who isn't a guest.
 */
export function useDemoEventPath(page = ""): string | null {
  const me = useQuery(api.users.me);
  const events = useQuery(api.events.listMine, me?.isGuest ? {} : "skip");
  const demo = events?.find((e) => e.event.demo)?.event._id;
  return demo ? `/e/${demo}${page}` : null;
}
