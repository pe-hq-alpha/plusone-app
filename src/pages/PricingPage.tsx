import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { PlusOneMark } from "../components/brand/Wordmarks";
import { ThemeFooter } from "../components/ui/ThemeFooter";
import { BRAND } from "../lib/brand";
import { money } from "../lib/format";
import { monthlyPrice, type PlanId } from "../lib/pricing";
import { useRegion } from "../lib/region";

const PLANS: { id: PlanId; name: string; line: string; status: string; when: string; includes: string[] }[] = [
  {
    id: "copilot",
    name: "Co-pilot",
    line: `${BRAND.name} plans with you and does the legwork.`,
    status: "Free until launch",
    when: "a month from launch",
    includes: [
      "Talk your event through; the plan, the budget and the vendors you need are set out for you",
      `Vendors found on the open web and from the ${BRAND.name} approved vendor list, with fair pricing and comparisons`,
      "Inquiries and follow-ups sent from your event's own inbox",
      "Every quote lined up in one unit: per plate, per piece or per day",
      "Guests and RSVPs, an event page and a gift list",
      "Instant help from our support team",
    ],
  },
  {
    id: "assisted",
    name: "Assisted",
    line: `A ${BRAND.name} planner plans it with you.`,
    status: "Opens after launch",
    when: "a month once it opens",
    includes: [
      "Everything in Co-pilot",
      "A planner who shortlists vendors for you and lines them up",
      "Planning done together, with someone keeping it moving",
      "On call any time, by phone",
      "Instant help from our support team",
    ],
  },
];

/**
 * The plans and their introductory prices at launch. Until launch Co-pilot is free to use;
 * Assisted opens after the introductory phase.
 */
export function PricingPage() {
  const region = useRegion();
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/" className="display text-2xl tracking-tight" aria-label={`${BRAND.name} home`}>
        <PlusOneMark />
      </Link>
      <h1 className="mt-6 text-3xl">Pricing</h1>
      <p className="mt-2 max-w-2xl text-muted">Two ways to plan: do it yourself with the co-pilot, or have a {BRAND.name} planner do it with you.</p>

      <section className="card mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="free-now">
        <div>
          <span className="chip-ok">Free until launch</span>
          <h2 id="free-now" className="mt-2 text-lg">Co-pilot is free to use until we launch.</h2>
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
                <span className={plan.id === "copilot" ? "chip-ok" : "chip-quiet"}>{plan.status}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{plan.line}</p>
              <p className="mt-4">
                <span className="display text-4xl">{money(amount, currency)}</span>
                <span className="text-sm text-muted"> {plan.when}</span>
              </p>
              <ul className="mt-5 grid gap-2.5 text-sm">
                {plan.includes.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {plan.id === "copilot" ? (
                  <Link to="/signin?new=1" className="btn-ghost w-full">Start free</Link>
                ) : (
                  <a href={`mailto:hello@${BRAND.domain}?subject=Tell%20me%20when%20Assisted%20opens`} className="btn-quiet w-full">Tell me when it opens</a>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-6 grid gap-1 text-xs text-muted">
        <p>For now, {BRAND.name} doesn&rsquo;t handle payments to vendors: you pay your vendors directly.</p>
        <p>Introductory prices at launch, shown in rupees in India and in US dollars elsewhere.</p>
      </div>
      <ThemeFooter className="mt-12" />
    </main>
  );
}
