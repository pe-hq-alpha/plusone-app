import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { answersOf, eatingAt, foodNeeds, type SessionAnswer } from "../../convex/lib/rsvp";
import { dayDate } from "../../convex/lib/text";
import { timeAgo } from "../lib/format";
import { Icon } from "./ui/Icon";
import { BRAND } from "../lib/brand";

type Guest = FunctionReturnType<typeof api.guests.list>[number];
export type Ceremony = { _id: Id<"sessions">; name: string; date: string };

const FROM: Record<NonNullable<SessionAnswer["source"]>, string> = {
  link: "from their RSVP link",
  email: "from their email",
  couple: "set by hand",
};

function answerFor(g: Guest, sessionId: Id<"sessions">): SessionAnswer<Id<"sessions">> | undefined {
  return answersOf(g).find((a) => a.sessionId === sessionId);
}

function describe(a: SessionAnswer | undefined): string {
  if (!a) return "No answer yet";
  const what = a.coming ? `Coming${a.count > 1 ? `, ${a.count}` : ""}` : "Not coming";
  const from = a.source ? ` · ${FROM[a.source]}${a.at ? ` ${timeAgo(a.at)}` : ""}` : "";
  return what + from;
}

/** How a ceremony stands: heads coming out of heads invited, and who hasn't said. */
function tally(guests: Guest[], sessionId: Id<"sessions">) {
  const t = { invited: 0, coming: 0, no: 0, open: 0 };
  for (const g of guests) {
    if (!g.sessionIds.includes(sessionId)) continue;
    t.invited += g.partySize;
    const a = answerFor(g, sessionId);
    if (!a) t.open += 1;
    else if (a.coming) t.coming += a.count;
    else t.no += 1;
  }
  return t;
}

/**
 * Who is coming to what: a head count for each session, then every guest's answer under
 * every session, whether it came from their link, their email or the hosts. The hosts
 * can set an answer by hand; viewers only see.
 */
