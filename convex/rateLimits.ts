import { DAY, HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { BRAND } from "./lib/brand";

/**
 * Every limit on work that costs money or reaches someone's inbox.
 *
 * Real events are limited per event, so a busy host is never slowed by anyone else,
 * and generously: these exist to stop a runaway loop or an abusive script, not a
 * person planning. A full plan starts about a dozen searches at once, which is why
 * the search bucket holds more than that.
 *
 * The demo is different. Anyone can open it without an account, and each visit is a
 * new anonymous user, so a per-visitor allowance alone can be reset by reloading.
 * Each demo limit is therefore two: a small one per visitor, and a daily total across
 * all visitors that caps what the demo can ever cost in a day.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Vendor searches: each one reads a dozen web pages and calls the model several times.
  research: { kind: "token bucket", rate: 30, period: HOUR, capacity: 20 },
  researchDemo: { kind: "fixed window", rate: 3, period: DAY },
  researchDemoAll: { kind: "fixed window", rate: 150, period: DAY },

  // Daily ceilings on paid work across every real wedding (see `spend`).
  researchAll: { kind: "fixed window", rate: 1500, period: DAY },
  assistantAll: { kind: "fixed window", rate: 5000, period: DAY },
  draftingAll: { kind: "fixed window", rate: 2000, period: DAY },

  // Questions to the assistant.
  assistant: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
  assistantDemo: { kind: "fixed window", rate: 10, period: DAY },
  assistantDemoAll: { kind: "fixed window", rate: 600, period: DAY },

  // Batches of inquiry drafts the model writes.
  drafting: { kind: "token bucket", rate: 30, period: HOUR, capacity: 15 },
  draftingDemo: { kind: "fixed window", rate: 5, period: DAY },
  draftingDemoAll: { kind: "fixed window", rate: 300, period: DAY },

  // Real email leaving an event's inbox, counted where it is actually sent so that
  // follow-ups and automatic replies are covered as well as the Send button. A large
  // guest list goes out in batches of 50, so the hourly bucket has room for a few.
  outboundHourly: { kind: "token bucket", rate: 150, period: HOUR, capacity: 150 },
  outboundDaily: { kind: "fixed window", rate: 500, period: DAY },

  // Emailed invitations to plan together, per person sending them.
  memberInvites: { kind: "token bucket", rate: 20, period: HOUR, capacity: 10 },
  // Invite links of any kind, per person: they cost nothing, so this only stops a script.
  inviteLinks: { kind: "token bucket", rate: 30, period: HOUR, capacity: 15 },

  // New accounts across everyone. A demo guest is one request away, and a sign-up
  // little more, so both have an overall ceiling that a real day never reaches.
  guestSignIns: { kind: "token bucket", rate: 600, period: HOUR, capacity: 200 },
  signUps: { kind: "token bucket", rate: 300, period: HOUR, capacity: 100 },

  /** The planning conversation: a dozen or so replies each, so room for a couple of conversations. */
  planningChat: { kind: "token bucket", rate: 60, period: HOUR, capacity: 25 },
  planningChatAll: { kind: "fixed window", rate: 8000, period: DAY },

  // Feedback sent to the team, per person.
  feedback: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },

  // Links pasted or shared into a Space: each one fetches the site's preview.
  spaceLinks: { kind: "token bucket", rate: 120, period: HOUR, capacity: 40 },
  spaceLinksDemo: { kind: "fixed window", rate: 12, period: DAY },
  spaceLinksDemoAll: { kind: "fixed window", rate: 600, period: DAY },
  // A link whose page gives no picture is opened in a scraping browser, which costs a
  // little each time: a small allowance per wedding, and a daily ceiling across all.
  linkPreviewFallback: { kind: "token bucket", rate: 30, period: HOUR, capacity: 12 },
  linkPreviewFallbackAll: { kind: "fixed window", rate: 1000, period: DAY },

  // Suggesting a palette from a Space: one model call that reads up to eight of its pictures.
  spacePalette: { kind: "token bucket", rate: 20, period: HOUR, capacity: 6 },
  spacePaletteDemo: { kind: "fixed window", rate: 3, period: DAY },
  spacePaletteDemoAll: { kind: "fixed window", rate: 150, period: DAY },

  // Answers sent from a guest's RSVP link, per link, and opening links, across everyone.
  rsvpAnswers: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
  // Choosing or letting go of a gift from a guest's RSVP link, per link.
  giftReservations: { kind: "token bucket", rate: 20, period: HOUR, capacity: 8 },
  publicReads: { kind: "token bucket", rate: 20000, period: HOUR, capacity: 2000 },

  // PlusOne Partner: new listings and claims across everyone, and a vendor's edits.
  partnerSignUps: { kind: "token bucket", rate: 100, period: HOUR, capacity: 40 },
  partnerEdits: { kind: "token bucket", rate: 120, period: HOUR, capacity: 40 },

  // Photos of a vendor's past work: per account, per demo guest, and across everyone.
  vendorPhotoAdd: { kind: "fixed window", rate: 30, period: DAY },
  vendorPhotoAddDemo: { kind: "fixed window", rate: 3, period: DAY },
  vendorPhotoAddAll: { kind: "fixed window", rate: 300, period: DAY },
  // SAM 3.1 and Muse Spark on a hall photo: $0.0025 an image plus one small read, and cached.
  venueSam: { kind: "fixed window", rate: 60, period: DAY },
  venueSamDemo: { kind: "fixed window", rate: 15, period: DAY },
  venueSamAll: { kind: "fixed window", rate: 2000, period: DAY },
  // Muse Spark Open on a vendor's price list: a few thousand tokens each, on Baseten's credit.
  priceListRead: { kind: "fixed window", rate: 20, period: DAY },
  priceListReadDemo: { kind: "fixed window", rate: 5, period: DAY },
  priceListReadAll: { kind: "fixed window", rate: 500, period: DAY },

  // New demos opened, across everyone.
  demoStarts: { kind: "fixed window", rate: 2000, period: DAY },

  // Voice brief: speak the plan or a change.
  voice: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  voiceDemo: { kind: "fixed window", rate: 6, period: DAY },
  voiceAll: { kind: "fixed window", rate: 400, period: DAY },

  // A vendor check costs the most, so each person gets a few and the team shares a small daily total.
  vendorChecks: { kind: "token bucket", rate: 20, period: DAY, capacity: 5 },
  vendorChecksAll: { kind: "fixed window", rate: 60, period: DAY },

  // Tidying what a vendor writes: cheap, but still capped per account, per guest and overall.
  vendorTidy: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
  vendorTidyDemo: { kind: "fixed window", rate: 20, period: DAY },
  vendorTidyAll: { kind: "fixed window", rate: 3000, period: DAY },

  // The visit log (POST /visit): plenty for a scraper to show up clearly, while a
  // flood from one address, or a leaked secret, can't fill the table.
  visitsPerIp: { kind: "token bucket", rate: 1200, period: HOUR, capacity: 300 },
  visitsAll: { kind: "token bucket", rate: 50000, period: HOUR, capacity: 5000 },
});

