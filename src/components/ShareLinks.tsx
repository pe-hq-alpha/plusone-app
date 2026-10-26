import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const say = (e: unknown) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't work. Try again.");
const linkFor = (token: string) => `${window.location.origin}/p/${token}`;

/**
 * Read-only links to this summary, for parents or a venue: no account, nothing they can
 * change, and off again with one tap.
 */
export function ShareLinks({ eventId }: { eventId: Id<"events"> }) {
  const links = useQuery(api.shareLinks.list, { eventId });
  const create = useMutation(api.shareLinks.create);
  const revoke = useMutation(api.shareLinks.revoke);
  const [label, setLabel] = useState("");
  const [withMoney, setWithMoney] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Id<"shareLinks"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = (token: string) =>
    void navigator.clipboard.writeText(linkFor(token)).then(() => {
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    });

  async function make() {
    setError(null);
    try {
      const token = await create({ eventId, label, showMoney: withMoney });
      setLabel("");
      setWithMoney(false);
      copy(token);
    } catch (e) {
      setError(say(e));
    }
  }

  return (
    <section className="no-print card mt-10 px-6 py-5" aria-labelledby="share-links" data-tour="share-links">
      <h2 id="share-links" className="display text-xl">Share a <em>read-only</em> link</h2>
      <p className="mt-1 text-sm text-muted">
        For parents or your venue: they see this summary, kept up to date, without an account. Never your emails, guests' names or vendors' contacts.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid min-w-[14rem] flex-1 gap-1 text-sm">
          <span className="label">Who is it for?</span>
          <input className="input" value={label} maxLength={60} placeholder="Mum and Dad" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void make()} />
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={withMoney} onChange={(e) => setWithMoney(e.target.checked)} /> Include money
        </label>
        <button type="button" className="btn-primary btn-sm mb-1" onClick={() => void make()}>Make a link</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}

      {links && links.length > 0 && (
        <ul className="mt-5 grid gap-2">
          {links.map((l) => (
            <li key={l._id} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-cream px-4 py-2.5 ring-1 ring-line">
              <div className="min-w-0">
                <p className="text-sm font-medium">{l.label}</p>
                <p className="text-xs text-muted">
                  {l.showMoney ? "With money" : "Without money"} · made {new Date(l._creationTime).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </p>
              </div>
              {confirming === l._id ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">It stops working at once.</span>
                  <button type="button" className="btn-quiet btn-sm" onClick={() => setConfirming(null)}>Keep it</button>
                  <button type="button" className="btn-primary btn-sm" onClick={() => void revoke({ linkId: l._id }).then(() => setConfirming(null), (e) => setError(say(e)))}>Turn it off</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <a href={`/p/${l.token}`} target="_blank" rel="noreferrer" className="btn-quiet btn-sm">Open</a>
                  <button type="button" className="btn-quiet btn-sm" onClick={() => copy(l.token)}>{copied === l.token ? "Copied" : "Copy the link"}</button>
                  <button type="button" className="btn-quiet btn-sm" onClick={() => setConfirming(l._id)}>Turn off</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