export function CeremonyAnswers({ guests, ceremonies, canEdit }: { guests: Guest[]; ceremonies: Ceremony[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Id<"guests"> | null>(null);
  const editingGuest = guests.find((g) => g._id === editing) ?? null;
  if (ceremonies.length === 0 || guests.length === 0) return null;
  return (
    <section className="card mt-6 p-5 md:p-6" aria-labelledby="by-ceremony-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="by-ceremony-h" className="display text-xl">Who's coming to what</h2>
        <p className="text-xs text-quiet">From their RSVP links, their email replies and anything set by hand.</p>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ceremonies.map((e) => {
          const t = tally(guests, e._id);
          return (
            <li key={e._id} className="rounded-[12px] border border-line bg-field px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-quiet">{dayDate(e.date, false)}</p>
              <p className="mt-0.5 truncate font-medium">{e.name}</p>
              <p className="mt-1 text-sm">
                <span className="display text-xl leading-none text-ok">{t.coming}</span>{" "}
                <span className="text-muted">of {t.invited} invited coming</span>
              </p>
              <p className="mt-1 text-xs text-quiet">
                {t.no} can't · {t.open} not answered yet
              </p>
            </li>
          );
        })}
      </ul>

      {/* Relative, so the cells' screen-reader labels scroll with the table instead of widening the page on a phone. */}
      <div className="relative mt-5 overflow-x-auto rounded-[14px] border border-line">
        <table className="w-full text-sm" style={{ minWidth: `${11 + ceremonies.length * 6}rem` }}>
          <caption className="sr-only">Each guest's answer for each part of the event</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-quiet">
              <th scope="col" className="sticky left-0 z-[1] bg-cream py-2.5 pl-4 pr-3 font-semibold">Name</th>
              {ceremonies.map((e) => (
                <th key={e._id} scope="col" className="px-3 py-2.5 text-center font-semibold">
                  {e.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {guests.map((g) => (
              <tr key={g._id}>
                <th scope="row" className="sticky left-0 z-[1] max-w-[11rem] bg-cream py-2.5 pl-4 pr-3 text-left font-normal">
                  {canEdit ? (
                    <button
                      type="button"
                      className="block max-w-full truncate text-left underline-offset-2 hover:text-accent hover:underline"
                      onClick={() => setEditing(g._id)}
                      aria-label={`Set ${g.name}'s answers`}
                    >
                      {g.name}
                    </button>
                  ) : (
                    <span className="block truncate">{g.name}</span>
                  )}
                </th>
                {ceremonies.map((e) => (
                  <td key={e._id} className="px-3 py-2.5 text-center">
                    <Mark invited={g.sessionIds.includes(e._id)} answer={answerFor(g, e._id)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && <p className="mt-2 text-xs text-quiet">Heard from someone another way? Tap their name to set their answers.</p>}

      {canEdit && editingGuest && (
        <AnswerDialog guest={editingGuest} ceremonies={ceremonies.filter((e) => editingGuest.sessionIds.includes(e._id))} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function Mark({ invited, answer }: { invited: boolean; answer: SessionAnswer | undefined }) {
  if (!invited) {
    return (
      <span className="text-rule" title="Not invited">
        <span aria-hidden>·</span>
        <span className="sr-only">Not invited</span>
      </span>
    );
  }
  const label = describe(answer);
  if (!answer) {
    return (
      <span className="text-quiet" title={label}>
        <span aria-hidden>–</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return answer.coming ? (
    <span className="inline-flex items-center gap-0.5 font-medium text-ok" title={label}>
      <Icon name="check" size={14} />
      <span aria-hidden>{answer.count}</span>
      <span className="sr-only">{label}</span>
    </span>
  ) : (
    <span className="inline-flex text-muted" title={label}>
      <Icon name="close" size={14} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Setting one guest's answers by hand, ceremony by ceremony; each tap saves. */
function AnswerDialog({ guest, ceremonies, onClose }: { guest: Guest; ceremonies: Ceremony[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const setAnswer = useMutation(api.guests.setAnswer);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function save(sessionId: Id<"sessions">, coming: boolean | null, count?: number) {
    setError(null);
    void setAnswer({ guestId: guest._id, sessionId, coming, count }).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "That didn't save. Try again."),
    );
  }

  const pill = (on: boolean) =>
    `rounded-full px-3.5 py-1.5 text-xs transition ${on ? "bg-accent text-paper" : "bg-paper ring-1 ring-line hover:ring-accent"}`;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="answers-h"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-[22px] border border-line bg-cream p-0 text-ink shadow-[0_40px_80px_-30px_rgb(var(--shadow-rgb)/0.45)] backdrop:bg-[var(--color-scrim)] backdrop:backdrop-blur-[3px]"
    >
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="answers-h" className="display truncate text-xl">{guest.name}</h2>
            <p className="mt-0.5 text-xs text-quiet">
              {guest.partySize > 1 ? `Party of ${guest.partySize}. ` : ""}What you set here shows as set by hand.
            </p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-accent-soft hover:text-accent"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        {ceremonies.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{guest.name} isn't invited to anything yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {ceremonies.map((e) => {
              const a = answerFor(guest, e._id);
              return (
                <li key={e._id} className="py-3">
                  <p className="text-sm">
                    <span className="font-medium">{e.name}</span> <span className="text-quiet">· {dayDate(e.date, false)}</span>
                  </p>
                  <p className="text-xs text-quiet">{describe(a)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={`${guest.name} at the ${e.name}`}>
                    <button type="button" aria-pressed={a?.coming === true} className={pill(a?.coming === true)} onClick={() => save(e._id, true)}>
                      Coming
                    </button>
                    <button type="button" aria-pressed={a?.coming === false} className={pill(a?.coming === false)} onClick={() => save(e._id, false)}>
                      Not coming
                    </button>
                    <button type="button" aria-pressed={!a} className={pill(!a)} onClick={() => save(e._id, null)}>
                      No answer
                    </button>
                    {a?.coming && guest.partySize > 1 && (
                      <label className="ml-auto flex items-center gap-2 text-xs text-muted">
                        How many
                        <select
                          className="input w-auto py-1 text-xs"
                          value={a.count}
                          onChange={(ev) => save(e._id, true, Number(ev.target.value))}
                        >
                          {Array.from({ length: guest.partySize }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      </div>
    </dialog>
  );
}

/**
 * Everything each ceremony's caterer must plan around, from everyone invited to it who
 * hasn't said no: allergens first, severe ones marked, with who has them so the hosts can
 * check; then preferences. The same grouping the vendors are told, without the names.
 */
export function KitchenNotes({ guests, ceremonies }: { guests: Guest[]; ceremonies: Ceremony[] }) {
  const groups = (ceremonies.length ? ceremonies : [null])
    .map((e) => ({ ceremony: e, needs: foodNeeds(eatingAt(guests, e?._id)) }))
    .filter((g) => g.needs.allergens.length > 0 || g.needs.prefs.length > 0);
  if (groups.length === 0) return null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <section className="card mt-6 p-5 md:p-6" aria-label="Food needs for the caterer">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-xl">For the caterer</h2>
        <p className="text-xs text-quiet">
          {BRAND.name} shares these with food vendors when they ask: allergens and numbers, never names.
        </p>
      </div>
      {groups.map(({ ceremony, needs }) => {
        const total = needs.allergens.reduce((n, a) => n + a.count, 0);
        const severe = needs.allergens.reduce((n, a) => n + a.severe, 0);
        return (
          <div key={ceremony?._id ?? "all"} className="mt-4 border-t border-line pt-4">
            {ceremony && (
              <p className="text-sm">
                <span className="font-medium">{ceremony.name}</span> <span className="text-quiet">· {dayDate(ceremony.date, false)}</span>
              </p>
            )}
            {total > 0 && (
              <>
                <p className="mt-1 text-sm">
                  {total} {total === 1 ? "allergy" : "allergies"}
                  {severe > 0 && <span className="text-bad">, {severe} severe</span>}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {needs.allergens.map((a) => (
                    <li
                      key={a.name}
                      className={`rounded-full px-3 py-1 text-xs ${a.severe ? "bg-bad/10 text-bad" : "bg-warn-bg text-warn"}`}
                    >
                      {cap(a.name)}
                      {a.severe ? (a.severe === a.count ? ", severe" : `, ${a.severe} severe`) : ""}{" "}
                      <span className="opacity-70">· {a.who.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {needs.prefs.length > 0 && (
              <p className="mt-2 text-sm text-muted">
                Also: {needs.prefs.map((p) => `${p.name} (${p.who.join(", ")})`).join("; ")}.
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
