import type React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/landing/Icon";
import "../landing.css";
import "../styles/running-status.css";
import { PlusOneMark } from "../components/brand/Wordmarks";
import { BRAND } from "../lib/brand";
import { useRegion } from "../lib/region";
import { examplesFor } from "../lib/regionExamples";
import { ThemeSwitch } from "../components/ui/ThemeSwitch";

type StepState = "done" | "now" | "waiting" | "next";
const STATE_LABEL: Record<StepState, string> = { done: "Done", now: "Now", waiting: "Waiting", next: "Next" };

/** The example event's running status: what the co-pilot has done, is doing and will do next. */
const route = (plan: string): { state: StepState; text: string }[] => [
  { state: "done", text: plan },
  { state: "done", text: "Found 8 caterers, 5 decorators and 3 photographers" },
  { state: "done", text: "Wrote to 6 of them from your event’s inbox" },
  { state: "now", text: "3 replies in, quotes lined up for you" },
  { state: "waiting", text: "Following up with 2 who went quiet" },
  { state: "next", text: "Choose a caterer by Friday" },
];

const HOW = [
  { title: "Talk it through", text: "Say what you're planning in your own words. It asks what it needs and checks it all with you." },
  { title: "The plan, set out", text: "Sessions, the vendors each one needs, a budget and first to-dos." },
  { title: "Vendors found and written to", text: "From the event's own inbox, with follow-ups for anyone who goes quiet." },
  { title: "Replies read for you", text: "Prices pulled out and made comparable, every number linked to its reply." },
  { title: "You choose", text: "Book the ones you like; the co-pilot keeps the rest of the plan moving." },
];

/** Celebrations, Western and Indian, under the events list. Generated images, not customers' events. */
const PHOTOS = [
  { src: "/photos/birthday.jpg", label: "A garden birthday", alt: "A family birthday dinner at dusk under string lights, a cake with candles carried to the table" },
  { src: "/photos/haldi.jpg", label: "A haldi morning", alt: "A bride in yellow laughing as her family apply turmeric at a haldi, marigolds all around" },
  { src: "/photos/wedding.jpg", label: "A wedding reception", alt: "A couple's first dance on a lawn under festoon lights, guests clapping" },
  { src: "/photos/office.jpg", label: "An office year-end", alt: "Colleagues at a rooftop celebration at dusk, a buffet and festoon lights" },
];

const KINDS = [
  { group: "Family and friends", items: ["Birthdays and milestone birthdays", "Weddings and engagements", "Anniversaries", "Housewarmings", "Baby showers and naming ceremonies", "Religious and cultural celebrations"] },
  { group: "Work and community", items: ["Office parties", "Team offsites", "Product launches", "Conferences", "College fests", "Community festivals"] },
];

