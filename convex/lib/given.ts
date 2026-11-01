/** What the host typed for a quote: a price, whether it's per plate or for everything, and for how many. */
export type Given = { amount: number; unit: "total" | "per_person"; headcount?: number };

/** The total a typed price comes to: per plate times the people, or the price itself. */
export function givenTotal(g: Given): number | null {
  if (!(g.amount > 0)) return null;
  if (g.unit === "total") return Math.round(g.amount);
  return g.headcount && g.headcount > 0 ? Math.round(g.amount * g.headcount) : null;
}
