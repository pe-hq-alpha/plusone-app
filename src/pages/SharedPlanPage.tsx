import { useQuery } from "convex/react";
import { useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { PlanSheet } from "../components/PlanSheet";
import { usePrivatePage } from "../lib/privatePage";
import { BRAND } from "../lib/brand";
import { ThemeFooter } from "../components/ui/ThemeFooter";

/**
 * A read-only link to the plan: what a parent or a venue opens
 * from the host's link. No account, nothing to change, and it updates as the plan does.
 */
export function SharedPlanPage() {
  const { token = "" } = useParams<{ token: string }>();
  const plan = useQuery(api.shareLinks.view, { token });
  usePrivatePage(plan ? plan.name : "Event plan");

  if (plan === undefined) return <main className="grid min-h-screen place-items-center bg-paper text-sm text-muted">Loading…</main>;
  if (plan === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6 text-center">
        <div>
          <p className="display text-3xl">This link isn't working.</p>
          <p className="mt-2 text-sm text-muted">Whoever shared it may have turned it off. Ask them for a new one.</p>
          <ThemeFooter className="mt-8" />
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink">
      <div className="mx-auto max-w-[52rem]">
        <p className="no-print mb-6 rounded-[14px] bg-accent-soft/50 px-4 py-3 text-sm text-muted">
          A read-only view of the plan. It stays up to date as they plan.
        </p>
        <PlanSheet plan={plan} footer={`Shared from ${BRAND.name}.`} />
        <ThemeFooter className="mt-10" />
      </div>
    </main>
  );
}