export function LandingPage() {
  const ex = examplesFor(useRegion());

  return (
    <div className="lp">
      <a href="#main" className="lp-skip">Skip to content</a>
      <section className="rs" aria-labelledby="hero-title">
        {/* The event, drawn in fine line behind the promise: lanterns, string lights, a long dinner table. */}
        <picture className="rs__plate" aria-hidden="true">
          <source media="(min-width: 1600px)" srcSet="/plates/backdrop-3840.jpg" />
          <img src="/plates/backdrop-1920.jpg" alt="" fetchPriority="high" />
        </picture>
        <header className="rs__nav">
          <Link to="/" className="rs__brand" aria-label={`${BRAND.name} Events home`}>
            <span className="rs__mark">Plus<em>One</em></span>
            <span className="rs__events">Events</span>
          </Link>
          <nav className="rs__links" aria-label="Main">
            <Link to="/how-it-works" className="rs__link">How it works</Link>
            <Link to="/pricing" className="rs__link">Pricing</Link>
            <Link to="/signin" className="rs__link rs__link--accent">Sign in</Link>
          </nav>
        </header>

        <main id="main" className="rs__body">
          <div className="rs__pitch">
            <h1 id="hero-title" className="rs__title">
              Your plus one <br />
              for <em>every event.</em>
            </h1>
            <p className="rs__lede">
              Your complete co-pilot for event planning.
              <br />
              <span className="rs__lede-strong">Someone with you, from the first idea to the day itself.</span>
            </p>
            <div className="rs__actions">
              <Link to="/signin?new=1" className="rs__pill rs__pill--solid">Plan an event</Link>
              <Link to="/demo" className="rs__pill rs__pill--outline">See the demo</Link>
            </div>
          </div>

          <section className="rs__status" aria-labelledby="status-title">
            <h2 id="status-title" className="rs__status-title">The co-pilot at work</h2>
            <p className="rs__example">Example</p>
            <p className="rs__event">
              <span>{ex.hero.event}</span> · <span>{ex.hero.city}</span> · <span>Sat 24 Jan</span> · about {ex.hero.people} people
            </p>
            <ol className="rs__route">
              {route(ex.hero.plan).map((s, i) => (
                <li key={s.text} className={`rs__step rs__step--${s.state}`} style={{ "--i": i } as React.CSSProperties} aria-current={s.state === "now" ? "step" : undefined}>
                  <span className="rs__node" aria-hidden="true">
                    {s.state === "done" ? <Icon name="check" size={16} /> : null}
                  </span>
                  <span className="rs__state">{STATE_LABEL[s.state]}</span>
                  <span className="rs__text">{s.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </section>

      <section id="how" className="rs-sec rs-sec--plate-left" aria-labelledby="how-title">
        <div className="rs-wrap">
          <h2 id="how-title" className="rs-h2">From the first conversation <em>to the day itself</em></h2>
          <p className="rs-lede">You make the decisions. {BRAND.name} does the searching, writing, reading and chasing in between, and tells you where things stand.</p>
          <ol className="rs-line">
            {HOW.map((h, i) => (
              <li key={h.title} className="rs-line__stop">
                <span className="rs-line__node" aria-hidden="true">{i + 1}</span>
                <h3 className="rs-line__title">{h.title}</h3>
                <p className="rs-line__text">{h.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rs-sec rs-sec--wash" aria-labelledby="ways-title">
        <div className="rs-wrap">
          <h2 id="ways-title" className="rs-h2">Two ways <em>to plan</em></h2>
          <div className="rs-ways">
            <article className="rs-card">
              <h3 className="rs-card__title">Your co-pilot</h3>
              <p className="rs-card__text">The plan, the vendors, the replies and the budget, with the legwork done for you. You see every step and make every call.</p>
            </article>
            <article className="rs-card">
              <h3 className="rs-card__title">Your co-pilot and our team</h3>
              <p className="rs-card__text">Everything the co-pilot does, plus people who plan it with you and are on the ground when the day needs them.</p>
            </article>
          </div>
          <p className="rs-note">Your co-pilot is free to use until launch; our team joins after launch. <Link to="/pricing">See pricing</Link>.</p>
        </div>
      </section>

      <section className="rs-sec" aria-labelledby="events-title">
        <div className="rs-wrap rs-split">
          <div>
            <h2 id="events-title" className="rs-h2">For the events <em>people actually hold</em></h2>
            <p className="rs-lede">Celebrations with family and friends, and big days at work. Talk it through with {BRAND.name} and it sets out the sessions, the vendors each one needs, and a budget.</p>
          </div>
          <div className="rs-kinds">
            {KINDS.map((k) => (
              <div key={k.group} className="rs-kinds__group">
                <h3 className="rs-kinds__head">{k.group}</h3>
                <ul>{k.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
        <div className="rs-wrap">
          <div className="rs-photos">
            {PHOTOS.map((p) => (
              <figure key={p.src} className="rs-photo">
                <img src={p.src} alt={p.alt} loading="lazy" decoding="async" width={800} height={1000} />
                <figcaption>{p.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="rs-sec rs-sec--wash rs-sec--plate-right" aria-labelledby="compare-title">
        <div className="rs-wrap rs-split rs-split--reverse">
          <div>
            <h2 id="compare-title" className="rs-h2">Every reply in its own shape. <em>One answer.</em></h2>
            <p className="rs-lede">Vendors quote per plate, all in, plus service, plus transport. {BRAND.name} reads every reply into the same unit, at your numbers, and lines them up so the best value per plate shows, not just the lowest total.</p>
          </div>
          <figure className="rs-compare" aria-label="Example comparison">
            <figcaption className="rs-compare__cap"><span>{ex.compare.title}</span><span className="rs-compare__ex">Example</span></figcaption>
            <table>
              <thead><tr><th scope="col">Vendor</th><th scope="col">{ex.compare.unit}</th><th scope="col">{ex.compare.totalLabel}</th></tr></thead>
              <tbody>
                {ex.compare.rows.map((r) => (
                  <tr key={r.name} className={r.best ? "is-best" : undefined}>
                    <th scope="row">{r.best ? <span className="rs-compare__node" aria-label="Best value" /> : null}{r.name}<small>{r.quoted}</small></th>
                    <td>{r.per}</td>
                    <td>{r.total}{r.tag ? <span className="rs-compare__tag">{r.tag}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rs-compare__range">{ex.compare.range}</p>
          </figure>
        </div>
      </section>

      <section className="rs-close" aria-labelledby="close-title">
        <div className="rs-wrap rs-close__inner">
          <h2 id="close-title" className="rs-h2">Tell us about the event. <em>We&rsquo;ll take it from there.</em></h2>
          <p className="rs-lede">Say what you&rsquo;re planning in your own words. {BRAND.name} asks for anything it&rsquo;s missing, checks it all with you, then gets on with the legwork.</p>
          <Link to="/signin?new=1" className="rs__pill rs__pill--solid rs-close__cta">Plan an event</Link>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot__inner">
          <p className="brand brand--static rs-foot-mark"><img src="/icon-192.png" alt="" width="28" height="28" /><PlusOneMark /></p>
          <p>
            <Link to="/how-it-works" className="lp-footer__link">How it works</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/pricing" className="lp-footer__link">Pricing</Link>
          </p>
          <ThemeSwitch compact />
          <p className="lp-footer__legal">
            <Link to="/privacy" className="lp-footer__link">Privacy</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/terms" className="lp-footer__link">Terms</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
