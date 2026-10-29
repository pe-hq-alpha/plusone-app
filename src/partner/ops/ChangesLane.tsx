import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { EmptyState } from "../../components/ui/EmptyState";
import { errorText } from "../shared";
import { diffLines, type DiffSide } from "./diff";
import { waitText } from "./time";

type WaitingChange = FunctionReturnType<typeof api.marketplace.changes.waiting>[number];

/**
 * Changes to verified listings, before and after: a price, a package, details or contact
 * numbers. Customers see a change only once a person here approves it.
 */
export function ChangesLane({ changes }: { changes: WaitingChange[] }) {
  const decide = useMutation(api.marketplace.changes.decide);
  const [error, setError] = useState<string | null>(null);

  if (changes.length === 0) {
    return <EmptyState icon="pen" title="Nothing waiting" body="Changes to verified listings appear here." />;
  }

  return (
    <div>
      <ul className="grid items-start gap-4" aria-label="Changes waiting">
        {changes.map((c) => (
          <ChangeCard
            key={c._id}
            change={c}
            onDecide={(decision) =>
              void decide({ changeId: c._id, decision }).catch((e) => setError(errorText(e, "That didn't save.")))
            }
          />
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function ChangeCard({
  change,
  onDecide,
}: {
  change: WaitingChange;
  onDecide: (decision: "approved" | "rejected") => void;
}) {
  const what = (kind: string) => (kind === "details" ? "New details" : kind === "offering_remove" ? "Remove a package" : "A package");
  const { now, after } = diffLines(change.before, change.after);
  const marked = now.some((l) => l.marked) || after.some((l) => l.marked);

  return (
    <li className="card min-w-0 p-5 md:p-6">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-sm font-medium">
          {change.profileName} · {what(change.kind)}
        </p>
        <p className="shrink-0 text-xs text-quiet">{waitText(change.submittedAt)}</p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="label">Now</p>
          <DiffLines lines={now} tone="now" empty="Nothing there now." />
        </div>
        <div className="min-w-0">
          <p className="label">After</p>
          <DiffLines lines={after} tone="after" empty="Nothing left after." />
        </div>
      </div>
      {marked && <p className="mt-2 text-xs text-quiet">Marked lines are new or removed.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={() => onDecide("approved")}>
          Approve
        </button>
        <button type="button" className="btn-quiet btn-sm" onClick={() => onDecide("rejected")}>
          Reject
        </button>
      </div>
    </li>
  );
}

/** One side of the comparison: lines that differ carry the marigold mark, removed ones struck through. */
function DiffLines({ lines, tone, empty }: { lines: DiffSide; tone: "now" | "after"; empty: string }) {
  if (lines.length === 0) return <p className="text-sm text-quiet">{empty}</p>;
  return (
    <ul className="grid content-start gap-1 text-sm">
      {lines.map((line, i) => (
        <li
          key={i}
          className={
            line.marked
              ? `rounded bg-highlight-soft px-2 py-0.5 break-words ${tone === "now" ? "line-through" : ""}`
              : `break-words px-2 py-0.5 ${tone === "now" ? "text-muted" : ""}`
          }
        >
          {line.text}
        </li>
      ))}
    </ul>
  );
}
