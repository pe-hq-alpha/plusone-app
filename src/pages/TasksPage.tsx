import { useQuery } from "convex/react";
import { Link, useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { shortDate } from "../lib/format";
import { Checklist } from "./CeremonyPage";
import { byDayThenOrder } from "../../convex/lib/sessionOrder";
import { partWord } from "../../convex/lib/occasion";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;

/** Every to-do on the event: anything general first, then each session's list, in the order they happen. */
export function TasksPage() {
  const { event, role, sessions } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const canEdit = role !== "viewer";
  const tasks = useQuery(api.tasks.list, { eventId });
  const ordered = [...sessions].sort(byDayThenOrder);
  const open = tasks?.filter((t) => !t.done).length ?? 0;
  return (
    <div>
      <h1 className="text-[2.2rem] leading-tight">To-dos</h1>
      <p className="mt-1 text-sm text-muted">
        {tasks ? `${open} still to do across the event.` : "Loading…"} Tick them off here or on each {partWord(event)}'s page.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-tour="todos">
        <Checklist eventId={eventId} tasks={tasks?.filter((t) => !t.sessionId)} canEdit={canEdit} title="Across the event" />
        {ordered.map((e) => (
          <div key={e._id} className="grid content-start gap-1">
            <Link to={`../sessions/${e._id}`} relative="path" className="px-1 text-xs font-semibold uppercase tracking-[0.1em] text-quiet hover:text-accent">
              Day {e.dayIndex + 1} · {shortDate(e.date)}
            </Link>
            <Checklist eventId={eventId} sessionId={e._id} tasks={tasks?.filter((t) => t.sessionId === e._id)} canEdit={canEdit} title={e.name} />
          </div>
        ))}
      </div>
    </div>
  );
}
