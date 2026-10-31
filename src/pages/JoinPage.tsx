import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "../lib/session";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { SignInPage } from "./SignInPage";
import { ThemeFooter } from "../components/ui/ThemeFooter";

const CLOSED = {
  used: "This invite has already been used.",
  cancelled: "This invite was cancelled.",
  expired: "Invite links work for 7 days, and this one has run out.",
} as const;

export function JoinPage() {
  const { token = "" } = useParams<{ token: string }>();
  const preview = useQuery(api.invites.preview, { token });
  const me = useQuery(api.users.me);
  const accept = useMutation(api.invites.accept);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (preview === undefined) return <main id="main" className="grid min-h-screen place-items-center text-muted">Checking your invite…</main>;
  if (preview === null || preview.state !== "open")
    return (
      <main id="main" className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p>{preview ? CLOSED[preview.state] : "This invite link is no longer valid."}</p>
          <p className="mt-1 text-sm text-muted">Ask whoever sent it for a new link.</p>
          <ThemeFooter className="mt-8" />
        </div>
      </main>
    );

  const forWhom = preview.forEmail ? ` This invite is for ${preview.forEmail}.` : "";

  return (
    <>
      <AuthLoading>
        <main id="main" className="grid min-h-screen place-items-center text-muted">Loading…</main>
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto max-w-md px-4 pt-8 text-center">
          <p className="text-sm text-muted">
            You've been invited to help plan <span className="font-medium text-ink">{preview.eventName}</span> as a {preview.role}. Create an account or sign in to join.{forWhom}
          </p>
        </div>
        <SignInPage />
      </Unauthenticated>
      <Authenticated>
        <main id="main" className="grid min-h-screen place-items-center px-4">
          <div>
            <div className="card max-w-md p-8 text-center">
              <p className="display text-2xl">{preview.eventName}</p>
              <p className="mt-2 text-sm text-muted">
                {[preview.host, preview.coHost].filter((n) => n.trim()).join(" and ")} invited you as a <span className="font-medium text-ink">{preview.role}</span>.{forWhom}
              </p>
              {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
              {me?.isGuest ? (
                // Someone still in the demo needs a real account before joining a real event.
                <button className="btn-primary mt-6" onClick={() => void signOut()}>
                  Create an account to join
                </button>
              ) : (
                <button
                  className="btn-primary mt-6"
                  onClick={() => {
                    setError(null);
                    accept({ token })
                      .then((eventId) => navigate(`/e/${eventId}`))
                      // The server's own words ("This invite was sent to s•••@gmail.com…"), never "Server Error".
                      .catch((e: unknown) => {
                        const data = (e as { data?: unknown }).data;
                        setError(typeof data === "string" ? data : "That didn't work. Try again, or ask for a new link.");
                      });
                  }}
                >
                  Join the plan
                </button>
              )}
              {error && /sign in with that address/i.test(error) && (
                <p className="mt-3 text-sm text-muted">
                  Signed in with another address?{" "}
                  <button type="button" className="text-accent underline underline-offset-2" onClick={() => void signOut()}>
                    Sign out and use the invited one
                  </button>
                </p>
              )}
            </div>
            <ThemeFooter className="mt-8" />
          </div>
        </main>
      </Authenticated>
    </>
  );
}
