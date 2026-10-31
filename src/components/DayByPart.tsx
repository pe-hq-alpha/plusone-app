import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sessionIcon, ICON_STROKE } from "../lib/sessionIcons";
import { addDaysIso, daysBetweenIso, longDate, money, type FlatSlot } from "../lib/format";
import {
  STATE_LABEL,
  dayHeading,
  groupByDay,
  needsOfPart,
  partProgress,
  placesOf,
  priceText,
  timeChip,
  type BoardNeedLike,
  type NeedRow,
} from "../lib/dayByPart";
import "../styles/day-by-part.css";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
export type Part = EventData["sessions"][number];

/** What the plan's text actions do. Each one is an existing mutation (see `usePartActions`). */
export type PartActions = {
  setTime: (partId: Id<"sessions">, start: string, end: string) => Promise<unknown>;
  moveToDay: (partId: Id<"sessions">, dayIndex: number) => Promise<unknown>;
  addNeed: (partId: Id<"sessions">, title: string, budget: number) => Promise<unknown>;
};

/** The three text actions, wired to `sessions.update`, `sessions.move` and `slots.add`. */
export function usePartActions(eventId: Id<"events">, startDate: string): PartActions {
  const update = useMutation(api.sessions.update);
  const move = useMutation(api.sessions.move).withOptimisticUpdate((store, args) => {
    const data = store.getQuery(api.events.get, { eventId });
    if (!data) return;
    const sessions = data.sessions.map((e) =>
      e._id === args.sessionId ? { ...e, dayIndex: args.dayIndex, date: addDaysIso(startDate, args.dayIndex), order: Number.MAX_SAFE_INTEGER } : e,
    );
    store.setQuery(api.events.get, { eventId }, { ...data, sessions });
  });
  const add = useMutation(api.slots.add);
  return {
    setTime: (sessionId, startTime, endTime) => update({ sessionId, patch: { startTime, endTime } }),
    // Past the end of the day means last on it; the order within a day is by time anyway.
    moveToDay: (sessionId, dayIndex) => move({ sessionId, dayIndex, position: Number.MAX_SAFE_INTEGER }),
    addNeed: (sessionId, title, budget) => add({ eventId, title, category: title, sessionIds: [sessionId], budget }),
  };
}

/**
 * The day, part by part: each day under a quiet heading, each part of it a card in time
 * order with its time, place, headcount and budget, and the vendors it needs, one row
 * each. A line with a node per part runs down the left and fills as vendors are booked.
 */
export function DayByPart({
  event,
  sessions,
  slots,
  needs,
  canEdit,
  actions,
}: {
  event: Pick<EventData["event"], "startDate" | "endDate" | "city" | "area" | "currency" | "guestEstimate" | "eventType">;
  sessions: Part[];
  slots: FlatSlot[];
  /** The decisions board's reading of each need (vendor states, quote range); undefined while loading. */
  needs: readonly BoardNeedLike[] | undefined;
  canEdit: boolean;
  actions?: PartActions;
}) {
  const days = groupByDay(sessions);
  const lastDay = Math.max(daysBetweenIso(event.startDate, event.endDate), ...sessions.map((s) => s.dayIndex));
  const people = event.guestEstimate ?? Math.max(0, ...sessions.map((s) => s.guestCount));
  const booked = slots.filter((s) => s.status === "booked").length;
  const place = [event.area, event.city].filter(Boolean).join(", ");
  const multiDay = event.endDate !== event.startDate;
  const firstId = days[0]?.parts[0]?._id;

  return (
    <section className="dbp" aria-labelledby="dbp-title">
      <h1 id="dbp-title" className="dbp__title">
        The {days.length > 1 ? "days" : "day"}, <em>part by part</em>
      </h1>
      <p className="dbp__meta">
        <b>{longDate(event.startDate)}</b>
        {multiDay ? <> to <b>{longDate(event.endDate)}</b></> : null}
        {place ? ` · ${place}` : ""} · {booked} of {slots.length} booked
      </p>

      {days.map((day) => {
        const places = placesOf(day.parts);
        return (
          <section key={day.date} className="dbp__day" aria-label={dayHeading(day.date)}>
            <div className="dbp__day-head">
              <h2>{dayHeading(day.date)}</h2>
              {places.length > 0 && <span>{places.join(", then ")}</span>}
            </div>
            <ol className="dbp__flow">
              {day.parts.map((part) => (
                  <PartCard
                    key={part._id}
                    part={part}
                    rows={needsOfPart(part._id, slots, needs, sessions.length)}
                    currency={event.currency}
                    canEdit={canEdit}
                    actions={actions}
                    startDate={event.startDate}
                    lastDay={lastDay}
                    anchor={part._id === firstId}
                    eventType={event.eventType}
                    showPlace={places.length > 1}
                    eventPeople={people}
                  />
              ))}
            </ol>
          </section>
        );
      })}
    </section>
  );
}

