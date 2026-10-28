import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { BRAND } from "../lib/brand";
import { money } from "../lib/format";
import { monthlyPrice, type PlanId } from "../lib/pricing";
import { useRegion } from "../lib/region";
import { Backdrop } from "../components/ui/Backdrop";
import { PublicHero, PublicNav } from "../components/public/PublicNav";

type Group = { title: string; items: string[] };

/** Everything Basic does, in the order an event needs it. "Soon" marks what isn't built yet. */
const BASIC: Group[] = [
  {
    title: "Planning",
    items: [
      "Tell us about the event in your own words; we ask what's missing and check it all with you",
      "The plan set out for you: each part of the day, the budget split across it, the vendors you'll need and the first to-dos",
      "Today: what's done, what's under way, what's waiting on you and what's next",
      "Change anything in plain words: “we're now 140 people”, “move lunch to 1 pm”",
      "The budget, every deposit, balance and vendor deadline in one list, ready for your calendar",
      "A board for the event, with a space for each part of the day: pictures, links from Instagram or Pinterest, notes and colours",
    ],
  },
  {
    title: "Vendors and quotes",
    items: [
      "Vendors found on the open web, from their own websites and price pages, each with a reason it fits",
      `Verified vendors on ${BRAND.name} Partner answering your request directly`,
      "Inquiries sent from your event's own inbox, follow-ups for anyone who goes quiet, and simple questions answered for you",
      "Every quote on the same lines: an emailed reply, a PDF, a photo of a price list from WhatsApp or a pasted message",
      "What each quote leaves out, flagged, with what the others charge for it",
      "Quotes compared line by line, in one unit at your own headcount, with what similar vendors charge",
    ],
  },
  {
    title: "Guests and the day",
    items: [
      "Guests and their own RSVP links, with head counts and food needs for each part of the day",
      "An event page written from your plan, and a gift list so nobody brings the same thing twice",
      "Plan together with family or colleagues, and share a read-only plan or print it on one page",
      "A weekly update by email that skips the quiet weeks",
    ],
  },
  {
    title: "Coming soon",
    items: ["Speak your plan instead of typing it", "See the decor on a photo of your own venue"],
  },
];

const PREMIUM: Group[] = [
  {
    title: "Everything in Basic, plus",
    items: [
      `Your own planner from the ${BRAND.name} team, who plans the event with you`,
      "Vendors shortlisted and lined up for you, with your planner keeping everything moving",
      "Someone on your side with every vendor, pushing for a fair price",
      "On call any time by phone, and there on the day when you need them",
    ],
  },
];

const PLANS: { id: PlanId; name: string; line: string; status: string; when: string; groups: Group[] }[] = [
  {
    id: "basic",
    name: "Basic",
    line: "The complete planning app. It plans with you, does the running around and lines up every quote; you make every call.",
    status: "Free until launch",
    when: "a month from launch",
    groups: BASIC,
  },
  {
    id: "premium",
    name: "Premium",
    line: `The app, and a person from the ${BRAND.name} team who plans it with you.`,
    status: "Opens after launch",
    when: "a month once it opens",
    groups: PREMIUM,
  },
];

/**
 * The plans and their introductory prices at launch. Until launch Basic is free to use;
 * Premium opens after the introductory phase. Both lists say only what is built, with
 * what isn't under "Coming soon".
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

      <div className="mt-6 grid items-start gap-4 md:grid-cols-2">
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
              {plan.groups.map((g) => (
                <div key={g.title} className="mt-5">
                  <h3 className="label">{g.title}</h3>
                  <ul className="mt-2 grid gap-2.5 text-sm">
                    {g.items.map((item) => (
                      <li key={item} className={`flex gap-2.5${g.title === "Coming soon" ? " text-muted" : ""}`}>
                        <Check size={16} className={`mt-0.5 shrink-0 ${g.title === "Coming soon" ? "text-quiet" : "text-accent"}`} aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="mt-5 text-sm text-muted">Instant help from our support team, on both plans.</p>
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

      <div className="mt-6 grid gap-1 text-xs text-muted">
        <p>For now, {BRAND.name} doesn&rsquo;t handle payments to vendors: you pay your vendors directly.</p>
        <p>Introductory prices at launch, shown in rupees in India and in US dollars elsewhere.</p>
      </div>
    </main>
    </div>
  );
}
