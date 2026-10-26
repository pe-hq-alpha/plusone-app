import { useQuery } from "convex/react";
import { useOutletContext, useParams } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Board } from "../components/board/Board";
import { byDayThenOrder } from "../../convex/lib/sessionOrder";
import { partWord } from "../../convex/lib/occasion";
import "../styles/board.css";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;

/**
 * Spaces: one open board for the whole event, with a zone for each part of it. Opening
 * a part's Space (from its own page) starts the board on that part's zone.
 */
export function SpacesPage() {
  const { event, role, sessions } = useOutletContext<EventData>();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const items = useQuery(api.spaces.list, { eventId: event._id as Id<"events"> });
  const parts = [...sessions].sort(byDayThenOrder);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-[1.7rem] leading-tight">Spaces</h1>
        <p className="text-sm text-muted">
          Each {partWord(event)} has its own zone; anything outside them is for the whole event. Drag to move around, pinch or Ctrl-scroll to zoom.
        </p>
      </div>
      {items === undefined ? (
        <p className="py-16 text-center text-sm text-muted">Opening the board…</p>
      ) : (
        <Board event={event} sessions={parts} items={items} canEdit={role !== "viewer"} focus={sessionId} />
      )}
    </div>
  );
}
