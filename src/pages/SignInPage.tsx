import { useState } from "react";
import { SignIn, SignUp } from "@clerk/react";
import { Link, useSearchParams } from "react-router-dom";
import { PlusOneMark } from "../components/brand/Wordmarks";
import { useAuthActions } from "../lib/session";
import { BRAND } from "../lib/brand";
import { ThemeFooter } from "../components/ui/ThemeFooter";
import { pendingAgreement, rememberAgreement, TERMS_VERSION } from "../lib/terms";

/**
 * Sign in or create an account. The form itself is Clerk's (email and password, a code
 * by email, or Google), in the app's colours. It stays on this page's address, so it
 * also works inside an invite link and brings the person back to it.
 *
 * The form stays switched off until the "I agree" box is ticked; the agreement is
 * remembered here and recorded against the account once it signs in (lib/session).
 */
export function SignInPage({ redirectTo }: { redirectTo?: string }) {
  const [params] = useSearchParams();
  const newHere = params.get("new") === "1";
  const { error } = useAuthActions();
  const back = redirectTo ?? (window.location.pathname === "/signin" ? "/" : window.location.pathname + window.location.search);
  const [agreed, setAgreed] = useState(() => pendingAgreement() === TERMS_VERSION);
  const agree = (value: boolean) => {
    setAgreed(value);
    rememberAgreement(value);
  };

  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="display text-4xl tracking-tight">
          <PlusOneMark />
        </p>
        <h1 className="mt-4 text-2xl">Your plus one for the perfect event.</h1>
        <p className="mt-2 text-sm text-muted">
          {BRAND.name} finds vendors, writes to them from your event&rsquo;s own inbox and reads their quotes into your budget,
          so the legwork is done and the choices stay yours. <Link to="/how-it-works" className="underline">How it works</Link>
        </p>
        {error && <p role="alert" className="mt-4 rounded-[12px] bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>}
        <label className="mt-6 flex items-start gap-3 rounded-[12px] border border-line bg-cream px-4 py-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            required
            checked={agreed}
            onChange={(e) => agree(e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
          />
          <span>
            I&rsquo;m 18 or older and agree to the{" "}
            <Link to="/terms" className="text-accent underline underline-offset-2">Terms</Link> and{" "}
            <Link to="/privacy" className="text-accent underline underline-offset-2">Privacy Policy</Link>, including security
            logging of my IP address.
          </span>
        </label>
        {!agreed && <p className="mt-2 text-xs text-muted">Tick the box to sign in or create an account.</p>}
        <div
          className={`mt-6 flex justify-center transition-opacity ${agreed ? "" : "pointer-events-none opacity-50"}`}
          inert={!agreed}
          aria-disabled={!agreed}
        >
          {newHere ? (
            <SignUp routing="hash" signInUrl="/signin" forceRedirectUrl={back} />
          ) : (
            <SignIn routing="hash" signUpUrl="/signin?new=1" forceRedirectUrl={back} signUpForceRedirectUrl={back} />
          )}
        </div>
        <p className="mt-5 text-center text-sm text-muted">
          Just looking?{" "}
          <Link to="/demo" className="text-accent underline underline-offset-2">
            See the demo
          </Link>{" "}
          first. No sign-up.
        </p>
        <ThemeFooter className="mt-8" />
      </div>
    </main>
  );
}
