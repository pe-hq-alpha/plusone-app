import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { longDate, money, shortDate } from "../lib/format";
import { dayHeading, groupByDay, timeChip } from "../lib/dayByPart";

type Shared = NonNullable<FunctionReturnType<typeof api.shareLinks.view>>;

/** The plan as one sheet: what a read-only link shows, plus contacts and food needs when printing. */
export type PlanSheetData = Omit<Shared, "vendors"> & {
  vendors: (Shared["vendors"][number] & { contact?: string })[];
  diets?: string[];
  allergies?: string[];
};

/**
 * The plan on one page, shared by the printable summary and the read-only link, so a
 * parent sees exactly what the hosts would print.
 */
export function PlanSheet({ plan, footer }: { plan: PlanSheetData; footer: string }) {
  const cur = plan.currency;
  const days = groupByDay(plan.days);

  return (
    <article className="print-sheet grid gap-7">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-quiet">The event plan</p>
        <h1 className="mt-1 text-[2.2rem] leading-tight">{plan.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {longDate(plan.startDate)}
          {plan.endDate !== plan.startDate ? ` to ${longDate(plan.endDate)}` : ""} · {plan.city}
          {plan.area ? `, ${plan.area}` : ""}
        </p>
        {plan.styleSummary && <p className="mt-3 text-sm italic leading-relaxed text-muted">“{plan.styleSummary}”</p>}
      </header>

      <section>
        <h2 className="display border-b border-line pb-1.5 text-xl">The {days.length > 1 ? "days" : "day"}, part by part</h2>
        {days.map((day) => (
          <div key={day.date} className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-quiet">{dayHeading(day.date)}</h3>
            <ol className="mt-2 grid gap-4 border-l border-line pl-4">
              {day.parts.map((c) => {
                const colors = c.palette ?? [];
                return (
                  <li key={c._id} className="break-inside-avoid">
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="display text-lg">{c.name}</span>
                      {c.startTime && <span className="text-sm text-muted">{timeChip(c.startTime, c.endTime)}</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {[c.location, `About ${c.guestCount} people`, plan.showMoney && c.budget !== undefined ? `${money(c.budget, cur)} set aside` : null].filter(Boolean).join(" · ")}
                    </p>
                    {colors.length > 0 && (
                      <p className="mt-1.5 inline-flex gap-1" aria-label={`Colours: ${colors.map((x) => x.name).join(", ")}`}>
                        {colors.slice(0, 6).map((x, i) => <span key={i} title={x.name} className="inline-block h-3 w-3 rounded-full ring-1 ring-line" style={{ background: x.hex }} />)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>

      <section>
        <h2 className="display border-b border-line pb-1.5 text-xl">Vendors</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {plan.vendors.map((s) => (
              <tr key={s._id} className="break-inside-avoid border-b border-line/60 align-top">
                <td className="py-1.5 pr-3">{s.title}</td>
                <td className="py-1.5 pr-3">
                  {s.bookedName ? (
                    <>
                      <span className="font-medium">{s.bookedName}</span>
                      {s.contact && <span className="block text-xs text-muted">{s.contact}</span>}
                    </>
                  ) : (
                    <span className="text-quiet">{s.status === "research" ? "Not chosen yet" : s.status}</span>
                  )}
                </td>
                {plan.showMoney && <td className="py-1.5 text-right tabular-nums">{s.budget !== undefined ? money(s.budget, cur) : ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {plan.budget && (
        <section className="break-inside-avoid">
          <h2 className="display border-b border-line pb-1.5 text-xl">Budget</h2>
          <p className="mt-2 text-sm">
            {money(plan.budget.total, cur)} in all · {money(plan.budget.committed, cur)} committed · {money(plan.budget.paid, cur)} paid ·{" "}
            {money(plan.budget.total - plan.budget.committed, cur)} left
          </p>
        </section>
      )}

      {plan.dues.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="display border-b border-line pb-1.5 text-xl">What's due</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {plan.dues.map((d) => (
              <li key={d._id} className="flex justify-between gap-3">
                <span>{shortDate(d.dueDate)} · {d.label}{d.vendorName ? ` (${d.vendorName})` : ""}</span>
                {plan.showMoney && d.amount !== undefined && <span className="tabular-nums">{money(d.amount, cur)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.guests.invited > 0 && (
        <section className="break-inside-avoid">
          <h2 className="display border-b border-line pb-1.5 text-xl">Who's coming</h2>
          <p className="mt-2 text-sm">{plan.guests.invited} invited · {plan.guests.coming} coming so far</p>
          {plan.diets && plan.diets.length > 0 && <p className="mt-1 text-sm">Food preferences: {plan.diets.join("; ")}</p>}
          {plan.allergies && plan.allergies.length > 0 && <p className="mt-1 text-sm">Allergies: {plan.allergies.join("; ")}</p>}
        </section>
      )}

      <p className="text-xs text-quiet">{footer}</p>
    </article>
  );
}
