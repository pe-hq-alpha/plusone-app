import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { daysBetweenIso, flattenSlots, money } from "../lib/format";
import { DayByPart, usePartActions } from "../components/DayByPart";
import { needRow, sharedAcrossEvent } from "../lib/dayByPart";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusChip } from "../components/ui/StatusChip";
import { Icon } from "../components/ui/Icon";
import { BudgetBar } from "../components/ui/BudgetBar";
import { peopleWord } from "../../convex/lib/occasion";
import { PeopleWord, partExamples } from "../lib/words";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;

export function PlanPage() {
  const { event, role, sessions, stats } = useOutletContext<EventData>();
  const canEdit = role !== "viewer";
  const eventId = event._id as Id<"events">;
  const slots = flattenSlots(useQuery(api.slots.list, { eventId }));
  const board = useQuery(api.dashboard.board, { eventId });
  const budget = useQuery(api.budget.summary, { eventId });
  const actions = usePartActions(eventId, event.startDate);

  const shared = sharedAcrossEvent(slots ?? [], sessions.length);
  const days = Math.max(1, daysBetweenIso(event.startDate, event.endDate) + 1);
  const rows = (slots ?? []).map((s) => needRow(s, board?.needs.find((n) => n.slotId === s._id)));
  const tally = (state: string) => rows.filter((r) => r.state === state).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="grid min-w-0 content-start gap-6">
        {slots === undefined ? (
          <p className="text-sm text-muted">Loading the plan…</p>
        ) : sessions.length === 0 ? (
          <EmptyState icon="calendar" title="No parts yet" body="Add the first part of the event to start planning it." />
        ) : (
          <DayByPart event={event} sessions={sessions} slots={slots} needs={board?.needs} canEdit={canEdit} actions={canEdit ? actions : undefined} />
        )}
        {event.styleSummary && <p className="text-sm italic leading-relaxed text-muted">“{event.styleSummary}”</p>}
        {canEdit && <div className="max-w-md"><AddPart eventId={eventId} event={event} nextDayIndex={days} /></div>}

        {shared.length > 0 && (
          <section className="card px-7 py-6" aria-labelledby="shared-h">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="shared-h" className="display text-xl">Across the whole event</h2>
              <p className="text-sm text-quiet">{shared.length} needs for every part</p>
            </div>
            <ul className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {shared.map((s) => (
                <li key={s._id}>
                  <Link
                    to={`../vendors/${s._id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[10px] px-3 py-2.5 transition hover:bg-accent-soft/50"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-[0.95rem]">{s.title}</span>
                      <span className="text-xs text-quiet">{money(s.budget, event.currency)}</span>
                    </span>
                    <StatusChip status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="grid content-start gap-4 md:grid-cols-3 lg:sticky lg:top-6 lg:grid-cols-1">
        <section className="card p-5" aria-labelledby="budget-h" data-tour="budget">
          <h2 id="budget-h" className="display text-lg">Budget</h2>
          <p className="display mt-1 text-[1.7rem] leading-tight text-ink">{money(stats.committedTotal, event.currency)}</p>
          <p className="text-xs text-quiet">committed of {money(event.totalBudget, event.currency)}</p>
          <BudgetBar className="mt-3 h-1.5" spent={stats.committedTotal} budget={event.totalBudget} label="Budget committed" />
          {budget?.warnings?.length ? (
            <ul className="mt-3 space-y-1 text-sm text-warn">
              {budget.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          ) : null}
        </section>
        <section className="card p-5" aria-labelledby="vendors-h">
          <h2 id="vendors-h" className="display text-lg">Vendors</h2>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {([["booked", "booked"], ["compare", "to compare"], ["waiting", "waiting"]] as const).map(([k, label]) => (
              <div key={k} className="rounded-[10px] border border-line bg-soft px-1 py-2">
                <dt className="sr-only">{label}</dt>
                <dd className="display text-[1.35rem] leading-tight text-ink">{tally(k)}</dd>
                <dd className="text-[11px] text-quiet" aria-hidden="true">{label}</dd>
              </div>
            ))}
          </dl>
          {tally("next") > 0 && <p className="mt-3 text-xs text-quiet">{tally("next")} more not started.</p>}
          <Link to="../vendors" className="btn-quiet btn-sm mt-4">
            Find vendors <Icon name="arrow" size={15} />
          </Link>
        </section>
        <section className="card p-5" aria-labelledby="guests-h">
          <h2 id="guests-h" className="display text-lg">{PeopleWord(event)}</h2>
          <p className="mt-1.5 text-sm text-muted">
            {stats.guestCounts?.yes ?? 0} yes · {stats.guestCounts?.no ?? 0} no · {stats.guestCounts?.pending ?? 0} pending
          </p>
          <Link to="../guests" className="btn-quiet btn-sm mt-4">
            Manage {peopleWord(event)} <Icon name="arrow" size={15} />
          </Link>
        </section>
      </aside>
    </div>
  );
}

/** Add another part of the event to the plan. Its budget comes out of the same total. */
function AddPart({
  eventId,
  event,
  nextDayIndex,
}: {
  eventId: Id<"events">;
  event: EventData["event"];
  nextDayIndex: number;
}) {
  const add = useMutation(api.sessions.add);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState(event.endDate);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const dayIndex = Math.max(
        0,
        Math.round((new Date(date).getTime() - new Date(event.startDate).getTime()) / 86400000),
      );
      await add({
        eventId,
        name: name.trim(),
        date,
        dayIndex: Number.isFinite(dayIndex) ? dayIndex : nextDayIndex,
        budget: 0,
        guestCount: 0,
      });
      setName("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That part couldn't be added.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 rounded-[18px] border border-dashed border-rule px-6 py-5 text-sm text-muted transition hover:border-accent hover:bg-accent-soft/40 hover:text-accent"
      >
        <Icon name="plus" size={16} /> Add a part
      </button>
    );
  }

  return (
    <div className="card px-6 py-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-quiet">
          What is it called?
          <input
            className="input"
            autoFocus
            placeholder={partExamples(event)}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-quiet">
          Date
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <p className="mt-3 text-xs text-quiet">{PeopleWord(event)} and budget can be set on the card once it's here.</p>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={() => void submit()} disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add the part"}
        </button>
        <button type="button" className="btn-quiet btn-sm" onClick={() => { setOpen(false); setError(null); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
