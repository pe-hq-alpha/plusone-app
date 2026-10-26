/**
 * Spotting "please stop writing to us" in a reply, without a model.
 *
 * Deliberately narrow. Vendors' own auto-replies and newsletters end with "to
 * unsubscribe, click here", so the bare word only counts when it is the whole first
 * line, the way a person answers a "reply STOP" footer. The phrases below are things
 * people write to be left alone and almost never write otherwise. The model reading
 * the reply makes the same call separately; either one is enough.
 */

import { BRAND } from "./brand";

const PHRASES =
  /\b(stop (e-?mailing|contacting|messaging|writing to|sending)|do not (contact|e-?mail|message)|don'?t (contact|e-?mail|message) (me|us)|remove (me|us|this (e-?mail|address))( from)?|take (me|us) off|no more e-?mails?|not interested in (hearing|receiving)|unsubscribe (me|us))\b/i;

const ONE_WORD = /^(stop|unsubscribe|remove|opt[- ]?out)[.!]*$/i;

/** Normalise an address for comparison: trimmed and lower-cased. */
export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** True when the sender is asking not to be contacted again. Looks only at what they wrote, not the quoted thread. */
export function looksLikeOptOut(body: string): boolean {
  const own = body.split(/\n\s*(On .{0,80}wrote:|-----Original Message-----|From: )/)[0] ?? body;
  const firstLine = own.trim().split("\n")[0]?.trim() ?? "";
  if (ONE_WORD.test(firstLine)) return true;
  return PHRASES.test(own.slice(0, 800));
}

/** Added to first contact and follow-ups: says who drafted it, and gives every vendor a one-word way to stop them. */
export function optOutFooter(hosts: string): string {
  return `\n\n--\nDrafted by ${BRAND.name}'s AI assistant on behalf of ${hosts}. If you'd rather not hear from us, reply STOP.`;
}

/** Kinds of email PlusOne writes to a vendor mid-conversation (agent.ts). */
const AGENT_KINDS = new Set(["agent_reply", "negotiation", "booking_confirmation", "no_thanks"]);

/**
 * The line that says AI had a hand in an email, by kind. Vendors and guests both hear
 * it; the body itself reads naturally. Words the host typed and sent as written carry
 * no line, because nothing drafted them.
 */
export function disclosureFooter(kind: string, hosts: string, hostWrote = false): string {
  if (kind === "inquiry" || kind === "follow_up") return optOutFooter(hosts);
  if (AGENT_KINDS.has(kind)) return hostWrote ? "" : `\n\n--\nDrafted by ${BRAND.name}'s AI assistant on behalf of ${hosts}.`;
  if (kind === "rsvp_invite") return `\n\n--\nSent with ${BRAND.name}'s AI assistant on behalf of ${hosts}.`;
  return "";
}
