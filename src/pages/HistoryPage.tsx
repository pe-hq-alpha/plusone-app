import { usePaginatedQuery } from "convex/react";
import { useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;

const dayOf = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeOf = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Everything that has happened on the event, by whom and when, newest first. */
export function HistoryPage() {
  const { event } = useOutletContext<EventData>();
  const { results, status, loadMore } = usePaginatedQuery(api.activity.page, { eventId: event._id as Id<"events"> }, { initialNumItems: 40 });
  const days: { day: string; rows: typeof results }[] = [];
  for (const r of results) {
    const day = dayOf(r._creationTime);
    if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
    days.at(-1)!.rows.push(r);
  }
  return (
    <div className="max-w-[48rem]">
      <h1 className="text-[2.2rem] leading-tight">History</h1>
      <p className="mt-1 text-sm text-muted">Who changed what, and when. Nothing here can be edited.</p>
      {status === "LoadingFirstPage" ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-6 grid gap-6">
          {days.map((d) => (
            <section key={d.day} aria-label={d.day}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-quiet">{d.day}</h2>
              <ol className="card mt-2 divide-y divide-line">
                {d.rows.map((r) => (
                  <li key={r._id} className="flex items-baseline gap-4 px-5 py-3 text-sm">
                    <span className="w-16 shrink-0 tabular-nums text-quiet">{timeOf(r._creationTime)}</span>
                    <span className="min-w-0">
                      <span className="font-medium text-ink">{r.actorLabel}</span> {r.text}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {status === "CanLoadMore" && (
            <button type="button" className="btn-quiet justify-self-start" onClick={() => loadMore(60)}>Show earlier</button>
          )}
        </div>
      )}
    </div>
  );
}
