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

          <RsvpLinks eventId={eventId} eventName={event.name} canEdit={canEdit} people={peopleWord(event)} />
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

/**
 * Every person's own RSVP link on one list: copy one, send it on WhatsApp, or copy them
 * all as "Name: link" lines. Each link knows who it is for, so answers land on the right row.
 */
function RsvpLinks({ eventId, eventName, canEdit, people }: { eventId: Id<"events">; eventName: string; canEdit: boolean; people: string }) {
  const make = useMutation(api.site.rsvpLinks);
  const [links, setLinks] = useState<{ guestId: string; name: string; rsvp: string; token: string }[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkFor = (token: string) => `${window.location.origin}/r/${token}`;
  const copy = (key: string, text: string) =>
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(key);
        window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
      },
      () => setError("Couldn't copy. Select the link and copy it instead."),
    );
  const message = (name: string, token: string) => `Hi ${name.split(" ")[0]}, please let us know if you can come to ${eventName}: ${linkFor(token)}`;

  return (
    <section className="card px-6 py-5" aria-labelledby="rsvp-links-h">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="rsvp-links-h" className="display text-xl">RSVP links</h2>
        {links && links.length > 0 && (
          <button type="button" className="btn-quiet btn-sm" onClick={() => copy("all", links.map((l) => `${l.name}: ${linkFor(l.token)}`).join("\n"))}>
            {copied === "all" ? "All copied" : "Copy all links"}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Each person on your list has their own link. Send it however you like; their answer, how many are coming and any food needs land on the {people} list by themselves.
      </p>
      {!canEdit ? null : links === null ? (
        <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => void make({ eventId }).then(setLinks, () => setError("Couldn't load the links. Try again."))}>
          Show everyone's links
        </button>
      ) : links.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Add people to your {people} list first, and their links appear here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {links.map((l) => (
            <li key={l.guestId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="min-w-[8rem] flex-1 text-sm">
                {l.name}
                <span className="ml-2 text-xs text-quiet">{l.rsvp === "yes" ? "coming" : l.rsvp === "no" ? "can't come" : "no answer yet"}</span>
              </span>
              <button type="button" className="btn-quiet btn-sm" onClick={() => copy(l.guestId, linkFor(l.token))}>
                <Icon name="link" size={14} /> {copied === l.guestId ? "Copied" : "Copy link"}
              </button>
              <a className="btn-quiet btn-sm" href={`https://wa.me/?text=${encodeURIComponent(message(l.name, l.token))}`} target="_blank" rel="noreferrer noopener">
                WhatsApp
              </a>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
