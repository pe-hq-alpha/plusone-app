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
          <Tell eventId={eventId} />
          <section aria-labelledby="money-h" className="today__panel">
            <h2 id="money-h" className="text-sm font-medium text-ink">Budget</h2>
            <p className="mt-2 text-sm text-muted">
              <span className="display text-2xl text-ink">{money(stats.committedTotal, event.currency)}</span> committed of{" "}
              {money(event.totalBudget, event.currency)}
            </p>
            <BudgetBar className="mt-3 h-2" spent={stats.committedTotal} budget={event.totalBudget} label="Budget committed" />
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <Link to="budget" className="text-accent underline-offset-4 hover:underline">Budget and dues</Link>
              <Link to="decisions" className="text-accent underline-offset-4 hover:underline">Compare quotes</Link>
            </div>
          </section>
          <section aria-labelledby="people-h" className="today__panel">
            <h2 id="people-h" className="text-sm font-medium text-ink">{PeopleWord(event)}</h2>
            <p className="mt-2 text-sm text-muted">
              {stats.guestCounts?.yes ?? 0} coming · {stats.guestCounts?.no ?? 0} not · {stats.guestCounts?.pending ?? 0} still to say
            </p>
            <Link to="guests" className="mt-3 inline-flex items-center gap-1 text-sm text-accent underline-offset-4 hover:underline">
              Open the list <Icon name="arrow" size={14} />
            </Link>
          </section>
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
function Tell({ eventId }: { eventId: Id<"events"> }) {
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
      await ask({ eventId, content, context: "the Today page" });
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
