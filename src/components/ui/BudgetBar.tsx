import { budgetSplit } from "../../lib/budgetBar";

/**
 * How much of the budget is committed: a solid fill within budget, and a striped
 * stretch on the end for anything over it. Widths ease when the numbers move.
 */
export function BudgetBar({ spent, budget, label, className = "h-2.5" }: { spent: number; budget: number; label: string; className?: string }) {
  const { within, over } = budgetSplit(spent, budget);
  const hasBudget = budget > 0;
  const committed = Math.max(0, spent || 0);
  const share = hasBudget ? Math.round((committed / budget) * 100) : 0;
  const valueText = !hasBudget
    ? "No budget set"
    : share > 100
      ? `${share}% of the budget committed, ${share - 100}% over`
      : `${share}% of the budget committed`;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={hasBudget ? budget : 0}
      aria-valuenow={hasBudget ? Math.min(committed, budget) : 0}
      aria-valuetext={valueText}
      className={`budget-track relative w-full overflow-hidden rounded-full ${className}`}
    >
      <span
        className={`budget-fill absolute inset-y-0 left-0 ${over ? "rounded-l-full" : "rounded-full"} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
        style={{ width: `${within}%` }}
      />
      {over > 0 && (
        <span
          className="budget-over absolute inset-y-0 rounded-r-full transition-[left,width] duration-700 ease-out motion-reduce:transition-none"
          style={{ left: `${within}%`, width: `${over}%` }}
        />
      )}
    </div>
  );
}
