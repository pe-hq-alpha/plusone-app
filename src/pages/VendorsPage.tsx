import { anOccasion } from "../../convex/lib/occasion";
import { defaultSearchText, partOfNeed } from "../../convex/lib/searchTerms";
import { missingCharges, sheetFor } from "../../convex/lib/standardSheet";
import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { flattenSlots, money, statusLabel, timeAgo, type FlatSlot } from "../lib/format";
import { BookButton } from "../components/BookButton";
import { SUGGESTED_CATEGORIES } from "../../convex/lib/templates";
import { Icon } from "../components/ui/Icon";
import { RenameTitle } from "../components/ui/RenameTitle";
import { VendorCard } from "../components/VendorCard";
import { ConfirmOutreach } from "../components/ConfirmOutreach";
import { BRAND } from "../lib/brand";
import { vendorHello } from "../lib/contact";
import { callText, toWav16k } from "../lib/audio";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;

export function VendorsPage() {
  const { event, role, sessions } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const { slotId } = useParams<{ slotId: string }>();
  const navigate = useNavigate();
  const slots = flattenSlots(useQuery(api.slots.list, { eventId }));
  const canEdit = role !== "viewer";

  useEffect(() => {
    if (!slotId && slots && slots.length > 0) navigate(`/e/${eventId}/vendors/${slots[0]._id}`, { replace: true });
  }, [slotId, slots, navigate, eventId]);

  const slot = slots?.find((s) => s._id === slotId);
  // Where the tour stops: a need with vendors found but nobody contacted yet.
  const explore = slots?.find((s) => s.status === "research" && s.vendorsCount >= 3) ?? slots?.[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside>
        <h1 className="text-2xl">Vendors</h1>
        <p className="text-xs text-muted">One slot per thing you need to book.</p>
        {canEdit && slots && <ResearchAll eventId={eventId} waiting={slots.filter((s) => s.status === "research").length} />}
        <ul className="mt-3 space-y-1">
          {(slots ?? []).map((s) => (
            <li key={s._id}>
              <Link
                data-tour={s._id === explore?._id ? "slot-to-explore" : undefined}
                to={`/e/${eventId}/vendors/${s._id}`}
                aria-current={s._id === slotId ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${s._id === slotId ? "bg-accent-soft text-accent" : "hover:bg-sand"}`}
              >
                <span className="truncate">{s.title}</span>
                <span className="ml-2 text-[11px] text-muted">{statusLabel(s.status)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {canEdit && <AddSlot eventId={eventId} sessions={sessions} currency={event.currency} />}
      </aside>

      <section className="min-w-0">
        {!slot ? (
          <p className="text-muted">Pick a slot to start.</p>
        ) : (
          <SlotPanel key={slot._id} slot={slot} event={event} sessions={sessions} canEdit={canEdit} />
        )}
      </section>
    </div>
  );
}

/** One click to research every need nobody has looked into yet. */
function ResearchAll({ eventId, waiting }: { eventId: Id<"events">; waiting: number }) {
  const startAll = useMutation(api.research.startAll);
  const [state, setState] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
  if (waiting === 0 && !state.note) return null;
  return (
    <div className="mt-3 rounded-[14px] bg-accent-soft/60 p-3">
      {state.note ? (
        <p className="text-xs leading-relaxed text-accent">{state.note}</p>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted">
            {waiting === 1 ? "One need hasn't" : `${waiting} needs haven't`} been looked into yet.
          </p>
          <button
            type="button"
            className="btn-primary btn-sm mt-2 w-full"
            disabled={state.busy}
            onClick={() => {
              setState({ busy: true, note: null });
              void startAll({ eventId })
                .then(({ started }) =>
                  setState({
                    busy: false,
                    note:
                      started === 0
                        ? "Everything is already being researched."
                        : `On it. ${BRAND.name} is researching ${started} ${started === 1 ? "need" : "needs"}, one every 20 seconds or so. Each fills in as it finishes.`,
                  }),
                )
                .catch((e: unknown) => setState({ busy: false, note: e instanceof Error ? e.message : "That didn't start. Try again." }));
            }}
          >
            <Icon name="search" size={15} /> {state.busy ? "Starting…" : "Find vendors for everything"}
          </button>
        </>
      )}
    </div>
  );
}

type Slot = FlatSlot;

function SlotPanel({
  slot,
  event,
  sessions,
  canEdit,
}: {
  slot: Slot;
  event: EventData["event"];
  sessions: EventData["sessions"];
  canEdit: boolean;
}) {
  const vendors = useQuery(api.vendors.listBySlot, { slotId: slot._id });
  const run = useQuery(api.research.latestForSlot, { slotId: slot._id });
  const drafts = useQuery(api.outreach.listDrafts, { slotId: slot._id })?.map((d) => ({ ...d.message, vendor: d.vendor }));
  const quotes = useQuery(api.quotes.compareForSlot, { slotId: slot._id })?.map((q) => ({ ...q.quote, vendorName: q.vendor.name, isBooked: q.isBooked }));
  // What each quote leaves unsaid, against the need's standard sheet and the other quotes.
  const sheet = sheetFor(slot.category);
  const gapsFor = (q: NonNullable<typeof quotes>[number]) =>
    sheet && quotes ? missingCharges(q, sheet, quotes.filter((o) => o._id !== q._id)).map((m) => m.message) : [];
  const startResearch = useMutation(api.research.start);
  const toggleShortlist = useMutation(api.vendors.toggleShortlist);
  const setEmail = useMutation(api.vendors.setEmail);
  const addManual = useMutation(api.vendors.addManual);
  const draft = useMutation(api.outreach.draft);
  const markBooked = useMutation(api.slots.markBooked);
  const renameSlot = useMutation(api.slots.update);

  // Starts from the host's feel for the day and a budget as people say it ("under ₹8 lakh"),
  // never the exact figure. The server's "find them all" searches the same words.
  const defaultQuery = defaultSearchText({
    category: slot.category,
    title: slot.title,
    area: event.area,
    city: event.city,
    occasion: anOccasion(event),
    part: partOfNeed(slot.sessionIds, sessions),
    vibes: event.styleVibes,
    amount: slot.budget,
    currency: event.currency,
  });
  const [query, setQuery] = useState(defaultQuery);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [manual, setManual] = useState({ name: "", email: "", website: "" });
  const [error, setError] = useState<string | null>(null);

  // The busiest day this need has to cover: what a per-head price must be multiplied by.
  const guestCount = Math.max(0, ...sessions.filter((e) => slot.sessionIds.includes(e._id)).map((e) => e.guestCount));

  const researching = run?.status === "running";
  const selectable = useMemo(() => (vendors ?? []).filter((v) => !!v.email), [vendors]);
  // `listBySlot` already returns top picks first, then by score. The split here is
  // only about how they are shown: the three PlusOne would choose, then the rest.
  const [onlyShortlisted, setOnlyShortlisted] = useState(false);
  const shortlistedCount = (vendors ?? []).filter((v) => v.shortlisted).length;
  // Filters: price against this need's budget, city, whether a
  // venue holds the guests, rating, and the order to show them in.
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const cities = useMemo(() => [...new Set((vendors ?? []).map((v) => v.city?.split(",")[0].trim()).filter((c): c is string => Boolean(c)))].sort(), [vendors]);
  const inView = useMemo(
    () => sortVendors(
      (vendors ?? []).filter((v) => (!onlyShortlisted || v.shortlisted) && passes(v, filters, slot.budget, guestCount)),
      filters.sort,
      guestCount,
    ),
    [vendors, onlyShortlisted, filters, slot.budget, guestCount],
  );
  const filtering = filters.price !== "any" || filters.city !== "" || filters.fits || filters.rating > 0;
  const topPicks = useMemo(() => inView.filter((v) => v.isTopPick), [inView]);
  const others = useMemo(() => inView.filter((v) => !v.isTopPick), [inView]);
  const topPickable = useMemo(() => topPicks.filter((v) => !!v.email), [topPicks]);
  const ranked = (vendors ?? []).some((v) => v.score !== undefined);

  function toggleSelected(vendorId: string, next: boolean) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (next) s.add(vendorId);
      else s.delete(vendorId);
      return s;
    });
  }

  async function requestQuotes() {
    setError(null);
    setDrafting(true);
    try {
      await draft({ slotId: slot._id, vendorIds: Array.from(selected) as Id<"vendors">[] });
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft emails.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <RenameTitle
            as="h2"
            className="text-2xl"
            value={slot.title}
            canEdit={canEdit}
            onSave={async (title) => {
              await renameSlot({ slotId: slot._id, patch: { title } });
            }}
          />
          <p className="text-sm text-muted">
            {slot.category} · planned {money(slot.budget, event.currency)} · <span className="capitalize">{statusLabel(slot.status)}</span>
            {slot.bookedVendor ? ` · booked ${slot.bookedVendor.name}` : ""}
          </p>
        </div>
        {canEdit && <RemoveSlot slot={slot} eventId={event._id as Id<"events">} />}
      </header>

      <SessionsForSlot slot={slot} sessions={sessions} canEdit={canEdit} />

      {canEdit && (
        <section className="card p-5" data-tour="vendor-research">
          <label htmlFor="q" className="label">Research the open web</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="q" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${slot.category} in ${event.city}`} />
            <button className="btn-primary shrink-0" disabled={researching || !query.trim()} onClick={() => void startResearch({ slotId: slot._id, query: query.trim() })}>
              {researching ? "Researching…" : "Research"}
            </button>
          </div>
          {run && (
            <p className="mt-2 text-xs text-muted" aria-live="polite">
              {run.status === "running" && <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />}
              {run.step}
              {run.status === "failed" && run.error ? ` — ${run.error}` : ""}
              {run.status === "done" ? ` · ${run.foundCount} vendors · ${timeAgo(run.finishedAt)}` : ""}
              {run.queries && run.queries.length > 0 && (
                <span className="mt-1 block text-quiet">
                  Searches: {run.queries.join(" · ")}
                </span>
              )}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted">{BRAND.name} reads each vendor's own website. Every price links back to the page it came from.</p>
          {(event.styleVibes?.length || event.stylePalette || event.styleSummary) && (
            <p className="mt-1.5 text-[11px] text-muted">
              <span className="text-accent">Matching your style:</span>{" "}
              {[
                (event.styleVibes ?? []).join(", "),
                event.stylePalette,
                event.styleFormality,
                event.styleSummary ? "the inspiration you shared" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </section>
      )}

      {slot.status !== "booked" && <AskVerified eventId={event._id} slotId={slot._id} canEdit={canEdit} />}

      <section aria-labelledby="found-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="found-h" className="text-lg">
              Vendors {vendors ? `(${vendors.length})` : ""}
              {shortlistedCount > 0 && (
                <button
                  type="button"
                  aria-pressed={onlyShortlisted}
                  onClick={() => setOnlyShortlisted((v) => !v)}
                  title={onlyShortlisted ? "Show everyone again" : "Show only the ones you've hearted"}
                  className={`ml-3 rounded-full px-3 py-1 text-xs align-middle transition ${
                    onlyShortlisted ? "bg-accent text-paper" : "bg-cream text-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-accent"
                  }`}
                >
                  ♥ {shortlistedCount} shortlisted
                </button>
              )}
            </h3>
            {ranked && (
              <p className="text-xs text-quiet">
                Ranked on what reviewers say, price against your {money(slot.budget, event.currency)} budget, and fit.
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">{selected.size} selected</span>
              <button className="btn-primary btn-sm" disabled={selected.size === 0 || drafting} onClick={() => void requestQuotes()}>
                {drafting ? "Drafting…" : "Request quotes"}
              </button>
            </div>
          )}
        </div>
        {vendors === undefined ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : vendors.length === 0 ? (
          <div className="card mt-3 p-6 text-sm text-muted">
            {researching ? "Reading vendor websites… cards appear as each one is read." : "No vendors yet. Run a search above, or add one you already know below."}
          </div>
        ) : inView.length === 0 && filtering ? (
          <>
            <VendorFilters filters={filters} setFilters={setFilters} cities={cities} guestCount={guestCount} venue={/venue/i.test(slot.category + slot.title)} shown={0} total={vendors.length} />
            <div className="card mt-3 p-6 text-sm text-muted">
              None of these match.{" "}
              <button type="button" className="text-accent underline underline-offset-2" onClick={() => setFilters(NO_FILTERS)}>Clear the filters</button>
            </div>
          </>
        ) : inView.length === 0 ? (
          <div className="card mt-3 p-6 text-sm text-muted">
            None of these are shortlisted yet. Tap the heart on a vendor to keep it here, or{" "}
            <button type="button" className="text-accent underline underline-offset-2" onClick={() => setOnlyShortlisted(false)}>
              show everyone again
            </button>
            .
          </div>
        ) : (
          <>
            {vendors.length >= 3 && (
              <VendorFilters filters={filters} setFilters={setFilters} cities={cities} guestCount={guestCount} venue={/venue/i.test(slot.category + slot.title)} shown={inView.length} total={vendors.length} />
            )}
            {topPicks.length > 0 && (
              <div className="mt-4 rounded-[20px] bg-accent-soft/55 p-4 md:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div>
                    <h4 className="display text-[1.15rem]">
                      {topPicks.length === 1 ? "The best match" : `The top ${topPicks.length === 2 ? "two" : "three"}`}
                    </h4>
                    <p className="text-xs text-muted">{BRAND.name}&rsquo;s estimate, ranked on their reviews, their price against your budget, and how well they fit. Check before you choose.</p>
                  </div>
                  {canEdit && topPickable.length > 0 && (
                    <button
                      className="text-xs text-accent underline underline-offset-2"
                      onClick={() => setSelected(new Set(topPickable.map((v) => v._id)))}
                    >
                      {topPickable.length === 1 ? "Select this one for quotes" : `Select these ${topPickable.length} for quotes`}
                    </button>
                  )}
                </div>
                <ul className="mt-3 grid items-stretch gap-4 md:grid-cols-2">
                  {topPicks.map((v, i) => (
                    <VendorCard
                      key={v._id}
                      vendor={v}
                      rank={i + 1}
                      slotBudget={slot.budget}
                      currency={event.currency}
                      guestCount={guestCount}
                      fallbackCity={event.city}
                      canEdit={canEdit}
                      selected={selected.has(v._id)}
                      onToggleSelected={(next) => toggleSelected(v._id, next)}
                      onToggleShortlist={() => void toggleShortlist({ vendorId: v._id })}
                      onSetEmail={(email) => void setEmail({ vendorId: v._id, email })}
                      hello={vendorHello(v.name, { name: event.name, city: event.city }, slot.title)}
                      sample={event.demo === true}
                    />
                  ))}
                </ul>
              </div>
            )}

            {others.length > 0 && (
              <>
                <h4 className="mt-7 display text-[1.15rem]">
                  {topPicks.length > 0 ? `Also found (${others.length})` : `Found (${others.length})`}
                </h4>
                <ul className="mt-3 grid items-stretch gap-4 md:grid-cols-2">
                  {others.map((v) => (
                    <VendorCard
                      key={v._id}
                      vendor={v}
                      slotBudget={slot.budget}
                      currency={event.currency}
                      guestCount={guestCount}
                      fallbackCity={event.city}
                      canEdit={canEdit}
                      selected={selected.has(v._id)}
                      onToggleSelected={(next) => toggleSelected(v._id, next)}
                      onToggleShortlist={() => void toggleShortlist({ vendorId: v._id })}
                      onSetEmail={(email) => void setEmail({ vendorId: v._id, email })}
                      hello={vendorHello(v.name, { name: event.name, city: event.city }, slot.title)}
                      sample={event.demo === true}
                    />
                  ))}
                </ul>
              </>
            )}

            {canEdit && slot.status !== "booked" && (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
                <button
                  type="button"
                  className="btn-quiet btn-sm"
                  disabled={researching}
                  onClick={() => void startResearch({ slotId: slot._id, query: (run?.query ?? query).trim() || defaultQuery, more: true })}
                >
                  <Icon name="search" size={15} /> {researching ? "Looking…" : "Find more options"}
                </button>
                <p className="text-xs text-quiet">
                  {vendors.length} found so far. {BRAND.name} searches again and skips everyone already here.
                </p>
              </div>
            )}
          </>
        )}
        {canEdit && selectable.length > 0 && selected.size === 0 && (
          <button className="mt-3 text-xs text-muted underline" onClick={() => setSelected(new Set(selectable.map((v) => v._id)))}>
            {selectable.length === 1 ? "Select the one with an email" : `Select all ${selectable.length} with an email`}
          </button>
        )}
      </section>

      {canEdit && drafts && drafts.length > 0 && (
        <ConfirmOutreach
          slotId={slot._id}
          drafts={drafts}
          editable={event.sendMode === "review"}
          onSent={(queued) => setSentCount(queued)}
        />
      )}

      {sentCount !== null && (
        <section className="card flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-5" aria-live="polite">
          <Icon name="send" size={18} className="text-accent" />
          <p className="text-sm">
            <span className="font-medium">
              {sentCount} {sentCount === 1 ? "email is" : "emails are"} on the way.
            </span>{" "}
            <span className="text-muted">
              {BRAND.name} chases anyone who goes quiet and turns every reply into a quote. Watch the Inbox — you do not need to do
              anything else.
            </span>
          </p>
        </section>
      )}

      {quotes && quotes.length > 0 && (
        <section aria-labelledby="quotes-h" className="card relative overflow-x-auto p-5">
          <h3 id="quotes-h" className="text-lg">Quotes side by side</h3>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-4">Vendor</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Deposit</th>
                <th className="py-2 pr-4">Includes</th>
                <th className="py-2 pr-4">Watch out</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {quotes.map((q) => (
                <tr key={q._id}>
                  <td className="py-2 pr-4 font-medium">{q.vendorName}</td>
                  <td className="py-2 pr-4">{money(q.total, q.currency)}</td>
                  <td className="py-2 pr-4">{q.deposit ? money(q.deposit, q.currency) : "—"}</td>
                  <td className="py-2 pr-4 text-xs text-muted">{q.includes.slice(0, 3).join(", ") || "—"}</td>
                  <td className="py-2 pr-4 text-xs text-warn">{[...q.redFlags.slice(0, 2), ...gapsFor(q).slice(0, 3)].join("; ") || "—"}</td>
                  <td className="py-2 text-right">
                    {canEdit && slot.status !== "booked" && (
                      <BookButton vendorName={q.vendorName} className="btn-ghost btn-sm" onBook={(notify) => markBooked({ slotId: slot._id, vendorId: q.vendorId, notify })} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {canEdit && slot.status !== "booked" && vendors && vendors.length > 0 && (
        <SharedQuote eventId={event._id} vendors={vendors.map((v) => ({ _id: v._id, name: v.name }))} demo={event.demo === true} />
      )}

      {canEdit && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-medium">Add a vendor you already know</summary>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!manual.name.trim()) return;
              void addManual({ eventId: event._id, slotId: slot._id, name: manual.name.trim(), email: manual.email.trim() || undefined, website: manual.website.trim() || undefined }).then(() =>
                setManual({ name: "", email: "", website: "" }),
              );
            }}
          >
            <input className="input" placeholder="Name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} aria-label="Vendor name" />
            <input className="input" type="email" placeholder="Email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} aria-label="Vendor email" />
            <input className="input" type="url" placeholder="Website" value={manual.website} onChange={(e) => setManual({ ...manual, website: e.target.value })} aria-label="Vendor website" />
            <button className="btn-ghost">Add</button>
          </form>
        </details>
      )}

      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}

/**
 * A quote that came outside the inbox: a WhatsApp photo, a screenshot, a PDF or a pasted
 * message. It is read like an emailed reply, into the same lines, and lands in Compare.
 */
function SharedQuote({ eventId, vendors, demo }: { eventId: Id<"events">; vendors: Array<{ _id: Id<"vendors">; name: string }>; demo: boolean }) {
  const uploadUrl = useMutation(api.sharedQuotes.generateUploadUrl);
  const add = useMutation(api.sharedQuotes.add);
  const voiceUploadUrl = useMutation(api.voiceBrief.uploadUrl);
  const hear = useAction(api.voiceBrief.transcribe);
  const [hearing, setHearing] = useState(false);
  const [vendorId, setVendorId] = useState<Id<"vendors">>(vendors[0]._id);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      let storageId: Id<"_storage"> | undefined;
      if (file) {
        const res = await fetch(await uploadUrl({ eventId }), { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!res.ok) throw new Error("That upload didn't go. Try again.");
        storageId = ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
      }
      await add({ vendorId, text: text.trim() || undefined, storageId, filename: file?.name, contentType: file?.type || undefined });
      setDone(`Reading ${vendors.find((v) => v._id === vendorId)?.name ?? "their"} quote. It lands in Compare in a few seconds.`);
      setText("");
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*ConvexError: /, "") : "That didn't go. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * A call with the vendor: the recording is heard speaker by speaker and its words put in the
   * box, for the person to check before the quote is read like any pasted message.
   */
  async function hearCall(recording: Blob) {
    setHearing(true);
    setError(null);
    setDone(null);
    try {
      const wav = await toWav16k(recording);
      const res = await fetch(await voiceUploadUrl({}), { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav as unknown as BodyInit });
      if (!res.ok) throw new Error("That recording didn't go. Try again.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const heard = await hear({ storageId, eventId, call: true });
      const name = vendors.find((v) => v._id === vendorId)?.name ?? "the vendor";
      setText(callText(name, heard.turns.length ? heard.turns : [{ text: heard.text }]));
      setDone("Here's the call, speaker by speaker. Check it, then read the quote.");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*ConvexError: /, "") : "We couldn't hear that recording. Try again.");
    } finally {
      setHearing(false);
    }
  }

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-medium">Add a quote they sent on WhatsApp, by hand or on a call</summary>
      <p className="mt-1 text-xs text-muted">A photo or screenshot of their price list, a PDF, their message pasted in, or a recording of your call with them. It&rsquo;s read into the same lines as every other quote.</p>
      <form
        className="mt-3 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <select className="input sm:w-72" value={vendorId} onChange={(e) => setVendorId(e.target.value as Id<"vendors">)} aria-label="Which vendor">
          {vendors.map((v) => (
            <option key={v._id} value={v._id}>{v.name}</option>
          ))}
        </select>
        <textarea className="input min-h-20" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste their message (optional with a photo)" aria-label="Their message" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className={`btn-quiet btn-sm cursor-pointer bg-cream ${hearing || busy ? "pointer-events-none opacity-60" : ""}`}>
            {hearing ? "Listening to the call…" : "Add a recording of your call"}
            <input
              type="file"
              className="hidden"
              accept="audio/*"
              disabled={hearing || busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void hearCall(f);
              }}
            />
          </label>
          {demo && (
            <button
              type="button"
              className="btn-quiet btn-sm"
              disabled={hearing || busy}
              onClick={() =>
                void fetch("/sample-call.mp3")
                  .then((r) => r.blob())
                  .then(hearCall)
              }
            >
              Try a sample call
            </button>
          )}
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-cream file:px-3 file:py-1.5 file:text-ink"
          aria-label="A photo or PDF of their quote"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-ghost btn-sm" disabled={busy || (!text.trim() && !file)}>{busy ? "Sending…" : "Read this quote"}</button>
          {done && <p className="text-xs text-muted">{done}</p>}
          {error && <p role="alert" className="text-xs text-bad">{error}</p>}
        </div>
      </form>
    </details>
  );
}

/**
 * Ask PlusOne Partner's verified vendors to price this need on the standard sheet, the same
 * lines every quote is read into. The family's name, contact details and budget stay private;
 * offers land in Compare beside the quotes.
 */
function AskVerified({ eventId, slotId, canEdit }: { eventId: Id<"events">; slotId: Id<"vendorSlots">; canEdit: boolean }) {
  const brief = useQuery(api.marketplace.briefs.forSlot, { eventId, slotId });
  const ask = useMutation(api.marketplace.briefs.ask);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (brief === undefined) return null;
  const open = brief?.status === "open";

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await ask({ eventId, slotId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That request didn't go. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-quiet flex flex-wrap items-center justify-between gap-3 px-5 py-4" aria-labelledby="verified-h">
      <div className="min-w-0">
        <h3 id="verified-h" className="text-sm font-medium">
          Verified vendors on {BRAND.name}
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          {open
            ? brief.offers > 0
              ? `${brief.offers} ${brief.offers === 1 ? "offer" : "offers"} so far, on the same lines as your quotes.`
              : "Asked. Their offers land in Compare, on the same lines as your quotes."
            : "Ask them to price this on the same lines as every quote. Your name, contact details and budget stay private."}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-bad">
            {error}
          </p>
        )}
      </div>
      {open ? (
        <Link to={`/e/${eventId}/decisions#need-${slotId}`} className="btn-quiet btn-sm shrink-0">
          See them in Compare
        </Link>
      ) : (
        canEdit && (
          <button type="button" className="btn-ghost btn-sm shrink-0" disabled={busy} onClick={() => void send()}>
            {busy ? "Asking…" : brief ? "Ask again" : "Ask verified vendors"}
          </button>
        )
      )}
    </section>
  );
}

