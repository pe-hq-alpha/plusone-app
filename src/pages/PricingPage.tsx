import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { BRAND } from "../lib/brand";
import { money } from "../lib/format";
import { monthlyPrice, type PlanId } from "../lib/pricing";
import { useRegion } from "../lib/region";
import { Backdrop } from "../components/ui/Backdrop";
import { PublicHero, PublicNav } from "../components/public/PublicNav";

type Highlight = { t: string; d: string };

/** Five things each plan does for you, explained, so the two cards read alike; every feature is in the table below. */
const PLANS: { id: PlanId; name: string; line: string; status: string; when: string; highlights: Highlight[] }[] = [
  {
    id: "basic",
    name: "Basic",
    line: "The complete planning app. You make every call; it does the running around.",
    status: "Free until launch",
    when: "a month from launch",
    highlights: [
      { t: "The whole event in one place", d: "The plan, budget, guests and to-dos, set out and kept up to date." },
      { t: "Vendors found and written to", d: "From the open web and verified vendors, chased when they go quiet." },
      { t: "Every quote on the same lines", d: "Emails, PDFs and WhatsApp price lists, so you see what's included." },
      { t: "What it should cost", d: "Each price beside what similar vendors charge, and what it leaves out." },
      { t: "Guests and your event page", d: "Invitations, replies and head counts, and a page for the day." },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    line: `Everything in Basic, and a person from the ${BRAND.name} team planning it with you.`,
    status: "Opens after launch",
    when: "a month once it opens",
    highlights: [
      { t: "Your own planner", d: `Someone from the ${BRAND.name} team who knows your event and plans it with you.` },
      { t: "Vendors shortlisted for you", d: "The right options found, checked and lined up, so you only choose." },
      { t: "Someone pushing for a fair price", d: "On your side with every vendor, so you don't pay more than you should." },
      { t: "Kept moving, every week", d: "Your planner chases what's late and tells you what's next." },
      { t: "On call, and there on the day", d: "By phone any time, and in person when the day needs them." },
    ],
  },
];

type Row = { feature: string; basic: boolean; premium: boolean };

/** Every feature, in plain words, with the plans it comes in. "Coming soon" is what isn't built yet. */
const ALL: { group: string; rows: Row[] }[] = [
  {
    group: "Planning",
    rows: [
      { feature: "Tell us about the event in your own words; the plan is set out for you", basic: true, premium: true },
      { feature: "Speak instead of typing, in Tamil, English or both", basic: true, premium: true },
      { feature: "Today: what's done, what's under way and what's next", basic: true, premium: true },
      { feature: "Changes made by just saying them", basic: true, premium: true },
      { feature: "The budget, deposits and deadlines in one list", basic: true, premium: true },
      { feature: "A board for ideas and pictures", basic: true, premium: true },
    ],
  },
  {
    group: "Vendors and quotes",
    rows: [
      { feature: "Vendors found on the open web", basic: true, premium: true },
      { feature: "Requests answered by verified vendors", basic: true, premium: true },
      { feature: "Inquiries and follow-ups from your event's own inbox", basic: true, premium: true },
      { feature: "Every quote on the same lines, from email, PDF or WhatsApp", basic: true, premium: true },
      { feature: "Missing charges flagged, and prices compared with similar vendors", basic: true, premium: true },
      { feature: "Vendors shortlisted and lined up by your planner", basic: false, premium: true },
      { feature: "Someone pushing for a fair price with each vendor", basic: false, premium: true },
    ],
  },
  {
    group: "Guests and the day",
    rows: [
      { feature: "Guests, RSVP links, head counts and food needs", basic: true, premium: true },
      { feature: "An event page and a gift list", basic: true, premium: true },
      { feature: "Planning together, and the plan shared or printed", basic: true, premium: true },
      { feature: "Your planner on call, and there on the day", basic: false, premium: true },
    ],
  },
  {
    group: "Help",
    rows: [{ feature: "Our support team, whenever you need it", basic: true, premium: true }],
  },
  {
    group: "Coming soon",
    rows: [
      { feature: "See the decor on a photo of your own venue", basic: true, premium: true },
    ],
  },
];

function Mark({ on }: { on: boolean }) {
  return on ? <Check size={16} className="mx-auto text-accent" aria-label="Included" /> : <span className="text-quiet" aria-label="Not included">&ndash;</span>;
}

/**
 * The plans and their introductory prices at launch. Until launch Basic is free to use;
 * Premium opens after the introductory phase. The cards explain each plan; the table
 * under them lists every feature.
 */
export function PricingPage() {
  const region = useRegion();
  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <PublicNav />
    <main id="main" className="mx-auto max-w-4xl px-4 pb-16">
      <PublicHero
        eyebrow="Pricing"
        title={<>Two ways <em>to plan</em></>}
        lede={`Basic is the complete planning app. Premium adds a person from the ${BRAND.name} team, planning it with you.`}
      />

      <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="free-now">
        <div>
          <span className="chip-ok">Free until launch</span>
          <h2 id="free-now" className="mt-2 text-lg">Basic is free to use until we launch.</h2>
          <p className="mt-1 text-sm text-muted">No card needed. At launch it moves to the introductory price below, and we&rsquo;ll tell you well before.</p>
        </div>
        <Link to="/signin?new=1" className="btn-primary shrink-0">Plan an event</Link>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => {
          const { amount, currency } = monthlyPrice(plan.id, region);
          return (
            <section key={plan.id} className="card flex flex-col p-6" aria-labelledby={`plan-${plan.id}`}>
              <div className="flex items-center justify-between gap-3">
                <h2 id={`plan-${plan.id}`} className="display text-2xl">{plan.name}</h2>
                <span className={plan.id === "basic" ? "chip-ok" : "chip-quiet"}>{plan.status}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{plan.line}</p>
              <p className="mt-4">
                <span className="display text-4xl">{money(amount, currency)}</span>
                <span className="text-sm text-muted"> {plan.when}</span>
              </p>
              <ul className="mt-5 grid gap-3.5 text-sm">
                {plan.highlights.map((h) => (
                  <li key={h.t} className="flex gap-2.5">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <span>
                      <span className="font-medium text-ink">{h.t}.</span> <span className="text-muted">{h.d}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {plan.id === "basic" ? (
                  <Link to="/signin?new=1" className="btn-ghost w-full">Start free</Link>
                ) : (
                  <a href={`mailto:hello@${BRAND.domain}?subject=Tell%20me%20when%20Premium%20opens`} className="btn-quiet w-full">Tell me when it opens</a>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="card mt-6 overflow-hidden" aria-labelledby="all-h">
        <h2 id="all-h" className="display px-6 pb-2 pt-5 text-xl">Everything in each plan</h2>
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Every feature and the plans it comes in</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="px-6 py-2 font-normal"><span className="sr-only">Feature</span></th>
                <th scope="col" className="w-24 px-3 py-2 text-center font-medium">Basic</th>
                <th scope="col" className="w-24 px-3 py-2 pr-6 text-center font-medium">Premium</th>
              </tr>
            </thead>
            {ALL.map((g) => (
              <tbody key={g.group}>
                <tr>
                  <th scope="rowgroup" colSpan={3} className="label px-6 pb-1.5 pt-4 text-left">{g.group}</th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.feature} className={`border-t border-line${g.group === "Coming soon" ? " text-muted" : ""}`}>
                    <th scope="row" className="px-6 py-2.5 text-left font-normal">{r.feature}</th>
                    <td className="px-3 py-2.5 text-center"><Mark on={r.basic} /></td>
                    <td className="px-3 py-2.5 pr-6 text-center"><Mark on={r.premium} /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-1 text-xs text-muted">
        <p>For now, {BRAND.name} doesn&rsquo;t handle payments to vendors: you pay your vendors directly.</p>
        <p>Introductory prices at launch, shown in rupees in India and in US dollars elsewhere.</p>
      </div>
    </main>
    </div>
  );
}
