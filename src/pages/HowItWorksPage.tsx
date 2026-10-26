import { Link } from "react-router-dom";
import { PlusOneMark } from "../components/brand/Wordmarks";
import { BRAND } from "../lib/brand";
import { useRegion } from "../lib/region";
import { examplesFor } from "../lib/regionExamples";
import { ThemeFooter } from "../components/ui/ThemeFooter";

const steps = (search: string) => [
  { t: "Talk it through", d: `Say what you're planning in your own words. ${BRAND.name} asks for whatever it still needs, reads it all back for you to confirm, and points out anything that can't be right. Then it sets out each day or session, splits the budget and lists the vendors you'll need.` },
  { t: "Research from the open web", d: `Ask for “${search}”. ${BRAND.name} reads real vendor websites and turns them into cards with prices, packages and a source link for every fact.` },
  { t: "Email from the event's own inbox", d: "Pick vendors, read the drafts, send. Replies land in the event's inbox, prices are read into quotes, and the budget moves with them." },
  { t: "No more chasing", d: "A vendor who goes quiet gets a polite nudge after three days. Guests reply to invites in plain words and the list keeps itself up to date." },
];

export function HowItWorksPage() {
  const { search } = examplesFor(useRegion());
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/" className="display text-2xl tracking-tight" aria-label={`${BRAND.name} home`}>
        <PlusOneMark />
      </Link>
      <h1 className="mt-6 text-3xl">How {BRAND.name} works</h1>
      <ol className="mt-6 space-y-4">
        {steps(search).map((s, i) => (
          <li key={s.t} className="card flex gap-4 p-5">
            <span className="display text-3xl text-accent">{i + 1}</span>
            <div>
              <h2 className="text-lg">{s.t}</h2>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link to="/" className="btn-primary mt-6">Start planning</Link>
      <ThemeFooter className="mt-12" />
    </main>
  );
}
