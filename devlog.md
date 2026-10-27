# Devlog

- **Project:** PlusOne Events
- **Event:** Meta Global AI Developer Hackathon (Cerebral Valley), 26 Oct – 4 Nov 2026
- **Team:** two founders
- **What it does:** A co-pilot for planning any event (a birthday, a wedding, an office party): it talks the plan through, sets out the parts of the event, the vendors each needs and a budget, then finds vendors, writes to them from the event's own inbox, chases replies and lines their quotes up in one unit, while the people planning make every decision.
- **Problem:** People planning a family function or a work event juggle many vendors, quotes and people across calls, chats and spreadsheets, with nothing holding the plan together or making quotes comparable.
- **Status:** deployed
- **Live app:** https://plusoneevents.site
- **Demo:** not recorded
- **Repo:** private until submission (pe-hq-alpha/plusone-app)
- **Stack:** TypeScript, React 19, React Router 7, Vite 8, Tailwind CSS 4, Convex 1.45 (database, functions, crons, workflow, workpool, rate-limiter and action-cache components)
- **Hosting:** Cloudflare Pages for the app; Convex (Ireland) for the backend
- **Auth:** Clerk; Convex Auth guest sessions for the sample events
- **External services:** AgentMail (event inboxes), Firecrawl (vendor search), Resend (app emails), PostHog (usage), Meta Model API (Muse Spark)
- **AI models (product):** muse-spark-1.3 (Meta Model API, Chat Completions with JSON Schema output) for every reading and writing step, live in production since 27 Oct; claude-haiku-5-5 and claude-sonnet-5-5 as the fallback when Meta can't answer. Coming: Muse Voice Transcribe, SAM 3.1, Muse Wonder, Muse Spark Open.
- **AI models (build):** Claude Code with claude-opus-5-5; Muse Code (Everyday plan, from 27 Oct), every session logged under Muse Code below
- **Track:** Startup
- **Meta models used:** Muse Spark 1.3 (live); planned: Muse Wonder, Muse Voice Transcribe, SAM 3.1 and the open-weights Muse Spark Open; Muse Code for building
- **Credits spent:** under $0.01 of $150 in our own measured runs (27 Oct); every call is recorded in `modelCalls`, to be reconciled with Meta Billing
- **Started:** 2026-09-15T20:55:44+05:30
- **Last updated:** 2026-10-27T20:55:00+05:30

## Evidence

| Claim | Evidence | Status |
|---|---|---|
| Muse Spark runs the agent | Every call site goes through `convex/lib/models.ts`; production runs `muse-spark-1.3` since 27 Oct; a production RSVP read on 27 Oct returned a correct structured answer (field notes) | partial: end-to-end runs on real events still to record |
| SAM 3.1 turns inspiration photos into decorator briefs | none yet | missing |
| Decor shown on the real venue | none yet | missing |
| Open-weights model for cheap calls | none yet | missing |
| Credits spent per run | `modelCalls` records feature, model, tokens and list-price cost for every call; first production call $0.0053 (1,214 in, 880 out) | partial: per-feature totals still to report |
| Screenshots of the Meta features | none yet | missing |
| Demo video | not recorded | missing |
| Live URL with the Meta features | plusoneevents.site runs Muse Spark in production (27 Oct) | done for Muse Spark |
| Muse Code used in the build | Everyday plan from 27 Oct; first session built the SAM 3.1 adapter (`46df7a5`), logged in the Muse Code table below | done: 2 sessions |

## Muse Code

Muse Code is Meta's coding agent. We subscribed to the Everyday plan on 27 Oct 2026 (Muse Spark, Muse Wonder and Muse Image; 10 to 50 prompts every 5 hours; voice mode; web search), run in Standard mode with Contributor off, so our code and prompts are not used for training. One founder uses it. It builds bounded pieces, each reviewed and tested before it is committed; Claude Code does the rest. Every session gets a row here.

| Date | What Muse Code built | Files | Model | Prompts | Kept, edited or dropped |
|---|---|---|---|---|---|
| 27 Oct, 20:57–21:01 IST | The SAM 3.1 adapter: request builder for one concept or up to 16 box-and-point objects, the Responses caller with Meta's retry rules, and the mask parser on `@meta-sam/parser` 0.1.0 with a confidence floor; 11 offline tests. Found two gaps in our API notes (the parser reads Responses events, not plain text; boxes carry no size). One prompt, 30 turns, about 4 minutes | `convex/lib/sam.ts`, `convex/lib/sam.test.ts`, `package.json` | muse-spark-1.3 | 1 (41% of the 5-hour quota) | Kept; Claude Code moved the duplicated retry rules into `meta.ts`, checked it bundles in Convex, committed as `46df7a5` |
| 27 Oct, 21:07–21:09 IST | Event cards showed only the middle of their photo, cutting heads off: found the 16:7 slot against 4:5 photos and changed the slot to 4:5 so the whole photo shows. A follow-up asking it to update the devlog and commit stopped when the 5-hour quota ran out | `src/pages/HomePage.tsx` (one line) | muse-wonder-1.0 | 2 (the second used up the rest of the 5-hour quota) | Kept as is; Claude Code tested, committed (`96a4c0d`) and wrote this log |

## Log

