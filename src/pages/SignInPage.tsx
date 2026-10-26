import { SignIn, SignUp } from "@clerk/react";
import { Link, useSearchParams } from "react-router-dom";
import { PlusOneMark } from "../components/brand/Wordmarks";
import { useAuthActions } from "../lib/session";
import { BRAND } from "../lib/brand";
import { ThemeFooter } from "../components/ui/ThemeFooter";

/**
 * Sign in or create an account. The form itself is Clerk's (email and password, a code
 * by email, or Google), in the app's colours. It stays on this page's address, so it
 * also works inside an invite link and brings the person back to it.
 */
export function SignInPage({ redirectTo }: { redirectTo?: string }) {
  const [params] = useSearchParams();
  const newHere = params.get("new") === "1";
  const { error } = useAuthActions();
  const back = redirectTo ?? (window.location.pathname === "/signin" ? "/" : window.location.pathname + window.location.search);

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
        <div className="mt-6 flex justify-center">
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
        <p className="mt-3 text-center text-xs text-muted">
          By continuing you agree to the{" "}
          <Link to="/terms" className="underline underline-offset-2">Terms of Use</Link> and the{" "}
          <Link to="/privacy" className="underline underline-offset-2">Privacy</Link> page.
        </p>
        <ThemeFooter className="mt-8" />
      </div>
    </main>
  );
}
