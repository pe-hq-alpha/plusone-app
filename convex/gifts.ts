import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { logActivity, requireMember } from "./lib/auth";
import { rateLimiter } from "./rateLimits";

/**
 * The couple's gift list. They add what they'd like; it shows on their wedding website;
 * a guest chooses a gift from their own RSVP link so nobody else brings the same one.
 * Strangers only ever see whether a gift is taken, never by whom.
 */

const MAX_GIFTS = 200;
/** A guest can hold a few gifts at once, so one link can't empty the list. */
const MAX_PER_GUEST = 3;

const text = (s: string | undefined, max: number) => (s === undefined ? undefined : s.trim().slice(0, max) || undefined);

/** A shop link the page can open safely: http or https, nothing else. */
export function cleanLink(s: string | undefined): string | undefined {
  const raw = s?.trim();
  if (!raw) return undefined;
  if (raw.length > 500) throw new ConvexError("That link is too long.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new ConvexError("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ConvexError("Use a shop's web address, starting with https://.");
  return url.toString();
}

function cleanPrice(n: number | null | undefined): number | undefined {
  if (n === null || n === undefined) return undefined;
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new ConvexError("That price doesn't look right.");
  return Math.round(n);
}

async function giftsOf(ctx: QueryCtx, eventId: Id<"events">): Promise<Doc<"gifts">[]> {
  const gifts = await ctx.db
    .query("gifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(MAX_GIFTS);
  return gifts.sort((a, b) => a.order - b.order);
}

async function giftFor(ctx: MutationCtx, giftId: Id<"gifts">): Promise<Doc<"gifts">> {
  const gift = await ctx.db.get(giftId);
  if (!gift) throw new ConvexError("That gift is no longer on the list.");
  return gift;
}

// ---------------------------------------------------------------- for the couple

export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      _id: v.id("gifts"),
      title: v.string(),
      note: v.optional(v.string()),
      link: v.optional(v.string()),
      price: v.optional(v.number()),
      reservedBy: v.optional(v.object({ guestId: v.id("guests"), name: v.string() })),
      reservedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "viewer");
    const gifts = await giftsOf(ctx, args.eventId);
    return await Promise.all(
      gifts.map(async (g) => {
        const guest = g.reservedByGuestId ? await ctx.db.get(g.reservedByGuestId) : null;
        return {
          _id: g._id,
          title: g.title,
          note: g.note,
          link: g.link,
          price: g.price,
          reservedBy: guest ? { guestId: guest._id, name: guest.name } : undefined,
          reservedAt: guest ? g.reservedAt : undefined,
        };
      }),
    );
  },
});

export const add = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    note: v.optional(v.string()),
    link: v.optional(v.string()),
    price: v.optional(v.number()),
  },
  returns: v.id("gifts"),
  handler: async (ctx, args) => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    const title = text(args.title, 120);
    if (!title) throw new ConvexError("Give the gift a name.");
    const existing = await giftsOf(ctx, args.eventId);
    if (existing.length >= MAX_GIFTS) throw new ConvexError(`The list holds up to ${MAX_GIFTS} gifts.`);
    const id = await ctx.db.insert("gifts", {
      eventId: args.eventId,
      title,
      note: text(args.note, 400),
      link: cleanLink(args.link),
      price: cleanPrice(args.price),
      order: (existing[existing.length - 1]?.order ?? 0) + 1,
    });
    await logActivity(ctx, { eventId: args.eventId, actorUserId: userId, type: "gift", text: `Added ${title} to the gift list.` });
    return id;
  },
});

