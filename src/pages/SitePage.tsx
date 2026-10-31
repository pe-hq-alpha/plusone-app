import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import "../styles/site.css";

type Site = NonNullable<FunctionReturnType<typeof api.site.bySlug>>;

/** "In 8 days", "Tomorrow", "Today"; nothing once it's past. */
function daysAway(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = date.split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
  if (days < 0) return null;
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
}

function mapsLink(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}

/** A calendar file for the whole event, made in the browser; nothing is sent anywhere. */
function downloadIcs(site: Site) {
  const day = (iso: string, add = 0) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + add);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const esc = (t: string) => t.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const first = site.sessions[0];
  const timed = first?.startTime && /^\d{2}:\d{2}$/.test(first.startTime) && site.startDate === site.endDate;
  const when = timed
    ? `DTSTART:${day(site.startDate)}T${first!.startTime!.replace(":", "")}00\r\nDTEND:${day(site.startDate)}T${(first!.endTime && /^\d{2}:\d{2}$/.test(first!.endTime) ? first!.endTime : first!.startTime!).replace(":", "")}00`
    : `DTSTART;VALUE=DATE:${day(site.startDate)}\r\nDTEND;VALUE=DATE:${day(site.endDate, 1)}`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PlusOne//Event//EN", "BEGIN:VEVENT",
    `UID:${day(site.startDate)}-${Math.random().toString(36).slice(2)}@plusoneevents.site`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    when,
    `SUMMARY:${esc(site.name)}`,
    `LOCATION:${esc([site.area, site.city].filter(Boolean).join(", "))}`,
    `URL:${window.location.href.split("?")[0]}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${site.name.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "event"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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
  const place = [site.area, site.city].filter(Boolean).join(", ");
  const days = daysAway(site.startDate);

  return (
    <main className="site min-h-screen bg-paper text-ink">
      {previewing && <p className="sticky top-0 z-20 bg-ink px-4 py-2 text-center text-xs text-paper">Preview: only the people planning your event can see this until it's published.</p>}
      <header className="site__hero">
        <div className={`site__cover${site.coverIsPhoto ? " site__cover--photo" : ""}`}>
          <img src={site.cover} alt="" decoding="async" fetchPriority="high" />
        </div>
        <div className="relative z-10 mx-auto max-w-[44rem] px-5">
          <div className="site__card">
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
            <span className="site__rule" aria-hidden="true" />
            <p className="text-muted">
              {sameDay ? longDate(site.startDate) : `${longDate(site.startDate)} to ${longDate(site.endDate)}`}
              <br />
              {place}
            </p>
            {days !== null && <p className="site__countdown">{days}</p>}
            {site.welcome && <p className="mx-auto mt-5 max-w-[30rem] leading-relaxed">{site.welcome}</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary btn-sm" onClick={() => downloadIcs(site)}>
                Add to calendar
              </button>
              {place && (
                <a className="btn-quiet btn-sm" href={mapsLink(place)} target="_blank" rel="noopener noreferrer">
                  Directions
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[44rem] gap-12 px-5 py-14">
        {site.story && (
          <section>
            <h2 className="site__h">A little <em>background</em></h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{site.story}</p>
          </section>
        )}

        {site.sessions.length > 0 && (
          <section>
            <h2 className="site__h">When and <em>where</em></h2>
            {groupByDay(site.sessions).map((day) => (
              <div key={day.date} className="mt-5">
                <p className="display text-lg text-ink">{dayHeading(day.date)}</p>
                <ol className="site__parts">
                  {day.parts.map((e) => (
                    <li key={e._id} className="site__part">
                      <p className="site__time">{e.startTime ? timeChip(e.startTime, e.endTime) : "Time to come"}</p>
                      <div className="min-w-0">
                        <h3 className="display text-xl">{e.name}</h3>
                        {e.location && (
                          <a className="mt-1 inline-block text-sm text-muted underline-offset-4 hover:text-accent hover:underline" href={mapsLink(`${e.location}, ${site.city}`)} target="_blank" rel="noopener noreferrer">
                            {e.location}
                          </a>
                        )}
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
            <h2 className="site__h">Travel and <em>stay</em></h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{site.travel}</p>
          </section>
        )}

        {site.showRsvp && (
          <section className="site__rsvp">
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
