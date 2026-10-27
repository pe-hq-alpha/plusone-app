/**
 * The two plans' introductory monthly prices at launch. Until launch Co-pilot is free to use,
 * and Assisted opens only after the introductory phase. Visitors in India see rupees,
 * everyone else dollars.
 */
export type PlanId = "copilot" | "assisted";

const MONTHLY: Record<"INR" | "USD", Record<PlanId, number>> = {
  INR: { copilot: 1000, assisted: 2500 },
  USD: { copilot: 10, assisted: 25 },
};

export function pricingCurrency(region: string | undefined): "INR" | "USD" {
  return region?.startsWith("IN") ? "INR" : "USD";
}

export function monthlyPrice(plan: PlanId, region: string | undefined): { amount: number; currency: "INR" | "USD" } {
  const currency = pricingCurrency(region);
  return { amount: MONTHLY[currency][plan], currency };
}
