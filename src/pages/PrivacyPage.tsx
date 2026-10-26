import { Link } from "react-router-dom";
import { PlusOneMark } from "../components/brand/Wordmarks";
import { BRAND } from "../lib/brand";
import { ThemeFooter } from "../components/ui/ThemeFooter";

/**
 * A plain account of what PlusOne stores and who it is shared with. Public, because
 * signing in with Google requires one, and because anyone should be able to read it.
 */
export function PrivacyPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[44rem] px-5 py-12 md:px-8">
      <Link to="/" className="display text-2xl tracking-tight text-accent" aria-label={`${BRAND.name} home`}>
        <PlusOneMark />
      </Link>
      <h1 className="mt-6 text-[2.2rem] leading-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Last updated 26 October 2026.</p>

      <div className="mt-8 grid gap-6 text-[0.98rem] leading-relaxed">
        <section>
          <h2 className="display text-xl">What {BRAND.name} keeps</h2>
          <p className="mt-2 text-muted">
            The event you describe: your names, dates, city, budget and the days you are planning. The vendors {BRAND.name}
            finds for you and what they write back. The guests you add, their email addresses, and their replies,
            including any dietary needs or allergies they mention. If you sign in with Google, your name, email address
            and profile picture. Nothing else, apart from the visit records described below.
          </p>
        </section>

        <section>
          <h2 className="display text-xl">Who else sees it</h2>
          <p className="mt-2 text-muted">
            Anyone you invite to plan with you. Vendors you contact see the emails {BRAND.name} sends on your behalf: your
            names, your dates, your guest numbers, and, when they ask about food, how many guests have an allergy and
            what it is — never a guest's name or address. Your budget is only ever mentioned to a vendor who asks about
            price.
          </p>
        </section>

        <section>
          <h2 className="display text-xl">The services behind it</h2>
          <p className="mt-2 text-muted">
            {BRAND.name} runs on Convex, which stores your plan, and Cloudflare, which serves the site. Anthropic reads vendor replies and writes emails. Firecrawl
            reads vendors' own web pages. AgentMail sends and receives your event's email. PostHog counts which screens
            and buttons are used, with recordings that hide what you type and anything about your guests and vendors, and
            records nothing at all when "hide email addresses" is on. Each sees only what it
            needs for that job, and none of them is given your data to sell or train on.
          </p>
        </section>

        <section>
          <h2 className="display text-xl">Visits, analytics and security</h2>
          <p className="mt-2 text-muted">
            Each visit to the site records your IP address, your approximate location (country, region, city and
            network), your browser and device type, the page you visited, the site that sent you, and the time. We use
            it, first, to understand our visitors — where they come from, roughly where they are and which pages they
            use — so we can improve the Service; and second, to keep the Service secure and to detect scraping, copying
            and misuse.
          </p>
          <p className="mt-2 text-muted">
            The site sets one cookie that recognises your browser across visits. When you are signed in, your visits
            are linked to your account, and so to your email address; visits from the same browser before you signed
            in are linked too. Visits through a VPN or proxy may be flagged. We may use these records to investigate
            abuse, and share them with the authorities where the law requires or allows.
          </p>
          <p className="mt-2 text-muted">
            They are kept for 180 days and then deleted. They are never sold or used for advertising. To ask about
            yours, or to have them deleted, write to{" "}
            <a href={`mailto:hello@${BRAND.domain}`} className="text-accent underline underline-offset-2">
              hello@{BRAND.domain}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="display text-xl">Your choices</h2>
          <p className="mt-2 text-muted">
            You can edit or delete any guest, vendor or day at any time, and remove a event entirely from its settings.
            Deleting a event deletes its guests, vendors and emails with it. To have your account removed, or to ask
            what is held about you, write to the address below and it will be done.
          </p>
        </section>

        <section>
          <h2 className="display text-xl">Contact</h2>
          <p className="mt-2 text-muted">
            Questions, requests and complaints all go
            to{" "}
            <a href={`mailto:hello@${BRAND.domain}`} className="text-accent underline underline-offset-2">
              hello@{BRAND.domain}
            </a>
            .
          </p>
        </section>
      </div>

      <Link to="/" className="btn-quiet btn-sm mt-10">Back to {BRAND.name}</Link>
      <ThemeFooter className="mt-12" />
    </main>
  );
}
