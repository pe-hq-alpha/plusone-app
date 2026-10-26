/**
 * How a budget bar divides: the part of the budget committed, and anything beyond it.
 * Colours come from the theme (see `.budget-fill` and `.budget-over` in index.css), so
 * the bars read the same in light and dark.
 */
export type BudgetSplit = { within: number; over: number };

function pct(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/**
 * Widths in % of the bar. Within budget, `within` is the share committed. Over budget,
 * the bar stands for everything committed: the budget's share is `within`, the rest `over`.
 */
export function budgetSplit(spent: number, budget: number): BudgetSplit {
  const committed = Number.isFinite(spent) ? Math.max(0, spent) : 0;
  if (!(budget > 0)) return { within: 0, over: 0 };
  if (committed <= budget) return { within: pct((committed / budget) * 100), over: 0 };
  const within = pct((budget / committed) * 100);
  return { within, over: 100 - within };
}
