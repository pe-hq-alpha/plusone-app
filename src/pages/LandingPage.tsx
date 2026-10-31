import type React from "react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/landing/Icon";
import "../landing.css";
import "../styles/running-status.css";
import { PlusOneLockup } from "../components/brand/Wordmarks";
import { BRAND } from "../lib/brand";
import { partnerHref } from "../lib/hosts";
import { useRegion } from "../lib/region";
import { examplesFor } from "../lib/regionExamples";
import { ThemeSwitch } from "../components/ui/ThemeSwitch";
import { useTheme } from "../lib/theme";

type StepState = "done" | "now" | "waiting" | "next";
const STATE_LABEL: Record<StepState, string> = { done: "Done", now: "Now", waiting: "Waiting", next: "Next" };

/** The example event's running status: what PlusOne has done, is doing and will do next. */
const route = (plan: string): { state: StepState; text: string }[] => [
  { state: "done", text: plan },
  { state: "done", text: "Found 8 caterers, 5 decorators and 3 photographers" },
  { state: "done", text: "Wrote to 6 of them from your event’s inbox" },
  { state: "now", text: "3 replies in, quotes lined up for you" },
  { state: "waiting", text: "Following up with 2 who went quiet" },
  { state: "next", text: "Choose a caterer by Friday" },
];

/** How it works for the people planning, then for the vendors who answer them. */
const HOW_CUSTOMERS = [
  { title: "Talk it through", text: "Say what you're planning, in your own words. You get the plan and a budget." },
  { title: "Vendors found", text: "Verified vendors on PlusOne answer your request, and more are found on the web with their prices." },
  { title: "Written to and chased", text: "From your event's own inbox, with a follow-up when a vendor goes quiet." },
  { title: "Every quote on the same lines", text: "Emails, PDFs and photos of price lists, read at your numbers: what's in, what's extra, what's missing." },
  { title: "You choose", text: "Compare line by line against the local range, then book. The budget keeps up." },
];

const HOW_VENDORS = [
  { title: "Get listed", text: "Set up your business, or claim the listing made from your public pages. No website needed." },
  { title: "Price it clearly", text: "Each package with its price and what it includes." },
  { title: "Answer real requests", text: "People planning near you send the occasion, the date and the guests. Answer once, on the same sheet." },
  { title: "Compared line by line", text: "Your offer sits beside the others, so what you include counts, not just the total." },
];

/** Three celebrations fanned beside How it works' heading, Western and Indian. Generated images, not customers' events. */
const FAN = [
  { src: "/photos/first-birthday.jpg", alt: "A baby in a high chair reaching for a small white cake at a first birthday, parents and grandparents laughing, pastel balloons behind" },
  { src: "/photos/sangeet.jpg", alt: "Family dancing at a sangeet night under marigold garlands and fairy lights" },
  { src: "/photos/anniversary.jpg", alt: "An older couple laughing at the head of a candlelit anniversary dinner with their family" },
];

/** Celebrations, Western and Indian, under the events list. Generated images, not customers' events. */
const PHOTOS = [
  { src: "/photos/backyard-birthday.jpg", label: "A garden birthday", alt: "Three generations clapping at a long table in a back garden at dusk as a cake with lit candles is carried out under string lights" },
  { src: "/photos/haldi.jpg", label: "A haldi morning", alt: "A bride in yellow laughing as her family apply turmeric at a haldi, marigolds all around" },
  { src: "/photos/first-dance.jpg", label: "A wedding reception", alt: "A bride and groom's first dance on a wooden floor under strings of lights, guests watching from candlelit tables" },
  { src: "/photos/rooftop-launch.jpg", label: "A product launch", alt: "Colleagues talking over drinks on a city rooftop at blue hour, a stage and screen glowing behind them" },
];

const KINDS = [
  { group: "Family and friends", items: ["Birthdays and milestones", "Weddings and engagements", "Anniversaries", "Housewarmings", "Baby showers and namings", "Religious celebrations"] },
  { group: "Work and community", items: ["Office parties", "Team offsites", "Product launches", "Conferences", "College fests", "Community events"] },
];

