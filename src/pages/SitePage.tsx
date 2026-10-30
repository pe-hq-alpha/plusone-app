import { useQuery } from "convex/react";
import { useSearchParams, useParams } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { longDate } from "../lib/format";
import { hostsLabel, partWord } from "../../convex/lib/occasion";
import { dayHeading, groupByDay, timeChip } from "../lib/dayByPart";
import { usePrivatePage } from "../lib/privatePage";
import { BRAND } from "../lib/brand";
import { GiftList } from "../components/GiftList";
import { ThemeFooter } from "../components/ui/ThemeFooter";
import { BadLink } from "../components/ui/BadLink";

/**
 * The event's own page: one calm page for the people invited, built from
 * the plan, showing only what the hosts published.
 */
export function SitePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const { isAuthenticated } = useConvexAuth();
  const previewing = params.get("preview") === "1" && isAuthenticated;
  const published = useQuery(api.site.bySlug, previewing ? "skip" : { slug });
  const draft = useQuery(api.site.preview, previewing ? { slug } : "skip");
  const site = previewing ? draft : published;
  usePrivatePage(site ? hostsLabel(site) : "Event");

  if (site === undefined) return <main className="grid min-h-screen place-items-center bg-paper text-sm text-muted">Loading…</main>;
  if (site === null) {
    return <BadLink title="This page isn't open yet." body="Check the link with whoever sent it to you." />;
  }
  const sameDay = site.startDate === site.endDate;

  return (
    <main className="min-h-screen bg-paper text-ink">
      {previewing && <p className="sticky top-0 z-10 bg-ink px-4 py-2 text-center text-xs text-paper">Preview: only the people planning your event can see this until it's published.</p>}
      <header className="relative bg-[linear-gradient(to_bottom,var(--color-wash)_0%,transparent_100%)] pb-2 pt-16 sm:pt-24">
        <div className="relative z-10 mx-auto max-w-[44rem] px-5">
          <div className="rounded-[22px] bg-paper px-6 py-8 text-center shadow-[0_30px_70px_-30px_rgb(var(--shadow-rgb)/0.45)] ring-1 ring-line sm:px-10">
            <p className="text-xs uppercase tracking-[0.22em] text-quiet">You're invited to {site.occasion}</p>
            <h1 className="mt-3 text-[clamp(2.1rem,3.6vw,3.2rem)] leading-[1.05]">
              {site.host.trim() && site.coHost.trim() ? (
                <>
                  {site.host} <em>&amp;</em> {site.coHost}
                </>
              ) : (
                hostsLabel(site)
              )}
            </h1>
            <p className="mt-3 text-muted">
              {sameDay ? longDate(site.startDate) : `${longDate(site.startDate)} to ${longDate(site.endDate)}`}
              <br />
              {site.city}
              {site.area ? `, ${site.area}` : ""}
            </p>
            {site.welcome && <p className="mx-auto mt-5 max-w-[30rem] leading-relaxed">{site.welcome}</p>}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[44rem] gap-12 px-5 py-14">
        {site.story && (
          <section>
            <h2 className="display text-2xl">A little <em>background</em></h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{site.story}</p>
          </section>
        )}

        {site.sessions.length > 0 && (
          <section>
            <h2 className="display text-2xl">When and <em>where</em></h2>
            {groupByDay(site.sessions).map((day) => (
              <div key={day.date} className="mt-5">
                <p className="display text-lg text-ink">{dayHeading(day.date)}</p>
                <ol className="mt-2 grid gap-3">
                  {day.parts.map((e) => (
                    <li key={e._id} className="overflow-hidden rounded-[18px] bg-cream ring-1 ring-line">
                      <div className="px-5 py-4">
                        {e.startTime && <p className="text-xs uppercase tracking-[0.14em] text-quiet">{timeChip(e.startTime, e.endTime)}</p>}
                        <h3 className="display mt-1 text-xl">{e.name}</h3>
                        {e.location && <p className="mt-1 text-sm text-muted">{e.location}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        )}

        {site.travel && (
          <section>
            <h2 className="display text-2xl">Travel and <em>stay</em></h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{site.travel}</p>
          </section>
        )}

        {site.showRsvp && (
          <section className="rounded-[18px] bg-accent-soft/60 px-6 py-6 text-center">
            <h2 className="display text-2xl">RSVP</h2>
            <p className="mx-auto mt-2 max-w-[28rem] text-sm text-muted">
              Please reply with the personal link we sent you. It knows which {partWord(site, true)} you're invited to.
            </p>
          </section>
        )}

        {site.gifts && <GiftList gifts={site.gifts} />}

        <p className="text-center text-xs text-quiet">Made with {BRAND.name}</p>
        <ThemeFooter />
      </div>
    </main>
  );
}
