import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { clock, eventsWord } from "../../../convex/lib/planningChat";
import type { Facts } from "../../../convex/lib/wizard";

type Row = Facts["sessions"][number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(first: string, day: number, many: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return many ? `Day ${day + 1}` : "On the day";
  const d = new Date(`${first}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * The plan as it takes shape beside the conversation: each day, its events with their time
 * and guests, and the vendors they call for. The host can rename, move, retime and remove an
 * event, or add their own; edits are saved to the conversation, which reads them back.
 */
export function PlanPreview({ facts, onSave, busy }: { facts: Facts; onSave: (sessions: Row[]) => Promise<void>; busy: boolean }) {
  const [rows, setRows] = useState<Row[]>(facts.sessions);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const signature = JSON.stringify(facts.sessions);
  // The conversation changed the plan: show its version unless the host is mid-edit.
  useEffect(() => {
    if (!dirty) setRows(facts.sessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const word = eventsWord(facts.eventType);
  const lastDay = Math.max(0, ...rows.map((r) => r.day ?? 0));
  const days = [...new Set(rows.map((r) => r.day ?? 0))].sort((a, b) => a - b);
  const many = lastDay > 0;
  const change = (i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      await onSave(rows.filter((r) => r.name.trim()));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  if (!rows.length) {
    return (
      <div className="pc-plan">
        <h2 className="pc-plan__title">Your plan</h2>
        <p className="mt-2 text-sm text-muted">The {word} will appear here as we talk, each with its day, time and guests, for you to change.</p>
      </div>
    );
  }

  return (
    <div className="pc-plan">
      <h2 className="pc-plan__title">Your plan</h2>
      <p className="mt-0.5 text-xs text-quiet">
        {days.length > 1 ? `${days.length} days, ` : ""}
        {rows.length} {rows.length === 1 ? "event" : word}
        {facts.guests ? ` · about ${facts.guests} people` : ""}
      </p>
      {days.map((d) => (
        <section key={d} className="pc-plan__day" aria-label={dayLabel(facts.date, d, many)}>
          <h3 className="pc-plan__dayname">{dayLabel(facts.date, d, many)}</h3>
          <ul>
            {rows
              .map((r, i) => ({ r, i }))
              .filter(({ r }) => (r.day ?? 0) === d)
              .sort((a, b) => (a.r.startTime || "99").localeCompare(b.r.startTime || "99"))
              .map(({ r, i }) => (
                <li key={i} className="pc-plan__event">
                  <input className="pc-plan__name" value={r.name} onChange={(e) => change(i, { name: e.target.value.slice(0, 80) })} aria-label="Name of this event" />
                  <div className="pc-plan__facts">
                    <label className="sr-only" htmlFor={`pp-time-${i}`}>Time</label>
                    <input id={`pp-time-${i}`} type="time" className="pc-plan__time" value={r.startTime} onChange={(e) => change(i, { startTime: e.target.value })} title={clock(r.startTime) || "Add a time"} />
                    <label className="sr-only" htmlFor={`pp-guests-${i}`}>Guests</label>
                    <input
                      id={`pp-guests-${i}`}
                      className="pc-plan__guests"
                      inputMode="numeric"
                      value={r.guests ?? ""}
                      placeholder="guests"
                      onChange={(e) => change(i, { guests: e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : null })}
                    />
                    <label className="sr-only" htmlFor={`pp-day-${i}`}>Day</label>
                    <select id={`pp-day-${i}`} className="pc-plan__day-pick" value={r.day ?? 0} onChange={(e) => change(i, { day: Number(e.target.value) })}>
                      {Array.from({ length: Math.min(10, lastDay + 2) }, (_, k) => (
                        <option key={k} value={k}>{dayLabel(facts.date, k, true)}</option>
                      ))}
                    </select>
                    <button type="button" className="pc-plan__remove" aria-label={`Remove ${r.name}`} onClick={() => { setRows((prev) => prev.filter((_, k) => k !== i)); setDirty(true); }}>
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
        onClick={() => {
          setRows((prev) => [...prev, { name: "", startTime: "", guests: facts.guests, day: lastDay }]);
          setDirty(true);
        }}
      >
        <Icon name="plus" size={14} /> Add {facts.eventType === "wedding" ? "a ceremony" : "an event"}
      </button>
      {dirty && (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={saving || busy}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn-quiet btn-sm" onClick={() => { setRows(facts.sessions); setDirty(false); }}>
            Undo
          </button>
        </div>
      )}
      {facts.needs.length > 0 && (
        <div className="pc-plan__needs">
          <h3 className="pc-plan__dayname">Vendors to find</h3>
          <p className="text-sm leading-relaxed text-muted">{facts.needs.map((n) => n.title).join(" · ")}</p>
        </div>
      )}
    </div>
  );
}
