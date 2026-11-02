import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./ui/Icon";
import { BRAND } from "../lib/brand";
import type { EventType } from "../../convex/lib/validators";
import { partWord, peopleWord } from "../../convex/lib/occasion";

/**
 * A tour of the real app, page by page, shown once after someone's first event is
 * built and again from "Show me around".
 *
 * It deliberately does not describe the product in prose. Each step goes to a page and
 * points at an element that is actually there, found by its `data-tour` name, so it
 * cannot drift out of date the way the old landing-page slideshow did. A step whose
 * element never appears (a viewer can't research, say) is skipped rather than shown
 * against nothing.
 */
type Step = {
  /** The page, relative to the event: "" is the overview. */
  path: string;
  /** A link on that page to open first, by its `data-tour` name. */
  open?: string;
  target: string;
  title: string;
  body: string;
  place?: "right" | "bottom";
};

/** The words a step needs: "functions" or "sessions", "guests" or "attendees". */
type Words = { part: string; parts: string; people: string };

/**
 * Written against the birthday demo (a morning pooja and a lunch for 120, three
 * caterers quoting in three shapes) but true of any event, since every step points at
 * the real screen.
 */
const stepsFor = ({ part, people }: Words): Step[] => [
  {
    path: "",
    target: "this-week",
    title: "Where things stand",
    body: `What ${BRAND.name} has done, what it is doing now, what is waiting on you and what comes next. It moves as the plan does.`,
    place: "bottom",
  },
  {
    path: "plan",
    target: "budget",
    title: "Everything adds up, always",
    body: "Your days, the vendors they need and this total are one sum. Change any of them and the rest follow, so this number is never a guess.",
    place: "bottom",
  },
  {
    path: "plan",
    target: "days",
    title: "The day, part by part",
    body: "Each day, its parts in time order: where and when, who comes, what is set aside and every vendor it needs. Change a time, move a part to another day, or add a vendor right on its card.",
    place: "bottom",
  },
  {
    path: "plan",
    open: "days",
    target: "ceremony",
    title: `Inside a ${part}`,
    body: `Its time and place, ${people} and budget, its Space and the vendors it needs.`,
    place: "bottom",
  },
  {
    path: "",
    target: "notes",
    title: "Notes to self",
    body: "A sticky note for anything you don't want to forget. Jot it down, tick it off when it's done.",
    place: "bottom",
  },
  {
    path: "spaces",
    target: "space-palette",
    title: "One open board for the look of it",
    body: `Every ${part} has a zone on the board. Drop in photos, links from Instagram or Pinterest, notes, colours and the vendors you like, and drag them where they belong. Once a zone has pictures it can suggest a palette, and the one you keep becomes that ${part}'s colours.`,
    place: "bottom",
  },
  {
    path: "vendors",
    open: "slot-to-explore",
    target: "vendor-research",
    title: `Where ${BRAND.name} goes looking`,
    body: `Describe what you want in plain words. ${BRAND.name} reads real vendor websites and review pages, then ranks the best with the reason for each.`,
    place: "bottom",
  },
  {
    path: "vendors",
    target: "vendor-filters",
    title: "Narrow it down",
    body: "Keep only the ones within budget, the halls that fit everyone, the best rated or one neighbourhood, and sort by price.",
    place: "bottom",
  },
  {
    path: "inbox",
    target: "nav-inbox",
    title: "Every reply, read for you",
    body: "Vendors are emailed from the event's own address, chased if they go quiet, and each reply is read into a quote. It goes into your budget by itself, with an undo, unless something looks off, and then it waits for you.",
    place: "right",
  },
  {
    path: "decisions",
    target: "decision",
    title: "Then you just choose",
    body: "One caterer prices per plate, another per head with extras, a third as a package. Here they are in the same units, with what each leaves out, side by side. Book or pass without opening an inbox.",
    place: "bottom",
  },
  {
    path: "budget",
    target: "whats-due",
    title: "What's due, and when",
    body: "Advances and balances from every booking, and the deadlines vendors set. Tick them off as you pay, and send them to your calendar.",
    place: "bottom",
  },
  {
    path: "guests",
    target: "rsvp-link",
    title: `An RSVP link for each of your ${people}`,
    body: `Everyone answers for each ${part} they're invited to, with numbers and food needs, and it lands here. Caterers who ask get the allergies and numbers, never the names. A list you already have comes in from a spreadsheet, a PDF or a paste.`,
    place: "bottom",
  },
  {
    path: "website",
    target: "website-status",
    title: `A page for your ${people}`,
    body: "Written from your plan: what's happening and when, what to wear, travel and how to RSVP. Nothing is public until you publish it.",
    place: "bottom",
  },
  {
    path: "members",
    target: "invite",
    title: "Plan together",
    body: "Invite family, friends or colleagues as planners who can change things, or viewers who can only look. Every change is kept in History, with who made it and when.",
    place: "bottom",
  },
  {
    path: "print",
    target: "share-links",
    title: "For family and the venue",
    body: "Print the whole plan on one page, or send a read-only link that stays up to date. No account needed, and you can turn it off at any time.",
    place: "bottom",
  },
  {
    path: "print",
    // The top bar's Ask on a laptop, the floating button on a phone: whichever is on screen.
    target: "ask-top|ask",
    title: "Ask, from any page",
    body: "Questions are answered from your plan, starting with the page you're on. It can add a vendor or a guest for you once you say yes.",
    place: "bottom",
  },
  {
    path: "settings",
    target: "weekly-update",
    title: "Change your mind whenever",
    body: "Dates, budget, whether emails go by themselves or wait for you, and a short weekly update that skips the quiet weeks.",
    place: "bottom",
  },
  {
    path: "settings",
    target: "plan-own",
    title: "Ready to plan your own?",
    body: "Everything you've seen works the same for a birthday, a housewarming, an offsite or anything else. Talk it through, confirm what was understood, and the plan sets itself out.",
    place: "bottom",
  },
];

