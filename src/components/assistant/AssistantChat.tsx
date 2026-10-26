import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Icon } from "../ui/Icon";
import { usePrivacy } from "../../lib/privacy";
import { ProposalCard } from "./ProposalCard";
import { AssistantNotes } from "./AssistantNotes";

type Ceremony = NonNullable<FunctionReturnType<typeof api.events.get>>["sessions"][number];

const OPENERS = [
  "What should we book next?",
  "How much of our budget is left?",
  "Find us a decorator",
  "Add Priya and Ravi to the list",
  "Remember: no onion or garlic in the lunch",
];

/**
 * The conversation with the assistant: on its own page, and in the drawer on every
 * other page, where `context` says what the host is looking at.
 */
export function AssistantChat({
  eventId,
  canEdit,
  sessions,
  currency,
  context,
  openers = OPENERS,
  compact = false,
}: {
  eventId: Id<"events">;
  canEdit: boolean;
  sessions: Ceremony[];
  currency: string;
  context?: string;
  openers?: string[];
  compact?: boolean;
}) {
  const privacy = usePrivacy();
  const history = useQuery(api.assistant.history, { eventId });
  const ask = useMutation(api.assistant.ask);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history?.length, history?.[history.length - 1]?.status]);

  async function send(question: string) {
    const q = question.trim();
    if (!q) return;
    setText("");
    setError(null);
    try {
      await ask({ eventId, content: q, ...(context ? { context } : {}) });
    } catch (e) {
      setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't send.");
    }
  }

  const empty = history !== undefined && history.length === 0;

  return (
    <div className="flex min-h-0 flex-col" data-ph-mask>
      {empty && (
        <div className={compact ? "px-1 py-3 text-center" : "card px-6 py-7 text-center"}>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
            <Icon name="heart" size={22} />
          </span>
          <h2 className="mt-3 display text-[1.35rem]">Ask anything about your event</h2>
          <p className="mx-auto mt-2 max-w-[28rem] text-sm leading-relaxed text-muted">
            It answers from your own plan, what is booked, what is left, what you have spent, and it can offer to add
            guests, add a day, move money, search for vendors or write to one. Nothing happens until you press the
            button on the card, and you can change the words first.
          </p>
          <ul className="mt-5 flex flex-wrap justify-center gap-2">
            {openers.map((o) => (
              <li key={o}>
                <button
                  className="rounded-full bg-cream px-3.5 py-1.5 text-sm text-muted shadow-[inset_0_0_0_1px_var(--color-line)] transition hover:bg-accent-soft hover:text-accent"
                  onClick={() => void send(o)}
                  disabled={!canEdit}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <ul className="grid gap-3">
          {history.map((m) => (
            <li
              key={m._id}
              className={
                m.role === "user"
                  ? "max-w-[85%] self-end justify-self-end rounded-[16px] rounded-br-[4px] bg-accent px-4 py-3 text-paper"
                  : "max-w-[92%] self-start rounded-[16px] rounded-bl-[4px] border border-line bg-cream px-4 py-3"
              }
            >
              {m.status === "thinking" ? (
                <span className="flex items-center gap-2 text-sm text-quiet">
                  <span className="inline-flex gap-1" aria-hidden="true">
                    <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
                    <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
                  </span>
                  Thinking about your plan…
                </span>
              ) : (
                <p className={`whitespace-pre-wrap text-[0.95rem] leading-relaxed ${m.role === "user" ? "" : "text-ink"}`}>
                  {privacy.text(m.content)}
                </p>
              )}

              {/* What it offers to do. Nothing happens until the host presses. */}
              {m.toolCalls?.map((t, i) =>
                t.name === "propose" ? (
                  <ProposalCard key={i} eventId={eventId} replyId={m._id} index={i} call={t} canEdit={canEdit} sessions={sessions} currency={currency} />
                ) : (
                  // Older replies, from when it acted without asking.
                  <p key={i} className="mt-2 flex items-center gap-1.5 text-xs text-accent">
                    <Icon name={t.name === "research" ? "search" : "plus"} size={13} />
                    {t.status === "done"
                      ? t.name === "research"
                        ? `Started a search for ${String((t.args as { need?: string })?.need ?? "that")}`
                        : `Added ${String((t.args as { title?: string })?.title ?? "a need")} to your vendors`
                      : "Couldn't do that one. Try the Vendors screen."}
                  </p>
                ),
              )}
            </li>
          ))}
          <div ref={endRef} />
        </ul>
      )}

      {!compact && <AssistantNotes eventId={eventId} canEdit={canEdit} />}

      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}

      {canEdit && (
        <form
          className={`${compact ? "sticky bottom-0 bg-paper pb-1 pt-3" : "sticky bottom-4 mt-5"} flex gap-2`}
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={context ? `Ask about ${context}, or anything else` : "Ask about your plan, or tell it what to find"}
            aria-label="Ask the assistant"
          />
          <button className="btn-primary shrink-0" disabled={!text.trim()}>
            <Icon name="send" size={16} />
            <span className="sr-only">Send</span>
          </button>
        </form>
      )}
    </div>
  );
}
