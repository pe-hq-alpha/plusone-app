# Devlog

- **Project:** PlusOne Events
- **Event:** Meta Global AI Developer Hackathon (Cerebral Valley), 26 Oct – 4 Nov 2026
- **Team:** two founders
- **What it does:** A co-pilot for planning events in India: it talks the plan through with the host, sets out the parts of the event, the vendors each needs and a budget, then finds vendors, writes to them from the event's own inbox, chases replies and lines their quotes up in one unit, while the host makes every decision.
- **Problem:** People planning a family function or a work event juggle many vendors, quotes and people across calls, chats and spreadsheets, with nothing holding the plan together or making quotes comparable.
- **Status:** deployed
- **Live app:** https://plusoneevents.site
- **Demo:** not recorded
- **Repo:** private until submission (pe-hq-alpha/plusone-app)
- **Stack:** TypeScript, React 19, React Router 7, Vite 8, Tailwind CSS 4, Convex 1.45 (database, functions, crons, workflow, workpool, rate-limiter and action-cache components)
- **Hosting:** Cloudflare Pages for the app; Convex (Ireland) for the backend
- **Auth:** Clerk; Convex Auth guest sessions for the sample events
- **External services:** AgentMail (event inboxes), Firecrawl (vendor search), Resend (app emails), PostHog (usage)
- **AI models (product):** claude-sonnet-5-5 for plans, vendor emails, quote reading, imports and the assistant; claude-haiku-5-5 for the planning conversation, link and palette reading and other quick reads. Moving the visible steps to Meta's models during the hackathon.
- **AI models (build):** Claude Code with claude-opus-5-5 (earlier sessions not recorded)
- **Track:** Startup
- **Meta models used:** none yet (planned: Muse Spark, Muse Wonder, Muse Voice Transcribe, SAM 3.1 and the open-weights Muse Spark Open)
- **Credits spent:** $0 of $150
- **Started:** 2026-09-15T20:55:44+05:30
- **Last updated:** 2026-10-25T13:46:00+05:30

## Evidence

| Claim | Evidence | Status |
|---|---|---|
| Muse Spark runs the agent | none yet | missing |
| SAM 3.1 turns inspiration photos into decorator briefs | none yet | missing |
| Decor shown on the real venue | none yet | missing |
| Open-weights model for cheap calls | none yet | missing |
| Credits spent per run | No paid runs yet | missing |
| Screenshots of the Meta features | none yet | missing |
| Demo video | not recorded | missing |
| Live URL with the Meta features | plusoneevents.site runs the pre-hackathon build | missing |

## Log

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
