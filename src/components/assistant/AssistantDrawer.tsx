import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BRAND } from "../../lib/brand";
import { Icon } from "../ui/Icon";
import { AssistantChat } from "./AssistantChat";

type Ceremony = NonNullable<FunctionReturnType<typeof api.events.get>>["sessions"][number];

const PAGES: Record<string, { context: string; openers: string[] }> = {
  plan: { context: "the plan", openers: ["What should we do next?", "What's still not booked?", "How are we doing on budget?"] },
  tasks: { context: "the to-do list", openers: ["What's most urgent?", "What's due this month?"] },
  budget: { context: "the budget", openers: ["How much is left?", "Where are we over?", "Move some money from flowers to photos"] },
  spaces: { context: "the event's Spaces", openers: ["What colours run through our Spaces?", "Which Space still feels thin?"] },
  vendors: { context: "the vendors page", openers: ["What should we book next?", "Find us a decorator"] },
  decisions: { context: "the quotes to decide on", openers: ["Which photographer is the best value?", "What's included in each quote?"] },
  inbox: { context: "the inbox", openers: ["Who hasn't replied yet?", "What does the caterer need from us?"] },
  guests: { context: "the list of people invited", openers: ["How many are coming?", "Any allergies we should know about?"] },
  members: { context: "who's planning with us", openers: ["Who can change the plan?"] },
};

/** What the host is looking at, in words the assistant reads. */
export function pageContext(pathname: string, sessions: Ceremony[]): { context: string; openers: string[] } | null {
  const rest = pathname.replace(/^\/e\/[^/]+\/?/, "");
  const [section, id] = rest.split("/");
  // The Assistant page is the conversation itself.
  if (section === "assistant") return null;
  if (!section) return { context: "the Overview page", openers: ["What should we do next?", "What's still not booked?", "Find us a caterer"] };
  if (section === "sessions" && id) {
    const c = sessions.find((e) => e._id === id);
    if (c) return { context: `the ${c.name}`, openers: [`What's left to do for the ${c.name}?`, `How's the ${c.name} budget?`] };
  }
  return PAGES[section ?? ""] ?? { context: "their plan", openers: ["What should we book next?"] };
}

/** Fired by any "Ask" button outside the drawer (the top bar's) to open it. */
export const ASK_EVENT = "plusone:ask";

/**
 * The assistant on every page: on a laptop the solid Ask in the top bar opens it (always in
 * view, never over the page); on a phone, a labelled button in the corner. Either opens it beside
 * whatever the host is looking at, and their questions carry that page with them.
 */
export function AssistantDrawer({ eventId, canEdit, sessions, currency }: { eventId: Id<"events">; canEdit: boolean; sessions: Ceremony[]; currency: string }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const here = pageContext(pathname, sessions);
  // On a phone the board's own toolbar sits where this button would.
  const onBoard = /\/spaces(\/|$)/.test(pathname);

  // The top bar's Ask button opens the same drawer.
  useEffect(() => {
    const onAsk = () => setOpen(true);
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // On a phone the button steps aside while the page scrolls down, so it never sits on what's being read.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let idle: number | undefined;
    const onScroll = () => {
      const y = window.scrollY;
      setTucked(y > last && y > 80);
      last = y;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setTucked(false), 900);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(idle);
    };
  }, []);

  if (!here) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          data-tour="ask"
          aria-label={`Ask ${BRAND.name}`}
          onClick={() => setOpen(true)}
          className={`no-print fixed bottom-[78px] right-3 z-40 md:hidden ${onBoard ? "max-md:hidden" : ""} ${tucked ? "max-md:pointer-events-none max-md:translate-y-4 max-md:opacity-0" : ""} flex items-center gap-2 rounded-full bg-accent py-3 pl-4 pr-5 text-[0.95rem] font-medium text-paper shadow-[0_16px_34px_-14px_rgb(var(--shadow-rgb)/0.6)] ring-4 ring-accent/15 transition duration-200 hover:-translate-y-0.5 hover:bg-accent-deep`}
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <Icon name="heart" size={17} /> <span>Ask {BRAND.name}</span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={() => setOpen(false)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Assistant"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full flex-col bg-paper shadow-[-20px_0_60px_-30px_rgb(var(--shadow-rgb)/0.5)] sm:w-[27rem]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="display text-lg">Assistant</p>
                <p className="truncate text-xs text-quiet">Looking at {here.context}</p>
              </div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close the assistant" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-accent-soft hover:text-accent">
                <Icon name="close" size={16} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
              <AssistantChat eventId={eventId} canEdit={canEdit} sessions={sessions} currency={currency} context={here.context} openers={here.openers} compact />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
