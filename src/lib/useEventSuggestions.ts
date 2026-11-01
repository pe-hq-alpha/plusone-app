import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { suggestionsFor } from "./suggestions";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;

/** This event's own suggestions (lib/suggestions), from its needs, parts, guests and money. */
export function useEventSuggestions(eventId: Id<"events">): string[] {
  const { event, sessions, stats } = useOutletContext<EventData>();
  const slots = useQuery(api.slots.list, { eventId });
  return useMemo(
    () =>
      suggestionsFor({
        needs: (slots ?? []).map((r) => ({ title: r.slot.title, status: r.slot.status, quoted: r.bestQuote !== null })),
        parts: sessions.map((p) => ({ name: p.name, guestCount: p.guestCount, startTime: p.startTime })),
        guests: {
          pending: stats.guestCounts?.pending ?? 0,
          yes: stats.guestCounts?.yes ?? 0,
          total: (stats.guestCounts?.pending ?? 0) + (stats.guestCounts?.yes ?? 0) + (stats.guestCounts?.no ?? 0) + (stats.guestCounts?.maybe ?? 0),
        },
        committed: stats.committedTotal,
        totalBudget: event.totalBudget,
      }),
    [slots, sessions, stats, event.totalBudget],
  );
}
