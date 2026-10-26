import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { longDate } from "../lib/format";
import { dayHeading, groupByDay, timeChip } from "../lib/dayByPart";
import { usePrivatePage } from "../lib/privatePage";
import { BRAND } from "../lib/brand";
import { GiftList } from "../components/GiftList";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { ThemeFooter } from "../components/ui/ThemeFooter";

type Answer = { coming: boolean | null; count: number };

/**
 * A guest's own RSVP page: reached by the personal link the
 * hosts sent, no account needed. For each part they're invited to, coming or
 * not and how many, plus food needs. They can come back and change it.
 */
export function RsvpPage() {
  const { token = "" } = useParams<{ token: string }>();
  const inv = useQuery(api.site.invitation, { token });
  const send = useMutation(api.site.answer);
  const reserve = useMutation(api.gifts.reserve);
  const unreserve = useMutation(api.gifts.unreserve);
  const [giftBusy, setGiftBusy] = useState<Id<"gifts"> | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const hosts = inv?.hosts ?? "";
  usePrivatePage(inv ? `RSVP · ${hosts}` : "RSVP");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [dietary, setDietary] = useState("");
  const [allergies, setAllergies] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inv) return;
    setAnswers(Object.fromEntries(inv.sessions.map((e) => [e._id, { coming: e.coming ?? null, count: e.count || inv.partySize }])));
    setDietary(inv.dietary ?? "");
    setAllergies(inv.allergies ?? "");
    // Only when the invitation first arrives; later updates are their own answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv === undefined || inv === null]);

  if (inv === undefined) return <main className="grid min-h-screen place-items-center bg-paper text-sm text-muted">Loading…</main>;
  if (inv === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-6 text-center">
        <div>
          <p className="display text-3xl">This RSVP link isn't valid.</p>
          <p className="mt-2 text-sm text-muted">Ask whoever invited you to send it again.</p>
          <ThemeFooter className="mt-8" />
        </div>
      </main>
    );
  }

  const ready = inv.sessions.every((e) => answers[e._id]?.coming !== null && answers[e._id] !== undefined);
  const set = (id: string, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));

  async function submit() {
    setError(null);
    setState("sending");
    try {
      await send({
        token,
        answers: inv!.sessions.map((e) => ({ sessionId: e._id as Id<"sessions">, coming: Boolean(answers[e._id]?.coming), count: answers[e._id]?.count ?? 1 })),
        dietary,
        allergies,
      });
      setState("sent");
    } catch (e) {
      setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't send. Try again.");
      setState("idle");
    }
  }

  async function chooseGift(giftId: Id<"gifts">, choose: boolean) {
    setGiftError(null);
    setGiftBusy(giftId);
    try {
      await (choose ? reserve : unreserve)({ token, giftId });
      if (choose) record(EVENTS.giftReserved);
    } catch (e) {
      setGiftError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't save. Try again.");
    } finally {
      setGiftBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink">
      <div className="mx-auto max-w-[36rem]">
        <p className="text-xs uppercase tracking-[0.22em] text-quiet">You're invited</p>
        <h1 className="mt-2 text-[2.2rem] leading-tight">
          Dear {inv.firstName},
        </h1>
        <p className="mt-2 text-muted">
          {hosts} would love you to join them for {inv.occasion}{inv.startDate === inv.endDate ? ` on ${longDate(inv.startDate)}` : ` from ${longDate(inv.startDate)} to ${longDate(inv.endDate)}`}, in {inv.city}.
        </p>

        {state === "sent" ? (
          <div className="mt-8 rounded-[18px] bg-accent-soft/60 px-6 py-6">
            <p className="display text-2xl">Thank you</p>
            <p className="mt-2 text-sm text-muted">Your answer is with {hosts}. You can come back to this link to change it.</p>
            <button type="button" className="btn-quiet btn-sm mt-4 bg-cream" onClick={() => setState("idle")}>Change my answer</button>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-6">
              {groupByDay(inv.sessions).map((day) => (
              <div key={day.date}>
              <p className="display text-lg text-ink">{dayHeading(day.date)}</p>
              <ul className="mt-2 grid gap-4">
              {day.parts.map((e) => {
                const a = answers[e._id] ?? { coming: null, count: inv.partySize };
                return (
                  <li key={e._id} className="overflow-hidden rounded-[18px] bg-cream ring-1 ring-line">
                    <div className="px-5 py-4">
                      {e.startTime && <p className="text-xs uppercase tracking-[0.14em] text-quiet">{timeChip(e.startTime)}</p>}
                      <h2 className="display mt-1 text-xl">{e.name}</h2>
                      {e.location && <p className="text-sm text-muted">{e.location}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={`Coming to the ${e.name}?`}>
                        <button type="button" aria-pressed={a.coming === true} onClick={() => set(e._id, { coming: true })} className={`rounded-full px-4 py-2 text-sm transition ${a.coming === true ? "bg-accent text-paper" : "bg-paper ring-1 ring-line hover:ring-accent"}`}>
                          I'll be there
                        </button>
                        <button type="button" aria-pressed={a.coming === false} onClick={() => set(e._id, { coming: false })} className={`rounded-full px-4 py-2 text-sm transition ${a.coming === false ? "bg-ink text-paper" : "bg-paper ring-1 ring-line hover:ring-accent"}`}>
                          I can't make it
                        </button>
                        {a.coming && inv.partySize > 1 && (
                          <label className="ml-auto flex items-center gap-2 text-sm">
                            How many of you
                            <select className="input w-auto py-1.5 text-sm" value={a.count} onChange={(ev) => set(e._id, { count: Number(ev.target.value) })}>
                              {Array.from({ length: inv.partySize }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </label>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
              </ul>
              </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="label">Food preferences</span>
                <input className="input" value={dietary} maxLength={200} placeholder="Vegetarian, no pork, halal…" onChange={(e) => setDietary(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="label">Allergies</span>
                <input className="input" value={allergies} maxLength={300} placeholder="Peanuts, severe; shellfish" onChange={(e) => setAllergies(e.target.value)} />
              </label>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
            <button type="button" className="btn-primary mt-6 w-full justify-center sm:w-auto" disabled={!ready || state === "sending"} onClick={() => void submit()}>
              {state === "sending" ? "Sending…" : inv.responded ? "Update my answer" : "Send my RSVP"}
            </button>
          </>
        )}
        {inv.gifts && (
          <div className="mt-12">
            <GiftList gifts={inv.gifts} onChoose={(id, choose) => void chooseGift(id, choose)} busy={giftBusy} />
            {giftError && <p role="alert" className="mt-3 text-sm text-bad">{giftError}</p>}
          </div>
        )}
        <p className="mt-10 text-center text-xs text-quiet">Made with {BRAND.name}</p>
        <ThemeFooter className="mt-6" />
      </div>
    </main>
  );
}
