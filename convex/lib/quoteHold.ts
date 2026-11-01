// When a quote read from a vendor's reply should wait for the couple instead of changing
// the plan by itself. Pure, so it is tested without a database.

/** A quote that has changed the plan. Quotes from before states existed count as applied. */
export function isLive(q: { state?: "applied" | "waiting" | "dismissed" }): boolean {
  return q.state === undefined || q.state === "applied";
}

/**
 * Why a quote should be held, in words the couple reads, or null to apply it. A reading
 * far from the budget is the commonest sign of a misread (a per-person price taken as
 * the total, a deposit taken as the price), so it waits whatever the wedding's setting.
 */
export function holdReason(args: {
  total: number;
  currency: string | undefined;
  eventCurrency: string;
  budget: number;
  slotBooked: boolean;
  reviewFirst: boolean;
  /** The host added it themselves; with `typedPrice`, they also typed the price, so it isn't a misreading. */
  fromHost?: boolean;
  typedPrice?: boolean;
}): string | null {
  if (args.slotBooked) return "You've already booked someone for this, so it won't change your plan unless you say so.";
  if (args.currency && args.currency.toUpperCase() !== args.eventCurrency.toUpperCase()) {
    return `It's in ${args.currency.toUpperCase()}, not ${args.eventCurrency.toUpperCase()}, so check the amount before it goes in your budget.`;
  }
  // A price the host typed is what they were told: no "check it was read right", no review step.
  if (args.fromHost && args.typedPrice) return null;
  if (args.budget > 0 && args.total > args.budget * 2) return "It's more than twice what you planned for this, so check it was read right.";
  if (args.budget > 0 && args.total < args.budget * 0.25) return "It's far below what you planned for this, so check it was read right (it may be a deposit or a price per person).";
  if (args.reviewFirst && !args.fromHost) return "You check each quote before it changes your plan.";
  return null;
}