/** Change a gift's words, link or price. An empty string or null clears that field. */
export const update = mutation({
  args: {
    giftId: v.id("gifts"),
    patch: v.object({
      title: v.optional(v.string()),
      note: v.optional(v.string()),
      link: v.optional(v.string()),
      price: v.optional(v.union(v.number(), v.null())),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const gift = await giftFor(ctx, args.giftId);
    await requireMember(ctx, gift.eventId, "planner");
    const p = args.patch;
    const title = p.title === undefined ? undefined : text(p.title, 120);
    if (p.title !== undefined && !title) throw new ConvexError("Give the gift a name.");
    await ctx.db.patch(gift._id, {
      ...(title !== undefined ? { title } : {}),
      ...(p.note !== undefined ? { note: text(p.note, 400) } : {}),
      ...(p.link !== undefined ? { link: cleanLink(p.link) } : {}),
      ...(p.price !== undefined ? { price: cleanPrice(p.price) } : {}),
    });
    return null;
  },
});

export const remove = mutation({
  args: { giftId: v.id("gifts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const gift = await giftFor(ctx, args.giftId);
    const { userId } = await requireMember(ctx, gift.eventId, "planner");
    await ctx.db.delete(gift._id);
    await logActivity(ctx, { eventId: gift.eventId, actorUserId: userId, type: "gift", text: `Took ${gift.title} off the gift list.` });
    return null;
  },
});

/** Move a gift one place up or down the list. */
export const move = mutation({
  args: { giftId: v.id("gifts"), direction: v.union(v.literal("up"), v.literal("down")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const gift = await giftFor(ctx, args.giftId);
    await requireMember(ctx, gift.eventId, "planner");
    const gifts = await giftsOf(ctx, gift.eventId);
    const i = gifts.findIndex((g) => g._id === gift._id);
    const j = args.direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= gifts.length) return null;
    // Renumber the whole list so equal or missing orders can't get stuck.
    [gifts[i], gifts[j]] = [gifts[j], gifts[i]];
    for (let k = 0; k < gifts.length; k++) {
      if (gifts[k].order !== k + 1) await ctx.db.patch(gifts[k]._id, { order: k + 1 });
    }
    return null;
  },
});

/** Free a gift a guest chose, say if they told the couple they've changed their mind. */
export const clearReservation = mutation({
  args: { giftId: v.id("gifts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const gift = await giftFor(ctx, args.giftId);
    await requireMember(ctx, gift.eventId, "planner");
    await ctx.db.patch(gift._id, { reservedByGuestId: undefined, reservedAt: undefined });
    return null;
  },
});

// ---------------------------------------------------------------- for guests

export const publicGift = v.object({
  _id: v.id("gifts"),
  title: v.string(),
  note: v.optional(v.string()),
  link: v.optional(v.string()),
  price: v.optional(v.number()),
  taken: v.boolean(),
  mine: v.optional(v.boolean()),
});

export const publicGifts = v.object({
  currency: v.string(),
  noGifts: v.boolean(),
  cashNote: v.optional(v.string()),
  items: v.array(publicGift),
});

/**
 * The gift list as a guest sees it: taken or not, and for a guest's own link, which are
 * theirs. Nothing when the couple has turned the list off or has nothing to say.
 */
export async function giftsForGuests(
  ctx: QueryCtx,
  site: Doc<"eventSites"> | null,
  event: Doc<"events">,
  guestId?: Id<"guests">,
) {
  if (site?.showGifts === false) return undefined;
  const noGifts = site?.noGifts === true;
  const cashNote = noGifts ? undefined : site?.cashGiftNote;
  const items = noGifts
    ? []
    : (await giftsOf(ctx, event._id)).map((g) => ({
        _id: g._id,
        title: g.title,
        note: g.note,
        link: g.link,
        price: g.price,
        taken: g.reservedByGuestId !== undefined,
        ...(guestId ? { mine: g.reservedByGuestId === guestId } : {}),
      }));
  if (!noGifts && !cashNote && items.length === 0) return undefined;
  return { currency: event.currency, noGifts, cashNote, items };
}

async function guestByToken(ctx: MutationCtx, token: string): Promise<Doc<"guests">> {
  const guest =
    token.length >= 24 && token.length <= 64
      ? await ctx.db
          .query("guests")
          .withIndex("by_rsvpToken", (q) => q.eq("rsvpToken", token))
          .unique()
      : null;
  if (!guest) throw new ConvexError("This link isn't valid any more. Ask whoever sent it for a new one.");
  const room = await rateLimiter.limit(ctx, "giftReservations", { key: guest._id });
  if (!room.ok) throw new ConvexError("That's a lot of changes in a short time. Try again in a little while.");
  return guest;
}

async function guestGift(ctx: MutationCtx, guest: Doc<"guests">, giftId: Id<"gifts">): Promise<Doc<"gifts">> {
  const gift = await ctx.db.get(giftId);
  if (!gift || gift.eventId !== guest.eventId) throw new ConvexError("That gift is no longer on the list.");
  const site = await ctx.db
    .query("eventSites")
    .withIndex("by_eventId", (q) => q.eq("eventId", guest.eventId))
    .unique();
  if (site?.showGifts === false || site?.noGifts) throw new ConvexError("This event isn't sharing a gift list.");
  return gift;
}

/** A guest says they'll bring a gift, from their own RSVP link. */
export const reserve = mutation({
  args: { token: v.string(), giftId: v.id("gifts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guest = await guestByToken(ctx, args.token);
    const gift = await guestGift(ctx, guest, args.giftId);
    if (gift.reservedByGuestId === guest._id) return null;
    if (gift.reservedByGuestId) throw new ConvexError("Someone has already chosen that gift.");
    const held = await ctx.db
      .query("gifts")
      .withIndex("by_eventId_and_reservedByGuestId", (q) => q.eq("eventId", guest.eventId).eq("reservedByGuestId", guest._id))
      .take(MAX_PER_GUEST);
    if (held.length >= MAX_PER_GUEST) throw new ConvexError(`You can choose up to ${MAX_PER_GUEST} gifts.`);
    await ctx.db.patch(gift._id, { reservedByGuestId: guest._id, reservedAt: Date.now() });
    await logActivity(ctx, {
      eventId: guest.eventId,
      actorLabel: guest.name,
      actorKind: "person",
      type: "gift",
      text: `will bring ${gift.title}.`,
      refs: { guestId: guest._id },
    });
    return null;
  },
});

/** A guest lets go of a gift they chose. Only their own. */
export const unreserve = mutation({
  args: { token: v.string(), giftId: v.id("gifts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const guest = await guestByToken(ctx, args.token);
    const gift = await guestGift(ctx, guest, args.giftId);
    if (gift.reservedByGuestId !== guest._id) throw new ConvexError("That gift isn't one you chose.");
    await ctx.db.patch(gift._id, { reservedByGuestId: undefined, reservedAt: undefined });
    await logActivity(ctx, {
      eventId: guest.eventId,
      actorLabel: guest.name,
      actorKind: "person",
      type: "gift",
      text: `won't bring ${gift.title} after all.`,
      refs: { guestId: guest._id },
    });
    return null;
  },
});
