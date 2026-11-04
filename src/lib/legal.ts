import { BRAND } from "./brand";

/** Who answers privacy and other complaints, named on the Privacy and Terms pages. */
export const GRIEVANCE_OFFICER = {
  // The officer's full name, as India's IT Rules expect (public since the founders went public on 4 Nov 2026).
  name: "Padmanabhan Rajendrakumar, Founder",
  // TODO: switch to grievance@plusoneevents.site once that mailbox exists.
  email: `hello@${BRAND.domain}`,
} as const;

/** The date the current Privacy Policy and Terms took effect. */
export const LEGAL_EFFECTIVE = "26 October 2026";

/** The last change to the Privacy Policy: Meta reads and writes, with Anthropic as a backup. */
export const PRIVACY_UPDATED = "27 October 2026";
