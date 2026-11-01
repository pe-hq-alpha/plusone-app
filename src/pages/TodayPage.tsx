import { useMemo, useRef, useState } from "react";
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
            {money(stats.committedTotal, event.currency)} <small>committed of {money(event.totalBudget, event.currency)}</small>
          </span>
          <BudgetBar className="mt-2 h-2" spent={stats.committedTotal} budget={event.totalBudget} label="Budget committed" />
          <span className="today__stat-foot">
            {money(stats.paidTotal, event.currency)} paid · {money(Math.max(0, event.totalBudget - stats.committedTotal), event.currency)} still free
          </span>
        </Link>
        <Link to="vendors" className="today__stat">
          <span className="today__stat-label">Vendors</span>
          <span className="today__stat-big">
            {stats.slotCounts.booked} <small>of {stats.slotCounts.research + stats.slotCounts.contacted + stats.slotCounts.quoted + stats.slotCounts.booked} booked</small>
          </span>
          <span className="today__stat-foot">{stats.slotCounts.quoted} with quotes to compare</span>
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
          <Tell eventId={eventId} demo={event.demo === true} />
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

const PROMPTS = ["What should we book next?", "We're now 140 people", "Find us a photographer", "Move lunch to 1 pm"];

/** One line to tell the co-pilot anything; the conversation itself carries on in the Assistant. */
function Tell({ eventId, demo = false }: { eventId: Id<"events">; demo?: boolean }) {
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
        {PROMPTS.map((p) => (
          <li key={p}>
            <button type="button" className="today__prompt" disabled={busy} onClick={() => void send(p)}>
              {p}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * To-dos as a note beside the overview rather than a page of its own: what's still open,
 * ticked off in place, and a line to add one.
 */
function TodoNote({ eventId }: { eventId: Id<"events"> }) {
  const tasks = useQuery(api.tasks.list, { eventId });
  const add = useMutation(api.tasks.add);
  const update = useMutation(api.tasks.update);
  const [text, setText] = useState("");
  const open = (tasks ?? []).filter((t) => !t.done);
  const shown = open.slice(0, 5);
  return (
    <section aria-labelledby="todo-h" className="today__panel">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="todo-h" className="text-sm font-medium text-ink">To-dos</h2>
        {tasks && tasks.length > 0 && (
          <Link to="tasks" className="text-xs text-accent underline-offset-4 hover:underline">
            All {tasks.length}
          </Link>
        )}
      </div>
      {tasks === undefined ? null : shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing open. Add anything you don't want to forget.</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {shown.map((t) => (
            <li key={t._id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                aria-label={`Done: ${t.title}`}
                onChange={() => void update({ taskId: t._id, patch: { done: true } })}
              />
              <span>{t.title}</span>
            </li>
          ))}
          {open.length > shown.length && <li className="text-xs text-quiet">and {open.length - shown.length} more</li>}
        </ul>
      )}
      <form
        className="mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const title = text.trim();
          if (!title) return;
          void add({ eventId, title }).then(() => setText(""));
        }}
      >
        <label htmlFor="todo-add" className="sr-only">Add a to-do</label>
        <input id="todo-add" className="input" placeholder="Add a to-do" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
      </form>
    </section>
  );
}
