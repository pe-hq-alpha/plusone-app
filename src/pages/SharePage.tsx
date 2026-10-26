import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { firstUrl } from "../../convex/lib/links";
import { Icon } from "../components/ui/Icon";
import { spaceLabel } from "../lib/spaces";
import { byDayThenOrder } from "../../convex/lib/sessionOrder";
import { ThemeFooter } from "../components/ui/ThemeFooter";

/**
 * Where a link lands when it is shared to PlusOne from another app (Instagram,
 * TikTok, Pinterest, a browser) on a phone that has the app installed. Pick the event
 * and the Space (the event's own unless another is chosen); it goes in at the front.
 */
export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const url = firstUrl([params.get("url"), params.get("text"), params.get("title")].filter(Boolean).join(" "));
  const mine = useQuery(api.events.listMine);
  const editable = (mine ?? []).filter((m) => m.role !== "viewer");
  const [picked, setPicked] = useState<Id<"events"> | null>(null);
  const eventId = picked ?? (editable.length === 1 ? (editable[0].event._id as Id<"events">) : null);
  const data = useQuery(api.events.get, eventId ? { eventId } : "skip");
  const [sessionId, setSessionId] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addLink = useMutation(api.spaces.addLink);

  const chosen = data?.sessions.find((e) => e._id === sessionId)?.name;

  async function add() {
    if (!eventId || !url) return;
    setBusy(true);
    setError(null);
    try {
      await addLink({ eventId, sessionId: (sessionId || undefined) as Id<"sessions"> | undefined, text: url, caption: caption || undefined });
      navigate(sessionId ? `/e/${eventId}/spaces/${sessionId}` : `/e/${eventId}/spaces`, { replace: true });
    } catch (e) {
      setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't work. Try again.");
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto grid min-h-[80svh] w-full max-w-[34rem] content-center px-5 py-10">
      <div className="card px-6 py-7">
        <h1 className="text-[2.2rem] leading-tight">Add to a <em>Space</em></h1>
        {!url ? (
          <>
            <p className="mt-3 text-sm text-muted">There's no link in what was shared. Share a post or a page from another app, or open one of your Spaces to add your own pictures.</p>
            <Link to="/" className="btn-quiet btn-sm mt-5">Back to my events</Link>
          </>
        ) : mine === undefined ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : editable.length === 0 ? (
          <>
            <p className="mt-3 text-sm text-muted">You need a event you can plan to add this to.</p>
            <Link to="/" className="btn-quiet btn-sm mt-5">Back to my events</Link>
          </>
        ) : (
          <div className="mt-4 grid gap-4">
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-2 rounded-[12px] bg-accent-soft/60 px-3 py-2.5 text-sm">
                <Icon name="link" size={16} className="shrink-0 text-accent" />
                <span className="truncate">{url}</span>
              </p>
              <p className="mt-2 text-xs text-quiet">It goes in at the front, and its picture is kept even if the post is taken down later.</p>
            </div>
            {editable.length > 1 && (
              <label className="grid gap-1 text-sm">
                <span className="label">Event</span>
                <select className="input py-2 text-sm" value={eventId ?? ""} onChange={(e) => { setPicked((e.target.value || null) as Id<"events"> | null); setSessionId(""); }}>
                  <option value="">Choose…</option>
                  {editable.map((m) => (
                    <option key={m.event._id} value={m.event._id}>{m.event.name}</option>
                  ))}
                </select>
              </label>
            )}
            {data && (
              <fieldset className="grid gap-2">
                <legend className="label">Which Space</legend>
                <div className="flex flex-wrap gap-2">
                  {[{ id: "", name: "The whole event" }, ...[...data.sessions].sort(byDayThenOrder).map((e) => ({ id: e._id as string, name: e.name }))].map((o) => (
                    <label
                      key={o.id || "whole"}
                      className={`cursor-pointer rounded-full px-4 py-2 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                        sessionId === o.id ? "bg-accent text-paper" : "bg-field text-ink ring-1 ring-line hover:bg-accent-soft"
                      }`}
                    >
                      <input type="radio" name="space" value={o.id} checked={sessionId === o.id} onChange={() => setSessionId(o.id)} className="sr-only" />
                      {o.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="grid gap-1 text-sm">
              <span className="label">A few words (optional)</span>
              <input className="input py-2 text-sm" value={caption} maxLength={300} placeholder="What you love about it" onChange={(e) => setCaption(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <button type="button" className="btn-primary" disabled={!eventId || busy} onClick={() => void add()}>
              {busy ? "Adding…" : `Add to ${spaceLabel(chosen)}`}
            </button>
          </div>
        )}
        <ThemeFooter className="mt-10" />
      </div>
    </main>
  );
}
