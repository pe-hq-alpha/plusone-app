import { Link } from "react-router-dom";
import { PlusOneMark } from "../components/brand/Wordmarks";
import { BRAND } from "../lib/brand";
import { ThemeFooter } from "../components/ui/ThemeFooter";
import { GRIEVANCE_OFFICER } from "../lib/legal";

/** The terms anyone agrees to by using PlusOne. Public, like the privacy page. */
export function TermsPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-[44rem] px-5 py-12 md:px-8">
      <Link to="/" className="display text-2xl tracking-tight text-accent" aria-label={`${BRAND.name} home`}>
        <PlusOneMark />
      </Link>
      <h1 className="mt-6 text-[2.2rem] leading-tight">Terms of Use</h1>
      <p className="mt-2 text-sm text-muted">Effective 26 October 2026. Last updated 27 October 2026.</p>

      <div className="mt-8 grid gap-6 text-[0.98rem] leading-relaxed">
        <p className="text-muted">PlusOne has been built and run by its founders since September 2026; these terms set out the rules for using it from 26 October 2026. These terms are an agreement between you and PlusOne Events ("PlusOne", "we", "us"), run from Chennai, India. They cover plusoneevents.site, app.plusoneevents.site and everything you reach through them (together, the "Service"). By opening an account or using the Service, you accept them. If you don't accept them, please don't use the Service.</p>
        <section>
          <h2 className="display text-xl">1. What PlusOne does</h2>
          <p className="mt-2 text-muted">PlusOne helps you plan events. It sets out the parts of your event, finds vendors, writes to them from your event's own inbox with your approval, reads their replies, and lines up their quotes so you can compare them.</p>
          <ul className="mt-2 grid gap-1.5 pl-5 text-muted list-disc">
            <li><strong className="text-ink">You make every decision.</strong> PlusOne does not book, pay or sign anything for you unless you tell it to.</li>
            <li><strong className="text-ink">Vendors are independent.</strong> Any agreement for goods or services is between you and the vendor. We are not a party to it and are not responsible for a vendor's work, prices, availability or conduct.</li>
            <li><strong className="text-ink">Quotes are the vendors' own.</strong> We read and compare what vendors send; we can't guarantee a vendor will honour a quote.</li>
            <li><strong className="text-ink">AI can be wrong.</strong> PlusOne uses AI to draft emails, rank vendors and estimate prices. Drafts, rankings and price estimates may be wrong or incomplete. You review what is sent in your name and you are responsible for what is sent and what you agree with a vendor.</li>
            <li><strong className="text-ink">Vendor information comes from the web.</strong> Details PlusOne finds about vendors, such as prices, ratings and contact details, come from public web pages and may be out of date. Check them with the vendor.</li>
          </ul>
        </section>
        <section>
          <h2 className="display text-xl">2. Your account</h2>
          <ul className="mt-2 grid gap-1.5 pl-5 text-muted list-disc">
            <li>Use your real name and accurate details, keep them up to date, and keep your sign-in private.</li>
            <li>One account per person. Don't open an account for someone else without their consent, or under a false identity.</li>
            <li>Use an email address that is yours and that you keep. Don't register or sign in with a temporary, disposable or throwaway email address or service; we may refuse or close accounts that do.</li>
            <li>You are responsible for what happens under your account. Tell us at once at <a href="mailto:hello@plusoneevents.site" className="text-accent underline underline-offset-2">hello@plusoneevents.site</a> if you think someone else has used it.</li>
            <li>You must be 18 or over.</li>
          </ul>
        </section>
        <section>
          <h2 className="display text-xl">3. Your content</h2>
          <p className="mt-2 text-muted">What you put into PlusOne — your event details, guest list, notes, files and messages — stays yours. You give us permission to store, process and send it only as needed to run the Service for you, including sending messages to vendors and guests that you approve. Our Privacy page explains how we handle personal data.</p>
          <p className="mt-2 text-muted">You confirm you are allowed to share any personal details you add about other people, such as guests or family members.</p>
        </section>
        <section>
          <h2 className="display text-xl">4. Our intellectual property</h2>
          <p className="mt-2 text-muted">PlusOne and everything in it, other than your content, belongs to PlusOne Events or its licensors. That includes the software and code; the <strong className="text-ink">design, layout, look and feel, screen flows and user experience</strong>, its architecture, technology stack, integrations, prompts and models, and how they are combined; the text, illustrations, icons, images and videos; the way the Service organises events, vendors and quotes; the collections of information it builds; and the PlusOne and PlusOne Events names, the "+1" mark and other brand features.</p>
          <p className="mt-2 text-muted">You may use the Service only to plan your own events. <strong className="text-ink">Without our prior written permission</strong>, you may not, and may not help anyone else to:</p>
          <ol className="mt-2 grid gap-1.5 pl-5 text-muted list-decimal">
            <li>copy, republish, sell or hand out the Service or anything in it;</li>
            <li><strong className="text-ink">copy, imitate or recreate its design, layout, look and feel, screen flows, features or wording</strong>, in whole or in substantial part, in another product, website or app;</li>
            <li>alter the Service, or make anything that is based on it, built from it or a version of it;</li>
            <li>take apart any part of it to work out how it is made, or try to obtain its source code or to identify, map or recreate its technology stack, architecture or integrations;</li>
            <li>inspect, probe, monitor or analyse the Service's code, network requests, APIs, architecture, technology stack, integrations, prompts or model use — including through browser developer tools, proxies or automated tools — to learn how it is built, or use anything learned that way to design, build or improve another product;</li>
            <li>use the Service, its content or any information from it to build, train, benchmark or improve a competing product or service, or any AI model;</li>
            <li>give the Service, or any part of it — its address, pages, screenshots, screen recordings, images, text, designs or descriptions of how it works — to an AI model, AI agent, code-generation or design tool, or any other person or service, in order to copy, recreate, imitate or build something like it, or instruct any of them to do so;</li>
            <li>harvest or pull information out of the Service in bulk, whether by software or by hand;</li>
            <li>show the Service inside another site or app, run a copy of it, or hide or change any statement of who owns it; or</li>
            <li>use our names, marks or logos, or suggest that we endorse or are affiliated with you.</li>
          </ol>
          <p className="mt-2 text-muted">Written permission means a signed letter, or an email from <a href="mailto:hello@plusoneevents.site" className="text-accent underline underline-offset-2">hello@plusoneevents.site</a>, from PlusOne Events or its authorised representative, that names what is permitted. Nothing else counts: not silence, a demo, a conversation, a video call, or anything said by anyone at PlusOne, including a representative, unless it is confirmed in writing in that way.</p>
        </section>
        <section>
          <h2 className="display text-xl">5. What we show you privately</h2>
          <p className="mt-2 text-muted">Anything PlusOne Events, its founders, staff, developers or representatives show or tell you that we have not made public — in chat, calls, meetings, email, decks, demos, prototypes or test accounts — is confidential. Keep it to yourself, don't use it to design or build any product or service, or to brief anyone, including an AI tool, to do so, and delete it when we ask. Only written permission, as described in section 4, makes it free to use. If you see more of PlusOne before it is public, we may ask you to sign a separate agreement, which then applies as well.</p>
        </section>
        <section>
          <h2 className="display text-xl">6. Using the Service fairly</h2>
          <p className="mt-2 text-muted">You agree not to:</p>
          <ul className="mt-2 grid gap-1.5 pl-5 text-muted list-disc">
            <li>let software, rather than a person, open, watch or test the Service;</li>
            <li>look for weaknesses in how it is protected, or get around any limit, sign-in or protection;</li>
            <li>record, log or analyse the Service's network traffic, or call its back-end APIs other than through the Service itself;</li>
            <li>use a VPN, proxy, Tor or any other means to hide or disguise your identity or location while using the Service, or to get around a block or limit;</li>
            <li>pretend to be someone else, or misstate your connection with anyone;</li>
            <li>message vendors or guests who have not asked to hear from you about something they did not ask for, or use the Service for anything against the law, abusive, harassing or misleading;</li>
            <li>gather details about other people who use PlusOne;</li>
            <li>put anything into it that could damage devices, data or systems;</li>
            <li>abuse the Service, its people, vendors or other users in any way; or</li>
            <li>slow the Service down, put it under strain or stop it working for others.</li>
          </ul>
          <p className="mt-2 text-muted">To keep PlusOne safe, we record visits as described on our <Link to="/privacy" className="text-accent underline underline-offset-2">Privacy</Link> page, including IP addresses linked to accounts, for security and to prevent abuse, never for marketing. We may use those records to investigate abuse and share them with the authorities where the law requires or allows.</p>
        </section>
        <section>
          <h2 className="display text-xl">7. What you share with us</h2>
          <p className="mt-2 text-muted">Unless we have agreed otherwise in a signed written agreement, anything you share with PlusOne Events, its founders, staff, developers or representatives — ideas, suggestions, feedback, plans, examples, contacts or anything else, in any way, including chat, calls, meetings and email — is not confidential to you, and we may use it freely, for any purpose, without paying or crediting you. This does not cover personal data, which our Privacy page governs, or your content in the Service, which section 3 governs.</p>
        </section>
        <section>
          <h2 className="display text-xl">8. Fees</h2>
          <p className="mt-2 text-muted">The Service is free while it is in early access. If we introduce paid plans, we will show the price and the refund terms clearly before you are charged, and nothing will be charged without your agreement.</p>
        </section>
        <section>
          <h2 className="display text-xl">9. Other services</h2>
          <p className="mt-2 text-muted">PlusOne uses other providers to run, for example hosting, email, search and AI models. Links to vendors' and other websites are for your convenience; their own terms apply there, and we don't control them.</p>
          <p className="mt-2 text-muted">If you are a vendor, you can stop PlusOne writing to you at any time by replying STOP to any of its emails, and you can ask us to remove your details by writing to <a href="mailto:hello@plusoneevents.site" className="text-accent underline underline-offset-2">hello@plusoneevents.site</a>.</p>
        </section>
        <section>
          <h2 className="display text-xl">10. No guarantees</h2>
          <p className="mt-2 text-muted">We work hard to keep PlusOne accurate and available, but the Service is offered in the state it is in, whenever it happens to be running. To the extent the law allows, we make no promises that it will always run without breaks or mistakes, or suit any particular purpose, or that information from vendors or found on the web is correct.</p>
        </section>
        <section>
          <h2 className="display text-xl">11. Limits on our liability</h2>
          <p className="mt-2 text-muted">To the extent the law allows, PlusOne Events will not pay for indirect or consequential loss, lost profits or lost data, or for anything a vendor does or fails to do. The most we will pay you, for all claims about the Service together, is the amount you paid us in the 12 months before the claim, or ₹1,000 if you paid nothing. Nothing in these terms limits liability that cannot be limited by law.</p>
        </section>
        <section>
          <h2 className="display text-xl">12. If you break these terms</h2>
          <p className="mt-2 text-muted">You agree to cover our reasonable losses and costs, including legal costs, that arise because you broke these terms or misused of the Service. We may suspend or close your account, remove content, and take legal action, including seeking an injunction to stop any copying or misuse of our intellectual property.</p>
        </section>
        <section>
          <h2 className="display text-xl">13. Ending</h2>
          <p className="mt-2 text-muted">You can stop using PlusOne and delete your account whenever you like, from your account page. We may suspend or end your access if you break these terms, if the law requires it, or to protect the Service or other people. Sections 3 to 7 and 10 to 15 continue after your account ends.</p>
        </section>
        <section>
          <h2 className="display text-xl">14. Law and disputes</h2>
          <p className="mt-2 text-muted">These terms are governed by the laws of India. The courts at Chennai, Tamil Nadu have exclusive jurisdiction over any dispute about them or the Service, except that we may seek urgent relief to protect our intellectual property in any court.</p>
        </section>
        <section>
          <h2 className="display text-xl">15. If part of these terms fails</h2>
          <p className="mt-2 text-muted">If a court finds any part of these terms unenforceable, that part is applied to the greatest extent the law allows, and the rest of the terms stay in force. Our not enforcing a term straight away does not waive it.</p>
        </section>
        <section>
          <h2 className="display text-xl">16. Changes</h2>
          <p className="mt-2 text-muted">We may update these terms. If a change matters, we will tell you in the app or by email before it takes effect. Continuing to use the Service after that means you accept the new terms.</p>
        </section>
        <section>
          <h2 className="display text-xl">17. Contact</h2>
          <p className="mt-2 text-muted">PlusOne Events, Chennai, India · <a href="mailto:hello@plusoneevents.site" className="text-accent underline underline-offset-2">hello@plusoneevents.site</a></p>
          <p className="mt-2 text-muted">Grievance Officer: {GRIEVANCE_OFFICER.name} · <a href={`mailto:${GRIEVANCE_OFFICER.email}`} className="text-accent underline underline-offset-2">{GRIEVANCE_OFFICER.email}</a>. We acknowledge every complaint within 24 hours and resolve it within 15 days.</p>
        </section>
      </div>

      <Link to="/" className="btn-quiet btn-sm mt-10">Back to {BRAND.name}</Link>
      <ThemeFooter className="mt-12" />
    </main>
  );
}
