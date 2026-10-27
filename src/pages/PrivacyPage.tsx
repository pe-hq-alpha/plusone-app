import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "../lib/brand";
import { GRIEVANCE_OFFICER, LEGAL_EFFECTIVE, PRIVACY_UPDATED } from "../lib/legal";
import { setConsent, useConsent } from "../lib/analytics/consent";
import { ANALYTICS_ENABLED } from "../lib/analytics/client";
import { Backdrop } from "../components/ui/Backdrop";
import { PublicNav } from "../components/public/PublicNav";

function Mail({ to }: { to: string }) {
  return (
    <a href={`mailto:${to}`} className="text-accent underline underline-offset-2">
      {to}
    </a>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="display text-xl">{title}</h2>
      {children}
    </section>
  );
}

/**
 * A plain account of what PlusOne stores and who it is shared with. Public, because
 * signing in with Google requires one, and because anyone should be able to read it.
 */
export function PrivacyPage() {
  const consent = useConsent();
  const hello = `hello@${BRAND.domain}`;
  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <PublicNav />
    <main id="main" className="mx-auto w-full max-w-[44rem] px-5 pb-12 pt-10 md:px-8">
      <h1 className="mt-6 text-[2.2rem] leading-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Effective {LEGAL_EFFECTIVE}. Last updated {PRIVACY_UPDATED}.</p>

      <div className="mt-8 grid gap-6 text-[0.98rem] leading-relaxed">
        <Section title="Who we are">
          <p className="mt-2 text-muted">
            {BRAND.name} Events is run by its founders from Chennai, India. We are setting up a private limited company to
            run it; once it is registered, its name will be given here. Until then, &ldquo;we&rdquo; means {BRAND.name} Events
            and its founders.
          </p>
        </Section>

        <Section title={`What ${BRAND.name} keeps`}>
          <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-muted">
            <li>The event you describe: your names, dates, city, budget and the days you are planning.</li>
            <li>The vendors {BRAND.name} finds for you, with the email addresses and phone numbers on their own websites, and what they write back.</li>
            <li>The guests you add, their email addresses, and their replies, including any dietary needs or allergies they mention.</li>
            <li>Your conversations with {BRAND.name}&rsquo;s assistant, including the one that sets up a new event.</li>
            <li>Files you upload: photos, contracts and quotes, and guest lists.</li>
            <li>Your account: the name, email address and profile picture you sign in with.</li>
            <li>The visit records described below.</li>
          </ul>
        </Section>

        <Section title="Allergies and dietary needs">
          <p className="mt-2 text-muted">
            A guest&rsquo;s allergies and dietary needs are health information. They are used only to brief the vendors who
            serve food and drink, as numbers and allergens, never with a guest&rsquo;s name. Meta, or Anthropic as a backup,
            handles them only to read guests&rsquo; replies and, as those counts without names, to write to food vendors.
          </p>
        </Section>

        <Section title="Who else sees it">
          <p className="mt-2 text-muted">
            Anyone you invite to plan with you. Vendors you contact see the emails {BRAND.name} sends on your behalf: your
            names, your dates, your guest numbers, and, when they ask about food, how many guests have an allergy and
            what it is &mdash; never a guest&rsquo;s name or address. Your budget is only ever mentioned to a vendor who asks
            about price.
          </p>
        </Section>

        <Section title="How AI is used">
          <p className="mt-2 text-muted">
            {BRAND.name} uses AI to draft emails to vendors and guests, to read their replies, and to estimate which vendors
            fit best and what things are likely to cost. These drafts and estimates can be wrong, so check them before you
            rely on them. Emails it drafts say so at the bottom.
          </p>
        </Section>

        <Section title="The services behind it">
          <p className="mt-2 text-muted">
            {BRAND.name} runs on Convex, which stores your plan, and Cloudflare, which serves the site. Clerk handles sign-in.
            Meta reads vendor and guest replies and writes emails, with Anthropic as a backup. Firecrawl reads vendors&rsquo; own
            web pages. AgentMail
            sends and receives your event&rsquo;s email. Resend sends the weekly update email. PostHog counts which screens and
            buttons are used, only if you allow it, and never records your screen. Each sees only what it needs for that
            job, and none of them is given your data to sell. None of them trains on it, with one exception: while we use
            Meta&rsquo;s trial credits, Meta may use what we send it to improve its products.
          </p>
        </Section>

        <Section title="Where it is processed">
          <p className="mt-2 text-muted">
            Convex stores your data in Ireland, in the European Union. Cloudflare serves the site from its locations around
            the world. Meta, Anthropic, PostHog, Clerk and our other providers process data in the United States or the
            European Union.
          </p>
        </Section>

        <Section title="Visits and security">
          <p className="mt-2 text-muted">
            Each visit to the site records your IP address, your approximate location (country, region, city and
            network), your browser and device type, the page you visited, the site that sent you, and the time. We use
            these records only to keep the Service secure and to detect and prevent scraping, copying, fraud and other
            misuse. They are never used for marketing or advertising, and never sold.
          </p>
          <p className="mt-2 text-muted">
            When you are signed in, your visits are linked to your account, and so to your email address; visits from the
            same browser before you signed in are linked too. Visits through a VPN or proxy may be flagged. We may use these
            records to investigate abuse, and share them with the authorities where the law requires or allows. They are
            kept for 180 days and then deleted.
          </p>
        </Section>

        <Section id="cookies" title="Cookies and storage">
          <p className="mt-2 text-muted">
            The site sets one cookie of its own, <code>po_vid</code>, which recognises your browser across visits for the
            security records above. It is essential, lasts 180 days, and is not used for anything else. Clerk sets the
            cookies that keep you signed in. Your browser also keeps a few settings for this site, such as your theme and
            your choice about analytics.
          </p>
          <p className="mt-2 text-muted">
            Analytics run only if you choose &ldquo;Allow analytics&rdquo;. With &ldquo;Essential only&rdquo;, nothing about
            how you use the app is sent from your browser.
            {ANALYTICS_ENABLED && (
              <>
                {" "}Your choice now: {consent === "analytics" ? "analytics allowed" : consent === "essential" ? "essential only" : "not made yet"}.{" "}
                <button type="button" className="text-accent underline underline-offset-2" onClick={() => setConsent(null)}>
                  Change it
                </button>
              </>
            )}
          </p>
        </Section>

        <Section title="How long we keep it">
          <p className="mt-2 text-muted">
            Your events and everything in them are kept while your account is open. When you delete an event or your
            account, it is removed from the app straight away and deleted from our systems within 90 days. Visit records
            are kept for 180 days. A vendor who asks not to be contacted again stays on a do-not-contact list, so that
            request keeps being honoured.
          </p>
        </Section>

        <Section title="Your rights">
          <p className="mt-2 text-muted">You can ask us to:</p>
          <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-muted">
            <li>tell you what we hold about you, and give you a copy;</li>
            <li>correct anything that is wrong or out of date;</li>
            <li>erase your data, which you can also do yourself by deleting events or your account;</li>
            <li>stop using your data where you gave consent, such as for analytics;</li>
            <li>let someone you nominate act for you if you die or cannot act yourself.</li>
          </ul>
          <p className="mt-2 text-muted">
            Write to the Grievance Officer below. If you are not happy with our answer, you can complain to the Data
            Protection Board of India, or to the data protection regulator where you live.
          </p>
        </Section>

        <Section title="Children">
          <p className="mt-2 text-muted">
            {BRAND.name} is not for anyone under 18. If you think someone under 18 has signed up, write to us and we will
            delete the account.
          </p>
        </Section>

        <Section title="If something goes wrong">
          <p className="mt-2 text-muted">
            If a breach affects your personal data, we will tell you, and the Data Protection Board of India where the law
            requires, as soon as we can, with what happened and what you can do.
          </p>
        </Section>

        <Section title="Your choices">
          <p className="mt-2 text-muted">
            You can edit or delete any guest, vendor or day at any time, and remove an event entirely from its settings.
            Deleting an event deletes its guests, vendors, emails and files with it. You can delete your account from your
            account page.
          </p>
        </Section>

        <Section title="Grievance Officer">
          <p className="mt-2 text-muted">
            {GRIEVANCE_OFFICER.name}, {BRAND.name} Events, Chennai, India &middot; <Mail to={GRIEVANCE_OFFICER.email} />
          </p>
          <p className="mt-2 text-muted">We acknowledge every complaint within 24 hours and resolve it within 15 days.</p>
        </Section>

        <Section title="Contact">
          <p className="mt-2 text-muted">
            Questions and requests go to <Mail to={hello} />.
          </p>
        </Section>
      </div>

      <Link to="/" className="btn-quiet btn-sm mt-10">Back to {BRAND.name}</Link>
    </main>
    </div>
  );
}
