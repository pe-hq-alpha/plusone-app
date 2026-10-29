import { Link } from "react-router-dom";
import { BRAND } from "../lib/brand";
import { partnerHref } from "../lib/hosts";
import { Backdrop } from "../components/ui/Backdrop";
import { PublicHero, PublicNav } from "../components/public/PublicNav";

/** The two problems PlusOne solves, in the order the pitch puts them. */
const SOLVES = [
  {
    t: "One place instead of many tools",
    d: "The plan and its budget, the vendors and every message with them, the guests and their replies, the event page and the to-dos. For a birthday at home or a conference at work, nothing lives in a separate spreadsheet or chat.",
  },
  {
    t: "Quotes you can compare",
    d: "Every price read onto the same lines, at your own numbers: what's included, what's extra, what's missing, and where it sits in the local range. Vendors with no website or listing can be found too, and answer on those same lines.",
  },
];

const CUSTOMERS = [
  { t: "Tell us about the event", d: `Say what you're planning in your own words. ${BRAND.name} asks for whatever it still needs, reads it all back for you to confirm and points out anything that can't be right. Then it sets out each part of the day, the budget and the vendors you'll need.` },
  { t: "Vendors found two ways", d: "It searches the open web and reads vendors' own websites, down to the pages with their prices. And verified vendors on PlusOne Partner answer your request directly." },
  { t: "Written to, and chased", d: "Inquiries go out from the event's own inbox once you approve them. Anyone who goes quiet gets a polite follow-up, and simple questions are answered for you." },
  { t: "Every quote on the same lines", d: "An emailed reply, a PDF, a photo of a price list sent on WhatsApp or a pasted message: each one is read onto the same lines, priced at your headcount, with service, transport and tax set out." },
  { t: "Compare line by line", d: "Quotes and offers side by side, with what each one leaves unsaid flagged and what the others charge for it, and where each price sits in the local range. The best value shows, not just the lowest total." },
  { t: "You choose; the rest keeps up", d: "Book the vendor you want. The budget, deposits and deadlines, the guest list and replies, the event page and the to-dos stay up to date around it." },
];

const VENDORS = [
  { t: "Get listed", d: "Set up your business, or claim the listing PlusOne already made from your public pages. No website needed. A person at PlusOne checks you're real, usually within a day." },
  { t: "Price it clearly", d: "Each package with its price, what it's priced by (per plate, per hour, all in) and what it includes. Prices set out like this earn the Transparent pricing badge." },
  { t: "Answer real requests", d: "Customers near you ask for your kind of service: the occasion, the date, how many guests, the area. You answer once, on the same sheet every vendor fills in." },
  { t: "Be compared fairly", d: "Your offer sits line by line beside the others, so what you include counts, not just the total. Your standing grows with every event done through PlusOne." },
];

function Steps({ steps }: { steps: { t: string; d: string }[] }) {
  return (
    <ol className="grid gap-4 md:grid-cols-2">
      {steps.map((s, i) => (
        <li key={s.t} className="card flex gap-4 p-6">
          <span className="display text-4xl leading-none text-accent">{i + 1}</span>
          <div>
            <h3 className="text-lg">{s.t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HowItWorksPage() {
  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <PublicNav />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-16">
        <PublicHero
          eyebrow="How it works"
          title={<>One app for the whole event. <em>Every quote on the same lines.</em></>}
          lede={`Planning an event usually means calls, chats, email and a spreadsheet, and quotes that are never written the same way twice, so what's included only shows when the extra charges arrive. ${BRAND.name} brings the plan into one place, and puts every quote and every vendor's offer on the same lines.`}
        />

        <section aria-labelledby="solves-h">
          <h2 id="solves-h" className="sr-only">What it solves</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {SOLVES.map((s) => (
              <article key={s.t} className="card p-6 md:p-7">
                <h3 className="display text-2xl">{s.t}</h3>
                <p className="mt-2 leading-relaxed text-muted">{s.d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14" aria-labelledby="customers-h">
          <p className="label">Planning an event</p>
          <h2 id="customers-h" className="display mt-1 text-[clamp(1.8rem,3vw,2.4rem)] leading-tight">
            For families, teams <em>and event managers</em>
          </h2>
          <p className="mb-6 mt-2 max-w-[42rem] text-muted">You make every decision. {BRAND.name} does the searching, writing, reading and chasing in between, and tells you where things stand.</p>
          <Steps steps={CUSTOMERS} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/signin?new=1" className="btn-primary">Plan an event</Link>
            <Link to="/demo" className="btn-ghost">See the demo</Link>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="vendors-h">
          <p className="label">PlusOne Partner</p>
          <h2 id="vendors-h" className="display mt-1 text-[clamp(1.8rem,3vw,2.4rem)] leading-tight">
            For vendors, <em>with or without a website</em>
          </h2>
          <p className="mb-6 mt-2 max-w-[42rem] text-muted">Caterers, decorators, photographers, halls and everyone else who makes an event happen. Get found by people planning near you, and answer them on the same sheet as everyone else: no bidding wars, no hidden charges.</p>
          <Steps steps={VENDORS} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={partnerHref("/")} className="btn-primary">List your business</Link>
            <Link to={partnerHref("/demo")} className="btn-ghost">Try it as a sample caterer</Link>
          </div>
        </section>

        <section className="card mt-14 p-6 md:p-8" aria-labelledby="aim-h">
          <h2 id="aim-h" className="display text-[clamp(1.6rem,2.6vw,2.1rem)] leading-tight">
            A standard way <em>to plan and buy events</em>
          </h2>
          <p className="mt-3 max-w-[46rem] leading-relaxed text-muted">
            Every event, whatever its size, should get a clear budget, vendor options that can be compared, prices that say what they include, and a
            predictable way to get it done. Fair pricing here means informed and comparable: never one price for everyone, and never simply the cheapest.
          </p>
          <p className="mt-3 max-w-[46rem] leading-relaxed text-muted">
            Plan on Basic, the complete app, free until launch, or on Premium, with a person from our team beside you once we launch. <Link to="/pricing" className="text-accent underline underline-offset-2">See pricing</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
