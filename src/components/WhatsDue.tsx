import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { money, shortDate } from "../lib/format";
import { downloadCalendar } from "../lib/calendar";
import { Icon } from "./ui/Icon";

type Due = FunctionReturnType<typeof api.dues.list>[number];
type Ceremony = NonNullable<FunctionReturnType<typeof api.events.get>>["sessions"][number];

const DAY = 86_400_000;
const todayIso = () => new Date().toISOString().slice(0, 10);
const daysUntil = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / DAY);

function when(iso: string): { text: string; tone: "bad" | "warn" | "quiet" } {
  const d = daysUntil(iso);
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, tone: "bad" };
  if (d === 0) return { text: "due today", tone: "warn" };
  if (d <= 30) return { text: `in ${d} day${d === 1 ? "" : "s"}`, tone: "warn" };
  return { text: shortDate(iso), tone: "quiet" };
}

/**
 * What's due, when: every payment and
 * deadline, overdue first. Ticking a payment counts it as paid in the budget.
 */
export function WhatsDue({
  eventId,
  eventName,
  currency,
  canEdit,
  sessions,
}: {
  eventId: Id<"events">;
  eventName: string;
  currency: string;
  canEdit: boolean;
  sessions: Ceremony[];
}) {
  const dues = useQuery(api.dues.list, { eventId });
  const slots = useQuery(api.slots.list, { eventId });
  const setDone = useMutation(api.dues.setDone);
  const remove = useMutation(api.dues.remove);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  if (dues === undefined) return null;

  const open = dues.filter((d) => !d.doneAt);
  const done = dues.filter((d) => d.doneAt).reverse();
  const toPay = open.filter((d) => d.kind === "payment").reduce((a, d) => a + (d.amount ?? 0), 0);
  const booked = (slots ?? []).flatMap((s) => (s.bookedVendor ? [{ id: s.bookedVendor._id as Id<"vendors">, name: s.bookedVendor.name, slot: s.slot.title }] : []));

  return (
    <section className="card px-6 py-5" aria-labelledby="due-h" data-tour="whats-due">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="due-h" className="display text-xl">What's <em>due</em></h2>
          <p className="mt-0.5 text-sm text-muted">
            {open.length === 0 ? "Nothing due. Booking a vendor adds their deposit and balance here." : `${open.length} to do${toPay ? `, ${money(toPay, currency)} still to pay` : ""}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-quiet btn-sm" onClick={() => downloadCalendar(eventName, sessions, dues)}>
            <Icon name="calendar" size={15} /> Add to my calendar
          </button>
          {canEdit && !adding && (
            <button type="button" className="btn-quiet btn-sm" onClick={() => setAdding(true)}>
              <Icon name="plus" size={15} /> Add
            </button>
          )}
        </div>
      </div>

      {adding && <AddDue eventId={eventId} booked={booked} onDone={() => setAdding(false)} />}

      {open.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {open.map((d) => (
            <Row key={d._id} d={d} currency={currency} canEdit={canEdit} onDone={(v) => void setDone({ dueId: d._id, done: v })} onRemove={() => void remove({ dueId: d._id })} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-3">
          <button type="button" className="text-sm text-muted underline underline-offset-2 hover:text-accent" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "Hide" : "Show"} {done.length} done
          </button>
          {showDone && (
            <ul className="mt-2 divide-y divide-line opacity-80">
              {done.map((d) => (
                <Row key={d._id} d={d} currency={currency} canEdit={canEdit} onDone={(v) => void setDone({ dueId: d._id, done: v })} onRemove={() => void remove({ dueId: d._id })} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ d, currency, canEdit, onDone, onRemove }: { d: Due; currency: string; canEdit: boolean; onDone: (v: boolean) => void; onRemove: () => void }) {
  const w = when(d.dueDate);
  const tone = d.doneAt ? "text-quiet" : w.tone === "bad" ? "text-bad" : w.tone === "warn" ? "text-warn" : "text-quiet";
  return (
    <li className="group flex items-center gap-3 py-2.5">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-accent"
        checked={Boolean(d.doneAt)}
        disabled={!canEdit}
        onChange={(e) => onDone(e.target.checked)}
        aria-label={`${d.doneAt ? "Not" : "Mark"} ${d.kind === "payment" ? "paid" : "done"}: ${d.label}`}
      />
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
        <Icon name={d.kind === "payment" ? "wallet" : "calendar"} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${d.doneAt ? "text-quiet line-through" : ""}`}>
          {d.label}
          {d.vendorName && <span className="text-muted"> · {d.vendorName}</span>}
        </span>
        <span className={`block text-xs ${tone}`}>{d.doneAt ? `${d.kind === "payment" ? "Paid" : "Done"}` : w.text}</span>
      </span>
      {d.amount !== undefined && <span className="shrink-0 text-sm tabular-nums">{money(d.amount, currency)}</span>}
      {canEdit && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${d.label}`} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-quiet opacity-60 transition hover:bg-accent-soft hover:text-accent group-hover:opacity-100">
          <Icon name="close" size={12} />
        </button>
      )}
    </li>
  );
}

function AddDue({ eventId, booked, onDone }: { eventId: Id<"events">; booked: { id: Id<"vendors">; name: string; slot: string }[]; onDone: () => void }) {
  const add = useMutation(api.dues.add);
  const [kind, setKind] = useState<"payment" | "deadline">("payment");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-4 grid gap-3 rounded-[14px] bg-accent-soft/40 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        void add({
          eventId,
          kind,
          label,
          dueDate: date,
          ...(kind === "payment" && amount ? { amount: Number(amount) } : {}),
          ...(vendorId ? { vendorId: vendorId as Id<"vendors"> } : {}),
        }).then(onDone, (err) => setError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "That didn't save."));
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="label">What</span>
        <select className="input py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as "payment" | "deadline")}>
          <option value="payment">A payment</option>
          <option value="deadline">A deadline</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="label">Vendor</span>
        <select className="input py-2 text-sm" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">None</option>
          {booked.map((b) => (
            <option key={b.id} value={b.id}>{b.name} ({b.slot})</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="label">Called</span>
        <input className="input py-2 text-sm" value={label} maxLength={120} placeholder={kind === "payment" ? "Deposit, balance…" : "Final menu, final headcount…"} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="label">Due</span>
        <input className="input py-2 text-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {kind === "payment" && (
        <label className="grid gap-1 text-sm">
          <span className="label">Amount</span>
          <input className="input py-2 text-sm" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-bad sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary btn-sm" disabled={!label.trim() || !date}>Add it</button>
        <button type="button" className="btn-quiet btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
