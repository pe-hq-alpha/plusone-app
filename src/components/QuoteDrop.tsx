import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const READABLE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;

function message(e: unknown): string {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  return e instanceof Error ? e.message.replace(/^.*ConvexError: /, "") : "That didn't go. Try again.";
}

/**
 * A quote that came on WhatsApp, dropped on the event as it is: the message pasted, or a
 * screenshot dropped, pasted or picked. PlusOne works out who sent it and which need it is
 * for, adds the vendor (and the need) when they're new, and reads it into Compare.
 */
export function QuoteDrop({ eventId }: { eventId: Id<"events"> }) {
  const uploadUrl = useMutation(api.quoteDrops.generateUploadUrl);
  const drop = useMutation(api.quoteDrops.drop);
  const recent = useQuery(api.quoteDrops.recent, { eventId });
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const take = (f: File | undefined | null) => {
    if (!f) return;
    if (!READABLE.test(f.type)) return setError("Add a screenshot or photo (JPEG, PNG or WebP) or a PDF.");
    if (f.size > 10 * 1024 * 1024) return setError("That file is over 10 MB.");
    setError(null);
    setFile(f);
  };

  async function send() {
    if (!text.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      let storageId: Id<"_storage"> | undefined;
      if (file) {
        const res = await fetch(await uploadUrl({ eventId }), { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!res.ok) throw new Error("That upload didn't go. Try again.");
        storageId = ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
      }
      await drop({ eventId, text: text.trim() || undefined, storageId, filename: file?.name, contentType: file?.type || undefined });
      setText("");
      setFile(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="quote-drop-h" className="today__panel">
      <h2 id="quote-drop-h" className="text-sm font-medium text-ink">Got a quote on WhatsApp?</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Paste their message or drop a screenshot. It&rsquo;s filed under the right need, with the vendor added if they&rsquo;re new, and read into Compare.
      </p>
      <div
        className={`quote-drop mt-3${over ? " quote-drop--over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
      >
        <label htmlFor="quote-drop-text" className="sr-only">Their message</label>
        <textarea
          id="quote-drop-text"
          className="input min-h-[4.5rem] resize-y"
          placeholder="Paste their message, or drop a screenshot here"
          value={text}
          maxLength={20_000}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const f = [...e.clipboardData.files].find((x) => READABLE.test(x.type));
            if (f) {
              e.preventDefault();
              take(f);
            }
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {file ? (
            <span className="quote-drop__file">
              {file.name}
              <button type="button" className="ml-2 text-quiet hover:text-ink" onClick={() => setFile(null)} aria-label="Remove the screenshot">
                ×
              </button>
            </span>
          ) : (
            <button type="button" className="btn-quiet btn-sm" disabled={busy} onClick={() => pick.current?.click()}>
              Add a screenshot
            </button>
          )}
          <input
            ref={pick}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn-primary btn-sm ml-auto" disabled={busy || (!text.trim() && !file)} onClick={() => void send()}>
            {busy ? "Sending…" : "Add the quote"}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {recent && recent.length > 0 && (
        <ul className="mt-3 grid gap-1.5 text-sm" aria-live="polite">
          {recent.map((d) => (
            <li key={d._id} className="text-muted">
              {d.status === "reading" ? (
                <span>Reading a quote…</span>
              ) : d.status === "failed" ? (
                <span className="text-bad">{d.error}</span>
              ) : (
                <span>
                  <span className="text-ink">{d.vendorName}</span>&rsquo;s quote filed under{" "}
                  {d.slotId ? (
                    <Link to={`vendors/${d.slotId}`} className="text-accent underline-offset-4 hover:underline">
                      {d.slotTitle}
                    </Link>
                  ) : (
                    d.slotTitle
                  )}
                  {d.newNeed ? " (a new need)" : ""}. It shows in{" "}
                  <Link to="decisions" className="text-accent underline-offset-4 hover:underline">Compare</Link> once read.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
