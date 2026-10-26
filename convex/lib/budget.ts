import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { allocateSlotBudgets, splitByWeights } from "./templates";
import { byDayThenOrder } from "./sessionOrder";

/**
 * The one place the plan's money maths lives.
 *
 * `weddings.create` seeds a wedding so that the functions' budgets add up to the
 * wedding total, and each vendor need's budget is drawn from the functions it
 * serves. Every later edit — removing a function, re-splitting the functions'
 * budgets, removing a need, changing the total — has to leave that true, so they
 * all come back here instead of re-deriving the sums.
 *
 * After this runs:
 *   sum(events.budget) === wedding.totalBudget === sum(slots.budget) === sum(budgetLines.planned)
 * (the slot sums hold whenever the wedding has at least one vendor need).
 *
 * `committed` and `paid` on a budget line are the couple's real money and are
 * never touched here.
 */
export async function rebalanceEventBudget(
  ctx: MutationCtx,
  eventId: Id<"events">,
  /** Optional new weights per function; anything omitted keeps its current budget as its weight. */
  sessionWeights?: Map<Id<"sessions">, number>,
): Promise<void> {
  const event = await ctx.db.get(eventId);
  if (!event) return;

  const sessions = (
    await ctx.db
      .query("sessions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(50)
  ).sort(byDayThenOrder);

  // Each need's weight is read off what it spends per function it serves, so a
  // need serving a single function keeps its standing when the functions' budgets
  // move — weighting by the raw budget would shrink it a little more every edit.
  const oldSessionBudget = new Map(sessions.map((e) => [e._id, e.budget]));

  // ---- 1. The functions' budgets always add up to the wedding total ---------
  const sessionBudgets: number[] = [];
  let sessionBudgetsMoved = false;
  if (sessions.length > 0) {
    let weights = sessions.map((e) => sessionWeights?.get(e._id) ?? e.budget);
    if (weights.every((w) => w <= 0)) weights = sessions.map(() => 1);
    const split = splitByWeights(event.totalBudget, weights);
    for (let i = 0; i < sessions.length; i++) {
      sessionBudgets.push(split[i]);
      if (sessions[i].budget !== split[i]) {
        await ctx.db.patch(sessions[i]._id, { budget: split[i] });
        sessionBudgetsMoved = true;
      }
    }
  }

  // ---- 2. Each need's budget is drawn from the functions it serves ----------
  const slots = await ctx.db
    .query("vendorSlots")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(200);
  if (slots.length === 0) return;

  const sessionIndexById = new Map(sessions.map((e, i) => [e._id, i]));
  const slotPlans = slots.map((slot) => {
    const sessionIndexes = slot.sessionIds
      .map((id) => sessionIndexById.get(id))
      .filter((i): i is number => i !== undefined);
    const servedBefore = slot.sessionIds.reduce((a, id) => a + (oldSessionBudget.get(id) ?? 0), 0);
    const pct = servedBefore > 0 ? slot.budget / servedBefore : slot.budget > 0 ? slot.budget : 1;
    return { pct, sessionIndexes };
  });

  // Nothing moved and the needs already add up: leave their budgets exactly as
  // they are (re-deriving them would nudge the numbers for no reason) and only
  // make sure the budget lines still mirror them.
  const target = sessionBudgets.reduce((a, b) => a + b, 0);
  const inSync = slots.reduce((a, s) => a + s.budget, 0) === target;
  const alloc = !sessionBudgetsMoved && inSync ? slots.map((s) => s.budget) : allocateSlotBudgets(sessionBudgets, slotPlans);

  // A function nobody serves yet (or a rounding crumb) would otherwise leave the
  // needs adding up to less than the wedding total; spread it over the needs.
  const allocated = alloc.reduce((a, b) => a + b, 0);
  const leftover = Math.round(target - allocated);
  if (leftover > 0) {
    const extra = splitByWeights(leftover, slotPlans.map((p) => p.pct));
    for (let i = 0; i < alloc.length; i++) alloc[i] += extra[i];
  }

  // ---- 3. Mirror onto the slots and their budget lines ----------------------
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const budget = alloc[i];
    if (slot.budget !== budget) await ctx.db.patch(slot._id, { budget });
    const sessionId = slot.sessionIds.length === 1 ? slot.sessionIds[0] : undefined;
    const line = await ctx.db
      .query("budgetLines")
      .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
      .first();
    if (line) {
      await ctx.db.patch(line._id, { planned: budget, sessionId });
    } else {
      await ctx.db.insert("budgetLines", {
        eventId,
        slotId: slot._id,
        sessionId,
        label: slot.title,
        planned: budget,
        committed: 0,
        paid: 0,
      });
    }
  }
}
