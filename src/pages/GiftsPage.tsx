import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { Gift } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon } from "../components/ui/Icon";
import { money } from "../lib/format";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type GiftRow = NonNullable<FunctionReturnType<typeof api.gifts.list>>[number];
const say = (e: unknown) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't save. Try again.");

type Draft = { title: string; link: string; price: string; note: string };
const EMPTY: Draft = { title: "", link: "", price: "", note: "" };
const priceOf = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return s.trim() && Number.isFinite(n) ? n : undefined;
};
const shopName = (link: string) => {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "the shop";
  }
};

/**
 * The host's gift list: what they'd like, shown on the event's website, and who has
 * chosen what. Guests choose from their own RSVP link, so nobody brings the same thing twice.
 */
export function GiftsPage() {
  const { event, role } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const canEdit = role !== "viewer";
  const gifts = useQuery(api.gifts.list, { eventId });
  const site = useQuery(api.site.get, { eventId });
  const add = useMutation(api.gifts.add);
  const update = useMutation(api.gifts.update);
  const remove = useMutation(api.gifts.remove);
  const move = useMutation(api.gifts.move);
  const clear = useMutation(api.gifts.clearReservation);
  const save = useMutation(api.site.save);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: Id<"gifts">; draft: Draft } | null>(null);
  const [cash, setCash] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (site !== undefined) setCash(site?.cashGiftNote ?? "");
    // Load the note once; after that it's the host's edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site === undefined]);

  const run = (p: Promise<unknown>) => {
    setError(null);
    return p.catch((e) => {
      setError(say(e));
      throw e;
    });
  };
  const showOnSite = site?.showGifts !== false;
  const noGifts = site?.noGifts === true;
  const taken = (gifts ?? []).filter((g) => g.reservedBy).length;

  async function addGift(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    await run(add({ eventId, title: draft.title, link: draft.link || undefined, price: priceOf(draft.price), note: draft.note || undefined }));
    record(EVENTS.giftAdded);
    setDraft(EMPTY);
  }

  async function saveEdit() {
    if (!editing) return;
    const d = editing.draft;
    await run(update({ giftId: editing.id, patch: { title: d.title, link: d.link, note: d.note, price: priceOf(d.price) ?? null } }));
    setEditing(null);
  }

  return (
    <div className="max-w-[46rem]">
      <h1 className="text-[2.2rem] leading-tight">Gift <em>list</em></h1>
      <p className="mt-1 text-sm text-muted">
        Add what you'd like. It shows on your event website, and each guest chooses from their own RSVP link, so nobody brings the same thing twice.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-5">
        {!noGifts && (
          <section className="card px-6 py-5" aria-labelledby="gifts-h">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="gifts-h" className="display text-xl">Your list</h2>
              {gifts && gifts.length > 0 && <p className="text-sm text-quiet">{gifts.length} gifts · {taken} chosen</p>}
            </div>
            {gifts === undefined ? (
              <p className="mt-3 text-sm text-muted">Loading…</p>
            ) : gifts.length === 0 ? (
              <div className="mt-4 flex items-start gap-3 text-sm text-muted">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Gift size={17} strokeWidth={1.5} aria-hidden /></span>
                <p>Nothing on the list yet. Add the first gift below; it shows on your website as soon as you do.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {gifts.map((g, i) =>
                  editing?.id === g._id ? (
                    <EditRow key={g._id} draft={editing.draft} onChange={(d) => setEditing({ id: g._id, draft: d })} onSave={() => void saveEdit().catch(() => {})} onCancel={() => setEditing(null)} />
                  ) : (
                    <GiftItem
                      key={g._id}
                      g={g}
                      currency={event.currency}
                      canEdit={canEdit}
                      first={i === 0}
                      last={i === gifts.length - 1}
                      onEdit={() => setEditing({ id: g._id, draft: { title: g.title, link: g.link ?? "", price: g.price !== undefined ? String(g.price) : "", note: g.note ?? "" } })}
                      onMove={(direction) => void run(move({ giftId: g._id, direction })).catch(() => {})}
                      onClear={() => void run(clear({ giftId: g._id })).catch(() => {})}
                      onRemove={() => void run(remove({ giftId: g._id })).catch(() => {})}
                    />
                  ),
                )}
              </ul>
            )}
          </section>
        )}
        {canEdit && !noGifts && (
          <form onSubmit={(e) => void addGift(e).catch(() => {})} className="card grid gap-3 px-6 py-5">
            <h2 className="display text-xl">Add a gift</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
              <label className="grid gap-1 text-sm">
                <span className="label">What it is</span>
                <input className="input" maxLength={120} required value={draft.title} placeholder="A brass lamp, a dinner set…" onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="label">Price (optional)</span>
                <input className="input" inputMode="decimal" value={draft.price} placeholder={money(0, event.currency).replace(/[\d.,\s]+$/, "")} onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))} />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="label">Where to buy it (optional)</span>
              <input className="input" inputMode="url" maxLength={500} value={draft.link} placeholder="https://…" onChange={(e) => setDraft((d) => ({ ...d, link: e.target.value }))} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="label">A note (optional)</span>
              <input className="input" maxLength={400} value={draft.note} placeholder="The colour, the size, why you'd love it" onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
            </label>
            <div>
              <button type="submit" className="btn-primary btn-sm" disabled={!draft.title.trim()}>
                <Icon name="plus" size={14} /> Add to the list
              </button>
            </div>
          </form>
        )}

        <section className="card px-6 py-5">
          <h2 className="display text-xl">On your website</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" className="h-4 w-4 accent-accent" disabled={!canEdit || site === undefined} checked={showOnSite} onChange={(e) => void run(save({ eventId, patch: { showGifts: e.target.checked } })).catch(() => {})} />
              Show the gift list on our website
            </label>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" className="h-4 w-4 accent-accent" disabled={!canEdit || site === undefined} checked={noGifts} onChange={(e) => void run(save({ eventId, patch: { noGifts: e.target.checked } })).catch(() => {})} />
              No gifts, please (the website says so kindly and lists nothing)
            </label>
          </div>
          {!noGifts && (
            <label className="mt-4 grid gap-1 text-sm">
              <span className="label">Cash gifts (optional)</span>
              <textarea
                className="input min-h-[4rem]"
                disabled={!canEdit}
                maxLength={400}
                value={cash}
                placeholder="Your blessings are the best gift. If you'd like to give shagun or moi, it's warmly welcome."
                onChange={(e) => setCash(e.target.value)}
                onBlur={() => (site?.cashGiftNote ?? "") !== cash && void run(save({ eventId, patch: { cashGiftNote: cash } })).catch(() => {})}
              />
            </label>
          )}
          {site && (
            <a href={`/s/${site.slug}${site.published ? "" : "?preview=1"}`} target="_blank" rel="noreferrer" className="btn-quiet btn-sm mt-4">
              {site.published ? "See it on the website" : "Preview the website"} <Icon name="external" size={14} />
            </a>
          )}
        </section>

        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}

