import { Suspense, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { NavLink, Outlet, useParams, Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { longDate } from "../lib/format";
import { CalendarDays, Compass, Cpu, LifeBuoy, Store, Users, type LucideIcon } from "lucide-react";
import type { EventType } from "../../convex/lib/validators";
import { Icon } from "./ui/Icon";
import { AccountMenu } from "./AccountMenu";
import { Walkthrough, shouldOfferWalkthrough } from "./Walkthrough";
import { PlusOneLockup } from "./brand/Wordmarks";
import { PlanReady } from "./PlanReady";
import { FeedbackBox } from "./FeedbackBox";
import { ASK_EVENT, AssistantDrawer } from "./assistant/AssistantDrawer";
import { BRAND } from "../lib/brand";
import { PartWord, PeopleWord } from "../lib/words";
import { Backdrop } from "./ui/Backdrop";
import { UnderTheHood } from "./UnderTheHood";
import { hoodSeen, markHoodSeen, onOpenHood } from "../lib/hood";

/** The sample events, by kind, for the demo banner's links. */
const SAMPLES = [
  { sample: "birthday", type: "birthday", label: "a 60th birthday" },
  { sample: "housewarming", type: "housewarming", label: "a griha pravesam" },
  { sample: "office", type: "office_party", label: "an office party" },
] as const;

type Lane = "today" | "plan" | "vendors" | "people";
type Stop = { to: string; label: string; end?: boolean; tour?: string };

/**
 * The plan in four lanes, each a short route of pages. The top bar names the lanes;
 * the lane you are in shows its pages as stops along a line, the way the co-pilot's
 * own status reads, so moving around the plan feels like moving along it.
 */
function lanesFor(event: { eventType?: EventType }): { key: Lane; label: string; icon: LucideIcon; home: string; tour?: string; stops: Stop[] }[] {
  return [
    { key: "today", label: "Today", icon: Compass, home: "", stops: [] },
    {
      key: "plan",
      label: "Plan",
      icon: CalendarDays,
      home: "plan",
      stops: [
        { to: "plan", label: PartWord(event, true) },
        { to: "tasks", label: "To-dos" },
        { to: "budget", label: "Budget" },
        { to: "spaces", label: "Spaces" },
      ],
    },
    {
      key: "vendors",
      label: "Vendors",
      icon: Store,
      home: "vendors",
      tour: "nav-vendors",
      stops: [
        { to: "vendors", label: "Find" },
        { to: "decisions", label: "Compare", tour: "nav-decisions" },
        { to: "inbox", label: "Inbox", tour: "nav-inbox" },
      ],
    },
    {
      key: "people",
      label: "People",
      icon: Users,
      home: "guests",
      stops: [
        { to: "guests", label: PeopleWord(event) },
        { to: "gifts", label: "Gifts" },
        { to: "website", label: "Event page" },
        { to: "members", label: "Planning team" },
      ],
    },
  ];
}

/** Which lane a page belongs to, from the first part of its path; null for the odd jobs. */
function laneOf(section: string): Lane | null {
  if (section === "") return "today";
  if (["plan", "sessions", "tasks", "budget", "spaces", "board"].includes(section)) return "plan";
  if (["vendors", "decisions", "inbox"].includes(section)) return "vendors";
  if (["guests", "gifts", "website", "members"].includes(section)) return "people";
  return null;
}

export function EventLayout() {
  const { eventId } = useParams<{ eventId: string }>();
  const data = useQuery(api.events.get, eventId ? { eventId: eventId as Id<"events"> } : "skip");
  const [walking, setWalking] = useState(false);
  const [hood, setHoodOpen] = useState(false);
  const [hoodNew, setHoodNew] = useState(() => !hoodSeen());
  const setHood = (open: boolean) => {
    setHoodOpen(open);
    if (open) {
      markHoodSeen();
      setHoodNew(false);
    }
  };
  // A page can point a judge at the panel ("See the Meta models behind this").
  useEffect(() => onOpenHood(() => setHood(true)), []);
  const [feedback, setFeedback] = useState(false);
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  /** Straight from onboarding: the plan is being finished, and then revealed. */
  const welcoming = params.get("welcome") === "1";
  // Only asked once the event has loaded, so a non-member never hits the member check.
  const waiting =
    useQuery(api.threads.attentionCount, data ? { eventId: data.event._id as Id<"events"> } : "skip") ?? 0;

  // A new page of the plan opens at its top; moving within one (a thread, a need) keeps the place.
  const page = pathname.split("/")[3] ?? "";
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  // The tab says so too, so a reply is noticed from another tab.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = waiting > 0 ? `(${waiting}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [waiting]);

  // Shown once, and only once the event is actually on screen: a tour that points at
  // empty space explains nothing. Never on its own in a sample event: someone trying the
  // demo wants to look around first, and "Show me around" is one click away.
  useEffect(() => {
    if (!data || welcoming || data.event.demo || !shouldOfferWalkthrough()) return;
    const t = setTimeout(() => setWalking(true), 900);
    return () => clearTimeout(t);
  }, [data, welcoming]);

  if (data === undefined) {
    return <div className="grid min-h-screen place-items-center text-muted">Loading your event…</div>;
  }
  if (data === null) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="display text-xl">You don't have access to this event.</p>
          <Link to="/" className="btn-ghost mt-5">Back to my events</Link>
        </div>
      </div>
    );
  }
  const { event, role } = data;
  if (welcoming) {
    return <PlanReady event={event} sessions={data.sessions} onDone={() => setParams({}, { replace: true })} />;
  }

  const lanes = lanesFor(event);
  const current = lanes.find((l) => l.key === laneOf(page));
  const inboxBadge = waiting > 0 && (
    <span
      className="grid h-[1.15rem] min-w-[1.15rem] place-items-center rounded-full bg-highlight px-1 text-[0.7rem] font-semibold tabular-nums text-on-highlight"
      aria-label={`${waiting} ${waiting === 1 ? "conversation needs" : "conversations need"} you`}
    >
      {waiting}
    </span>
  );

  return (
    <div className="isolate min-h-screen pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0 print:pb-0">
      <Backdrop quiet />
      <header className="shell-bar no-print sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 md:gap-5 md:px-6">
          <Link to="/" className="shrink-0 text-[1.3rem]" aria-label={`${BRAND.name}: all your events`}>
            <PlusOneLockup />
          </Link>
          <span className="hidden h-6 w-px shrink-0 bg-line sm:block" aria-hidden="true" />
          <Link to="" className="min-w-0 flex-1 lg:flex-none" title="Today">
            <span className="display block truncate text-[1.08rem] leading-tight text-ink">{event.name}</span>
            <span className="hidden truncate text-[0.72rem] text-quiet sm:block">
              {longDate(event.startDate)} · {event.city}
            </span>
          </Link>

          <nav aria-label="Plan sections" className="ml-auto hidden h-full items-stretch md:flex">
            {lanes.map((l) => (
              <NavLink
                key={l.key}
                to={l.home}
                end={l.key === "today"}
                data-tour={l.tour}
                className={`shell-lane ${current?.key === l.key ? "is-here" : ""}`}
              >
                {l.label}
                {l.key === "vendors" && inboxBadge}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-2">
            {/* The assistant, where people look first; the corner button opens the same drawer. */}
            <button type="button" onClick={() => window.dispatchEvent(new Event(ASK_EVENT))} className="shell-ask max-md:!hidden" data-tour="ask-top">
              <Icon name="heart" size={15} /> Ask
            </button>
            {/* Anyone new, signed up or in the demo, should be able to find the tour at once. */}
            <button type="button" onClick={() => setWalking(true)} title="A quick tour of the whole plan" aria-label="Show me around" className="shell-tool">
              <Icon name="star" size={17} />
            </button>
            <button type="button" onClick={() => setHood(true)} title="Under the hood: which model ran each step" aria-label="Under the hood" className="shell-tool relative">
              <Cpu size={17} strokeWidth={1.5} aria-hidden="true" />
              {/* On the demo, a dot until it has been opened once, so a judge finds it. */}
              {data?.event.demo && hoodNew && (
                <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-accent" />
              )}
            </button>
            <Link to="help" title="Help" aria-label="Help" className="shell-tool max-sm:!hidden">
              <LifeBuoy size={17} strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <Link to="settings" title="Settings" aria-label="Settings" data-tour="nav-settings" className="shell-tool max-sm:!hidden">
              <Icon name="settings" size={17} />
            </Link>
            <AccountMenu role={role} inEvent />
          </div>
        </div>

        {current && current.stops.length > 0 && (
          <nav aria-label={`${current.label} pages`} className="border-t border-line">
            <ol className="shell-route mx-auto max-w-[1240px] px-4 md:px-6">
              {current.stops.map((st) => (
                <li key={st.to}>
                  <NavLink to={st.to} end={st.end} data-tour={st.tour} className="shell-stop">
                    <span className="shell-node" aria-hidden="true" />
                    {st.label}
                    {st.to === "inbox" && inboxBadge}
                  </NavLink>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </header>

      {event.demo && (
        <div className="no-print border-b border-line bg-wash">
          <div className="demo-banner mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 text-sm md:px-6">
            <p className="min-w-0 text-muted">
              <span className="font-medium text-ink">A sample plan.</span> Click anything; the vendors are made up, so emails to them are simulated.{" "}
              <span>
                Judging?{" "}
                <button type="button" onClick={() => setHood(true)} className="text-accent underline-offset-4 hover:underline">
                  Under the hood
                </button>
                , the chip icon at the top, shows the Meta model behind every step.{" "}
              </span>
              <span className="hidden lg:inline">
                Or open{" "}
                {SAMPLES.filter((x) => x.type !== event.eventType).map((x, i) => (
                  <span key={x.sample}>
                    {i > 0 && " or "}
                    {/* Each sample is a fresh copy, so a full load. */}
                    <a href={`/demo?sample=${x.sample}`} className="text-accent underline-offset-4 hover:underline">{x.label}</a>
                  </span>
                ))}
                .
              </span>
            </p>
            <Link to="/new" className="btn-primary btn-sm shrink-0" data-tour="plan-own">Plan your own</Link>
          </div>
        </div>
      )}

      <main id="main" className="mx-auto min-w-0 max-w-[1240px] px-4 pb-16 pt-6 md:px-6 md:pb-10 md:pt-8">
        <div className="page">
          <Suspense fallback={<p className="py-16 text-center text-sm text-muted">Loading…</p>}>
            <Outlet context={data} />
          </Suspense>
        </div>
        <footer className="no-print page mt-16 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-xs text-quiet">
          <Link to="assistant" className="hover:text-accent">Assistant</Link>
          <Link to="history" className="hover:text-accent">History</Link>
          <Link to="print" className="hover:text-accent">Print</Link>
          <button type="button" onClick={() => setFeedback(true)} className="hover:text-accent">Share feedback</button>
        </footer>
        <Preload eventId={event._id as Id<"events">} />
        <AssistantDrawer eventId={event._id as Id<"events">} canEdit={role !== "viewer"} sessions={data.sessions} currency={event.currency} />
      </main>

      {/* On a phone the lanes sit under the thumb. */}
      <nav aria-label="Plan sections" className="shell-dock no-print">
        {lanes.map((l) => (
          <NavLink key={l.key} to={l.home} end={l.key === "today"} className={`shell-dock__lane ${current?.key === l.key ? "is-here" : ""}`}>
            <span className="relative">
              <l.icon size={20} strokeWidth={1.5} aria-hidden="true" />
              {l.key === "vendors" && waiting > 0 && <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-highlight" aria-hidden="true" />}
            </span>
            {l.label}
          </NavLink>
        ))}
      </nav>

      {walking && <Walkthrough base={`/e/${event._id}`} eventType={event.eventType} onClose={() => setWalking(false)} />}
      {hood && <UnderTheHood eventId={event._id} onClose={() => setHood(false)} />}
      {feedback && <FeedbackBox eventId={event._id as Id<"events">} onClose={() => setFeedback(false)} />}
    </div>
  );
}


/**
 * Warm the next page before it is opened. A moment after an event loads, this fetches
 * every page's code and subscribes to the lists those pages read, so moving around the
 * plan shows data straight away instead of waiting on a round trip to the backend.
 * Every one of these lists is open to any member, so it is safe for viewers too.
 */
function Preload({ eventId }: { eventId: Id<"events"> }) {
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setWarm(true);
      for (const load of [
        () => import("../pages/TodayPage"), () => import("../pages/PlanPage"), () => import("../pages/CeremonyPage"), () => import("../pages/TasksPage"),
        () => import("../pages/BudgetPage"), () => import("../pages/VendorsPage"), () => import("../pages/DecisionsPage"),
        () => import("../pages/InboxPage"), () => import("../pages/GuestsPage"), () => import("../pages/AssistantPage"),
        () => import("../pages/MembersPage"), () => import("../pages/SettingsPage"), () => import("../pages/HistoryPage"), () => import("../pages/SpacesPage"), () => import("../pages/WebsitePage"), () => import("../pages/GiftsPage"),
      ]) void load().catch(() => {});
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);
  const args = warm ? { eventId } : "skip";
  useQuery(api.budget.summary, args);
  useQuery(api.slots.list, args);
  useQuery(api.spaces.list, args);
  useQuery(api.tasks.list, args);
  useQuery(api.dashboard.board, args);
  useQuery(api.threads.list, args);
  useQuery(api.guests.list, args);
  useQuery(api.gifts.list, args);
  useQuery(api.members.list, args);
  return null;
}
