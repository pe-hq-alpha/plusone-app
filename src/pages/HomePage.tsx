import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { useAuthActions } from "../lib/session";
import { api } from "../../convex/_generated/api";
import { longDate, money } from "../lib/format";
import { Icon } from "../components/ui/Icon";
import { ThemeFooter } from "../components/ui/ThemeFooter";
import { UserChip } from "../components/ui/UserChip";
import { PlusOneLockup } from "../components/brand/Wordmarks";
import { BRAND } from "../lib/brand";
import { occasionNoun } from "../../convex/lib/occasion";
import { Backdrop } from "../components/ui/Backdrop";
import { eventCover } from "../lib/eventCover";

/** Each card is nudged a degree or two off square, like prints on a board. */
const TILTS = ["-2.5deg", "1.8deg", "-1.2deg", "2.4deg", "-1.9deg", "1.3deg"];

export function HomePage() {
  const mine = useQuery(api.events.listMine);
  const draft = useQuery(api.drafts.mine);
  const { signOut } = useAuthActions();
  const has = mine && mine.length > 0;

  if (mine === undefined || draft === undefined) {
    return <div className="grid min-h-[100dvh] place-items-center bg-paper text-sm text-muted">Loading…</div>;
  }

  /* Nothing planned yet: one held moment, the whole window, nothing to scroll past. */
  if (!has) {
    return (
      <div className="relative h-[100dvh] overflow-hidden bg-paper">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[linear-gradient(to_bottom,var(--color-wash)_0%,transparent_92%)] opacity-70"
        />

        <div className="relative flex h-full flex-col">
          <Header onSignOut={() => void signOut()} />

          <main id="main" className="flex min-h-0 flex-1 items-center justify-center px-5 pb-8">
            <div className="w-full max-w-[36rem] rounded-[18px] border border-line bg-cream px-6 py-7 text-center shadow-[0_30px_70px_-28px_rgb(var(--shadow-rgb)/0.55)] md:px-10 md:py-10">
              {draft ? (
                <>
                  <h1 className="text-[2.2rem] leading-[1.05] md:text-[2.8rem]">
                    Welcome <em>back</em>
                  </h1>
                  <p className="mx-auto mt-3.5 max-w-[30rem] text-[0.95rem] leading-relaxed text-muted md:text-base">
                    {draft.name}'s plan is saved just as you left it{" "}
                    <span className="whitespace-nowrap">({savedWhen(draft.updatedAt)})</span>. Pick it up and finish in a
                    minute or two.
                  </p>
                  <Link to="/new" className="btn-primary mt-6">
                    Continue planning <Icon name="arrow" size={17} />
                  </Link>
                  <p className="mt-3 text-sm text-quiet">You can start over from the next page if you'd rather.</p>
                </>
              ) : (
                <>
                  <h1 className="text-[2.2rem] leading-[1.05] md:text-[2.8rem]">
                    Let's plan <em>something lovely</em>
                  </h1>
                  <p className="mx-auto mt-3.5 max-w-[30rem] text-[0.95rem] leading-relaxed text-muted md:text-base">
                    Tell {BRAND.name} what you are planning, who is coming and roughly what you would like to spend. It sets
                    out the plan, finds your vendors and writes to them for you.
                  </p>

                  <Link to="/new" className="btn-primary mt-6">
                    Start planning <Icon name="arrow" size={17} />
                  </Link>
                  <p className="mt-3 text-sm text-quiet">About two minutes, and you can change all of it later.</p>
                </>
              )}

              <ul className="mx-auto mt-7 grid max-w-[30rem] gap-2 border-t border-line pt-5 text-left text-[0.86rem] leading-snug text-muted sm:grid-cols-2 sm:gap-x-5 sm:gap-y-2.5 sm:text-sm">
                {[
                  "Every day or session, with its own headcount and budget",
                  "Real vendors, read off their own sites",
                  "The best three, and why",
                  "Emails sent, chased and read for you",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </main>
          <ThemeFooter className="pb-6" />
        </div>
      </div>
    );
  }

  return (
    <div className="isolate min-h-[100dvh] bg-paper">
      <Backdrop quiet />
      {/* One quiet marigold wash at the top, and nothing else behind the prints. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[260px] bg-[linear-gradient(to_bottom,var(--color-wash)_0%,transparent_92%)] opacity-70"
      />
      <div className="relative mx-auto w-full max-w-[74rem]">
        <Header onSignOut={() => void signOut()} />

        <main id="main" className="px-5 pb-16 md:px-8">
          <h1 className="mt-4 text-[2.4rem] leading-tight">
            Your <em>events</em>
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {mine.length === 1 ? "One event on the go." : `${mine.length} events on the go.`}
          </p>

          <ul className="mt-10 flex flex-wrap items-stretch gap-x-10 gap-y-12">
            {mine.map(({ event, role, summary }, i) => (
              <li key={event._id}>
                <Link
                  to={`/e/${event._id}`}
                  className="polaroid group block w-[21rem] hover:-translate-y-1.5 hover:rotate-0 hover:shadow-[0_30px_56px_-22px_rgb(var(--shadow-rgb)/0.5)]"
                  style={{ transform: `rotate(${TILTS[i % TILTS.length]})` }}
                >
                  {/* A celebration photo for the kind of event, with the kind on it, so no card opens blank. */}
                  <span aria-hidden="true" className="relative block aspect-[16/7] overflow-hidden rounded-[3px] bg-accent-soft/70">
                    <img src={eventCover(event.eventType)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                    <span className="absolute bottom-2 left-2 rounded-full bg-paper/85 px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-ink">
                      {event.occasionLabel?.trim() || occasionNoun(event)}
                    </span>
                  </span>

                  <span className="mt-3.5 block px-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate display text-[1.3rem] leading-tight">{event.name}</span>
                      {role !== "owner" && <span className="shrink-0 text-[11px] text-quiet">{role}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.8rem] text-quiet">
                      {longDate(event.startDate)} · {event.city}
                    </span>

                    {/* Where the plan actually stands, so the card is worth reading. */}
                    <span className="mt-3.5 block border-t border-line pt-3">
                      <Row
                        label={summary.daysToGo <= 1 ? "The day" : "Days to go"}
                        value={summary.daysToGo === 0 ? "Today" : summary.daysToGo === 1 ? "Tomorrow" : `${summary.daysToGo}`}
                      />
                      <Row label="Vendors booked" value={`${summary.booked} of ${summary.needs}`} />
                      <Row
                        label="Committed"
                        value={`${money(summary.committed, event.currency)} of ${money(event.totalBudget, event.currency)}`}
                      />
                      <span className="mt-2.5 flex items-center gap-1.5 text-[0.82rem] text-accent">
                        {summary.nextStep}
                        <Icon name="arrow" size={14} className="transition group-hover:translate-x-0.5" />
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}

            <li>
              <Link
                to="/new"
                className="group flex h-full min-h-[20rem] w-[15rem] flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-rule bg-cream/70 p-6 text-center transition hover:border-accent hover:bg-accent-soft/40"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-paper">
                  <Icon name="plus" size={19} />
                </span>
                {draft ? (
                  <>
                    <span className="display text-[1.1rem]">Finish {draft.name}</span>
                    <span className="max-w-[12rem] text-[0.8rem] leading-relaxed text-quiet">
                      Saved {savedWhen(draft.updatedAt)}. Pick up where you left off.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="display text-[1.1rem]">Plan something new</span>
                    <span className="max-w-[12rem] text-[0.8rem] leading-relaxed text-quiet">
                      A birthday, a housewarming, an offsite or anything else.
                    </span>
                  </>
                )}
              </Link>
            </li>
          </ul>
        </main>
        <ThemeFooter className="pb-10" />
      </div>
    </div>
  );
}

/** "just now", "3 hours ago", "yesterday", "on 12 Sept". */
function savedWhen(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (hours < 48) return "yesterday";
  return `on ${new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** One line of the plan's state, label left and figure right. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline justify-between gap-3 text-[0.82rem] leading-6">
      <span className="text-muted">{label}</span>
      <span className="shrink-0 text-ink">{value}</span>
    </span>
  );
}

function Header({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-6 md:px-8">
      <Link to="/" className="text-2xl" aria-label={`${BRAND.name} home`}>
        <PlusOneLockup />
      </Link>
      <div className="flex min-w-0 items-center gap-2">
      <UserChip to="/account" className="hidden max-w-[15rem] sm:inline-flex" />
      <button onClick={onSignOut} className="btn-quiet btn-sm gap-1.5 bg-paper/90 text-ink shadow-[inset_0_0_0_1px_var(--color-line),0_6px_18px_-8px_rgb(var(--shadow-rgb)/0.35)] backdrop-blur-sm">
        <Icon name="signout" size={15} />
        Sign out
      </button>
      </div>
    </header>
  );
}
