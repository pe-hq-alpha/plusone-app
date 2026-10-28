/**
 * The two plans' introductory monthly prices at launch. Until launch Basic is free to use,
 * and Premium opens only after the introductory phase. Visitors in India see rupees,
 * everyone else dollars.
 */
export type PlanId = "basic" | "premium";

const MONTHLY: Record<"INR" | "USD", Record<PlanId, number>> = {
  INR: { basic: 1000, premium: 2500 },
  USD: { basic: 10, premium: 25 },
};

export function pricingCurrency(region: string | undefined): "INR" | "USD" {
  return region?.startsWith("IN") ? "INR" : "USD";
}

export function monthlyPrice(plan: PlanId, region: string | undefined): { amount: number; currency: "INR" | "USD" } {
  const currency = pricingCurrency(region);
  return { amount: MONTHLY[currency][plan], currency };
}