const SEEN_KEY = "plusone.walkthrough.seen";

/** Safe because a private window or blocked storage must not break the app. */
function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* nothing to do: the tour simply shows again next time */
  }
}

/** A step's element: the first of its "a|b" targets that is actually on screen. */
function tourTarget(target: string): HTMLElement | null {
  for (const t of target.split("|")) {
    const el = document.querySelector<HTMLElement>(`[data-tour="${t}"]`);
    if (el && el.getClientRects().length > 0) return el;
  }
  return null;
}

export function shouldOfferWalkthrough() {
  return !seen();
}

type Box = { top: number; left: number; width: number; height: number };

export function Walkthrough({ base, onClose, eventType }: { base: string; onClose: () => void; eventType?: EventType }) {
  const STEPS = useMemo(() => {
    const kind = { eventType };
    return stepsFor({ part: partWord(kind), parts: partWord(kind, true), people: peopleWord(kind) });
  }, [eventType]);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  /** The card shows once the ring has reached the step's element. */
  const [found, setFound] = useState(false);
  /** The ring glides between two places on the same page; anywhere else it fades out and back in. */
  const [glide, setGlide] = useState(false);
  const [ringOn, setRingOn] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 352, h: 210 });
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const forward = useRef(true);

  const step = STEPS[i];
  const go = (to: number) => {
    forward.current = to > i;
    // Hide the card in the same render as the step changes, so the next step's words never
    // show in the last step's place; leaving the page, the ring fades out at once too.
    setFound(false);
    if ((STEPS[to]?.path ?? "") !== (step?.path ?? "")) setRingOn(false);
    setI(to);
  };

  const rectOf = useCallback((): Box | null => {
    if (!step) return null;
    const el = tourTarget(step.target);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, [step]);

  // Following the page while someone scrolls or resizes: once a frame, and without the
  // glide, so the ring sits on its element instead of trailing behind it.
  const frame = useRef(0);
  const measure = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const next = rectOf();
      if (!next) return;
      setGlide(false);
      setBox(next);
    });
  }, [rectOf]);

  // Go to the step's page, open what it needs, wait for its element, bring it into view
  // at once, and only then move the ring: one deliberate move per step.
  useEffect(() => {
    if (!step) return;
    setFound(false);
    const page = step.path ? `${base}/${step.path}` : base;
    const here = step.path ? pathname.startsWith(page) : pathname === base || pathname === `${base}/`;
    if (!here) {
      setRingOn(false);
      navigate(page);
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let opened = false;
    let tries = 0;
    let raf = 0;
    let reveal: ReturnType<typeof setTimeout> | undefined;
    const settle = (el: Element, last: Box | null, still: number, frames: number) => {
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const now = { top: r.top, left: r.left, width: r.width, height: r.height };
        const same = last && Math.abs(now.top - last.top) < 0.5 && Math.abs(now.left - last.left) < 0.5 && Math.abs(now.width - last.width) < 0.5 && Math.abs(now.height - last.height) < 0.5;
        // Wait for two quiet frames (images loading, a panel opening), but not forever.
        if ((same ? still + 1 : 0) < 2 && frames < 40) return settle(el, now, same ? still + 1 : 0, frames + 1);
        setGlide(here && !reduced);
        setRingOn(true);
        setBox(now);
        reveal = setTimeout(() => setFound(true), here && !reduced ? 300 : 120);
      });
    };
    const timer = setInterval(() => {
      tries += 1;
      // Open the step's link before looking: the page may already show something else.
      if (step.open && !opened) {
        const link = document.querySelector<HTMLElement>(`[data-tour="${step.open}"]`);
        if (link) {
          opened = true;
          if (link.getAttribute("aria-current") !== "page") link.click();
          return;
        }
        if (tries < 25) return;
      }
      const el = tourTarget(step.target);
      if (el) {
        clearInterval(timer);
        const r = el.getBoundingClientRect();
        const margin = 96;
        if (r.top < margin || r.bottom > window.innerHeight - margin) el.scrollIntoView({ block: "center", behavior: "instant" });
        settle(el, null, 0, 0);
        return;
      }
      if (tries > 50) {
        // Not on this page for this person: move on in the direction they were going,
        // and end the tour if there is nowhere left to go.
        clearInterval(timer);
        if (forward.current && i === STEPS.length - 1) return finish();
        if (!forward.current && i === 0) forward.current = true;
        setI((x) => (forward.current ? Math.min(STEPS.length - 1, x + 1) : Math.max(0, x - 1)));
      }
    }, 80);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      clearTimeout(reveal);
    };
    // Only when the step changes: navigating inside it must not restart the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCardSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [i, box]);

  useEffect(() => {
    if (!found) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    // The element itself can change size too: a list filling in, a card opening.
    const el = step && tourTarget(step.target);
    const watch = el ? new ResizeObserver(measure) : undefined;
    if (el) watch?.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      watch?.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [measure, found, step]);

  const finish = useCallback(() => {
    markSeen();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" && i < STEPS.length - 1) go(i + 1);
      if (e.key === "ArrowLeft" && i > 0) go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish, i]);

  if (!step) return null;
  const last = i === STEPS.length - 1;

  // The card sits beside a sidebar item and beneath anything in the main column — but
  // never off the edge of the screen, which is where a tall target used to push it.
  const pad = 8;
  const gap = 14;
  const margin = 12;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const clamp = (v: number, max: number) => Math.max(margin, Math.min(v, max - margin));

  let top = 80;
  let left = 80;
  if (box) {
    if (step.place === "right") {
      left = box.left + box.width + 16;
      top = box.top - 6;
      // No room to the right (a narrow window, or the nav has wrapped): sit underneath.
      if (left + cardSize.w > vw - margin) {
        left = box.left;
        top = box.top + box.height + gap;
      }
    } else {
      left = box.left;
      top = box.top + box.height + gap;
      // Below the fold: put it above the target instead, and failing that, over it.
      if (top + cardSize.h > vh - margin) {
        const above = box.top - gap - cardSize.h;
        top = above >= margin ? above : Math.max(margin, vh - cardSize.h - margin);
      }
    }
  }
  const card: React.CSSProperties = { top: clamp(top, vh - cardSize.h), left: clamp(left, vw - cardSize.w) };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="walk-title">
      {/* The dimming is the ring's own huge spread shadow, so the element it points at
          stays bright. This layer only catches a click outside it. */}
      <button
        type="button"
        aria-label="Close the walkthrough"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={finish}
      />
      {/* Between pages, and before the first step lands, the page stays dimmed. */}
      {(!box || !ringOn) && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-scrim" />}
      {box && (
        <div
          aria-hidden="true"
          className="walk-ring pointer-events-none absolute left-0 top-0 rounded-[14px]"
          data-glide={glide ? "" : undefined}
          data-on={ringOn ? "" : undefined}
          style={{
            transform: `translate3d(${Math.round(box.left - pad)}px, ${Math.round(box.top - pad)}px, 0)`,
            width: Math.round(box.width + pad * 2),
            height: Math.round(box.height + pad * 2),
          }}
        />
      )}

      <div
        ref={cardRef}
        className="walk-card absolute w-[min(22rem,calc(100vw-1.5rem))] rounded-[16px] border border-line bg-cream p-5 shadow-[0_24px_60px_-20px_rgb(var(--shadow-rgb)/0.45)]"
        data-on={found ? "" : undefined}
        style={card}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-quiet">
            {i + 1} of {STEPS.length}
          </p>
          <button type="button" onClick={finish} aria-label="Close the walkthrough" className="-mr-1 -mt-1 text-quiet hover:text-accent">
            <Icon name="close" size={17} />
          </button>
        </div>
        <h2 id="walk-title" className="mt-1.5 display text-[1.25rem] leading-tight">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" className="text-sm text-quiet underline underline-offset-2 hover:text-accent" onClick={finish}>
            {last ? "" : "Skip"}
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" className="btn-quiet btn-sm" onClick={() => go(i - 1)}>
                Back
              </button>
            )}
            <button type="button" className="btn-primary btn-sm" onClick={() => (last ? finish() : go(i + 1))}>
              {last ? "Start planning" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