type Paid = "research" | "assistant" | "drafting";

/** "in a few minutes", "in about 2 hours", "tomorrow": when to come back, in words. */
export function comeBack(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  if (minutes <= 2) return "in a couple of minutes";
  if (minutes < 60) return `in about ${Math.ceil(minutes / 5) * 5} minutes`;
  const hours = Math.ceil(minutes / 60);
  if (hours >= 20) return "tomorrow";
  return `in about ${hours} hours`;
}

const WHAT: Record<Paid, string> = {
  research: "vendor searches",
  assistant: "questions",
  drafting: "emails to write",
};

/**
 * Take `count` from the allowance for a paid action, or refuse in words the person
 * can act on. Call it after the membership check and before anything is scheduled.
 */
export async function spend(
  ctx: MutationCtx,
  what: Paid,
  event: Doc<"events">,
  userId: Id<"users">,
  count = 1,
): Promise<void> {
  if (event.demo) {
    const mine = await rateLimiter.limit(ctx, `${what}Demo`, { key: userId, count });
    if (!mine.ok) {
      throw new ConvexError(
        `That's as many ${WHAT[what]} as the demo allows. Plan your own event to keep going.`,
      );
    }
    const everyone = await rateLimiter.limit(ctx, `${what}DemoAll`, { count });
    if (!everyone.ok) {
      throw new ConvexError("The demo is very busy right now. Try again later, or plan your own event.");
    }
    return;
  }
  const status = await rateLimiter.limit(ctx, what, { key: event._id, count });
  if (!status.ok) {
    throw new ConvexError(
      `That's a lot of ${WHAT[what]} in a short time. ${BRAND.name} will be ready for more ${comeBack(status.retryAfter)}.`,
    );
  }
  // A ceiling across every wedding, so a runaway loop or a flood of sign-ups can never
  // run up the bill. A normal day uses a small fraction of it.
  const all = await rateLimiter.limit(ctx, `${what}All`, { count });
  if (!all.ok) {
    throw new ConvexError(`${BRAND.name} is very busy right now. Try again ${comeBack(all.retryAfter)}.`);
  }
}

/**
 * Count one real email against the event's sending allowance, at the moment it is
 * sent. Returns a sentence explaining the pause when the allowance is used up.
 */
export async function outboundPause(ctx: ActionCtx, eventId: Id<"events">): Promise<string | null> {
  const hourly = await rateLimiter.limit(ctx, "outboundHourly", { key: eventId });
  if (!hourly.ok) {
    return `${BRAND.name} has sent a lot of email for this event in the last hour and has paused. It can send more ${comeBack(hourly.retryAfter)}.`;
  }
  const daily = await rateLimiter.limit(ctx, "outboundDaily", { key: eventId });
  if (!daily.ok) {
    return `${BRAND.name} has reached today's sending limit for this event. It can send more ${comeBack(daily.retryAfter)}.`;
  }
  return null;
}