type Panel = "time" | "day" | "vendor" | null;

function PartCard({
  part,
  rows,
  currency,
  canEdit,
  actions,
  startDate,
  lastDay,
  anchor,
  eventType,
  showPlace,
  eventPeople,
}: {
  part: Part;
  rows: NeedRow[];
  currency: string;
  canEdit: boolean;
  actions?: PartActions;
  startDate: string;
  lastDay: number;
  anchor: boolean;
  eventType?: EventData["event"]["eventType"];
  /** The day's parts are at more than one place, so each card says where it is. */
  showPlace: boolean;
  /** The event's headcount; a part says its own only when it differs. */
  eventPeople: number;
}) {
  const PartIcon = sessionIcon(part, eventType);
  const progress = partProgress(rows);
  const [panel, setPanel] = useState<Panel>(null);
  // The three ways to change a part stay folded under one Edit, so a card reads as the part, not as its controls.
  const [editing, setEditing] = useState(false);
  const chip = timeChip(part.startTime, part.endTime);
  const open = `../sessions/${part._id}`;
  const toggle = (p: Panel) => setPanel((now) => (now === p ? null : p));

  return (
    <li className={`dbp__part dbp__part--${progress.node}`} style={{ "--fill": `${Math.round(progress.fraction * 100)}%` } as CSSProperties}>
      <article className="dbp__card" aria-labelledby={`part-${part._id}`}>
        <span
          className="dbp__node"
          role="img"
          aria-label={progress.total ? `${progress.booked} of ${progress.total} vendors booked` : "No vendors yet"}
        >
          <PartIcon strokeWidth={ICON_STROKE} aria-hidden="true" />
        </span>
        <div className="dbp__head">
          <div className="min-w-0">
            <h3 id={`part-${part._id}`} className="dbp__name">{part.name}</h3>
            <p className="dbp__facts">
              {chip && <span className="dbp__time">{chip}</span>}
              {showPlace && part.location && <span>{part.location}</span>}
              {part.guestCount > 0 && part.guestCount !== eventPeople && <span>About {part.guestCount} people</span>}
              {part.budget > 0 && <span>{money(part.budget, currency)} set aside</span>}
            </p>
          </div>
          <Link to={open} className="dbp__open" data-tour={anchor ? "days" : undefined} aria-label={`Open ${part.name}`}>
            Open <span aria-hidden="true">→</span>
          </Link>
        </div>

        {rows.length > 0 ? (
          <ul className="dbp__needs">
            {rows.map((r) => (
              <NeedLine key={r.slotId} row={r} currency={currency} />
            ))}
          </ul>
        ) : (
          <p className="dbp__none">No vendors on this part yet.</p>
        )}

        {canEdit && (
          <div className="dbp__foot">
            <button
              type="button"
              className="dbp__edit"
              aria-expanded={editing}
              onClick={() => {
                setEditing((v) => !v);
                setPanel(null);
              }}
            >
              {editing ? "Done" : "Edit"}
            </button>
            {editing && <div className="dbp__acts">
              {actions ? (
                <>
                  <button type="button" aria-expanded={panel === "time"} onClick={() => toggle("time")}>Change the time</button>
                  <button type="button" aria-expanded={panel === "day"} onClick={() => toggle("day")}>Move to another day</button>
                  <button type="button" aria-expanded={panel === "vendor"} onClick={() => toggle("vendor")}>Add a vendor</button>
                </>
              ) : (
                <>
                  <Link to={open}>Change the time</Link>
                  <Link to={open}>Move to another day</Link>
                  <Link to={open}>Add a vendor</Link>
                </>
              )}
            </div>}
            {actions && panel === "time" && <TimeForm part={part} actions={actions} done={() => setPanel(null)} />}
            {actions && panel === "day" && <DayForm part={part} actions={actions} startDate={startDate} lastDay={lastDay} done={() => setPanel(null)} />}
            {actions && panel === "vendor" && <VendorForm part={part} actions={actions} currency={currency} done={() => setPanel(null)} />}
          </div>
        )}
      </article>
    </li>
  );
}