### 2026-10-27 - 608627f..96a4c0d
- **Morning:** the Terms gained a plain confidentiality rule for what we show privately (conversations, demos, tools), with detailed protections left to a signed agreement; Privacy and Terms moved to a small line in the footer corner; the share image shows the current home page; internal working files left the repository; every green push to `main` now deploys to a staging site with its own backend (`.github/workflows/staging.yml`), while production stays a manual deploy.
- **Meta's models, live:** every model call now goes through one wrapper (`convex/lib/models.ts`) that sends it to Meta's `muse-spark-1.3` over Chat Completions, with the same Zod schemas turned into JSON Schema for structured output, images as data URLs and PDFs as file blocks. Meta calls retry on 429, 500 and 503 and honour Retry-After; a call Meta can't answer moves to Claude and the switch is logged; Contributor model ids are refused because requests carry personal data. Production switched to Meta the same evening.
- **Cost record:** every call writes a `modelCalls` row with its feature, provider, model, tokens, list-price cost and whether it fell back (`convex/modelCalls.ts`, prices in `convex/lib/modelCost.ts`).
- **Measured:** a production RSVP read on `muse-spark-1.3` was correct first time (2 coming, peanut allergy caught), 1,214 tokens in and 880 out, $0.0053. Reasoning can't be turned off and counts as output: at a 400-token limit a one-line answer came back empty, so every call allows 16,000.
- **Pricing page:** Co-pilot free until launch, then an introductory monthly price in rupees or dollars; Assisted, with a person from the team, after launch (`src/pages/PricingPage.tsx`, `src/lib/pricing.ts`).
- **Planning conversation:** asks what the event is called and whose it is, not who is hosting; events with nobody named sign their emails with the account holder's name.
- **Look:** a new line drawing behind every page (marigold at night, its own ink-blue drawing by day), celebration photos on the home page and sign-in, one logo lockup everywhere, a two-column sign-in, a smaller theme switch whose choice carries between the home page and the app, gentle motion on the home page, and a bolder tab icon.
- **Privacy:** the privacy page names Meta as the reading and writing service.
- **Tests:** 394 passed in 42 files; typecheck clean. Every push to `main` deploys to a staging site; production is deployed by hand.
- **Muse Code:** Everyday plan subscribed. First session built the SAM 3.1 adapter (`convex/lib/sam.ts`, `46df7a5`): one prompt, 30 turns, 41% of a 5-hour quota; Claude Code reviewed it, shared the retry rules with `meta.ts` and committed it. A second session (Muse Wonder) fixed event cards cropping their photos (`96a4c0d`) and used up the rest of the 5-hour quota.
- **Built with:** Claude Code, claude-opus-5-5.


### 2026-10-26 - ab4d141..d4e1712 (before kickoff, which was 26 Oct at 9:30 PM IST)
Groundwork on trust and privacy, made the afternoon before kickoff; none of it is a demo feature.
- **Emails say they are drafted by an assistant** and never claim to be a person; new events start in review mode, so the people planning read every email, follow-ups included, before it goes.
- **Sign-in asks for agreement** with a ticked box and records it against the account.
- **Analytics only with consent:** a consent bar, no session recordings, and visitors' IP addresses no longer passed to PostHog (`src/components/ConsentBar.tsx`, `functions/ingest/`).
- **Polite vendor search:** robots.txt respected, listing and review sites never read, no reviewer quotes kept (`convex/lib/scrapePolicy.ts`, with tests); rankings and top picks labelled as PlusOne's estimate.
- **Deletion:** deleting an account also clears its chats, visit logs and the Clerk sign-in record.
- **Privacy and Terms:** the operator, a Grievance Officer, how AI is used, rights, retention and cookies; the visit log is for security only.
- **Built with:** Claude Code, claude-opus-5-5.

### 2026-10-25 - 1e6c63b (tag `pre-hackathon`)
The starting point for the hackathon. PlusOne Events is an early-stage startup built in semi-stealth, so this repository begins from one snapshot of the earlier private work; every later commit is hackathon work. What the snapshot holds:

- **Today:** an event opens on the co-pilot's route (done, under way, over to you, up next), read from the plan by `convex/copilot.ts`, with a box to tell it anything; a slim top bar with four lanes (Today, Plan, Vendors, People), each lane's pages as stops on a line, and a dock on phones.
- **The planning conversation** at `/new`: the host writes in their own words; the fast model only reads each message, while fixed rules (`convex/lib/planningChat.ts`) decide what to ask, read everything back for confirmation, catch a weekday that doesn't match the date or a budget missing a zero, and build only once every line is confirmed. A manual form sits at `/new/manual`.
- **Vendors:** open-web research, outreach from each event's own inbox, follow-ups, and quotes read into lines and compared in one unit (per plate, per piece, per day) with flags such as "priced for 120" (`convex/lib/comparable.ts`).
- **Spaces:** one open board per event to pan and zoom, a zone for each part, with pictures, links, notes, colour swatches and pinned vendors (`src/components/board/Board.tsx`, `src/lib/board.ts`).
- **Traditions:** 24 wedding traditions from India, and "Other tradition" read from the hosts' own words.
- **Samples:** three sample events at `/demo` (a 60th birthday in Chennai, a griha pravesam in Bengaluru, an office Diwali party in Gurugram), each with a seeded board.
- **Look:** dark ink and marigold by default, with a light theme; a contrast test checks every text colour in both.
- **Tests:** `npx vitest run`, 354 passed in 35 files (25 Oct). `npm run typecheck` clean.
- **Deployed:** the build is live on plusoneevents.site and app.plusoneevents.site; all three samples were opened there headlessly with no page errors.
- **Decision:** event management first, for India, with weddings one quiet type among sixteen; the long-term aim is standard vendor prices.
- **Built with:** Claude Code, claude-opus-5-5.
