import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { money, pct, timeAgo } from "../lib/format";
import { BookButton } from "../components/BookButton";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon } from "../components/ui/Icon";
import { BRAND } from "../lib/brand";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type Board = NonNullable<FunctionReturnType<typeof api.dashboard.board>>;
type Need = Board["needs"][number];
type VendorRow = Need["vendors"][number];
type Quote = NonNullable<VendorRow["quote"]>;
type QuotedRow = VendorRow & { quote: Quote };
type Reading = Quote["readings"][number];

/** The quote's own warnings, less "GST extra" when the line-by-line gaps already say it. */
function flagsBesideGaps(q: Quote): string[] {
  return q.missing.some((m) => m.key === "gst") ? q.flags.filter((f) => !/^GST extra$/i.test(f)) : q.flags;
}

/** How each state reads on the board, and what it looks like. */
const STATE: Record<VendorRow["state"], { label: string; cls: string }> = {
  booked: { label: "Booked", cls: "chip-ok" },
  quoted: { label: "Quoted", cls: "chip-pending" },
  replied: { label: "Replied", cls: "chip-pending" },
  chased: { label: "Chased", cls: "chip-warn" },
  emailed: { label: "Waiting", cls: "chip-quiet" },
  declined: { label: "You passed", cls: "chip-quiet" },
  needs_attention: { label: "Needs you", cls: "chip-warn" },
  not_contacted: { label: "Not asked", cls: "chip-quiet" },
};

export function DecisionsPage() {
  const { event, role } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const board = useQuery(api.dashboard.board, { eventId });
  const canEdit = role !== "viewer";
  const [onlyLive, setOnlyLive] = useState(true);
  const { hash } = useLocation();
  const loaded = board !== undefined;
  // Arriving from a part's Compare (#need-…): bring that need into view once the board is in.
  useEffect(() => {
    if (loaded && hash.startsWith("#need-")) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loaded, hash]);

  if (board === undefined) {
    return (
      <>
        <PageHeader title="Decisions" meta="Everything you are waiting on, and everything you can decide." />
        <p className="text-sm text-muted">Loading the board…</p>
      </>
    );
  }

  const t = board.totals;
  // A need nobody has written to yet is noise on a decision screen.
  const shown = onlyLive ? board.needs.filter((n) => n.vendors.some((v) => v.state !== "not_contacted")) : board.needs;

  return (
    <>
      <PageHeader
        title="Decisions"
        meta="Everything you are waiting on, and everything you can decide — without opening an inbox."
        action={
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyLive} onChange={(e) => setOnlyLive(e.target.checked)} />
            Only what's in motion
          </label>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Where things stand">
        <Kpi
          label="Asked"
          value={`${t.vendorsContacted}`}
          note={`${t.needsContacted} of ${t.needs} ${t.needs === 1 ? "need" : "needs"} under way`}
        />
        <Kpi
          label="Replied"
          value={`${t.vendorsReplied}`}
          note={
            t.vendorsContacted > 0
              ? `${pct(t.vendorsReplied, t.vendorsContacted)}% of those asked${t.medianReplyHours !== null ? `, usually within ${formatHours(t.medianReplyHours)}` : ""}`
              : "nobody has been asked yet"
          }
          tone={t.vendorsReplied > 0 ? "ok" : undefined}
        />
        <Kpi
          label="Quotes in"
          value={`${t.quotesIn}`}
          note={t.awaiting > 0 ? `${t.awaiting} still to answer` : t.vendorsDeclined > 0 ? `${t.vendorsDeclined} passed` : "nothing outstanding"}
        />
        <Kpi
          label="Booked"
          value={money(t.committed, board.currency)}
          note={
            t.needsBooked > 0
              ? `${t.needsBooked} of ${t.needs} needs · ${money(t.totalBudget, board.currency)} budget`
              : t.cheapestSoFar > 0
                ? `nothing booked yet · cheapest so far would be ${money(t.cheapestSoFar, board.currency)}`
                : `nothing booked yet · ${money(t.totalBudget, board.currency)} budget`
          }
          tone={t.committed > t.totalBudget ? "bad" : undefined}
        />
      </section>

      {shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="send"
            title={onlyLive ? "Nothing in motion yet" : "No vendor needs yet"}
            body={
              onlyLive
                ? `Once ${BRAND.name} has written to a few vendors, this is where their answers land — prices, availability and all — so you can decide here.`
                : `Add what you need on the Vendors screen and ${BRAND.name} will go looking.`
            }
            action={
              <Link to="../vendors" className="btn-primary">
                Go to vendors <Icon name="arrow" size={16} />
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-7 grid gap-5">
          {shown.map((need) => (
            <NeedBoard key={need.slotId} need={need} currency={board.currency} canEdit={canEdit} eventId={eventId} />
          ))}
        </div>
      )}
    </>
  );
}

