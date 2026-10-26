import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { PriceUnit } from "./validators";

/**
 * What every sample event is built from: made-up vendors on the reserved `.example`
 * domain, the searches that found them, and the emails PlusOne would have exchanged.
 * Email on a demo event is simulated, never sent.
 */

export const DAY = 86_400_000;

export type SeedVendor = {
  name: string;
  handle: string;
  city: string;
  startingPrice: number;
  /** How the starting price is quoted: per plate is `per_person`, a package is `total`. */
  priceUnit: PriceUnit;
  priceNotes: string;
  highlights: string[];
  summary: string;
  score: number;
  rankReason: string;
  isTopPick?: boolean;
  rating?: number;
  reviewCount?: number;
};

/** A vendor on a need, in the event's own currency. Demo vendors have no pictures: the card shows their initials. */
export async function addVendor(
  ctx: MutationCtx,
  eventId: Id<"events">,
  slot: Doc<"vendorSlots">,
  seed: SeedVendor,
  now: number,
  currency: string,
): Promise<Id<"vendors">> {
  return await ctx.db.insert("vendors", {
    eventId,
    slotId: slot._id,
    name: seed.name,
    email: `hello@${seed.handle}.example`,
    city: seed.city,
    category: slot.category,
    startingPrice: seed.startingPrice,
    priceUnit: seed.priceUnit,
    priceCurrency: currency,
    priceNotes: seed.priceNotes,
    packages: [],
    highlights: seed.highlights,
    sourceUrls: [],
    summary: seed.summary,
    shortlisted: seed.isTopPick ?? false,
    scrapedAt: now - 12 * DAY,
    rating: seed.rating,
    reviewCount: seed.reviewCount,
    reviewSource: seed.rating ? "Sample reviews" : undefined,
    reviewHighlights: [],
    score: seed.score,
    rankReason: seed.rankReason,
    isTopPick: seed.isTopPick ?? false,
    pagesRead: [],
  });
}

/** One finished vendor search on a need. */
export async function researched(ctx: MutationCtx, eventId: Id<"events">, slot: Doc<"vendorSlots">, query: string, found: number, at: number) {
  await ctx.db.insert("researchRuns", {
    eventId,
    slotId: slot._id,
    query,
    status: "done",
    step: "Done",
    foundCount: found,
    startedAt: at,
    finishedAt: at + 2 * 60_000,
  });
}

export type Mail = { dir: "in" | "out"; kind: Doc<"messages">["kind"]; body: string; at: number };

/** A thread with its emails, oldest first. Returns the thread and the id of each email. */
export async function conversation(
  ctx: MutationCtx,
  eventId: Id<"events">,
  slot: Doc<"vendorSlots">,
  vendorId: Id<"vendors">,
  vendorEmail: string,
  subject: string,
  mails: Mail[],
  thread: Partial<Doc<"threads">>,
): Promise<{ threadId: Id<"threads">; messageIds: Id<"messages">[] }> {
  const lastOut = [...mails].reverse().find((m) => m.dir === "out");
  const lastIn = [...mails].reverse().find((m) => m.dir === "in");
  const threadId = await ctx.db.insert("threads", {
    eventId,
    vendorId,
    slotId: slot._id,
    status: "sent",
    followUpCount: 0,
    lastOutboundAt: lastOut?.at,
    lastInboundAt: lastIn?.at,
    ...thread,
  });
  const messageIds: Id<"messages">[] = [];
  for (const [i, m] of mails.entries()) {
    messageIds.push(
      await ctx.db.insert("messages", {
        eventId,
        threadId,
        direction: m.dir,
        kind: m.kind,
        status: m.dir === "in" ? "received" : "sent",
        fromAddress: m.dir === "in" ? vendorEmail : "",
        toAddress: m.dir === "in" ? "" : vendorEmail,
        subject: i === 0 ? subject : `Re: ${subject}`,
        bodyText: m.body,
        attachments: [],
        ...(m.dir === "in" ? { receivedAt: m.at } : { sentAt: m.at }),
      }),
    );
  }
  return { threadId, messageIds };
}

/** "24 January 2027": a date the way an Indian email would write it. */
export function longDateIN(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The slots of a new event, looked up by title. */
export async function slotsOf(ctx: MutationCtx, eventId: Id<"events">) {
  const slots = await ctx.db.query("vendorSlots").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(40);
  return (title: string) => {
    const s = slots.find((x) => x.title === title);
    if (!s) throw new Error(`demo: no need titled ${title}`);
    return s;
  };
}

/**
 * A sample event's board: notes and colours in each part's zone and the booked vendors
 * pinned beside them. Left unplaced, so the board lays them out in their zones.
 */
export async function seedBoard(
  ctx: MutationCtx,
  eventId: Id<"events">,
  parts: { sessionId?: Id<"sessions">; notes?: string[]; colors?: { name: string; hex: string }[]; vendors?: Id<"vendors">[] }[],
) {
  let order = 0;
  for (const part of parts) {
    const base = { eventId, sessionId: part.sessionId };
    for (const text of part.notes ?? []) await ctx.db.insert("spaceItems", { ...base, kind: "note", text, order: order++ });
    for (const c of part.colors ?? []) await ctx.db.insert("spaceItems", { ...base, kind: "swatch", hex: c.hex.toLowerCase(), colorName: c.name, w: 104, order: order++ });
    for (const vendorId of part.vendors ?? []) await ctx.db.insert("spaceItems", { ...base, kind: "vendor", vendorId, w: 248, order: order++ });
  }
}
