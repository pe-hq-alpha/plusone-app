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
      budget: s.budget,
    })),
    budget: showMoney && budget ? { total: budget.totalBudget, committed: budget.committedTotal, paid: budget.paidTotal } : null,
    dues: (dues ?? []).filter((d) => !d.doneAt),
    guests: {
      invited: guests?.length ?? 0,
      coming: (guests ?? []).filter((g) => g.rsvp === "yes").reduce((a, g) => a + (g.attendingCount || g.partySize), 0),
    },
    diets: (guests ?? []).map((g) => g.dietary).filter((d): d is string => Boolean(d)),
    allergies: (guests ?? []).flatMap((g) => g.allergies ?? []),
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
