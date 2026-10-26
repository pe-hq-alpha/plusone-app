import { TERMS_VERSION } from "../../convex/lib/terms";

export { TERMS_VERSION };

/**
 * The sign-in page's "I agree" box, remembered in this browser until the account it
 * signs in to has recorded it (users.acceptTerms). Kept across a Google sign-in's
 * round trip, which leaves the page and comes back.
 */
const KEY = "plusone.termsAccepted";

export function rememberAgreement(agreed: boolean): void {
  try {
    if (agreed) localStorage.setItem(KEY, TERMS_VERSION);
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the box still has to be ticked on this page
  }
}

/** The version agreed to on this browser and not yet recorded, if any. */
export function pendingAgreement(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearAgreement(): void {
  rememberAgreement(false);
}