/** What rises into place as it scrolls into view, and the parent whose children step in one after another. */
const REVEAL = ".rs-sec .rs-h2, .rs-sec .rs-lede, .rs-fan, .rs-line__stop, .rs-card, .rs-kinds__group, .rs-photo, .rs-compare, .rs-close__inner > *";

/** Sections rise into place as they come into view; nothing is hidden when motion is unwelcome or unsupported. */
function useReveal() {
  useEffect(() => {
    const root = document.querySelector(".lp");
    if (!root || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = [...root.querySelectorAll<HTMLElement>(REVEAL)];
    items.forEach((el) => {
      const siblings = [...(el.parentElement?.children ?? [])].filter((c) => c.matches(REVEAL));
      el.style.setProperty("--rs-d", `${Math.max(0, siblings.indexOf(el)) * 90}ms`);
      el.classList.add("rs-reveal");
    });
    const seen = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        seen.unobserve(e.target);
      }),
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
    );
    root.classList.add("lp-motion");
    items.forEach((el) => seen.observe(el));
    return () => {
      seen.disconnect();
      root.classList.remove("lp-motion");
      items.forEach((el) => el.classList.remove("rs-reveal", "is-in"));
    };
  }, []);
}

export function LandingPage() {
  const ex = examplesFor(useRegion());
  // Marigold on ink at night; by day its own ink-blue drawing, which reads far better on ivory than gold.
  const plate = useTheme() === "dark" ? "backdrop" : "backdrop-light";
  useReveal();

  return (
    <div className="lp">
      <a href="#main" className="lp-skip">Skip to content</a>
      <section className="rs" aria-labelledby="hero-title">
        {/* The event, drawn in fine line behind the promise: lanterns, string lights, a long dinner table. */}
        <picture className="rs__plate" aria-hidden="true">
          <source media="(min-width: 1600px)" srcSet={`/plates/${plate}-3840.jpg`} />
          <img src={`/plates/${plate}-1920.jpg`} alt="" fetchPriority="high" />
        </picture>
        <header className="rs__nav">
          <Link to="/" className="rs__brand" aria-label={`${BRAND.name} Events home`}>
            <span className="rs__mark">Plus<em>One</em></span>
            <span className="rs__events">Events</span>
          </Link>
          <nav className="rs__links" aria-label="Main">
            <Link to="/how-it-works" className="rs__link rs__link--wide">How it works</Link>
            <Link to="/vendors" className="rs__link rs__link--wide">Find vendors</Link>
            <Link to="/pricing" className="rs__link">Pricing</Link>
            <Link to={partnerHref("/")} className="rs__link"><span className="rs__wide">For vendors</span><span className="rs__narrow">Partner</span></Link>
            <Link to="/signin" className="rs__link rs__link--accent">Sign in</Link>
          </nav>
        </header>

        <main id="main" className="rs__body">
          <div className="rs__pitch">
            <h1 id="hero-title" className="rs__title">
              Plan it all <span className="rs__keep">in one place.</span> <br />
              <em>Know what you&rsquo;re <span className="rs__keep">paying for.</span></em>
            </h1>
            <p className="rs__lede">
              One app from the first idea to the day itself,{" "}
              <span className="rs__lede-strong">and a team on your side, so you never pay more than you should.</span>
            </p>
            <div className="rs__actions">
              <Link to="/signin?new=1" className="rs__pill rs__pill--solid">Plan an event</Link>
              <Link to="/vendors" className="rs__pill rs__pill--outline">Find vendors</Link>
              <Link to={partnerHref("/")} className="rs__pill rs__pill--outline">List your business</Link>
            </div>
            {/* On a phone the example sits below the fold, so the demo is offered here too. */}
            <Link to="/demo" className="rs__try">See the demo, no sign-up <span aria-hidden="true">&rarr;</span></Link>
          </div>

          <section className="rs__status" aria-labelledby="status-title">
            <h2 id="status-title" className="rs__status-title">{BRAND.name} at work</h2>
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
            <Link to="/demo" className="rs__demo">See it in the demo, no sign-up <span aria-hidden="true">&rarr;</span></Link>
          </section>
        </main>
      </section>

      <section id="how" className="rs-sec" aria-labelledby="how-title">
        <div className="rs-wrap">
          <div className="rs-split rs-how-head">
            <div>
              <h2 id="how-title" className="rs-h2">One app for the whole event. <em>Every quote on the same lines.</em></h2>
              <p className="rs-lede">Planning usually means calls, chats, email and a spreadsheet, and no two quotes written alike. {BRAND.name} puts the plan in one place for the people planning, and gives vendors one sheet to answer on, so every price can be compared.</p>
            </div>
            <div className="rs__fan rs-fan">
              {FAN.map((p) => <img key={p.src} src={p.src} alt={p.alt} width={560} height={700} loading="lazy" decoding="async" />)}
            </div>
          </div>
          <div className="rs-track">
            <h3 className="rs-track__head">For families, teams and event managers</h3>
            <ol className="rs-line">
              {HOW_CUSTOMERS.map((h, i) => (
                <li key={h.title} className="rs-line__stop">
                  <span className="rs-line__node" aria-hidden="true">{i + 1}</span>
                  <h4 className="rs-line__title">{h.title}</h4>
                  <p className="rs-line__text">{h.text}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="rs-track">
            <h3 className="rs-track__head">For vendors, on {BRAND.name} Partner</h3>
            <ol className="rs-line rs-line--4">
              {HOW_VENDORS.map((h, i) => (
                <li key={h.title} className="rs-line__stop">
                  <span className="rs-line__node" aria-hidden="true">{i + 1}</span>
                  <h4 className="rs-line__title">{h.title}</h4>
                  <p className="rs-line__text">{h.text}</p>
                </li>
              ))}
            </ol>
            <p className="rs-note">
              <Link to={partnerHref("/")}>List your business</Link> or <Link to={partnerHref("/demo")}>try it as a sample caterer</Link>, no sign-up.
            </p>
          </div>
        </div>
      </section>

      <section className="rs-sec rs-sec--wash" aria-labelledby="ways-title">
        <div className="rs-wrap">
          <h2 id="ways-title" className="rs-h2">Two ways <em>to plan</em></h2>
          <div className="rs-ways">
            <article className="rs-card">
              <h3 className="rs-card__title">Basic</h3>
              <p className="rs-card__text">The complete planning app: the plan and budget, vendors found and written to, and every quote on the same lines. You see every step and make every call.</p>
            </article>
            <article className="rs-card">
              <h3 className="rs-card__title">Premium</h3>
              <p className="rs-card__text">Everything in Basic, plus a planner from our team who plans it with you, negotiates with each vendor for you and is there when the day needs them.</p>
            </article>
          </div>
          <p className="rs-note">Basic is free to use until launch; Premium opens after launch. <Link to="/pricing">See everything in each plan</Link>.</p>
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

      <section className="rs-sec rs-sec--wash rs-sec--plate-left" aria-labelledby="compare-title">
        <div className="rs-wrap rs-split rs-split--reverse">
          <div>
            <h2 id="compare-title" className="rs-h2">Every reply in its own shape. <em>One answer.</em></h2>
            <p className="rs-lede">Vendors quote per plate, all in, plus service, plus transport. {BRAND.name} reads every reply, PDF or photo of a price list onto the same lines, at your numbers, says what each one leaves out, and lines them up so the best value shows, not just the lowest total.</p>
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
          <h2 id="close-title" className="rs-h2">Plan it, price it, <em>or get found.</em></h2>
          <p className="rs-lede">Plan the whole event with {BRAND.name}, find vendors and see their prices, or list your business for people planning near you.</p>
          <div className="rs-close__actions">
            <Link to="/signin?new=1" className="rs__pill rs__pill--solid rs-close__cta">Plan an event</Link>
            <Link to="/vendors" className="rs__pill rs__pill--outline rs-close__cta">Find vendors</Link>
            <Link to={partnerHref("/")} className="rs__pill rs__pill--outline rs-close__cta">List your business</Link>
          </div>
          <Link to="/demo" className="rs-close__demo">Or see the demo, no sign-up <span aria-hidden="true">&rarr;</span></Link>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot__inner">
          <p className="brand brand--static rs-foot-mark"><img src="/icon-192.png" alt="" width="28" height="28" /><PlusOneLockup /></p>
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
