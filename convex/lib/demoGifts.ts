import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** A sample wedding's gift list, with a few already chosen by its sample guests. */
export async function seedGifts(
  ctx: MutationCtx,
  eventId: Id<"events">,
  now: number,
  gifts: { title: string; note?: string; price?: number; takenBy?: string }[],
) {
  const guests = await ctx.db
    .query("guests")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(100);
  for (const [i, g] of gifts.entries()) {
    const guest = g.takenBy ? guests.find((x) => x.name === g.takenBy) : undefined;
    await ctx.db.insert("gifts", {
      eventId,
      title: g.title,
      note: g.note,
      price: g.price,
      order: i + 1,
      ...(guest ? { reservedByGuestId: guest._id, reservedAt: now - (i + 1) * 3_600_000 } : {}),
    });
  }
}