function NeedLine({ row, currency }: { row: NeedRow; currency: string }) {
  return (
    <li className={`dbp__need dbp__need--${row.state}`}>
      <span className="dbp__dot" aria-hidden="true" />
      <Link to={`../vendors/${row.slotId}`} className="dbp__what" title={row.detail}>
        {row.title}
        {row.note && <small className={row.note.endsWith("question for you") ? "dbp__ask" : undefined}>{row.note}</small>}
      </Link>
      {row.state === "compare" && row.quotes > 1 ? (
        <Link to={`../decisions#need-${row.slotId}`} className="dbp__compare">Compare</Link>
      ) : (
        <span className="dbp__state">{STATE_LABEL[row.state]}</span>
      )}
      <span className="dbp__price">
        {priceText(row.price, currency)}
      </span>
    </li>
  );
}

/** Saves through the action, shows a reason if it is refused, and closes on success. */
function useSave(done: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*ConvexError:\s*/, "") : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function FormButtons({ busy, label, disabled, done }: { busy: boolean; label: string; disabled?: boolean; done: () => void }) {
  return (
    <div className="dbp__form-buttons">
      <button type="submit" className="btn-primary btn-sm" disabled={busy || disabled}>{busy ? "Saving…" : label}</button>
      <button type="button" className="btn-quiet btn-sm" onClick={done}>Cancel</button>
    </div>
  );
}

function TimeForm({ part, actions, done }: { part: Part; actions: PartActions; done: () => void }) {
  const [start, setStart] = useState(part.startTime ?? "");
  const [end, setEnd] = useState(part.endTime ?? "");
  const { busy, error, run } = useSave(done);
  return (
    <form className="dbp__form" onSubmit={(e) => { e.preventDefault(); void run(() => actions.setTime(part._id, start, end)); }}>
      <label className="dbp__field">
        <span className="label">Starts</span>
        <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="dbp__field">
        <span className="label">Ends</span>
        <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <FormButtons busy={busy} label="Save the time" done={done} />
      {error && <p role="alert" className="dbp__error">{error}</p>}
    </form>
  );
}

function DayForm({ part, actions, startDate, lastDay, done }: { part: Part; actions: PartActions; startDate: string; lastDay: number; done: () => void }) {
  const [day, setDay] = useState(part.dayIndex);
  const { busy, error, run } = useSave(done);
  return (
    <form className="dbp__form" onSubmit={(e) => { e.preventDefault(); void run(() => actions.moveToDay(part._id, day)); }}>
      <label className="dbp__field dbp__field--wide">
        <span className="label">Which day?</span>
        <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {Array.from({ length: lastDay + 2 }, (_, i) => (
            <option key={i} value={i}>
              {i > lastDay ? `A new day, ${dayHeading(addDaysIso(startDate, i))}` : dayHeading(addDaysIso(startDate, i))}
            </option>
          ))}
        </select>
      </label>
      <FormButtons busy={busy} label="Move it" disabled={day === part.dayIndex} done={done} />
      {error && <p role="alert" className="dbp__error">{error}</p>}
    </form>
  );
}

function VendorForm({ part, actions, currency, done }: { part: Part; actions: PartActions; currency: string; done: () => void }) {
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const { busy, error, run } = useSave(done);
  return (
    <form className="dbp__form" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void run(() => actions.addNeed(part._id, title.trim(), Math.max(0, Number(budget) || 0))); }}>
      <label className="dbp__field dbp__field--wide">
        <span className="label">What do you need?</span>
        <input className="input" autoFocus placeholder="Photographer" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="dbp__field">
        <span className="label">Budget ({currency})</span>
        <input className="input" type="number" min={0} step={100} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </label>
      <FormButtons busy={busy} label="Add it" disabled={!title.trim()} done={done} />
      {error && <p role="alert" className="dbp__error">{error}</p>}
    </form>
  );
}
