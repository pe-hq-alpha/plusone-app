import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { iconComponent, iconLabel, ICON_ROWS, ICON_STROKE, sessionIcon } from "../lib/sessionIcons";
import { flattenSlots, longDate, money } from "../lib/format";
import { clock } from "../lib/dayByPart";
import { StatusChip } from "../components/ui/StatusChip";
import { Icon } from "../components/ui/Icon";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { SpaceView } from "../components/spaces/SpaceView";
import { keptPalette } from "../lib/spaces";
import { isWorkEvent, partWord } from "../../convex/lib/occasion";
import { PartWord, PeopleWord } from "../lib/words";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type Ceremony = EventData["sessions"][number];
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message.replace(/^.*ConvexError: /, "").split("\n")[0] : fallback);

/** A field that saves when it loses focus, and says so if it couldn't. */
function InlineField({
  label,
  value,
  type = "text",
  disabled,
  onSave,
  className = "",
}: {
  label: string;
  value: string;
  type?: "text" | "time" | "number";
  disabled: boolean;
  onSave: (v: string) => Promise<unknown>;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className={`grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-quiet ${className}`}>
      {label}
      <input
        type={type}
        className="input font-normal normal-case tracking-normal"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === value) return;
          setError(null);
          onSave(draft).catch((e) => {
            setError(errorText(e, "That didn't save."));
            setDraft(value);
          });
        }}
      />
      {error && <span role="alert" className="font-normal normal-case tracking-normal text-bad">{error}</span>}
    </label>
  );
}

/**
 * One part of the event, whole: what it means, when and where, its Space, the vendors it
 * needs and its checklist, with its vendors and inbox one tap away.
 */
