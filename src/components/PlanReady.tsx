import { useEffect, useMemo, useRef, useState } from "react";
import { partWord, peopleWord } from "../../convex/lib/occasion";
import type { Doc } from "../../convex/_generated/dataModel";
import { longDate } from "../lib/format";
import { PlusOneMark } from "./brand/Wordmarks";
import { Icon } from "./ui/Icon";

/** Long enough to take the plan in; the button waits at least this long. */
const HOLD_MS = 2000;
/** If the first to-dos haven't started by now, they aren't coming. */
const NOT_STARTED_MS = 8000;
/** Past this, the plan opens on its own. */
const OPEN_ANYWAY_MS = 45_000;

/**
 * Straight after a plan is created: the whole plan at once, its days side by side with
 * each part of it under its day, and three plain checks that tick as they become true.
 * The last one, the first to-dos, is the only part still being written.
 */
export function PlanReady({ event, sessions, onDone }: { event: Doc<"events">; sessions: Doc<"sessions">[]; onDone: () => void }) {
  const [held, setHeld] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const a = window.setTimeout(() => setHeld(true), HOLD_MS);
    const b = window.setTimeout(() => setGaveUp(true), NOT_STARTED_MS);
    const c = window.setTimeout(() => doneRef.current(), OPEN_ANYWAY_MS);
    return () => [a, b, c].forEach((t) => window.clearTimeout(t));
  }, []);

  const days = useMemo(() => {
    const byDay = new Map<number, Doc<"sessions">[]>();
    for (const e of sessions) byDay.set(e.dayIndex, [...(byDay.get(e.dayIndex) ?? []), e]);
    return [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, list]) => ({ day, date: list[0].date, list: list.sort((x, y) => (x.startTime ?? "99").localeCompare(y.startTime ?? "99") || x.order - y.order) }));
  }, [sessions]);

  const writing = event.generation === "running" || (event.generation === undefined && !gaveUp);
  const ready = held && !writing;
  useEffect(() => {
    if (ready) openRef.current?.focus({ preventScroll: true });
  }, [ready]);

  const checks: { label: string; done: boolean }[] = [
    { label: `${sessions.length} ${partWord(event, sessions.length !== 1)} on ${days.length} ${days.length === 1 ? "day" : "days"}`, done: true },
    { label: "Budget shared across them", done: true },
    { label: event.generation === "failed" ? "First to-dos: add your own as you go" : `First to-dos for each ${partWord(event)}`, done: !writing },
  ];

  return (
    <main id="main" className="ready">
      <div className="ready__inner">
        <p className="display text-xl text-accent"><PlusOneMark /></p>
        <h1 className="ready__title">
          The plan for <em>{event.name}</em>
        </h1>
        <p className="ready__where">{[event.city, longDate(event.startDate)].filter(Boolean).join(" · ")}</p>

        <ol className="ready__days" aria-label="Your days">
          {days.map(({ day, date, list }) => (
            <li key={day} className="ready__day">
              <p className="ready__day-label">Day {day + 1} · {longDate(date)}</p>
              <ul>
                {list.map((e) => (
                  <li key={e._id} className="ready__ceremony">
                    <span className="display">{e.name}</span>
                    <span className="ready__meta">{e.guestCount > 0 ? `${e.guestCount} ${peopleWord(event)}` : "Headcount to come"}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <ul className="ready__checks" role="status" aria-live="polite">
          {checks.map((c) => (
            <li key={c.label} className={c.done ? "is-done" : ""}>
              <span className="ready__tick" aria-hidden="true">{c.done ? <Icon name="check" size={14} /> : null}</span>
              {c.label}
            </li>
          ))}
        </ul>

        <button ref={openRef} type="button" className="btn-primary ready__open" disabled={!ready} onClick={onDone}>
          Open the plan
        </button>
      </div>
    </main>
  );
}
