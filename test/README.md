# Testing PlusOne

Three layers, run in this order before every release and before submitting.

## 1. Automated tests (every push, in CI)

```bash
npm test             # 685 tests in 70 files: the backend, the rules and the app's logic
npm run typecheck    # app and backend
```

The tests sit beside the code they test (`convex/**/*.test.ts`, `src/**/*.test.ts`), with the Cloudflare middleware's here (`test/visitMiddleware.test.ts`), because Convex's test runner
finds each backend module by its place in `convex/`. They never call a live model: every model reply is a fixture.

## 2. The browser walk (before every deploy that changes a screen)

```bash
node test/walk.mjs   # the three sample events, every lane, the home page, pricing and the vendors' demo
```

It opens each page at phone (390 px) and laptop (1440 px) width in headless Chrome and fails on sideways scroll
or any page or console error. Screenshots land in `test/shots/` for a look by eye. Set `CHROME_PATH` if Chrome is
somewhere else.

The evaluations that measure the models (`convex/evals.ts`, `scripts/eval-reading.mjs`) are run by hand on
production and cost Meta credit; their results are in the main README.

## 3. A person on the live site

[`checklist.md`](checklist.md): every feature, the way a family, an event manager, a vendor, the PlusOne team and
a judge would use it, on a phone and a laptop, in both themes. Tick each box when it passes on both, and note any
failure under it.

## Always on

An uptime check (`.github/workflows/uptime.yml`) runs every 15 minutes through judging against the home page, both
demos and the backend's `/health`.
