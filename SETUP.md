# Run it yourself

[← Back to the README](README.md)

**Check the build in two minutes, with no accounts and no keys.** The tests fake every model and service, so they run offline:

```bash
git clone https://github.com/pe-hq-alpha/plusone-app.git plusone && cd plusone
npm ci
npm test              # 773 tests, no network, no keys
npm run typecheck     # the app and the backend
```

The evaluations' raw results are in `scripts/*-run*.json` beside the scripts that made them, so every number in [Evaluations](EVALUATIONS.md#evaluation-missing-charges) can be checked without calling a model.

**To run the whole app**, you need Node 20 or later, a Convex account and a Clerk application with a JWT template named `convex` (claims `aud: convex`, `name`, `email`, `email_verified`).

```bash
git clone https://github.com/pe-hq-alpha/plusone-app.git plusone && cd plusone
npm install
npx convex dev --once     # first run: sign in and create a dev deployment (writes .env.local)
node scripts/auth-keys.mjs                                   # once: JWT_PRIVATE_KEY and JWKS for the demo's guest tokens
npx convex env set SITE_URL http://localhost:5173            # where links in emails point
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk-frontend-api>
npx convex env set MODEL_API_KEY <meta-key>   # Meta's models; or ANTHROPIC_API_KEY for Claude
echo 'VITE_CLERK_PUBLISHABLE_KEY=pk_test_…' >> .env.local     # the app's Clerk key
npm run dev               # the app on http://localhost:5173, and the backend watching for changes
```

Open `http://localhost:5173/demo` for the sample events; they need only the steps above, since their vendors are made up and nothing is sent. Vendor search also needs `FIRECRAWL_API_KEY`, and real emails need the AgentMail and Resend keys in the table below.

Or run `./start.sh`, which checks Node, installs what's missing, warns about any backend key not yet set on the deployment, and then starts both.

Backend keys are set on the deployment, for example `npx convex env set ANTHROPIC_API_KEY …`, never in a file. **Model calls run on Meta's models** once `npx convex env set MODEL_API_KEY …` (a Meta Model API key) is set; without it, or with `MODEL_PROVIDER=claude`, every call runs on Claude. The minimum to try it is what the block above sets. To deploy (run `node scripts/auth-keys.mjs --prod` once for the production deployment first):

```bash
npx convex deploy -y                                                    # the backend
VITE_CONVEX_URL=https://<deployment>.convex.cloud \
VITE_HOME_ORIGIN=https://<home> VITE_APP_ORIGIN=https://app.<home> VITE_PARTNER_ORIGIN=https://partner.<home> \
VITE_CLERK_PUBLISHABLE_KEY=pk_live_… npx vite build                     # the app, built against it
npx wrangler pages deploy dist --project-name <pages-project>          # served from Cloudflare Pages
node scripts/agentmail-setup.mjs https://<deployment>.convex.site <pod-id>   # once: the inbox webhook
```

The app can also be served by Convex itself: `npm run deploy`.

Every push to `main` runs typecheck, tests and a build in CI, and a second workflow (`.github/workflows/e2e.yml`, `scripts/e2e-live.mjs`) walks the live demo in a real browser on a phone and a laptop (the home page, Today, Compare, Vendors, Under the hood, Find vendors, a broken guest link and the vendors' demo), failing on any page error or sideways scroll; it also runs every three hours through judging. A staging workflow (`.github/workflows/staging.yml`) deploys each green push to a separate backend and site once its deploy keys are set as repository secrets; production is deployed by hand. The backend checks the live site itself every five minutes (`convex/uptime.ts`): the home page, both demos and `/health`, which also fails if model calls stop going to Meta; the last day is at [`/uptime`](https://trustworthy-ram-180.eu-west-1.convex.site/uptime), and the team gets an email when the site goes down and when it's back. GitHub's own check (`.github/workflows/uptime.yml`) watches the same addresses from outside, every few hours in practice.

| Variable | For |
|---|---|
| `ANTHROPIC_API_KEY` | Claude: the fallback for every model call, and the provider when `MODEL_PROVIDER` is `claude` or no Meta key is set |
| `ANTHROPIC_MODEL_SMART`, `ANTHROPIC_MODEL_FAST` | Optional. Override `claude-sonnet-5-5` and `claude-haiku-5-5` |
| `MODEL_PROVIDER` | Optional. Model calls run on Meta's models by default; `claude` runs them on Claude instead |
| `MODEL_API_KEY` | Meta Model API key. Without it, calls fall back to Claude |
| `META_MODEL_SMART`, `META_MODEL_FAST` | Optional. Override `muse-spark-1.3` per tier (Contributor ids are refused) |
| `META_BASE_URL` | Optional. The Model API address, `https://api.meta.ai/v1` by default |
| `BASETEN_API_KEY` | Optional. Baseten key for Muse Spark Open; without it, calls that ask for Spark Open run on Muse Spark |
| `GLIMMER_BASE_URL`, `MODAL_PROXY_TOKEN` | Optional. Our Muse Glimmer endpoint on Modal and its proxy token (`wk-….ws-…`); without them, photo checks run on Muse Spark |
| `GLIMMER_MODEL` | Optional. The endpoint's model name, `inference-1` by default |
| `FIRECRAWL_API_KEY` | Vendor search |
| `AGENTMAIL_API_KEY`, `AGENTMAIL_WEBHOOK_SECRET`, `AGENTMAIL_INBOX_DOMAIN` | The event inboxes and their incoming mail |
| `AGENTMAIL_FALLBACK_INBOX_ID` | Optional. An inbox to use when an event can't get its own |
| `AGENTMAIL_INBOX_LIMIT` | Optional. How many inboxes the AgentMail plan allows, 3 by default |
| `AGENTMAIL_POD_ID` | Optional. The AgentMail pod this deployment keeps its inboxes in, so production and dev never share mail |
| `SITE_URL` | Links in emails and WhatsApp messages back to the app |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Optional. Meta's WhatsApp Cloud API: the access token and the number quote updates come from; without them nothing is sent |
| `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` | Optional. The approved message template, `quote_received` and `en` by default |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | The webhook: the app secret Meta signs its messages with, and the token Meta checks the address with |
| `CLERK_JWT_ISSUER_DOMAIN` | The Clerk instance whose sign-ins the backend accepts, such as `https://clerk.<home>` |
| `CLERK_SECRET_KEY` | Optional. Deletes the person at Clerk too when an account is deleted |
| `VISIT_LOG_SECRET` | Optional. Shared with the Cloudflare middleware, which sends each visit for the security log |
| `JWT_PRIVATE_KEY`, `JWKS` | Keys for the demo's guest tokens (Convex Auth), made by `node scripts/auth-keys.mjs` |
| `RESEND_API_KEY`, `EMAIL_FROM` | The app's own emails |
| `EMAIL_LIVE` | Optional. `1` to send app emails; anything else keeps them in test mode |
| `EMAIL_UNSUBSCRIBE_SECRET` | Signs the stop links in app emails |
| `POSTHOG_KEY`, `POSTHOG_HOST` | Optional. Usage events from the server |
| `VITE_CONVEX_URL` | The app's link to its backend (written by `npx convex dev`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | The app's Clerk key: `pk_test_…` for development, `pk_live_…` for the live site |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | Optional. Usage events from the app |
| `VITE_HOME_ORIGIN`, `VITE_APP_ORIGIN`, `VITE_PARTNER_ORIGIN` | Optional. The home page's address, the app's and PlusOne Partner's; set them to split the three across their own addresses, or none to keep one, with Partner at `/partner` |
