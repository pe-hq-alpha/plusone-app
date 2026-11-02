import { useMemo, useRef, useState, useLayoutEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { longDate, money, timeAgo } from "../lib/format";
import { BudgetBar } from "../components/ui/BudgetBar";
import { Icon } from "../components/ui/Icon";
import { VoiceButton } from "../components/VoiceButton";
import { QuoteDrop } from "../components/QuoteDrop";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { BRAND } from "../lib/brand";
import { PeopleWord } from "../lib/words";
import { usePrivacy } from "../lib/privacy";
import { addTask, removeTask, updateTask } from "../lib/optimistic";
import { useEventSuggestions } from "../lib/useEventSuggestions";
import "../styles/today.css";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type Route = FunctionReturnType<typeof api.copilot.route>;
type State = "done" | "now" | "yours" | "next";
type Row = { state: State; title: string; detail: string; href?: string; action?: string; at?: number };

const STATE_WORD: Record<State, string> = { done: "Done", now: "Under way", yours: "Over to you", next: "Up next" };

/** Today in the host's own time zone, as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

/** "in 3 weeks", "tomorrow", "today", or "was 4 days ago". */
function countdown(days: number): string {
  if (days < 0) return `was ${-days === 1 ? "yesterday" : `${-days} days ago`}`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  return weeks < 9 ? `in ${weeks} weeks` : `in ${Math.round(days / 30)} months`;
}

/** The route top to bottom: the work behind, the work under way, what needs the host, and what comes next. */
function rowsOf(route: Route): Row[] {
  return [
    ...route.done.slice().reverse().map((s) => ({ state: "done" as const, ...s })),
    ...route.now.map((s) => ({ state: "now" as const, ...s })),
    ...route.yours.map((y) => ({ state: "yours" as const, title: y.title, detail: y.detail, href: y.href, action: y.hrefLabel })),
    ...route.next.map((s) => ({ state: "next" as const, ...s, action: "Start" })),
  ];
}

/**
 * Today: the co-pilot's own account of the event, read as a route. What it has done,
 * what it is doing, what is waiting on the hosts and what it will pick up next, with
 * a line to tell it anything and the budget at a glance.
 */
export function TodayPage() {
  const { event, stats } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const today = useMemo(localToday, []);
  const route = useQuery(api.copilot.route, { eventId, today });
  const days = daysUntil(event.startDate, today);
  const rows = route ? rowsOf(route) : undefined;
  const prompts = useEventSuggestions(eventId);

  return (
    <div className="today">
      <header className="today__head">
        <h1 className="today__title">{event.name}</h1>
        <p className="today__when">
          {longDate(event.startDate)}
          {event.endDate !== event.startDate ? ` to ${longDate(event.endDate)}` : ""} · {event.city}
          {event.area ? `, ${event.area}` : ""} · <span className="text-ink">{countdown(days)}</span>
        </p>
      </header>

      {/* At a glance, first: the money, then vendors and people. */}
      <section className="today__glance" aria-label="At a glance">
        <Link to="budget" className="today__stat today__stat--money">
          <span className="today__stat-label">Budget</span>
          <span className="today__stat-big">
            {money(stats.bookedTotal, event.currency)} <small>booked of {money(event.totalBudget, event.currency)}</small>
          </span>
          <BudgetBar className="mt-2 h-2" spent={stats.bookedTotal} budget={event.totalBudget} label="Budget booked" />
          <span className="today__stat-foot">
            {money(stats.paidTotal, event.currency)} paid
            {stats.toPayTotal > 0 && <> · {money(stats.toPayTotal, event.currency)} still to pay</>}
            {stats.committedTotal > stats.bookedTotal && <> · {money(stats.committedTotal - stats.bookedTotal, event.currency)} more in quotes you're weighing</>}
            {" · "}{money(Math.max(0, event.totalBudget - stats.committedTotal), event.currency)} still free
          </span>
        </Link>
        <Link to="vendors" className="today__stat">
          <span className="today__stat-label">Vendors</span>
          <span className="today__stat-big">
            {stats.slotCounts.booked} <small>of {stats.slotCounts.research + stats.slotCounts.contacted + stats.slotCounts.quoted + stats.slotCounts.booked} booked</small>
          </span>
          <span className="today__stat-foot">{stats.needsToCompare} with prices to compare</span>
        </Link>
        <Link to="guests" className="today__stat">
          <span className="today__stat-label">{PeopleWord(event)}</span>
          <span className="today__stat-big">
            {stats.guestCounts?.yes ?? 0} <small>coming</small>
          </span>
          <span className="today__stat-foot">{stats.guestCounts?.pending ?? 0} still to say · {stats.guestCounts?.no ?? 0} not</span>
        </Link>
      </section>

      <div className="today__grid">
        <section aria-labelledby="route-h" className="today__route" data-tour="this-week">
          <div className="today__route-head">
            <h2 id="route-h" className="display text-[1.7rem]">Where things stand</h2>
            {route && route.needs > 0 && (
              <p className="text-sm text-quiet">
                {route.booked} of {route.needs} {route.needs === 1 ? "need" : "needs"} booked
              </p>
            )}
          </div>
          {rows === undefined ? (
            <p className="mt-6 text-sm text-muted">Reading your plan…</p>
          ) : rows.length === 0 ? (
            <div className="route-empty">
              <p className="display text-xl">Nothing is moving yet.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Say what you need below, or open a need under Vendors and {BRAND.name} will start looking.
              </p>
              <Link to="vendors" className="btn-primary btn-sm mt-4">Find vendors</Link>
            </div>
          ) : (
            <ol className="route">
              {rows.map((r, i) => (
                <RouteRow key={`${r.state}:${r.href ?? ""}:${r.title}:${i}`} row={r} />
              ))}
            </ol>
          )}
        </section>

        <aside className="today__side">
          <Tell eventId={eventId} demo={event.demo === true} prompts={prompts} />
          {event.demo !== true && <QuoteDrop eventId={eventId} />}
          <TodoNote eventId={eventId} />
        </aside>
      </div>
    </div>
  );
}

function RouteRow({ row }: { row: Row }) {
  const privacy = usePrivacy();
  const body = (
    <>
      <span className="route__node" aria-hidden="true" />
      <span className="route__state">{STATE_WORD[row.state]}</span>
      <span className="route__text">
        <span className="route__title">{privacy.text(row.title)}</span>
        {(row.detail || row.at) && (
          <span className="route__detail">
            {privacy.text(row.detail)}
            {row.detail && row.at ? " · " : ""}
            {row.at ? timeAgo(row.at) : ""}
          </span>
        )}
      </span>
      {row.href && row.action && (
        <span className="route__act">
          {row.action} <Icon name="arrow" size={14} />
        </span>
      )}
    </>
  );
  return (
    <li className={`route__step route__step--${row.state}`}>
      {row.href ? (
        <Link to={row.href} className="route__row" onClick={() => row.state === "yours" && record(EVENTS.thisWeekOpened, { kind: "today" })}>
          {body}
        </Link>
      ) : (
        <div className="route__row">{body}</div>
      )}
    </li>
  );
}

/** One line to tell the co-pilot anything; the conversation itself carries on in the Assistant. */
function Tell({ eventId, demo = false, prompts }: { eventId: Id<"events">; demo?: boolean; prompts: string[] }) {
  const ask = useMutation(api.assistant.ask);
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function send(words: string) {
    const content = words.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ask({ eventId, content, context: "the Overview page" });
      navigate("assistant");
    } catch (e) {
      setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't send. Try again.");
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="tell-h" className="today__panel today__panel--tell">
      <h2 id="tell-h" className="display text-xl">Tell {BRAND.name}</h2>
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor="tell-input" className="sr-only">Ask or tell {BRAND.name} anything about this event</label>
        <textarea
          id="tell-input"
          ref={inputRef}
          className="input min-h-[5.5rem] resize-y"
          placeholder="A change, a question, or a vendor to find"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
        />
        <div className="mt-2">
          <VoiceButton
            eventId={eventId}
            disabled={busy}
            // On the demo, a recorded brief, for a visitor who can't or won't speak.
            sampleUrl={demo ? "/sample-brief.mp3" : undefined}
            onText={(t) => {
              setText((prev) => (prev ? `${prev} ${t}` : t));
              inputRef.current?.focus();
            }}
          />
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-quiet">Enter to send</span>
          <button type="submit" className="btn-primary btn-sm" disabled={busy || !text.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Things to try">
        {prompts.map((p) => (
          <li key={p} className="min-w-0 max-w-full">
            <button type="button" className="today__prompt" title={p} disabled={busy} onClick={() => void send(p)}>
              {p}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Notes to self: a sticky note beside the overview that the host writes themselves.
 * Jot at the top; tick one to strike it out into a folded "Done" list; × takes it away.
 */
function TodoNote({ eventId }: { eventId: Id<"events"> }) {
  const tasks = useQuery(api.tasks.list, { eventId });
  // Instant on screen; the server's answer replaces the guess when it arrives.
  const add = useMutation(api.tasks.add).withOptimisticUpdate(addTask);
  const update = useMutation(api.tasks.update).withOptimisticUpdate(updateTask);
  const remove = useMutation(api.tasks.remove).withOptimisticUpdate(removeTask);
  const [text, setText] = useState("");
  const [showDone, setShowDone] = useState(false);
  const { offset, dragging, handle, putBack, ref: noteRef } = useMovable(`plusone.note.${eventId}`);
  // Newest first: a note is what was on the host's mind most recently.
  const open = (tasks ?? []).filter((t) => !t.done).sort((a, b) => b._creationTime - a._creationTime);
  const done = (tasks ?? []).filter((t) => t.done);
  const Line = ({ t }: { t: NonNullable<typeof tasks>[number] }) => (
    <li className="note__line">
      <button
        type="button"
        className={`note__tick ${t.done ? "is-done" : ""}`}
        aria-label={t.done ? `Not done: ${t.title}` : `Done: ${t.title}`}
        onClick={() => void update({ taskId: t._id, patch: { done: !t.done } })}
      >
        {t.done && <Icon name="check" size={12} />}
      </button>
      <span className={t.done ? "note__text is-done" : "note__text"}>{t.title}</span>
      <button type="button" className="note__remove" aria-label={`Remove: ${t.title}`} onClick={() => void remove({ taskId: t._id })}>
        <Icon name="close" size={12} />
      </button>
    </li>
  );
  return (
    <section
      ref={noteRef}
      aria-labelledby="note-h"
      className={`note ${dragging ? "is-dragging" : ""}`}
      data-tour="notes"
      style={offset.x || offset.y ? { translate: `${offset.x}px ${offset.y}px` } : undefined}
    >
      <button type="button" className="note__tape" aria-label="Move the note (drag it anywhere)" title="Drag to move the note" {...handle} />
      {(offset.x !== 0 || offset.y !== 0) && (
        <button type="button" className="note__back" onClick={putBack}>Put it back</button>
      )}
      <h2 id="note-h" className="text-[0.98rem] font-medium">Notes to self</h2>
      <p className="text-xs">Anything you don't want to forget.</p>
      <form
        className="mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          const title = text.trim();
          if (!title) return;
          void add({ eventId, title }).then(() => setText(""));
        }}
      >
        <label htmlFor="note-add" className="sr-only">Jot something down</label>
        <input id="note-add" className="note__input" placeholder="Jot something down" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
      </form>
      {open.length > 0 && (
        <ul className="mt-1 grid">
          {open.map((t) => <Line key={t._id} t={t} />)}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-1">
          <button type="button" className="note__done" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            Done ({done.length}) · {showDone ? "hide" : "show"}
          </button>
          {showDone && <ul className="mt-1 grid">{done.map((t) => <Line key={t._id} t={t} />)}</ul>}
        </div>
      )}
    </section>
  );
}

/**
 * Something the host can drag around by a handle on a wide screen, kept where they left it
 * in this browser (a per-viewer convenience: storage may be missing, so it falls back to its
 * place). On a phone or tablet it stays put in the column.
 */
function useMovable(key: string) {
  const read = (): { x: number; y: number } => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "null") as { x?: number; y?: number } | null;
      return v && typeof v.x === "number" && typeof v.y === "number" ? { x: v.x, y: v.y } : { x: 0, y: 0 };
    } catch {
      return { x: 0, y: 0 };
    }
  };
  const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const [offset, setOffset] = useState(() => (wide() ? read() : { x: 0, y: 0 }));
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const ref = useRef<HTMLElement | null>(null);
  // Never under the top bar or off the page's sides: an offset that would put it there is pulled back in.
  const contain = (v: { x: number; y: number }) => {
    const el = ref.current;
    if (!el) return v;
    const r = el.getBoundingClientRect();
    const naturalTop = r.top + window.scrollY - v.y;
    const naturalLeft = r.left - v.x;
    const bar = document.querySelector("header")?.getBoundingClientRect().height ?? 64;
    const minY = bar + 12 - naturalTop;
    const minX = 8 - naturalLeft;
    const maxX = document.documentElement.clientWidth - 8 - r.width - naturalLeft;
    return { x: Math.round(Math.min(Math.max(v.x, minX), Math.max(minX, maxX))), y: Math.round(Math.max(v.y, minY)) };
  };
  // A position saved before this rule (or on a wider screen) is brought back into view once.
  useLayoutEffect(() => {
    if (offset.x === 0 && offset.y === 0) return;
    const fixed = contain(offset);
    if (fixed.x !== offset.x || fixed.y !== offset.y) {
      setOffset(fixed);
      save(fixed);
    }
    // Once, on arrival; dragging handles the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = (v: { x: number; y: number }) => {
    try {
      if (v.x === 0 && v.y === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* kept for this visit only */
    }
  };
  const handle = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!wide()) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { px: e.clientX, py: e.clientY, x: offset.x, y: offset.y };
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const s = start.current;
      if (!s) return;
      setOffset({ x: Math.round(s.x + e.clientX - s.px), y: Math.round(s.y + e.clientY - s.py) });
    },
    onPointerUp: () => {
      if (!start.current) return;
      start.current = null;
      setDragging(false);
      setOffset((v) => {
        const kept = contain(v);
        save(kept);
        return kept;
      });
    },
  };
  const putBack = () => {
    setOffset({ x: 0, y: 0 });
    save({ x: 0, y: 0 });
  };
  return { offset, dragging, handle, putBack, ref };
}
