import { useEffect } from "react";
import { useQuery } from "convex/react";
import { X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BRAND } from "../lib/brand";

/** Each step in plain words, by the feature name the cost record keeps. */
const STEP: Record<string, string> = {
  planningChat: "Read your message in the planning conversation",
  draftFirstPlan: "Set out the first plan",
  summariseStyle: "Summed up the style you like",
  planSearch: "Planned the vendor search",
  buildCards: "Read vendors' own websites into cards",
  rankVendors: "Ranked the vendors found",
  draftInquiries: "Wrote the first emails to vendors",
  draftFollowUp: "Wrote a follow-up to a quiet vendor",
  readVendorReply: "Read a vendor's reply into a quote",
  decideVendorReply: "Decided what a vendor's reply needs",
  writeVendorReply: "Answered a vendor's question",
  writeAgentEmail: "Wrote an email to a vendor",
  readRsvp: "Read a guest's RSVP",
  answerQuestion: "Answered you, and offered the changes",
  checkContract: "Checked a contract",
  guestImport: "Read a guest list",
  suggestPalette: "Suggested palettes from your pictures",
};

/** A model id as people would say it. */
function modelName(model: string, provider: "meta" | "claude"): string {
  const spark = model.match(/^muse-spark-(\d+(?:\.\d+)?)/);
  if (spark) return `Meta Muse Spark ${spark[1]}`;
  if (model.startsWith("muse-wonder")) return "Meta Muse Wonder";
  if (provider === "meta") return `Meta ${model}`;
  return "Claude (backup)";
}

const seconds = (ms?: number) => (ms === undefined ? "" : `${(ms / 1000).toFixed(1)} s`);
const dollars = (usd?: number) => (usd === undefined ? "" : usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`);
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * "Under the hood": every step PlusOne ran for this event, with the model that did it, how
 * long it took and what it cost, read from the cost record. Opened on purpose from the top
 * bar, so the rest of the app keeps describing outcomes rather than models.
 */
export function UnderTheHood({ eventId, onClose }: { eventId: Id<"events">; onClose: () => void }) {
  const calls = useQuery(api.modelCalls.forEvent, { eventId });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = (calls ?? []).reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end bg-ink/25" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="hood-title"
        className="flex h-full w-full max-w-[26rem] flex-col border-l border-line bg-paper shadow-(--shadow-card)"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="hood-title" className="display text-xl">Under the hood</h2>
            <p className="mt-1 text-xs text-muted">
              Every step {BRAND.name} ran for this event: the Meta model that did it, how long it took and what it cost.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shell-tool">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {calls === undefined ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : calls.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing yet. Ask {BRAND.name} something on Today, such as &ldquo;We&rsquo;re now 140 people&rdquo;, and the step shows up here.
            </p>
          ) : (
            <ol className="grid gap-2.5">
              {calls.map((c) => (
                <li key={c._id} className="card-quiet px-3.5 py-3">
                  <p className="text-sm">{STEP[c.feature] ?? c.feature}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className={c.provider === "meta" ? "chip-pending" : "chip-quiet"}>{modelName(c.model, c.provider)}</span>
                    {c.fellBack && <span className="chip-warn">Meta was busy; the backup answered</span>}
                    <span className="tabular-nums">{seconds(c.durationMs)}</span>
                    <span className="tabular-nums">
                      {c.inputTokens.toLocaleString()} in · {c.outputTokens.toLocaleString()} out
                    </span>
                    <span className="tabular-nums">{dollars(c.costUsd)}</span>
                    <span className="ml-auto tabular-nums text-quiet">{clock(c.at)}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {calls && calls.length > 0 && (
          <footer className="border-t border-line px-5 py-3 text-xs text-muted">
            {calls.length} {calls.length === 1 ? "step" : "steps"} shown · <span className="tabular-nums">{dollars(total)}</span> in all, at list price
          </footer>
        )}
      </aside>
    </div>
  );
}