export function CeremonyPage() {
  const { event, role, sessions } = useOutletContext<EventData>();
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const canEdit = role !== "viewer";
  const eventId = event._id as Id<"events">;
  const c = sessions.find((e) => e._id === sessionId);
  const part = partWord(event);
  const slots = flattenSlots(useQuery(api.slots.list, { eventId }));
  const spaceItems = useQuery(api.spaces.list, { eventId });
  const update = useMutation(api.sessions.update);
  const remove = useMutation(api.sessions.remove);
  const keepPalette = useMutation(api.spaces.keepPalette);
  const opened = c?.key ?? (c ? "own" : undefined);
  useEffect(() => {
    if (opened) record(EVENTS.ceremonyOpened, { ceremony: opened });
  }, [sessionId, opened]);

  if (!c) {
    return (
      <div className="card p-8 text-center">
        <p className="display text-xl">That {part} isn't in your plan any more.</p>
        <Link to="../../plan" relative="path" className="btn-ghost mt-5">Back to the plan</Link>
      </div>
    );
  }
  const ceremony = c;
  const save = (patch: Parameters<typeof update>[0]["patch"]) => update({ sessionId: ceremony._id, patch });
  const mine = (slots ?? []).filter((s) => s.sessionIds.includes(ceremony._id));

  async function removeCeremony() {
    if (!window.confirm(`Remove ${ceremony.name} from your plan? Any vendor you've already contacted moves to another ${part}.`)) return;
    await remove({ sessionId: ceremony._id });
    navigate("../../plan", { relative: "path" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-6">
        <Link to="../../plan" relative="path" className="btn-quiet btn-sm w-max gap-1.5 bg-cream">
          <Icon name="arrow" size={15} className="rotate-180" /> All {partWord(event, true)}
        </Link>

        <Header ceremony={ceremony} currency={event.currency} canEdit={canEdit} onSave={save} part={PartWord(event)} people={PeopleWord(event)} />
        <Meaning ceremony={ceremony} canEdit={canEdit} onSave={save} part={part} work={isWorkEvent(event)} />
        <section className="card px-5 py-6 sm:px-7" aria-labelledby="space-h">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 id="space-h" className="display text-xl">This {part}'s <em>Space</em></h2>
            <Link to={`/e/${eventId}/spaces/${ceremony._id}`} className="flex shrink-0 items-center gap-1 text-sm text-accent underline-offset-2 hover:underline">
              All Spaces <Icon name="arrow" size={14} />
            </Link>
          </div>
          <SpaceView
            eventId={eventId}
            sessionId={ceremony._id}
            ceremony={ceremony.name}
            items={(spaceItems ?? []).filter((i) => i.sessionId === ceremony._id && (i.kind === "image" || i.kind === "link"))}
            canEdit={canEdit}
            spaces={[{ sessionId: undefined, name: "The whole event" }, ...sessions.map((e) => ({ sessionId: e._id as Id<"sessions">, name: e.name }))]}
            catchPaste
            maxColumns={3}
            palette={{ kept: keptPalette(ceremony), keep: (p) => keepPalette({ sessionId: ceremony._id, description: p.description, colors: p.colors }) }}
          />
        </section>
      </div>

      <aside className="grid content-start gap-4 lg:pt-12">
        <section className="card p-5" aria-labelledby="needs-h">
          <h2 id="needs-h" className="display text-lg">Vendors for this {part}</h2>
          {mine.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No vendors on this {part} yet.</p>
          ) : (
            <ul className="mt-2 grid gap-0.5">
              {mine.map((s) => (
                <li key={s._id}>
                  <Link to={`../vendors/${s._id}`} relative="path" className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-2 transition hover:bg-accent-soft/50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{s.title}</span>
                      <span className="text-xs text-quiet">
                        {s.bookedVendor ? s.bookedVendor.name : s.sessionIds.length > 1 ? `Shared with ${s.sessionIds.length - 1} more` : money(s.budget, event.currency)}
                      </span>
                    </span>
                    <StatusChip status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="../vendors" relative="path" className="btn-quiet btn-sm mt-3">
            Find vendors <Icon name="arrow" size={15} />
          </Link>
        </section>

        {canEdit && sessions.length > 1 && (
          <button type="button" onClick={() => void removeCeremony()} className="justify-self-start text-sm text-bad underline underline-offset-2 hover:opacity-80">
            Remove this {part}
          </button>
        )}
      </aside>
    </div>
  );
}

function Header({
  ceremony: c,
  currency,
  canEdit,
  onSave,
  part,
  people,
}: {
  ceremony: Ceremony;
  currency: string;
  canEdit: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<unknown>;
  /** "Ceremony", "Session" or "Function", capitalised. */
  part: string;
  /** "Guests" or "Attendees". */
  people: string;
}) {
  const [picking, setPicking] = useState(false);
  const CeremonyIcon = sessionIcon(c);
  return (
    <section className="card px-7 py-6" aria-labelledby="ceremony-name" data-tour="ceremony">
      <div className="flex items-start gap-4">
        <div className="relative">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setPicking((p) => !p)}
            aria-label="Choose an icon"
            aria-expanded={picking}
            className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent transition hover:bg-accent hover:text-paper disabled:pointer-events-none"
          >
            <CeremonyIcon size={22} strokeWidth={ICON_STROKE} aria-hidden="true" />
          </button>
          {picking && (
            <div className="absolute left-0 top-14 z-20 w-[19rem] rounded-[14px] border border-line bg-cream p-3 shadow-[0_18px_40px_-20px_rgb(var(--shadow-rgb)/0.4)]">
              {ICON_ROWS.map((row) => (
                <fieldset key={row.title} className="mt-2 first:mt-0">
                  <legend className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-quiet">{row.title}</legend>
                  <div className="flex flex-wrap gap-1">
                    {row.keys.map((key) => {
                      const Glyph = iconComponent(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          title={iconLabel(key)}
                          aria-label={iconLabel(key)}
                          aria-pressed={c.icon === key}
                          onClick={() => {
                            setPicking(false);
                            void onSave({ icon: key });
                          }}
                          className={`grid h-8 w-8 place-items-center rounded-full transition hover:bg-accent-soft ${c.icon === key ? "bg-accent-soft text-accent" : "text-muted"}`}
                        >
                          <Glyph size={17} strokeWidth={ICON_STROKE} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-quiet">
            Day {c.dayIndex + 1} · {longDate(c.date)}
            {c.startTime ? ` · ${clock(c.startTime)}${c.endTime ? `–${clock(c.endTime)}` : ""}` : ""}
          </p>
          {canEdit ? (
            <input
              id="ceremony-name"
              aria-label={`${part} name`}
              defaultValue={c.name}
              key={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void onSave({ name: e.target.value.trim() })}
              className="mt-1 w-full truncate rounded-[10px] bg-transparent px-1 -mx-1 text-[1.75rem] leading-tight font-display outline-none transition hover:bg-accent-soft/40 focus:bg-accent-soft/40 sm:text-[2.2rem]"
            />
          ) : (
            <h1 id="ceremony-name" className="mt-1 text-[1.75rem] leading-tight sm:text-[2.2rem]">{c.name}</h1>
          )}
        </div>
      </div>
      <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,8rem))_minmax(0,1fr)]">
        <InlineField label="Starts" type="time" value={c.startTime ?? ""} disabled={!canEdit} onSave={(v) => onSave({ startTime: v })} />
        <InlineField label="Ends" type="time" value={c.endTime ?? ""} disabled={!canEdit} onSave={(v) => onSave({ endTime: v })} />
        <InlineField label="Where" value={c.location ?? ""} disabled={!canEdit} onSave={(v) => onSave({ location: v })} className="sm:col-span-2 lg:col-span-1" />
        <InlineField label={people} type="number" value={String(c.guestCount)} disabled={!canEdit} onSave={(v) => onSave({ guestCount: Math.max(0, Number(v) || 0) })} />
        <InlineField label={`Budget (${currency})`} type="number" value={String(c.budget)} disabled={!canEdit} onSave={(v) => onSave({ budget: Math.max(0, Number(v) || 0) })} />
        <p className="self-end pb-2.5 text-xs text-quiet">Changing the budget re-spreads the rest so your total still adds up.</p>
      </div>
    </section>
  );
}

function Meaning({ ceremony: c, canEdit, onSave, part, work }: { ceremony: Ceremony; canEdit: boolean; onSave: (patch: Record<string, unknown>) => Promise<unknown>; part: string; work: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.significance ?? "");
  if (!c.significance && !c.rites?.length && !canEdit) return null;
  return (
    <section className="card px-7 py-6" aria-labelledby="meaning-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="meaning-h" className="display text-xl">{work ? "What it's for" : "What it means"}</h2>
        {canEdit && !editing && (
          <button type="button" className="text-sm text-accent underline underline-offset-2" onClick={() => { setDraft(c.significance ?? ""); setEditing(true); }}>
            {c.significance ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 grid gap-2">
          <textarea className="input resize-y" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={work ? `What this ${part} is for` : `What this ${part} means`} />
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={() => void onSave({ significance: draft }).then(() => setEditing(false))}>Save</button>
            <button type="button" className="btn-quiet btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="mt-2 leading-relaxed text-muted">{c.significance || (work ? "Say what it is for, so anyone planning it with you knows what matters." : "Say what it means to you, for anyone planning it with you.")}</p>
      )}
      {c.rites?.length ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="label">Moments within it</p>
          <ul className="grid gap-2 text-sm">
            {c.rites.map((r) => (
              <li key={r.name} className="leading-relaxed">
                <span className="display text-base text-ink">{r.name}</span>
                {r.gloss && <span className="block text-muted">{r.gloss}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