function AddSlot({ eventId, sessions, currency }: { eventId: Id<"events">; sessions: EventData["sessions"]; currency: string }) {
  const add = useMutation(api.slots.add);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [budget, setBudget] = useState(1000);
  const [sessionIds, setSessionIds] = useState<string[]>(sessions.map((e) => e._id));
  const [busy, setBusy] = useState(false);
  const taken = new Set<string>();

  function submit() {
    if (!title.trim() || sessionIds.length === 0) return;
    setBusy(true);
    void add({
      eventId,
      title: title.trim(),
      category: category.trim() || title.trim(),
      sessionIds: sessionIds as Id<"sessions">[],
      budget: Number(budget) || 0,
    }).finally(() => {
      setBusy(false);
      setOpen(false);
      setTitle("");
      setCategory("");
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-quiet btn-sm mt-4 w-full" onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} /> Add a vendor need
      </button>
    );
  }

  return (
    <section className="card mt-4 p-4" aria-label="Add a vendor need">
      <p className="label">Common needs</p>
      <ul className="flex flex-wrap gap-1.5">
        {SUGGESTED_CATEGORIES.filter((c) => !taken.has(c.title)).map((c) => (
          <li key={c.title}>
            <button
              type="button"
              title={c.hint}
              onClick={() => { setTitle(c.title); setCategory(c.category); }}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                title === c.title ? "bg-accent text-paper" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"
              }`}
            >
              {c.title}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3">
        <div>
          <label className="label" htmlFor="slot-title">What do you need?</label>
          <input id="slot-title" className="input" placeholder="Dhol player" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="slot-budget">Budget ({currency})</label>
          <input id="slot-budget" className="input" type="number" min={0} step={100} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </div>
        <fieldset>
          <legend className="label">Which days?</legend>
          <div className="flex flex-wrap gap-1.5">
            {sessions.map((ev) => {
              const on = sessionIds.includes(ev._id);
              return (
                <button
                  key={ev._id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSessionIds(on ? sessionIds.filter((x) => x !== ev._id) : [...sessionIds, ev._id])}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${on ? "bg-accent text-paper" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"}`}
                >
                  {ev.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={busy || !title.trim() || sessionIds.length === 0}>
          {busy ? "Adding…" : "Add it"}
        </button>
        <button type="button" className="btn-quiet btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </section>
  );
}

/** Drop a need you no longer have. Booked needs are refused by the backend. */
function RemoveSlot({ slot, eventId }: { slot: Slot; eventId: Id<"events"> }) {
  const remove = useMutation(api.slots.remove);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!window.confirm(`Remove ${slot.title} from your plan? Its budget goes back to the rest.`)) return;
    setBusy(true);
    setError(null);
    try {
      await remove({ slotId: slot._id });
      navigate(`/e/${eventId}/vendors`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That need couldn't be removed.");
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        className="text-sm text-muted underline underline-offset-2 transition hover:text-bad"
        onClick={() => void submit()}
        disabled={busy}
      >
        Remove this need
      </button>
      {error && <p role="alert" className="mt-1 max-w-xs text-sm text-bad">{error}</p>}
    </div>
  );
}

/**
 * Which days this vendor is for. Most serve every day, but a photographer might do
 * one day only while the caterer does three, and that changes the headcount
 * PlusOne quotes and which day the money lands on.
 */
function SessionsForSlot({ slot, sessions, canEdit }: { slot: Slot; sessions: EventData["sessions"]; canEdit: boolean }) {
  const update = useMutation(api.slots.update);
  const [error, setError] = useState<string | null>(null);
  const on = new Set(slot.sessionIds as string[]);

  async function toggle(sessionId: string, next: boolean) {
    const ids = next ? [...on, sessionId] : [...on].filter((id) => id !== sessionId);
    if (ids.length === 0) {
      setError("A vendor need has to cover at least one day. Remove the need itself if you don't want it.");
      return;
    }
    setError(null);
    try {
      await update({ slotId: slot._id, patch: { sessionIds: ids as Id<"sessions">[] } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    }
  }

  return (
    <section className="card p-4 md:p-5" aria-label="Which days this vendor is for">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="label mb-0">Needed for</p>
        <p className="text-xs text-quiet">
          {canEdit ? "Tick every day this vendor is for. Quotes and headcounts follow." : `${on.size} of ${sessions.length} days`}
        </p>
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {sessions.map((e) => {
          const active = on.has(e._id);
          return (
            <li key={e._id}>
              <button
                type="button"
                disabled={!canEdit}
                aria-pressed={active}
                onClick={() => void toggle(e._id, !active)}
                className={`rounded-full px-3.5 py-1.5 text-sm transition disabled:cursor-default ${
                  active
                    ? "bg-accent text-paper"
                    : "bg-cream text-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft hover:text-accent"
                }`}
              >
                {e.name}
                <span className={`ml-2 text-xs ${active ? "opacity-80" : "text-quiet"}`}>{e.guestCount}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {canEdit && slot.sessionIds.length > 1 && slot.status !== "booked" && <SplitByDay slot={slot} count={slot.sessionIds.length} />}
      {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
    </section>
  );
}

/** Two venues, or a different florist per day: one need becomes one need per day. */
function SplitByDay({ slot, count }: { slot: Slot; count: number }) {
  const split = useMutation(api.slots.splitBySession);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return (
      <button
        type="button"
        className="mt-3 text-xs text-accent underline underline-offset-2"
        onClick={() => setAsking(true)}
      >
        Using a different {slot.category.toLowerCase()} on each day? Split this need
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-[14px] border border-line bg-cream p-3 text-sm">
      <p>
        This becomes {count} separate needs, one per day, each with its own vendors, budget and booking. The budget is
        split by headcount, and everything found so far stays with the first day.
      </p>
      {error && <p role="alert" className="mt-1 text-xs text-bad">{error}</p>}
      <div className="mt-2.5 flex justify-end gap-2">
        <button type="button" className="btn-quiet btn-sm" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void split({ slotId: slot._id })
              .then(() => setAsking(false))
              .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't split."))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Splitting…" : `Split into ${count}`}
        </button>
      </div>
    </div>
  );
}

type Filters = { price: "any" | "budget"; city: string; fits: boolean; rating: number; sort: "match" | "price" | "rating" };
const NO_FILTERS: Filters = { price: "any", city: "", fits: false, rating: 0, sort: "match" };
type ListedVendor = { startingPrice?: number; priceUnit?: string; city?: string; capacity?: string; rating?: number };

/** What a vendor would cost for this need, where their price says: a per-person rate times the guests. */
function costFor(v: ListedVendor, guestCount: number): number | undefined {
  if (v.startingPrice === undefined) return undefined;
  if (v.priceUnit === "per_person") return v.startingPrice * Math.max(1, guestCount);
  if (v.priceUnit === "total" || v.priceUnit === undefined || v.priceUnit === "per_day") return v.startingPrice;
  return undefined;
}

/** The most guests a venue's stated capacity mentions ("up to 200 seated" is 200). */
function maxGuests(capacity?: string): number | undefined {
  const n = (capacity ?? "").match(/\d[\d,]*/g)?.map((x) => Number(x.replace(/,/g, ""))).filter((x) => x > 0 && x < 100000);
  return n?.length ? Math.max(...n) : undefined;
}

function passes(v: ListedVendor, f: Filters, budget: number, guestCount: number): boolean {
  if (f.price === "budget") {
    const cost = costFor(v, guestCount);
    if (cost === undefined || cost > budget) return false;
  }
  if (f.city && !(v.city ?? "").toLowerCase().startsWith(f.city.toLowerCase())) return false;
  if (f.fits) {
    const most = maxGuests(v.capacity);
    if (most === undefined || most < guestCount) return false;
  }
  if (f.rating > 0 && (v.rating ?? 0) < f.rating) return false;
  return true;
}

function sortVendors<V extends ListedVendor>(list: V[], sort: Filters["sort"], guestCount: number): V[] {
  if (sort === "match") return list;
  const key = (v: V) => (sort === "price" ? (costFor(v, guestCount) ?? Infinity) : -(v.rating ?? 0));
  return [...list].sort((a, b) => key(a) - key(b));
}

function VendorFilters({
  filters: f,
  setFilters,
  cities,
  guestCount,
  venue,
  shown,
  total,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  cities: string[];
  guestCount: number;
  venue: boolean;
  shown: number;
  total: number;
}) {
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-xs transition ${on ? "bg-accent text-paper" : "bg-cream text-muted ring-1 ring-line hover:text-accent"}`;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter vendors" data-tour="vendor-filters">
      <button type="button" aria-pressed={f.price === "budget"} className={chip(f.price === "budget")} onClick={() => setFilters({ ...f, price: f.price === "budget" ? "any" : "budget" })}>Within budget</button>
      {venue && guestCount > 0 && (
        <button type="button" aria-pressed={f.fits} className={chip(f.fits)} onClick={() => setFilters({ ...f, fits: !f.fits })}>Fits {guestCount} people</button>
      )}
      <button type="button" aria-pressed={f.rating > 0} className={chip(f.rating > 0)} onClick={() => setFilters({ ...f, rating: f.rating > 0 ? 0 : 4.5 })}>4.5★ and up</button>
      {cities.length > 1 && (
        <select aria-label="City" className="rounded-full bg-cream px-3 py-1.5 text-xs text-muted ring-1 ring-line" value={f.city} onChange={(e) => setFilters({ ...f, city: e.target.value })}>
          <option value="">Anywhere</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <select aria-label="Order" className="rounded-full bg-cream px-3 py-1.5 text-xs text-muted ring-1 ring-line" value={f.sort} onChange={(e) => setFilters({ ...f, sort: e.target.value as Filters["sort"] })}>
        <option value="match">Best match first</option>
        <option value="price">Lowest price first</option>
        <option value="rating">Highest rated first</option>
      </select>
      {shown !== total && <span className="text-xs text-quiet">Showing {shown} of {total}</span>}
    </div>
  );
}
