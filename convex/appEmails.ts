import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";

/**
 * The app's own emails, from our own address (never an event's own inbox): the weekly
 * update in digest.ts, with a stop link for each membership.
 *
 * Nothing is sent until RESEND_API_KEY is set, and only to Resend's test addresses
 * until EMAIL_LIVE is "1". EMAIL_FROM says who it comes from.
 */
export const resend = new Resend(components.resend, { testMode: process.env.EMAIL_LIVE !== "1" });

async function hmac(value: string): Promise<string> {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.JWT_PRIVATE_KEY ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`unsubscribe:${value}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** The weekly update's own stop link, for one membership, so stopping it leaves other emails alone. */
export async function digestUnsubscribeLink(memberId: string): Promise<string> {
  return `${process.env.CONVEX_SITE_URL}/email/unsubscribe?topic=digest&u=${memberId}&t=${await hmac(`digest:${memberId}`)}`;
}

/** Whether a stop link's token is the one made for this membership; it can't be guessed for anyone else. */
export async function checkDigestUnsubscribe(memberId: string, token: string): Promise<boolean> {
  const expected = await hmac(`digest:${memberId}`);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
