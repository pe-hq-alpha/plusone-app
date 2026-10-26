import { useState } from "react";
import { useMutation } from "convex/react";
import { useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon } from "./ui/Icon";

const KINDS = [
  { value: "bug" as const, label: "Something's wrong" },
  { value: "idea" as const, label: "An idea" },
  { value: "general" as const, label: "Anything else" },
];

/** "Share feedback": a note straight to the team, from wherever they are. */
export function FeedbackBox({ eventId, onClose }: { eventId: Id<"events">; onClose: () => void }) {
  const send = useMutation(api.feedback.send);
  const { pathname } = useLocation();
  const [category, setCategory] = useState<(typeof KINDS)[number]["value"]>("idea");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-ink/25 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="feedback-h" onClick={onClose}>
      <div className="rise w-full max-w-md rounded-[22px] border border-line bg-cream p-6 shadow-[0_30px_70px_-28px_rgb(var(--shadow-rgb)/0.55)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="feedback-h" className="display text-xl">Share feedback</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-quiet hover:bg-accent-soft hover:text-accent">
            <Icon name="close" size={14} />
          </button>
        </div>
        {state === "sent" ? (
          <>
            <p className="mt-3 leading-relaxed text-muted">Thank you. It's with the team now, and it really does shape what we build next.</p>
            <button type="button" className="btn-primary mt-5" onClick={onClose}>Done</button>
          </>
        ) : (
          <form
            className="mt-4 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setState("sending");
              setError(null);
              send({ category, message, eventId, page: pathname.replace(/^\/e\/[^/]+/, "") || "/" })
                .then(() => setState("sent"))
                .catch((err) => { setError(err instanceof Error ? err.message.replace(/^.*ConvexError: /, "").split("\n")[0] : "That didn't send."); setState("idle"); });
            }}
          >
            <div className="flex flex-wrap gap-2" role="group" aria-label="What kind of note">
              {KINDS.map((k) => (
                <button key={k.value} type="button" aria-pressed={category === k.value} onClick={() => setCategory(k.value)} className={`rounded-full px-3.5 py-1.5 text-sm transition ${category === k.value ? "bg-accent text-paper" : "bg-paper text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"}`}>
                  {k.label}
                </button>
              ))}
            </div>
            <textarea autoFocus rows={5} className="input resize-y" value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Your note" placeholder="Tell us in your own words. What happened, or what would make planning easier?" />
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <button type="submit" className="btn-primary justify-self-start" disabled={!message.trim() || state === "sending"}>
              {state === "sending" ? "Sending…" : "Send to the team"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
