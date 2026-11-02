import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useParams } from "react-router-dom";
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
import { BadLink } from "../components/ui/BadLink";
import { daysAway, downloadIcs, mapsLink } from "../lib/eventPage";
import { partCoverPath } from "../../convex/lib/covers";
import "../styles/site.css";

type Answer = { coming: boolean | null; count: number };

/**
 * A guest's own RSVP page: reached by the personal link the
 * hosts sent, no account needed. For each part they're invited to, coming or
 * not and how many, plus food needs. They can come back and change it.
 * It wears the event page's cover and invitation card, and links to that page once it's published.
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

  // What's saved for them (from this page, an email reply or the hosts), as one key: when it changes,
  // the form follows it, unless they have started changing it themselves.
  const [touched, setTouched] = useState(false);
  const saved = inv
    ? JSON.stringify([inv.sessions.map((e) => [e._id, e.coming ?? null, e.count ?? 0]), inv.dietary ?? "", inv.allergies ?? "", inv.answeredAt ?? 0])
    : "";
  useEffect(() => {
    if (!inv || touched) return;
    setAnswers(Object.fromEntries(inv.sessions.map((e) => [e._id, { coming: e.coming ?? null, count: e.count || inv.partySize }])));
    setDietary(inv.dietary ?? "");
    setAllergies(inv.allergies ?? "");
    // Keyed on what's saved, not on every render of the invitation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, touched]);

  if (inv === undefined) return <main className="grid min-h-screen place-items-center bg-paper text-sm text-muted">Loading…</main>;
  if (inv === null) {
    return <BadLink title="This RSVP link isn't valid." body="Ask whoever invited you to send it again." />;
  }

  const ready = inv.sessions.every((e) => answers[e._id]?.coming !== null && answers[e._id] !== undefined);
  const set = (id: string, patch: Partial<Answer>) => {
    setTouched(true);
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  };
  // Food questions only matter to someone who is coming to at least one part.
  const anyComing = inv.sessions.some((e) => answers[e._id]?.coming === true);
  const noneComing = inv.sessions.length > 0 && inv.sessions.every((e) => answers[e._id]?.coming === false);
  const how = inv.answeredBy === "email" ? "replied by email" : inv.answeredBy === "couple" ? `told ${hosts} your answer` : "answered";
  const when = inv.answeredAt ? new Date(inv.answeredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

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
      setTouched(false);
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

  const place = [inv.area, inv.city].filter(Boolean).join(", ");
  const days = daysAway(inv.startDate);

  return (
    <main className="site min-h-screen bg-paper text-ink">
      <header className="site__hero">
        <div className={`site__cover${inv.coverIsPhoto ? " site__cover--photo" : ""}`}>
          <img src={inv.cover} alt="" decoding="async" fetchPriority="high" />
        </div>
        <div className="relative z-10 mx-auto max-w-[44rem] px-5">
          <div className="site__card">
            <p className="text-xs uppercase tracking-[0.22em] text-quiet">You're invited to {inv.occasion}</p>
            <h1 className="mt-3 text-[clamp(2.1rem,3.6vw,3.2rem)] leading-[1.05]">Dear {inv.firstName},</h1>
            <span className="site__rule" aria-hidden="true" />
            <p className="text-muted">
              {hosts} would love you to join them.
              <br />
              {inv.startDate === inv.endDate ? longDate(inv.startDate) : `${longDate(inv.startDate)} to ${longDate(inv.endDate)}`}
              {place && (
                <>
                  <br />
                  {place}
                </>
              )}
            </p>
            {days !== null && <p className="site__countdown">{days}</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {inv.sitePath && (
                <Link to={inv.sitePath} className="btn-primary btn-sm">
                  See the event page
                </Link>
              )}
              <button type="button" className={inv.sitePath ? "btn-quiet btn-sm" : "btn-primary btn-sm"} onClick={() => downloadIcs(inv)}>
                Add to calendar
              </button>
              {place && (
                <a className="btn-quiet btn-sm" href={mapsLink(place)} target="_blank" rel="noopener noreferrer">
                  Directions
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[44rem] gap-12 px-5 py-14">
        <section aria-labelledby="rsvp-h">
        <h2 id="rsvp-h" className="site__h">
          {/* One piece of text, so the heading's rule doesn't space out the question mark. */}
          <span>
            Will you <em>come</em>?
          </span>
        </h2>
        {state === "sent" ? (
          <div className="site__rsvp mt-5">
            <p className="display text-2xl">Thank you</p>
            <p className="mx-auto mt-2 max-w-[28rem] text-sm text-muted">
              {noneComing
                ? `${hosts} will miss you. If your plans change, come back to this link.`
                : `Your answer is with ${hosts}. You can come back to this link to change it.`}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-quiet btn-sm bg-cream" onClick={() => setState("idle")}>Change my answer</button>
              {inv.sitePath && (
                <Link to={inv.sitePath} className="btn-primary btn-sm">
                  See the event page
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            {inv.responded && when && !touched && (
              // An answer that came by email shows here too, so the page never looks unanswered.
              <p className="mt-4 rounded-[12px] bg-accent-soft/50 px-4 py-2.5 text-sm text-muted">
                You {how} on {when}; it&rsquo;s below. Change anything and send it again.
              </p>
            )}
            <div className="mt-5 grid gap-6">
              {groupByDay(inv.sessions).map((day) => (
              <div key={day.date}>
              <p className="display text-lg text-ink">{dayHeading(day.date)}</p>
              <ul className="mt-2 grid gap-4">
              {day.parts.map((e) => {
                const a = answers[e._id] ?? { coming: null, count: inv.partySize };
                return (
                  <li key={e._id} className="overflow-hidden rounded-[18px] bg-cream ring-1 ring-line">
                    {/* Each part of the day with its own drawing: a pooja's, a festival's, or the event's. */}
                    <img src={partCoverPath(inv.eventType, e.name, inv.name)} alt="" loading="lazy" className="h-28 w-full object-cover object-[50%_82%] opacity-90" />
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
            {/* Shown once they're coming to something; hidden again if they switch every part to "can't make it". */}
            {anyComing && (
              <div className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm">
                  <span className="label">Food preferences</span>
                  <input className="input" value={dietary} maxLength={200} placeholder="Vegetarian, no pork, halal…" onChange={(e) => { setTouched(true); setDietary(e.target.value); }} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="label">Allergies</span>
                  <input className="input" value={allergies} maxLength={300} placeholder="Peanuts, severe; shellfish" onChange={(e) => { setTouched(true); setAllergies(e.target.value); }} />
                </label>
              </div>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
            <button type="button" className="btn-primary mt-6 w-full justify-center sm:w-auto" disabled={!ready || state === "sending"} onClick={() => void submit()}>
              {state === "sending" ? "Sending…" : inv.responded ? "Update my answer" : "Send my RSVP"}
            </button>
          </>
        )}
        </section>
        {inv.gifts && (
          <div>
            <GiftList gifts={inv.gifts} onChoose={(id, choose) => void chooseGift(id, choose)} busy={giftBusy} />
            {giftError && <p role="alert" className="mt-3 text-sm text-bad">{giftError}</p>}
          </div>
        )}
        <p className="text-center text-xs text-quiet">Made with {BRAND.name}</p>
        <ThemeFooter />
      </div>
    </main>
  );
}
