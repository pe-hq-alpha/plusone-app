import { Link } from "react-router-dom";
import { BRAND } from "../lib/brand";
import { useRegion } from "../lib/region";
import { examplesFor } from "../lib/regionExamples";
import { Backdrop } from "../components/ui/Backdrop";
import { PublicHero, PublicNav } from "../components/public/PublicNav";

const steps = (search: string) => [
  { t: "Talk it through", d: `Say what you're planning in your own words. ${BRAND.name} asks for whatever it still needs, reads it all back for you to confirm, and points out anything that can't be right. Then it sets out each day or session, splits the budget and lists the vendors you'll need.` },
  { t: "Research from the open web", d: `Ask for “${search}”. ${BRAND.name} reads real vendor websites and turns them into cards with prices, packages and a source link for every fact.` },
  { t: "Email from the event's own inbox", d: "Pick vendors, read the drafts, send. Replies land in the event's inbox, prices are read into quotes, and the budget moves with them." },
  { t: "No more chasing", d: "A vendor who goes quiet gets a polite nudge after three days. Guests reply to invites in plain words and the list keeps itself up to date." },
];

export function HowItWorksPage() {
  const { search } = examplesFor(useRegion());
  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <PublicNav />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-16">
        <PublicHero
          eyebrow="How it works"
          title={<>From the first conversation <em>to the day itself</em></>}
          lede={`You make the decisions. ${BRAND.name} does the searching, writing, reading and chasing in between, and tells you where things stand.`}
        />
        <ol className="grid gap-4 md:grid-cols-2">
          {steps(search).map((s, i) => (
            <li key={s.t} className="card flex gap-4 p-6">
              <span className="display text-4xl leading-none text-accent">{i + 1}</span>
              <div>
                <h2 className="text-lg">{s.t}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/signin?new=1" className="btn-primary">Plan an event</Link>
          <Link to="/demo" className="btn-ghost">See the demo</Link>
        </div>
      </main>
    </div>
  );
}
