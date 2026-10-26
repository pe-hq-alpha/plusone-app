import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon } from "../components/ui/Icon";
import { byDayThenOrder } from "../../convex/lib/sessionOrder";
import { isWedding, isWorkEvent, peopleWord } from "../../convex/lib/occasion";
import { PartWord } from "../lib/words";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
const say = (e: unknown) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't save. Try again.");

/**
 * The event's website: write the welcome, background and travel
 * notes, choose which sections and sessions show, and publish when it's ready.
 */
export function WebsitePage() {
  const { event, role, sessions } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const canEdit = role !== "viewer";
  const site = useQuery(api.site.get, { eventId });
  const save = useMutation(api.site.save);
  const publish = useMutation(api.site.setPublished);
  const [draft, setDraft] = useState({ welcome: "", story: "", travel: "" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (site) setDraft({ welcome: site.welcome ?? "", story: site.story ?? "", travel: site.travel ?? "" });
    // Load the words once; after that they are the host's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site === undefined || site === null]);

  const run = (p: Promise<unknown>) => void p.catch((e) => setError(say(e)));
  const url = site ? `${window.location.origin}/s/${site.slug}` : "";
  const hidden = new Set(site?.hiddenSessionIds ?? []);

  if (site === undefined) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="max-w-[46rem]">
      <h1 className="text-[2.2rem] leading-tight">Event <em>website</em></h1>
      <p className="mt-1 text-sm text-muted">One page for your {peopleWord(event)}: what is happening, where and when, what to wear, and how to get there. Nothing is public until you publish it.</p>

      {site === null ? (
        <div className="card mt-6 px-6 py-6">
          <p className="text-sm">Start your website from your plan. You can change everything before anyone sees it.</p>
          {canEdit && <button type="button" className="btn-primary mt-4" onClick={() => run(save({ eventId, patch: {} }))}>Start our website</button>}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5">
          <section data-tour="website-status" className={`card flex flex-wrap items-center justify-between gap-4 px-6 py-5 ${site.published ? "ring-1 ring-ok-fill" : ""}`}>
            <div className="min-w-0">
              <p className="display text-lg">{site.published ? "It's live" : "Not published yet"}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted">{url}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={`/s/${site.slug}${site.published ? "" : "?preview=1"}`} target="_blank" rel="noreferrer" className="btn-quiet btn-sm">
                {site.published ? "Open it" : "Preview"} <Icon name="external" size={14} />
              </a>
              {site.published && (
                <button type="button" className="btn-quiet btn-sm" onClick={() => void navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })}>
                  {copied ? "Copied" : "Copy the link"}
                </button>
              )}
              {role === "owner" && (
                <button type="button" className={site.published ? "btn-quiet btn-sm" : "btn-primary btn-sm"} onClick={() => run(publish({ eventId, published: !site.published }))}>
                  {site.published ? "Take it down" : "Publish"}
                </button>
              )}
            </div>
            {!site.published && <p className="w-full text-xs text-quiet">Only the people planning your event can open the preview. {role !== "owner" && "The owner publishes it."}</p>}
          </section>

          <section className="card grid gap-4 px-6 py-5">
            <h2 className="display text-xl">The words</h2>
            {(["welcome", "story", "travel"] as const).map((k) => (
              <label key={k} className="grid gap-1 text-sm">
                <span className="label">{k === "welcome" ? "Welcome" : k === "story" ? "A little background (optional)" : "Travel and stay"}</span>
                <textarea
                  className="input min-h-[5rem]"
                  disabled={!canEdit}
                  value={draft[k]}
                  maxLength={k === "welcome" ? 600 : 3000}
                  placeholder={k === "welcome" ? "We can't wait to celebrate with you." : k === "story" ? storyExample(event) : "The nearest airport, hotels we've held rooms at, getting between the venues…"}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  onBlur={() => (site[k] ?? "") !== draft[k] && run(save({ eventId, patch: { [k]: draft[k] } }))}
                />
              </label>
            ))}
          </section>

          <section className="card px-6 py-5">
            <h2 className="display text-xl">What shows</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {([
                ["showSchedule", "The schedule, with times and places"],
                ["showTravel", "Travel and stay"],
                ["showRsvp", "How to RSVP"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-accent" disabled={!canEdit} checked={site[k]} onChange={(e) => run(save({ eventId, patch: { [k]: e.target.checked } }))} />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-2.5">
                <input type="checkbox" className="h-4 w-4 accent-accent" disabled={!canEdit} checked={site.showGifts !== false} onChange={(e) => run(save({ eventId, patch: { showGifts: e.target.checked } }))} />
                Your gift list
              </label>
            </div>
            {site.showSchedule && (
              <>
                <p className="mt-5 text-sm text-muted">{PartWord(event, true)} on the public page (a personal RSVP link always shows the ones that person is invited to):</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...sessions].sort(byDayThenOrder).map((e) => {
                    const on = !hidden.has(e._id as Id<"sessions">);
                    return (
                      <button
                        key={e._id}
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={on}
                        onClick={() => run(save({ eventId, patch: { hiddenSessionIds: on ? [...hidden, e._id as Id<"sessions">] : [...hidden].filter((x) => x !== e._id) } }))}
                        className={`rounded-full px-3.5 py-1.5 text-sm transition ${on ? "bg-accent text-paper" : "bg-cream text-muted ring-1 ring-line"}`}
                      >
                        {e.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section className="card px-6 py-5">
            <h2 className="display text-xl">RSVPs</h2>
            <p className="mt-1 text-sm text-muted">Everyone on your list has their own RSVP link: copy it from the {peopleWord(event)} page and send it however you like. Their answers, numbers and food needs land on the list by themselves.</p>
          </section>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** The background box's example, in the words this kind of event would use. */
function storyExample(o: EventData["event"]): string {
  if (isWedding(o)) return "How you met, the proposal…";
  if (isWorkEvent(o)) return "What the event is for, and who will be there…";
  return "Why you're gathering, and what the day means to the family…";
}