function GiftItem({
  g, currency, canEdit, first, last, onEdit, onMove, onClear, onRemove,
}: {
  g: GiftRow;
  currency: string;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (direction: "up" | "down") => void;
  onClear: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 sm:flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-base text-ink">{g.title}</span>
          {g.price !== undefined && <span className="text-xs text-quiet">{money(g.price, currency)}</span>}
        </p>
        {g.note && <p className="mt-0.5 text-sm text-muted">{g.note}</p>}
        {g.link && (
          <a href={g.link} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-accent underline">
            {shopName(g.link)} <Icon name="external" size={12} />
          </a>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {g.reservedBy ? <span className="chip-ok">Chosen by {g.reservedBy.name}</span> : <span className="chip-quiet">Still free</span>}
        {canEdit && (
          <>
            {g.reservedBy && <button type="button" className="text-xs text-quiet underline hover:text-accent" onClick={onClear}>Free it</button>}
            <button type="button" aria-label={`Move ${g.title} up`} disabled={first} className="grid h-7 w-7 place-items-center rounded-full text-quiet hover:bg-accent-soft hover:text-accent disabled:opacity-30" onClick={() => onMove("up")}><Icon name="up" size={14} /></button>
            <button type="button" aria-label={`Move ${g.title} down`} disabled={last} className="grid h-7 w-7 place-items-center rounded-full text-quiet hover:bg-accent-soft hover:text-accent disabled:opacity-30" onClick={() => onMove("down")}><Icon name="down" size={14} /></button>
            <button type="button" aria-label={`Edit ${g.title}`} className="grid h-7 w-7 place-items-center rounded-full text-quiet hover:bg-accent-soft hover:text-accent" onClick={onEdit}><Icon name="pen" size={14} /></button>
            <button type="button" aria-label={`Remove ${g.title}`} className="grid h-7 w-7 place-items-center rounded-full text-quiet hover:bg-accent-soft hover:text-accent" onClick={onRemove}><Icon name="close" size={14} /></button>
          </>
        )}
      </div>
    </li>
  );
}

function EditRow({ draft, onChange, onSave, onCancel }: { draft: Draft; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <li className="grid gap-2 py-3.5">
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <input className="input" aria-label="What it is" maxLength={120} value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
        <input className="input" aria-label="Price" inputMode="decimal" value={draft.price} placeholder="Price" onChange={(e) => onChange({ ...draft, price: e.target.value })} />
      </div>
      <input className="input" aria-label="Where to buy it" inputMode="url" maxLength={500} value={draft.link} placeholder="https://…" onChange={(e) => onChange({ ...draft, link: e.target.value })} />
      <input className="input" aria-label="A note" maxLength={400} value={draft.note} placeholder="A note" onChange={(e) => onChange({ ...draft, note: e.target.value })} />
      <div className="flex gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={!draft.title.trim()} onClick={onSave}>Save</button>
        <button type="button" className="btn-quiet btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </li>
  );
}
