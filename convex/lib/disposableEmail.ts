/**
 * Common temporary, disposable and throwaway email services. A short built-in list, no
 * outside lookup: it catches the usual ones, not every one. A subdomain of a listed
 * domain counts too.
 */
const DISPOSABLE = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonaddy.me",
  "burnermail.io", "discard.email", "dispostable.com", "dropmail.me", "emailondeck.com",
  "fakeinbox.com", "fakemail.net", "getairmail.com", "getnada.com", "guerrillamail.biz",
  "guerrillamail.com", "guerrillamail.de", "guerrillamail.info", "guerrillamail.net",
  "guerrillamail.org", "guerrillamailblock.com", "grr.la", "harakirimail.com", "inboxkitten.com",
  "incognitomail.org", "maildrop.cc", "mailcatch.com", "mailinator.com", "mailinator.net",
  "mailnesia.com", "mailpoof.com", "mailsac.com", "mailtemp.net", "mintemail.com", "mohmal.com",
  "moakt.com", "mytemp.email", "nada.email", "sharklasers.com", "spam4.me", "spamgourmet.com",
  "temp-mail.io", "temp-mail.org", "tempail.com", "tempinbox.com", "tempmail.com", "tempmail.dev",
  "tempmail.net", "tempmailo.com", "tempr.email", "throwawaymail.com", "trashmail.com",
  "trashmail.de", "trashmail.net", "yopmail.com", "yopmail.fr", "yopmail.net", "emailfake.com",
  "1secmail.com", "1secmail.net", "1secmail.org", "byom.de", "cs.email", "dpptd.com",
]);

/** Whether an address is at a known disposable email service. */
export function isDisposableEmail(email: string | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const parts = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
