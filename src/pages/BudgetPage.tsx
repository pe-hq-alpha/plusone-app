import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useOutletContext } from "react-router-dom";
import { partWord } from "../../convex/lib/occasion";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { money } from "../lib/format";
import { StatusChip } from "../components/ui/StatusChip";
import { Icon } from "../components/ui/Icon";
import { BudgetBar } from "../components/ui/BudgetBar";
import { WhatsDue } from "../components/WhatsDue";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type Summary = NonNullable<FunctionReturnType<typeof api.budget.summary>>;

/** Past this many kinds of vendor, the smallest fold into one "Other kinds" row. */
const MAX_ROWS = 8;

type Row = { key: string; label: string; planned: number; committed: number; paid: number };

function Tile({ label, value, note, tone = "ink" }: { label: string; value: string; note?: string; tone?: "ink" | "bad" }) {
  return (
    <div className="card-quiet px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-quiet">{label}</p>
      <p className={`display mt-1 text-[1.55rem] leading-tight tabular-nums ${tone === "bad" ? "text-bad" : "text-ink"}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-quiet">{note}</p>}
    </div>
  );
}

/**
 * One bar per row on a shared scale: the pale bar is what's planned, the solid part
 * what's committed. One hue throughout, so nothing depends on telling colours apart;
 * the amounts are written beside every bar.
 */
function Breakdown({ title, rows, currency }: { title: string; rows: Row[]; currency: string }) {
  const sorted = [...rows].sort((a, b) => b.planned - a.planned || b.committed - a.committed);
  const shown = sorted.length > MAX_ROWS ? [...sorted.slice(0, MAX_ROWS - 1), sorted.slice(MAX_ROWS - 1).reduce<Row>((acc, r) => ({ ...acc, planned: acc.planned + r.planned, committed: acc.committed + r.committed, paid: acc.paid + r.paid }), { key: "rest", label: `Other kinds (${sorted.length - MAX_ROWS + 1})`, planned: 0, committed: 0, paid: 0 })] : sorted;
  const scale = Math.max(1, ...shown.map((r) => Math.max(r.planned, r.committed)));
  return (
    <section className="card px-6 py-5" aria-label={title}>
      <h2 className="display text-xl">{title}</h2>
      <ul className="mt-4 grid gap-3.5">
        {shown.map((r) => {
          const over = r.committed > r.planned && r.planned > 0;
          const detail = `${r.label}: ${money(r.planned, currency)} planned, ${money(r.committed, currency)} booked or quoted, ${money(r.paid, currency)} paid`;
          return (
            <li key={r.key} title={detail}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  <span className={over ? "text-bad" : "text-ink"}>{money(r.committed, currency)}</span> of {money(r.planned, currency)}
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-line" aria-hidden="true">
                <div className="budget-planned absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.planned / scale) * 100}%` }} />
                <div
                  className={`${over ? "budget-over" : "budget-fill"} absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out motion-reduce:transition-none`}
                  style={{ width: `${(Math.min(r.committed, scale) / scale) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex items-center gap-4 text-xs text-quiet" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="budget-fill h-2 w-4 rounded-full" /> Booked or quoted</span>
        <span className="flex items-center gap-1.5"><span className="budget-over h-2 w-4 rounded-full" /> Over</span>
        <span className="flex items-center gap-1.5"><span className="budget-planned h-2 w-4 rounded-full" /> Planned</span>
      </p>
    </section>
  );
}

function AmountCell({ value, disabled, onSave, label }: { value: number; disabled: boolean; onSave: (n: number) => Promise<unknown>; label: string }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);
  return (
    <input
      type="number"
      min={0}
      aria-label={label}
      disabled={disabled}
      className={`input w-28 py-1.5 text-right text-sm tabular-nums ${error ? "border-bad" : ""}`}
      value={draft}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Math.max(0, Number(draft) || 0);
        if (n === value) return;
        onSave(n).then(() => setError(false)).catch(() => { setError(true); setDraft(String(value)); });
      }}
    />
  );
}

/**
 * The money, whole: what's planned, committed and paid, by
 * session and by kind of vendor, every line editable, room for costs that aren't
 * vendors, all in the event's own currency.
 */
export function BudgetPage() {
  const { event, role, sessions } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const canEdit = role !== "viewer";
  const summary = useQuery(api.budget.summary, { eventId });
  const updateLine = useMutation(api.budget.updateLine);
  const addCost = useMutation(api.budget.addCost);
  const removeCost = useMutation(api.budget.removeCost);
  const markPaid = useMutation(api.budget.markPaid);
  const [label, setLabel] = useState("");
  const [planned, setPlanned] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!summary) return <p className="text-sm text-muted">Loading your budget…</p>;
  const cur = summary.currency;
  const left = summary.totalBudget - summary.committedTotal;
  const agreedPct = summary.totalBudget > 0 ? Math.round((summary.agreedTotal / summary.totalBudget) * 100) : 0;
  // What needs a hand: money still owed on what's agreed, and money paid on a need never marked booked.
  const owing = summary.lines.filter((l) => l.toPay > 0);
  const paidUnbooked = summary.lines.filter((l) => l.state === "weighing" && l.line.paid > 0);
  const overpaid = summary.lines.filter((l) => l.overpaid > 0);
  const needHref = (slotId: string) => `/e/${eventId}/vendors/${slotId}`;

  const byCeremony: Row[] = summary.sessions.map((e) => ({ key: e.sessionId, label: e.name, planned: e.planned, committed: e.committed, paid: e.paid }));
  const kinds = new Map<string, Row>();
  for (const l of summary.lines) {
    const kind = l.slot?.category ?? "Other costs";
    // Labelled with the need's own name ("Priest"), not its category ("Officiant").
    const row = kinds.get(kind) ?? { key: kind, label: l.slot?.title ?? kind, planned: 0, committed: 0, paid: 0 };
    row.planned += l.line.planned;
    row.committed += l.line.committed;
    row.paid += l.line.paid;
    kinds.set(kind, row);
  }
  const lines = [...summary.lines].sort((a, b) => Number(Boolean(a.slot)) - Number(Boolean(b.slot)) || b.line.planned - a.line.planned);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.2rem] leading-tight">Budget</h1>
          <p className="mt-1 text-sm text-muted">Every {partWord(event)}, every vendor and everything else, adding up to one total.</p>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Totals">
        <Tile label="Budget" value={money(summary.totalBudget, cur)} />
        <Tile
          label="Booked"
          value={money(summary.agreedTotal, cur)}
          note={summary.weighingTotal > 0 ? `plus ${money(summary.weighingTotal, cur)} in quotes you're weighing` : `${agreedPct}% of the budget`}
        />
        <Tile
          label="Paid"
          value={money(summary.paidTotal, cur)}
          note={
            summary.toPayTotal > 0
              ? `${money(summary.toPayTotal, cur)} still to pay, listed below`
              : summary.agreedTotal > 0
                ? "Everything booked is paid"
                : undefined
          }
        />
        <Tile
          label={left < 0 ? "Over" : "Left"}
          value={money(Math.abs(left), cur)}
          tone={left < 0 ? "bad" : "ink"}
          note={summary.weighingTotal > 0 ? "After what's booked and the quotes you're weighing" : "Budget less what's booked"}
        />
      </section>
      <BudgetBar className="-mt-3 h-2.5" spent={summary.committedTotal} budget={summary.totalBudget} label="Budget committed" />
      {summary.warnings.length > 0 && (
        <ul className="grid gap-1 rounded-[14px] bg-[var(--color-warn-bg)] px-4 py-3 text-sm text-warn">
          {summary.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown title={`By ${partWord(event)}`} rows={byCeremony} currency={cur} />
        <Breakdown title="By kind of vendor" rows={[...kinds.values()]} currency={cur} />
      </div>

      {(owing.length > 0 || paidUnbooked.length > 0 || overpaid.length > 0) && (
        <section className="card px-6 py-5" aria-labelledby="owing-h">
          <h2 id="owing-h" className="display text-xl">Still to pay</h2>
          <p className="mt-1 text-sm text-muted">
            {summary.toPayTotal > 0
              ? `${money(summary.toPayTotal, cur)} in all, vendor by vendor. Mark one paid once the money has gone.`
              : "Nothing is owed on what's booked. One thing to tidy up:"}
          </p>
          <ul className="mt-3 divide-y divide-line">
            {owing.map(({ line }) => (
              <li key={line._id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium">{line.label}</span>
                  <span className="text-xs text-quiet">
                    {money(line.committed, cur)} agreed · {money(line.paid, cur)} paid
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="display text-lg tabular-nums">{money(line.committed - line.paid, cur)}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-quiet btn-sm"
                      aria-label={`Mark ${line.label} paid`}
                      onClick={() => void markPaid({ lineId: line._id }).catch(() => setError("That didn't save. Try again."))}
                    >
                      Mark paid
                    </button>
                  )}
                </span>
              </li>
            ))}
            {paidUnbooked.map(({ line, slot }) => (
              <li key={line._id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium">{line.label}</span>
                  <span className="text-xs text-warn">
                    {money(line.paid, cur)} paid on a quote of {money(line.committed, cur)}, but not marked booked, so nothing is counted as owed
                  </span>
                </span>
                {slot && canEdit && (
                  <Link to={needHref(slot._id)} className="btn-quiet btn-sm">
                    Mark it booked
                  </Link>
                )}
              </li>
            ))}
            {overpaid.map(({ line, overpaid: extra }) => (
              <li key={`${line._id}-over`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium">{line.label}</span>
                  <span className="text-xs text-warn">
                    {money(line.paid, cur)} paid against {money(line.committed, cur)} agreed: {money(extra, cur)} more than the agreed price
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WhatsDue eventId={eventId} eventName={event.name} currency={event.currency} canEdit={canEdit} sessions={sessions} />

      <section className="card overflow-hidden" aria-labelledby="lines-h">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 pt-5">
          <h2 id="lines-h" className="display text-xl">Every cost</h2>
          <p className="text-xs text-quiet">A vendor's agreed amount comes from the quote you book. Until then it's a quote you're weighing.</p>
        </div>
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-quiet">
                <th className="px-6 py-2 font-semibold">For</th>
                <th className="px-2 py-2 text-right font-semibold">Planned</th>
                <th className="px-2 py-2 text-right font-semibold">Agreed</th>
                <th className="px-2 py-2 text-right font-semibold">Paid</th>
                <th className="px-2 py-2 text-right font-semibold">To pay</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map(({ line, slot, sessionName, state, toPay }: Summary["lines"][number]) => (
                <tr key={line._id}>
                  <td className="px-6 py-2.5">
                    <span className="block">{line.label}</span>
                    <span className="text-xs text-quiet">{slot ? (sessionName ?? `Across ${partWord(event, true)}`) : sessionName ?? "Not a vendor"}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <AmountCell label={`Planned for ${line.label}`} value={line.planned} disabled={!canEdit} onSave={(n) => updateLine({ lineId: line._id, planned: n })} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {slot ? (
                      state === "weighing" ? (
                        line.committed > 0 ? (
                          <span className="text-quiet" title="A quote on a need that isn't booked yet">
                            {money(line.committed, cur)}
                            <span className="block text-[11px]">quote, not booked</span>
                          </span>
                        ) : (
                          <span className="text-quiet">—</span>
                        )
                      ) : (
                        money(line.committed, cur)
                      )
                    ) : (
                      <AmountCell label={`Committed for ${line.label}`} value={line.committed} disabled={!canEdit} onSave={(n) => updateLine({ lineId: line._id, committed: n })} />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <AmountCell label={`Paid for ${line.label}`} value={line.paid} disabled={!canEdit} onSave={(n) => updateLine({ lineId: line._id, paid: n })} />
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${toPay > 0 ? "font-medium text-ink" : "text-quiet"}`}>
                    {state === "weighing" ? "—" : toPay > 0 ? money(toPay, cur) : "Paid"}
                  </td>
                  <td className="px-6 py-2 text-right">
                    {slot ? (
                      <StatusChip status={slot.status} />
                    ) : (
                      canEdit && (
                        <button type="button" onClick={() => void removeCost({ lineId: line._id })} className="text-xs text-quiet underline underline-offset-2 hover:text-bad">
                          Remove
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* The totals, so the table adds up to the figures at the top. */}
            <tfoot>
              <tr className="border-t-2 border-line font-medium">
                <th scope="row" className="px-6 py-3 text-left">
                  Total
                  {summary.weighingTotal > 0 && <span className="block text-xs font-normal text-quiet">plus {money(summary.weighingTotal, cur)} in quotes not booked</span>}
                </th>
                <td className="px-2 py-3 text-right tabular-nums">{money(summary.plannedTotal, cur)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{money(summary.agreedTotal, cur)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{money(summary.paidTotal, cur)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{money(summary.toPayTotal, cur)}</td>
                <td className="px-6 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
        {canEdit && (
          <form
            className="grid gap-2 border-t border-line px-6 py-4 sm:grid-cols-[1fr_12rem_9rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              addCost({ eventId, label, planned: Math.max(0, Number(planned) || 0), sessionId: (sessionId || undefined) as Id<"sessions"> | undefined })
                .then(() => { setLabel(""); setPlanned(""); })
                .catch((err) => setError(err instanceof Error ? err.message.replace(/^.*ConvexError: /, "").split("\n")[0] : "That didn't save."));
            }}
          >
            <input className="input" placeholder="A cost that isn't a vendor: outfits, return gifts, travel…" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="What the cost is for" />
            <select className="input" value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label={`Which ${partWord(event)}`}>
              <option value="">The whole event</option>
              {sessions.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
            <input className="input text-right" type="number" min={0} placeholder={`Planned (${cur})`} value={planned} onChange={(e) => setPlanned(e.target.value)} aria-label="Planned amount" />
            <button type="submit" className="btn-quiet" disabled={!label.trim()}>
              <Icon name="plus" size={15} /> Add a cost
            </button>
            {error && <p role="alert" className="text-sm text-bad sm:col-span-4">{error}</p>}
          </form>
        )}
      </section>
    </div>
  );
}
