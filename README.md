<div align="center">

<img src="assets/banner.jpg" width="100%" alt="PlusOne Events: the headline 'Your plus one for every event' beside the Today screen of a sample 60th birthday in Chennai, with the co-pilot's route of done, under way and over-to-you steps">

# PlusOne Events

[![Live site](https://img.shields.io/badge/Live-plusoneevents.site-f4b53a?style=for-the-badge&labelColor=11141c)](https://plusoneevents.site)
[![Try the demo](https://img.shields.io/badge/Try_the-demo-f4b53a?style=for-the-badge&labelColor=11141c)](https://app.plusoneevents.site/demo)
[![How it works](https://img.shields.io/badge/How_it-works-f4b53a?style=for-the-badge&labelColor=11141c)](#how-it-works)
[![Run it yourself](https://img.shields.io/badge/Run_it-yourself-f4b53a?style=for-the-badge&labelColor=11141c)](#run-it-yourself)
[![Real runs](https://img.shields.io/badge/Real-runs-1f2a5c?style=for-the-badge)](#real-runs)

![Event](https://img.shields.io/badge/event-Meta_Global_AI_Developer_Hackathon-f4b53a?style=flat-square&labelColor=11141c)
![Track](https://img.shields.io/badge/track-Startup-f4b53a?style=flat-square&labelColor=11141c)
![Status](https://img.shields.io/badge/status-working_end_to_end-c4dfbc?style=flat-square&labelColor=11141c)
![Tests](https://img.shields.io/badge/tests-356_passing-c4dfbc?style=flat-square&labelColor=11141c)
[![License](https://img.shields.io/badge/license-FSL--1.1--ALv2-b3b7c3?style=flat-square&labelColor=11141c)](LICENSE.md)

<table align="center">
<tr>
<td align="center" width="190"><img src="assets/logos/convex.svg" width="56" height="56" alt="Convex"><br><b>Convex</b><br><sub>The platform. Database, server functions, workflows, scheduling and webhooks in one.</sub></td>
<td align="center" width="190"><img src="assets/logos/claude.svg" width="56" height="56" alt="Claude"><br><b>Claude</b><br><sub>The reading and writing. Plans, vendor emails, quotes and replies.</sub></td>
<td align="center" width="190"><img src="assets/logos/firecrawl.png" width="56" height="56" alt="Firecrawl"><br><b>Firecrawl</b><br><sub>The search. Reads vendors' own websites, down to their pricing pages.</sub></td>
<td align="center" width="190"><img src="assets/logos/agentmail.png" width="56" height="56" alt="AgentMail"><br><b>AgentMail</b><br><sub>The event's inbox. Every event gets its own address.</sub></td>
</tr>
</table>

![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=white&labelColor=11141c)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white&labelColor=11141c)
![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite&logoColor=white&labelColor=11141c)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white&labelColor=11141c)
![Convex](https://img.shields.io/badge/Convex-1.45-ee342f?style=flat-square&labelColor=11141c)
![Clerk](https://img.shields.io/badge/Clerk-sign--in-6c47ff?style=flat-square&logo=clerk&logoColor=white&labelColor=11141c)
![Resend](https://img.shields.io/badge/Resend-app_email-000000?style=flat-square&logo=resend&logoColor=white&labelColor=11141c)
![PostHog](https://img.shields.io/badge/PostHog-usage-f54e00?style=flat-square&logo=posthog&logoColor=white&labelColor=11141c)

</div>

PlusOne Events is a complete co-pilot for event planning in India, for people who plan from anywhere. Tell PlusOne about the event in your own words and, once it has checked everything with you, it sets out the plan: the functions or sessions, the vendors each one needs and a budget. Then it does the slow part. It finds vendors on the open web, writes to them from the event's own inbox, chases the ones who go quiet, and lines up their quotes in one unit, per plate, per piece or per day. The host makes every decision.

It is built for the events families and teams actually hold: birthdays and sixtieths, housewarmings and griha pravesams, naming ceremonies, poojas at home, baby showers, anniversaries and engagements; office parties, team offsites, product launches, conferences, college fests and community festivals. Weddings are one of the sixteen types too.

Try it at [app.plusoneevents.site/demo](https://app.plusoneevents.site/demo), with no sign-up. Three sample events open there, all in rupees: Amma's 60th birthday in Chennai (the default), a griha pravesam in Bengaluru (`/demo?sample=housewarming`) and an office Diwali party in Gurugram with no alcohol (`/demo?sample=office`). Their vendors are made up, so nothing is really sent.

PlusOne placed second at Convex's All Gas hackathon. For the Meta Global AI Developer Hackathon (Startup track), it is being built into a product for events of every kind.

**For the judges:** open [the demo](https://app.plusoneevents.site/demo), start on **Today**, then follow **Vendors → Compare** to see three catering quotes read into one price per plate.

## How it works

<img src="assets/screens/landing.jpg" width="100%" alt="The home page: 'Your plus one for every event' beside an example of the co-pilot at work for Amma's 60th in Chennai">

1. **Talk it through.** "Amma's 60th in Chennai, a homam at home and lunch for about 120." PlusOne asks for whatever it still needs, one thing at a time, reads everything back for you to confirm, and points out anything that can't be right, like a weekday that doesn't match the date or a budget missing a zero. It builds the plan only once every line is confirmed. The model only reads each message; what to ask next and when the plan is ready are fixed rules (`/new`, `convex/planningChat.ts`, with the rules in `convex/lib/planningChat.ts`). A manual form at `/new/manual` does the same step by step.
2. **Open on Today.** The app opens on the co-pilot's route through the event: what is **done**, what is **under way**, what is **over to you** and what is **up next**, each with the button that finishes it. It is read straight from the plan, so it is instant and never disagrees with the pages it links to (`src/pages/TodayPage.tsx`, `convex/copilot.ts`). A box beside it takes a change or a question in plain words: "we're now 140 people", "find us a photographer".

<img src="assets/screens/today.jpg" width="100%" alt="Today for the sample 60th birthday: four done steps, two under way, one over to you, with the budget and a box to tell PlusOne a change">

3. **Move through four lanes.** A top bar holds Today, Plan, Vendors and People. Each lane shows its pages as stops on a line: Plan has the functions, to-dos, budget and Spaces; Vendors has Find, Compare and Inbox; People has guests, gifts, the event page and the planning team (`src/components/EventLayout.tsx`). Each function has its own time, place, headcount, budget, vendors and to-dos, and the words follow the event: functions and guests for a birthday, sessions and attendees for a conference.

<table>
<tr>
<td width="30%" valign="top"><img src="assets/screens/today-phone.jpg" alt="Today on a phone, with the four lanes as a bar along the bottom"></td>
<td valign="top"><img src="assets/screens/plan.jpg" alt="The Plan lane: the event, its budget committed, a morning pooja and a birthday lunch, and the next to-dos"><br><sub>On a phone the four lanes move to a bar along the bottom. On a laptop, the Plan lane: the event, the money committed so far, its two functions and what to do next.</sub></td>
</tr>
</table>

4. **Find vendors on the open web.** For each need, PlusOne runs several short searches at once (the kind of vendor and the area, the style, a rounded budget such as "under ₹40,000"), reads vendors' own websites down to the contact and pricing pages most searches never open, and ranks what it finds on reviews, price against the budget and fit, with a reason for each. Every price links back to the page it came from.
5. **Write from the event's own inbox.** Once the host confirms a shortlist, PlusOne sends the inquiries from the event's own address, follows up with vendors who go quiet (up to three times) and answers the simple questions they ask. Anything that is the host's to decide comes back as one clear question, on Today and in the inbox.

| Vendors found on the open web | The event's inbox |
|---|---|
| <img src="assets/screens/vendors.jpg" alt="Find: a priest for the morning pooja, researched on the open web, with the best match ranked on reviews, price against the budget and fit"> | <img src="assets/screens/inbox.jpg" alt="The inbox: six vendor conversations with their status, and the first email to a nadaswaram group with a follow-up due"> |

6. **Line up quotes in one unit.** Vendors quote per plate, all in, plus service, plus transport, each for a headcount of their own choosing. A price in a reply, or in a PDF attached to it, is read into a quote with its lines, and Compare puts every quote in the same unit at the host's own numbers: per plate for food, per piece for gifts and hampers, per day for stays and transport, all in for the rest (`convex/lib/comparable.ts`). It says what each quote leaves out ("GST extra", "Priced for 150; you expect 120") and refuses a per-unit figure when the lines don't add up to the total.

<img src="assets/screens/decisions.jpg" width="100%" alt="Compare for the sample birthday: three catering quotes from ₹456 to ₹517 a plate for 120, with what each includes and leaves out">

7. **Keep the budget honest.** A quote moves the budget by itself, with an undo; one that looks off (another currency, an offer for something already booked, a price far from the plan) waits for the host. The budget is split by function and by kind of vendor, and every deposit, balance and vendor deadline sits in one list that can go to a calendar.
8. **Run guests and RSVPs.** Each guest gets one invitation from the event's inbox and their own RSVP link. Replies in their own words or on the link are saved for each function, with head counts and food needs, and caterers who ask get the allergies and numbers, never the names. A guest list can come in from a spreadsheet, a PDF or a paste.
9. **Give the event a page, and share the plan.** The event page is written from the plan, with dress, travel and how to reply, and stays private until it is published. A gift list lets each guest pick a gift so nobody brings the same thing twice. The plan prints on one page, or goes to family or colleagues as a read-only link with no emails, guest names or vendor contacts in it. Everything in an event can be downloaded as one file.

The rest of the app:
- **Spaces**, one open board per event to pan and zoom, with a zone for each function or session: pictures, links from Instagram, Pinterest, TikTok or any page, notes, colour swatches and pinned vendors, with palettes suggested from the pictures.
- **People planning together:** owner, planner and viewer roles, with single-use invite links that can be revoked.
- **Emails from PlusOne:** a weekly update on Fridays that skips quiet weeks, with a way to stop it.
- **A guided tour**, "Show me around", that points at the real controls on each page.
- **Dark ink and marigold by default**, with a light theme of ink blue on ivory; pick Light, Dark or Device. A new event's currency follows where the visitor is, so money shows in rupees in India and dollars in the US.
- **It installs on a phone like an app**, and a link shared to it from another app lands in a Space.

## Care taken

- **The host stays in charge.** PlusOne never books, pays or signs. It drafts, sends and chases; every decision is the host's.
- **Nobody is pestered.** Follow-ups stop after three. A vendor who asks not to be contacted is never written to again, by any event, and first emails say how to stop them.
- **Every number has a source.** Prices link to the vendor's page or the reply they came from, and a per-plate figure is shown only when the quote's lines add up.
- **A misread price never moves the budget by itself.** Quotes that look off wait for the host, and the rest can be undone.
- **Usage is measured without reading what people write.** Usage events carry names and safe numbers only, stay off until a key is set, and in the browser start only once the visitor allows them.
- **Guest pages stay private.** The event page, RSVP links and shared plans use long random addresses, ask search engines not to list them, and show only the fields they need.
- **Data is the host's to remove.** An event can be deleted from its settings and an account from the account page, with the files they stored.
- **The demo is safe to click.** Its vendors are made up and its emails are simulated, never sent; each demo visitor gets a fresh sample of their own, with tighter rate limits.

## Real runs

| What | Result | When | How |
|---|---|---|---|
| Tests | 356 passed in 35 files, including the quote comparison, the planning conversation's rules, the board's geometry, the co-pilot's route and a contrast check of every text colour in the light and dark themes | 25 Oct 2026 | `npm test` |
| Typecheck, app and backend | Clean | 25 Oct 2026 | `npm run typecheck` |
| The three sample events | Each opened from `/demo` for a new visitor (the birthday, `?sample=housewarming`, `?sample=office`); eleven screens captured with 0 page errors; at phone width (390 px) the page is exactly as wide as the screen, with no sideways scroll | 25 Oct 2026 | Headless Chrome (playwright-core) against the dev server and the dev backend; these are the screenshots in this README |
| Vendor search terms, old against new | Vendors' own websites among results kept: 9 of 27 with the new short terms against 5 of 26 with the old single sentence, for about half the credits | 20 Oct 2026 | A one-off before/after run of three briefs against Firecrawl |
| Page load from India | First byte in 0.08–0.09 s from Cloudflare's edge, down from 0.9–1.2 s | 18 Oct 2026 | `curl` timing from Chennai |

## The tech, part by part

| Part | Built with | What it does |
|---|---|---|
| App | React 19, React Router 7, Vite 8, Tailwind CSS 4, dnd-kit, lucide-react, EB Garamond and Work Sans | Every screen, in `src/pages/` and `src/components/`; the four-lane top bar in `src/components/EventLayout.tsx`; the themes in `src/lib/theme.ts` and `src/index.css` |
| Backend and database | Convex 1.45, with the workflow, workpool, rate-limiter, action-cache and static-hosting components | Schema, queries, mutations, actions, crons and webhooks in `convex/` |
| The planning conversation | Claude (`claude-haiku-5-5`) plus own rules | `convex/planningChat.ts` reads each message into facts; `convex/lib/planningChat.ts` decides what to fix, ask or read back and when the plan is ready; `convex/lib/wizard.ts` fills in defaults by event type from `convex/lib/templates.ts` and turns the result into an event; the page is `src/pages/NewEventPage.tsx` |
| Event types | Own code | Sixteen types in three groups (family, work and community, other), with the words each one uses, in `convex/lib/occasion.ts` |
| Today | Own code, no model | The co-pilot's route in `convex/copilot.ts`, drawn by `src/pages/TodayPage.tsx`; the "Tell PlusOne" box goes to `convex/assistant.ts`, and anything it proposes to change waits on a card until someone presses its button |
| Reading and writing | Claude through the Anthropic SDK: `claude-sonnet-5-5` for plans, emails, quotes and imports; `claude-haiku-5-5` for quick reads | `convex/lib/claude.ts` and `convex/claude.ts`, with one house style sent ahead of every request; both models can be changed with `ANTHROPIC_MODEL_SMART` / `ANTHROPIC_MODEL_FAST` |
| Vendor search | Firecrawl | Short search terms in `convex/lib/searchTerms.ts`; research, ranking and contact and pricing pages in `convex/research.ts` and `convex/firecrawl.ts`, with a cache in `convex/webCache.ts` |
| The event's inbox | AgentMail | One inbox per event, named after the hosts' first names on the deployment's domain, in `convex/agentmail.ts` and `convex/lib/inboxName.ts`; sending, replies and follow-ups in `convex/outreach.ts`, `convex/inbound.ts` and `convex/followups.ts`; the do-not-contact list in `convex/doNotContact.ts`. Each deployment keeps its inboxes in its own AgentMail pod, with a webhook that hears only that pod |
| Quotes in one unit | Own code | `convex/lib/comparable.ts` puts each quote per plate, per piece, per day or all in, at the host's numbers, with its flags; `convex/quotes.ts` and `convex/lib/quoteHold.ts` decide when a quote waits and handle the undo; the page is `src/pages/DecisionsPage.tsx` |
| Budget, dues and currencies | Own code | `convex/budget.ts` and `convex/dues.ts`; the calendar file is made in the browser by `src/lib/calendar.ts`; currency by region in `src/lib/currency.ts` and `src/lib/region.ts` |
| Sample events | Own code | `convex/demoBirthday.ts` (Chennai), `convex/demoHousewarming.ts` (Bengaluru) and `convex/demoOfficeParty.ts` (Gurugram), started fresh for each visitor by `convex/demo.ts` and `src/pages/GuestPage.tsx` |
| Sign-in | Clerk, with Convex Auth for the demo | Accounts sign in with Clerk in `src/lib/session.tsx` and `src/pages/SignInPage.tsx`; the first sign-in finds an earlier account by its verified email, in `convex/users.ts`. Demo visitors get short-lived guest tokens from Convex Auth (`convex/auth.ts`), so the demo needs no account |
| Guests, event page and gifts | Own code | Guests and RSVPs in `convex/guests.ts` and `convex/lib/rsvp.ts`; the event page in `convex/site.ts` with `src/pages/SitePage.tsx` and `src/pages/RsvpPage.tsx`; gifts in `convex/gifts.ts` |
| Spaces | Own code, plus TikTok, Pinterest and YouTube previews and any page's own tags | The board in `src/components/board/Board.tsx`, with its geometry in `src/lib/board.ts`; `convex/spaces.ts` for pictures, links, notes, swatches, pinned vendors, previews and palettes (suggested by `claude-haiku-5-5`), with `convex/lib/links.ts`, which refuses private addresses; the phone share target in `public/manifest.webmanifest`, landing in `src/pages/SharePage.tsx` |
| Sharing, import and export | Own code, fflate for spreadsheets, plus Claude | Read-only links in `convex/shareLinks.ts`, the one-page plan in `src/components/PlanSheet.tsx`, the full download in `convex/exports.ts`; guest-list imports in `convex/guestImport.ts` |
| App emails | Resend, via the Convex component | The weekly update in `convex/digest.ts`, sent Fridays by `convex/crons.ts`, through the Resend client in `convex/appEmails.ts`; the +1 logo for mail apps that show one in `public/bimi.svg` |
| Usage | PostHog | Counts what people do, never what they write, in `convex/analytics.ts` and `src/lib/analytics/`; it starts only after a visitor allows analytics on the consent bar (`src/components/ConsentBar.tsx`), with session recordings off, and `functions/ingest/` forwards events without the visitor's IP address |
| Hosting | Cloudflare Pages and a Worker, Convex in Ireland | The built app is served from Cloudflare's edge on plusoneevents.site (home) and app.plusoneevents.site (app); `src/lib/hosts.ts` keeps each page on its own address, and `functions/geo.ts` says which country and state a visit comes from. The backend runs on Convex in Europe (Ireland) |

Rate limits on searches, emails, invites, sign-ups, planning conversations, imports, links added to Spaces, palettes, RSVPs, gifts and the assistant are in `convex/rateLimits.ts`, with tighter limits for demo visitors and a daily ceiling across all events for research, the assistant and drafting.

## Run it yourself

You need Node 20 or later, a Convex account and a Clerk application with a JWT template named `convex` (claims `aud: convex`, `name`, `email`, `email_verified`).

```bash
git clone https://github.com/pe-hq-alpha/plusone-app.git plusone && cd plusone
npm install
npx convex dev --once     # first run: sign in and create a dev deployment (writes .env.local)
npm run dev               # the app on http://localhost:5173, and the backend watching for changes
```

Or run `./start.sh`, which checks Node, installs what's missing, warns about any backend key not yet set on the deployment, and then starts both.

Backend keys are set on the deployment, for example `npx convex env set ANTHROPIC_API_KEY …`, never in a file. To deploy:

```bash
npx convex deploy -y                                                    # the backend
VITE_CONVEX_URL=https://<deployment>.convex.cloud \
VITE_HOME_ORIGIN=https://<home> VITE_APP_ORIGIN=https://app.<home> \
VITE_CLERK_PUBLISHABLE_KEY=pk_live_… npx vite build                     # the app, built against it
npx wrangler pages deploy dist --project-name <pages-project>          # served from Cloudflare Pages
node scripts/agentmail-setup.mjs https://<deployment>.convex.site <pod-id>   # once: the inbox webhook
```

The app can also be served by Convex itself: `npm run deploy`.

| Variable | For |
|---|---|
| `ANTHROPIC_API_KEY` | Reading descriptions, plans, emails, quotes, imports and the assistant |
| `ANTHROPIC_MODEL_SMART`, `ANTHROPIC_MODEL_FAST` | Optional. Override `claude-sonnet-5-5` and `claude-haiku-5-5` |
| `FIRECRAWL_API_KEY` | Vendor search |
| `AGENTMAIL_API_KEY`, `AGENTMAIL_WEBHOOK_SECRET`, `AGENTMAIL_INBOX_DOMAIN` | The event inboxes and their incoming mail |
| `AGENTMAIL_FALLBACK_INBOX_ID` | Optional. An inbox to use when an event can't get its own |
| `AGENTMAIL_INBOX_LIMIT` | Optional. How many inboxes the AgentMail plan allows, 3 by default |
| `AGENTMAIL_POD_ID` | Optional. The AgentMail pod this deployment keeps its inboxes in, so production and dev never share mail |
| `SITE_URL` | Links in emails back to the app |
| `CLERK_JWT_ISSUER_DOMAIN` | The Clerk instance whose sign-ins the backend accepts, such as `https://clerk.<home>` |
| `JWT_PRIVATE_KEY`, `JWKS` | Keys for the demo's guest tokens (Convex Auth) |
| `RESEND_API_KEY`, `EMAIL_FROM` | The app's own emails |
| `EMAIL_LIVE` | Optional. `1` to send app emails; anything else keeps them in test mode |
| `EMAIL_UNSUBSCRIBE_SECRET` | Signs the stop links in app emails |
| `POSTHOG_KEY`, `POSTHOG_HOST` | Optional. Usage events from the server |
| `VITE_CONVEX_URL` | The app's link to its backend (written by `npx convex dev`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | The app's Clerk key: `pk_test_…` for development, `pk_live_…` for the live site |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | Optional. Usage events from the app |
| `VITE_HOME_ORIGIN`, `VITE_APP_ORIGIN` | Optional. The home page's address and the app's; set both to split them across two addresses, or neither to keep one |

## Status and limits

Planning works end to end: the planning conversation, the plan, Today, vendor search, emails, replies, quotes in one unit, the budget and dues, guests and RSVPs, the event page, gifts, sharing, imports, Spaces, the weekly update and people planning together.

- Vendor search is only as good as vendors' own websites: a vendor with no prices online comes back without one, until it replies.
- Compare shows the range across the quotes an event has received; a price that cannot be put in the unit honestly is shown as quoted, not converted.

## Next steps

- **Meta's models for every visible step:** reading descriptions and replies, writing to vendors and the co-pilot's route, for the hackathon.
- **A fair range for each city:** built from quotes across events, so Compare says where a price sits for that city and season.
- **A team on the ground:** people who step in when an event needs hands, alongside the co-pilot.
- **Updates on WhatsApp:** the weekly update and urgent alerts for those who opt in, with STOP honoured at once.
- **Billing:** Stripe outside India and Razorpay in India.
- **The long run:** standard vendor prices and a vetted vendor network, booked through PlusOne.

## Repository

**History.** PlusOne Events is an early-stage startup being built in semi-stealth, so this repository starts from a snapshot of earlier private work rather than its full history. The first commit, tagged [`pre-hackathon`](../../tree/pre-hackathon) (25 October 2026), is the product as it stood before the hackathon; every commit after it was made during the hackathon, from 26 October. The earlier history is kept privately.


| Path | What it is |
|---|---|
| `src/pages/` | One file per screen: Today, the plan and each function, to-dos, budget, Spaces, Find, Compare, Inbox, guests, gifts, the event page, the planning team, settings and the new-event pages, plus the guest pages for the event page, RSVP links and shared plans |
| `src/components/` | Shared pieces: the four-lane layout (`EventLayout.tsx`), the guided tour, the wordmark in `src/components/brand/` |
| `convex/` | The backend: `schema.ts` and one file per area, with tests beside them |
| `convex/lib/` | Pure rules shared with the app: quote comparison, the planning conversation's rules, event types and their words, templates, inbox names, search terms |
| `DESIGN.md`, `PRODUCT.md` | The design system (colours, type, components) and the product brief |
| `scripts/` | `agentmail-setup.mjs` registers a deployment's inbox webhook; `fake-webhook.mjs` sends a signed test email to it |
| `functions/` | Cloudflare Pages Functions: `geo.ts` for a visit's country and state, `ingest/` for analytics |
| `public/` | Icons, the install manifest, the share image and the mail logo |
| `assets/` | This README's banner (source in `assets/src/banner.html`), screenshots and logos |

```bash
npm test             # backend and app tests
npm run typecheck    # app and backend
npm run build        # production build
```

## License

[FSL-1.1-ALv2](LICENSE.md), the Functional Source License. You can read, run and change it for anything except offering a competing commercial product. Each version becomes Apache 2.0 two years after it's published.
