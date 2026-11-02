import { useState } from "react";
import { useQuery } from "convex/react";
import { useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { flattenSlots } from "../lib/format";
import { PlanSheet, type PlanSheetData } from "../components/PlanSheet";
import { ShareLinks } from "../components/ShareLinks";
import { Icon } from "../components/ui/Icon";
import { BRAND } from "../lib/brand";
import { keptPalette } from "../lib/spaces";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;

/**
 * The plan on paper: one clean page for parents or a
 * venue, printed or saved as a PDF from the browser. Money and contact details can be
 * left out before printing. Owners can also send it as a read-only link.
 */
/** The same words said by several guests, once, with a count: ["Jain", "jain ", "No onion"] → ["Jain (2)", "No onion"]. */
function tallied(items: string[]): string[] {
  const seen = new Map<string, { text: string; n: number }>();
  for (const raw of items) {
    const text = raw.trim().replace(/[.;]+$/, "");
    if (!text) continue;
    const key = text.toLowerCase();
    const row = seen.get(key) ?? { text, n: 0 };
    row.n += 1;
    seen.set(key, row);
  }
  return [...seen.values()].sort((a, b) => b.n - a.n).map(({ text, n }) => (n > 1 ? `${text} (${n})` : text));
}

export function PrintPage() {
  const { event, sessions, role } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const slots = flattenSlots(useQuery(api.slots.list, { eventId }));
  const budget = useQuery(api.budget.summary, { eventId });
  const dues = useQuery(api.dues.list, { eventId });
  const guests = useQuery(api.guests.list, { eventId });
  const [showMoney, setShowMoney] = useState(true);
  const [showContacts, setShowContacts] = useState(true);

  const plan: PlanSheetData = {
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate,
    city: event.city,
    area: event.area,
    styleSummary: event.styleSummary,
    currency: event.currency,
    showMoney,
    days: sessions.map((e) => ({
      _id: e._id,
      name: e.name,
      key: e.key,
      kind: e.kind,
      date: e.date,
      dayIndex: e.dayIndex,
      order: e.order,
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      guestCount: e.guestCount,
      budget: e.budget,
      palette: keptPalette(e)?.colors,
    })),
    vendors: (slots ?? []).map((s) => ({
      _id: s._id,
      title: s.title,
      status: s.status,
      bookedName: s.bookedVendor?.name,
      contact: showContacts ? [s.bookedVendor?.email, s.bookedVendor?.phone].filter(Boolean).join(" · ") || undefined : undefined,
      // A booked need prints what was agreed; one still open prints what's planned for it.
      budget: s.status === "booked" ? (budget?.lines.find((l) => l.slot?._id === s._id)?.line.committed ?? s.budget) : s.budget,
    })),
    budget: showMoney && budget ? { total: budget.totalBudget, committed: budget.agreedTotal, paid: budget.paidTotal } : null,
    dues: (dues ?? []).filter((d) => !d.doneAt),
    guests: {
      invited: guests?.length ?? 0,
      coming: (guests ?? []).filter((g) => g.rsvp === "yes").reduce((a, g) => a + (g.attendingCount || g.partySize), 0),
    },
    // Each need once, with how many asked for it: "No onion or garlic (2)".
    diets: tallied((guests ?? []).map((g) => g.dietary).filter((d): d is string => Boolean(d))),
    allergies: tallied((guests ?? []).flatMap((g) => g.allergies ?? [])),
  };

  return (
    <div className="mx-auto max-w-[52rem]">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-accent-soft/50 px-4 py-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-accent" checked={showMoney} onChange={(e) => setShowMoney(e.target.checked)} /> Show money</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-accent" checked={showContacts} onChange={(e) => setShowContacts(e.target.checked)} /> Show vendors' contacts</label>
        </div>
        <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>
          <Icon name="list" size={15} /> Print or save as PDF
        </button>
      </div>

      <PlanSheet plan={plan} footer={`Printed ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} from ${BRAND.name}.`} />
      {role === "owner" && <ShareLinks eventId={eventId} />}
    </div>
  );
}
