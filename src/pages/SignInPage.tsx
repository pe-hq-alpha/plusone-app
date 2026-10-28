import { useState } from "react";
import { SignIn, SignUp } from "@clerk/react";
import { Link, useSearchParams } from "react-router-dom";
import { PlusOneLockup } from "../components/brand/Wordmarks";
import { useAuthActions } from "../lib/session";
import { BRAND } from "../lib/brand";
import { PublicNav } from "../components/public/PublicNav";
import { pendingAgreement, rememberAgreement, TERMS_VERSION } from "../lib/terms";
import { Backdrop } from "../components/ui/Backdrop";

/**
 * Sign in or create an account. The form itself is Clerk's (email and password, a code
 * by email, or Google), in the app's colours. It stays on this page's address, so it
 * also works inside an invite link and brings the person back to it.
 *
 * The form stays switched off until the "I agree" box is ticked; the agreement is
 * remembered here and recorded against the account once it signs in (lib/session).
 *
 * Two doors to the same accounts: customers planning an event (families and event managers)
 * come in at /signin, vendors at /partner, with their own words and landing on PlusOne
 * Partner. One person can be both.
 */
export function SignInPage({ redirectTo, audience = "customer" }: { redirectTo?: string; audience?: "customer" | "vendor" }) {
  const [params] = useSearchParams();
  const newHere = params.get("new") === "1";
  const { error } = useAuthActions();
  const vendor = audience === "vendor";
  const here = vendor ? "/partner" : "/signin";
  const back = redirectTo ?? (window.location.pathname === here ? (vendor ? "/partner" : "/") : window.location.pathname + window.location.search);
  const pitch = vendor
    ? `Answer requests from families and event managers on the same sheet every vendor fills in, keep your prices itemised, and get verified so they can find you.`
    : `${BRAND.name} finds vendors, writes to them from your event\u2019s own inbox and reads their quotes into your budget, so the legwork is done and the choices stay yours.`;
  const [agreed, setAgreed] = useState(() => pendingAgreement() === TERMS_VERSION);
  const agree = (value: boolean) => {
    setAgreed(value);
    rememberAgreement(value);
  };

  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* A celebration on the left on wide screens; the form on the right, so it all fits without scrolling. */}
      <aside className="photo-panel relative hidden overflow-hidden lg:block">
        {vendor ? (
          <img src="/photos/sangeet.jpg" alt="Guests dancing at a sangeet under marigold garlands and strings of lights" className="absolute inset-0 size-full object-cover" />
        ) : (
          <img src="/photos/housewarming.jpg" alt="Friends raising their glasses over dinner in a new apartment, a moving box and the city lights behind them" className="absolute inset-0 size-full object-cover" />
        )}
        <div className="photo-scrim absolute inset-0" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Link to="/" className="display text-4xl tracking-tight" aria-label={`${BRAND.name} home`}>
            <PlusOneLockup />
          </Link>
          <div className="max-w-lg">
            <p className="display text-[2.6rem] leading-tight">{vendor ? `${BRAND.name} Partner, for vendors.` : "Your plus one for every event."}</p>
            <p className="mt-3 text-base opacity-90">{pitch}</p>
          </div>
        </div>
      </aside>
      <div className="relative isolate flex min-h-screen flex-col">
        <Backdrop contained />
        <PublicNav signIn={false} brand={false} />
        <div className="grid flex-1 place-items-center px-4 py-8">
        <div className="w-full max-w-md">
        <p className="pub-eyebrow">{vendor ? `${BRAND.name} Partner` : newHere ? "Create your account" : "Sign in"}</p>
        <h1 className="pub-title !text-[2.4rem]">
          {vendor ? (newHere ? <>List <em>your business</em></> : <>Welcome <em>back</em></>) : newHere ? <>Let&rsquo;s plan <em>your event</em></> : <>Welcome <em>back</em></>}
        </h1>
        <p className="mt-2 text-sm text-muted lg:hidden">{pitch}</p>
        {error && <p role="alert" className="mt-4 rounded-[12px] bg-bad-bg px-4 py-3 text-sm text-bad">{error}</p>}
        <label className="mt-5 flex items-start gap-3 rounded-[12px] border border-line bg-cream px-4 py-3 text-sm leading-relaxed">
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
          className={`mt-4 flex justify-center transition-opacity ${agreed ? "" : "pointer-events-none opacity-50"}`}
          inert={!agreed}
          aria-disabled={!agreed}
        >
          {newHere ? (
            <SignUp routing="hash" signInUrl={here} forceRedirectUrl={back} />
          ) : (
            <SignIn routing="hash" signUpUrl={`${here}?new=1`} forceRedirectUrl={back} signUpForceRedirectUrl={back} />
          )}
        </div>
        <p className="mt-5 text-center text-sm text-muted">
          Just looking?{" "}
          <Link to="/demo" className="text-accent underline underline-offset-2">
            See the demo
          </Link>{" "}
          first. No sign-up.
        </p>
        <p className="mt-2 text-center text-sm text-muted">
          {vendor ? "Planning an event? " : "A vendor? "}
          <Link to={vendor ? "/signin" : "/partner"} className="text-accent underline underline-offset-2">
            {vendor ? "Sign in here" : `Sign in to ${BRAND.name} Partner`}
          </Link>
          .
        </p>
        </div>
        </div>
      </div>
    </main>
  );
}

/** The vendors' door, at /partner when signed out: the same accounts, landing on PlusOne Partner. */
export function VendorSignInPage() {
  return <SignInPage audience="vendor" />;
}