function formatHours(h: number) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes`;
  if (h < 48) return `${Math.round(h)} ${Math.round(h) === 1 ? "hour" : "hours"}`;
  return `${Math.round(h / 24)} days`;
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "ok" | "bad" }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-quiet">{label}</p>
      <p className={`display mt-1 text-[1.9rem] leading-none ${tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : ""}`}>
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{note}</p>
    </div>
  );
}

/** One need, with everyone in the running side by side. */
function NeedBoard({ need, currency, canEdit, eventId }: { need: Need; currency: string; canEdit: boolean; eventId: Id<"events"> }) {
  const markBooked = useMutation(api.slots.markBooked);
  const setStatus = useMutation(api.threads.setStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = need.vendors.filter((v) => v.state !== "not_contacted");
  const cheapest = need.cheapest;
  // Compared in the need's own unit when two or more quotes can be: the lowest total is
  // often not the best value once service, transport and headcounts are counted.
  const perUnits = live.map((v) => v.quote?.perUnit ?? null).filter((x): x is number => x !== null);
  const bestPerUnit = need.spread && perUnits.length > 1 ? Math.min(...perUnits) : null;
  const unitWord = need.basisLabel.toLowerCase().replace(/^per /, "");
  const quoted = live.filter((v): v is QuotedRow => v.quote !== null && v.state !== "declined");

  async function book(v: VendorRow, notify: boolean) {
    setBusy(v.vendorId);
    setError(null);
    try {
      await markBooked({ slotId: need.slotId as Id<"vendorSlots">, vendorId: v.vendorId as Id<"vendors">, notify });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That booking didn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function pass(v: VendorRow) {
    if (!v.threadId) return;
    setBusy(v.vendorId);
    setError(null);
    try {
      await setStatus({ threadId: v.threadId as Id<"threads">, status: "declined" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card overflow-hidden" aria-labelledby={`need-${need.slotId}`} data-tour="decision">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 border-b border-line px-6 py-4">
        <div className="min-w-0">
          <h2 id={`need-${need.slotId}`} className="display text-[1.3rem] leading-tight">
            {need.title}
          </h2>
          <p className="mt-0.5 text-xs text-quiet">
            {need.sessionNames.length > 0 ? need.sessionNames.join(" · ") : "the whole event"} · {money(need.budget, currency)} planned
          </p>
        </div>
        <p className="text-sm text-muted">
          {need.spread ? (
            <>
              {need.basisLabel}: <span className="text-ink">{money(need.spread.low, currency)}</span> – {money(need.spread.high, currency)}
              <span className="text-quiet"> · for {need.units}</span>
            </>
          ) : need.cheapest !== null ? (
            <>
              <span className="text-ink">{money(need.cheapest, currency)}</span>
              {need.dearest !== null && need.dearest !== need.cheapest && <> – {money(need.dearest, currency)}</>} quoted
            </>
          ) : (
            `${live.length} ${live.length === 1 ? "vendor" : "vendors"} asked, no prices yet`
          )}
        </p>
      </div>

      {error && <p role="alert" className="border-b border-line px-6 py-2.5 text-sm text-bad">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] text-sm">
          <caption className="sr-only">Everyone asked about {need.title}</caption>
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-quiet">
              <th scope="col" className="py-2.5 pl-6 pr-4 font-semibold">Vendor</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Where it stands</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Free on your dates</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Quote</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Includes</th>
              <th scope="col" className="py-2.5 pl-4 pr-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {live.map((v) => {
              const isCheapest = v.quote !== null && cheapest !== null && v.quote.total === cheapest && live.length > 1 && bestPerUnit === null;
              const isBestValue = v.quote !== null && bestPerUnit !== null && v.quote.perUnit === bestPerUnit;
              return (
                <tr key={v.vendorId} className={v.state === "declined" ? "opacity-55" : undefined}>
                  <th scope="row" className="py-3.5 pl-6 pr-4 text-left font-normal align-top">
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium">{v.name}</span>
                      {v.isTopPick && <span className="text-[11px] text-accent" title={`${BRAND.name}'s estimate from reviews, price and fit`}>top pick, {BRAND.name}&rsquo;s estimate</span>}
                      {v.shortlisted && <span className="text-[11px] text-accent" title="Shortlisted by you">♥ shortlisted</span>}
                    </span>
                    {v.rating !== undefined && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-quiet">
                        <Icon name="star" size={12} className="text-accent" />
                        {v.rating.toFixed(1)}
                        {v.reviewCount !== undefined && <> · {v.reviewCount.toLocaleString()} reviews</>}
                      </span>
                    )}
                  </th>

                  <td className="px-4 py-3.5 align-top">
                    <span className={STATE[v.state].cls}>
                      {v.state === "declined" && v.theyDeclined ? "They passed" : STATE[v.state].label}
                    </span>
                    <span className="mt-1 block text-xs text-quiet">
                      {v.repliedInHours !== null
                        ? `answered in ${formatHours(v.repliedInHours)}`
                        : v.followUpCount > 0
                          ? `chased ${v.followUpCount}×, last written ${timeAgo(v.lastOutboundAt)}`
                          : v.lastOutboundAt
                            ? `written ${timeAgo(v.lastOutboundAt)}`
                            : "—"}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 align-top">
                    {v.availableOnDates === "yes" ? (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <Icon name="check" size={14} /> Yes
                      </span>
                    ) : v.availableOnDates === "no" ? (
                      <span className="inline-flex items-center gap-1 text-bad">
                        <Icon name="close" size={14} /> No
                      </span>
                    ) : (
                      <span className="text-quiet">—</span>
                    )}
                    {v.availabilityNote && <span className="mt-0.5 block max-w-[16rem] text-xs text-quiet">{v.availabilityNote}</span>}
                  </td>

                  <td className="px-4 py-3.5 text-right align-top">
                    {v.quote ? (
                      <>
                        <span className={`block font-medium ${isCheapest ? "text-ok" : ""}`}>
                          {isBestValue && <span className="best-node mr-2" aria-hidden="true" />}
                          {money(v.quote.total, v.quote.currency)}
                        </span>
                        {v.quote.perUnit !== null && (
                          <span className={`block text-xs ${isBestValue ? "text-accent" : "text-muted"}`}>
                            {money(v.quote.perUnit, v.quote.currency)} per {unitWord}
                            {v.quote.atYourNumbers !== v.quote.total && <> · {money(v.quote.atYourNumbers, v.quote.currency)} for your {need.units}</>}
                          </span>
                        )}
                        {flagsBesideGaps(v.quote).length > 0 && (
                          <span className="mt-0.5 block text-xs text-warn">{flagsBesideGaps(v.quote).slice(0, 2).join(" · ")}</span>
                        )}
                        <span className="block text-xs text-quiet">
                          {v.quote.deltaVsBudget <= 0
                            ? `${money(-v.quote.deltaVsBudget, currency)} under`
                            : `${money(v.quote.deltaVsBudget, currency)} over`}
                          {v.quote.deposit !== undefined && <> · {money(v.quote.deposit, v.quote.currency)} deposit</>}
                        </span>
                        {isCheapest && <span className="mt-1 inline-block text-[11px] text-ok">cheapest</span>}
                        {isBestValue && <span className="mt-1 inline-block text-[11px] text-accent">best per {unitWord}</span>}
                      </>
                    ) : (
                      <span className="text-quiet">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3.5 align-top">
                    {v.quote && v.quote.includes.length > 0 ? (
                      <ul className="max-w-[18rem] text-xs leading-relaxed text-muted">
                        {v.quote.includes.slice(0, 3).map((inc, i) => <li key={i}>{inc}</li>)}
                      </ul>
                    ) : (
                      <span className="text-quiet">—</span>
                    )}
                    {v.quote && v.quote.excludes.length > 0 && (
                      <p className="mt-1 max-w-[18rem] text-xs text-quiet">Not included: {v.quote.excludes.slice(0, 2).join(", ")}</p>
                    )}
                    {v.quote && v.quote.redFlags.length > 0 && (
                      <p className="mt-1 max-w-[18rem] text-xs text-warn">{v.quote.redFlags.slice(0, 2).join("; ")}</p>
                    )}
                    {v.quote && v.quote.missing.length > 0 && (
                      <ul className="mt-1.5 max-w-[18rem] space-y-0.5 text-xs leading-relaxed text-warn" aria-label={`What ${v.name}'s quote leaves unsaid`}>
                        {v.quote.missing.slice(0, 3).map((m) => (
                          <li key={m.key}>{m.message}</li>
                        ))}
                        {v.quote.missing.length > 3 && <li className="text-quiet">and {v.quote.missing.length - 3} more, line by line below</li>}
                      </ul>
                    )}
                  </td>

                  <td className="py-3.5 pl-4 pr-6 align-top text-right">
                    {/* "Where it stands" already says Booked; this is how you reach them. */}
                    {v.threadId && (
                      <Link to={`/e/${eventId}/inbox/${v.threadId}`} className="btn-quiet btn-sm gap-1.5 whitespace-nowrap">
                        <Icon name="mail" size={14} />
                        Email
                      </Link>
                    )}
                    {canEdit && v.state !== "declined" && (
                      <span className="mt-1.5 inline-flex flex-col items-end gap-1.5">
                        {v.state === "booked" ? null : (
                          <BookButton
                            vendorName={v.name}
                            label={busy === v.vendorId ? "…" : "Book"}
                            disabled={busy !== null || need.status === "booked"}
                            note={v.quote ? `${money(v.quote.total, v.quote.currency)} goes onto your budget.` : undefined}
                            onBook={(notify) => book(v, notify)}
                          />
                        )}
                        {v.state !== "booked" && v.threadId && (
                          <button
                            type="button"
                            className="text-xs text-quiet underline underline-offset-2 hover:text-bad"
                            disabled={busy !== null}
                            onClick={() => void pass(v)}
                          >
                            Pass
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {need.sheet && quoted.length > 0 && <LineByLine sheet={need.sheet} quoted={quoted} unitWord={unitWord} />}
    </section>
  );
}

/**
 * Every quote for a need on the same rows: the need's standard sheet, line by line, so a
 * charge one vendor names and another leaves out shows as a gap rather than a lower total.
 */
function LineByLine({ sheet, quoted, unitWord }: { sheet: NonNullable<Need["sheet"]>; quoted: QuotedRow[]; unitWord: string }) {
  return (
    <div className="border-t border-line px-6 pb-5 pt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-quiet">Line by line</h3>
      <p className="mt-1 text-xs text-muted">The main price should cover: {sheet.covers.charAt(0).toLowerCase() + sheet.covers.slice(1)}.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: `${12 + quoted.length * 10}rem` }}>
          <caption className="sr-only">Each quote against the same lines</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-2 pr-4 font-normal">
                <span className="sr-only">Line</span>
              </th>
              {quoted.map((v) => (
                <th key={v.vendorId} scope="col" className="px-3 py-2 text-right font-medium text-ink">
                  {v.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <th scope="row" className="py-2 pr-4 text-left font-normal text-muted">Quoted total</th>
              {quoted.map((v) => (
                <td key={v.vendorId} className="px-3 py-2 text-right font-medium">
                  {money(v.quote.total, v.quote.currency)}
                  {v.quote.perUnit !== null && (
                    <span className="block text-xs font-normal text-muted">
                      {money(v.quote.perUnit, v.quote.currency)} per {unitWord}
                    </span>
                  )}
                </td>
              ))}
            </tr>
            {sheet.lines.map((line) => (
              <tr key={line.key}>
                <th scope="row" className="py-2 pr-4 text-left font-normal text-muted">{line.label}</th>
                {quoted.map((v) => (
                  <td key={v.vendorId} className="px-3 py-2 text-right">
                    <LineCell
                      reading={v.quote.readings.find((r) => r.key === line.key)}
                      flagged={v.quote.missing.some((m) => m.key === line.key)}
                      currency={v.quote.currency}
                    />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 pr-4 text-left font-normal text-muted">Gaps to ask about</th>
              {quoted.map((v) => (
                <td key={v.vendorId} className={`px-3 py-2 text-right ${v.quote.missing.length ? "text-warn" : "text-ok"}`}>
                  {v.quote.missing.length ? v.quote.missing.length : "None"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One quote's answer on one line: its price, included, extra, or not said. */
function LineCell({ reading, flagged, currency }: { reading: Reading | undefined; flagged: boolean; currency: string }) {
  if (!reading || reading.status === "unstated") {
    return <span className={flagged ? "text-warn" : "text-quiet"}>Not stated</span>;
  }
  if (reading.status === "included") {
    return (
      <span className="inline-flex items-center gap-1 text-ok">
        <Icon name="check" size={13} /> Included
      </span>
    );
  }
  if (reading.status === "priced") return <span>{money(reading.amount, currency)}</span>;
  return reading.amount !== undefined ? (
    <span className="text-muted">+{money(reading.amount, currency)} extra</span>
  ) : (
    <span className="text-warn">Extra, no price</span>
  );
}
