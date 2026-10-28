# PlusOne Partner

The vendors' side of PlusOne. Vendors list their business, price their packages in the units customers compare, and answer a customer's brief on the same lines. **PlusOne Ops** is the PlusOne team's side of it: a person verifies each vendor before families and event managers see them.

Built during the hackathon and live since 28 October 2026. Its own address, `partner.plusoneevents.site`, is built and going live; until then it is at [app.plusoneevents.site/partner](https://app.plusoneevents.site/partner). It has its own demo, separate from the customers': [try it as a sample caterer](https://app.plusoneevents.site/partner/demo), with no sign-up. The vendors in the demo are samples, and are labelled as samples.

## How it connects to PlusOne Events

Partner isn't a separate app. It runs in the same app as PlusOne Events, on the same backend and the same sign-in, so the two sides share one set of lines:

1. **A customer asks.** On a need in Events (catering, for example), a family or an event manager presses "Ask verified vendors". That opens a brief for the event's city and category (`convex/marketplace/briefs.ts`).
2. **A vendor answers.** A verified vendor in that city and category sees the brief on `/partner` and answers it on the standard sheet (`convex/lib/standardSheet.ts`): the unit, what's included, GST and the usual extras, which are the same lines Events reads emailed and WhatsApp quotes into.
3. **The offer lands in Compare.** It sits beside the customer's other quotes, line by line, with missing charges flagged and the city's price range alongside.
4. **Prices make the range.** The prices that listed vendors publish feed each city's ranges, which have no names attached and are shown only once eight prices sit behind one (`convex/marketplace/bands.ts`, every six hours).

## Pages

| Route | File | For | What it does |
|---|---|---|---|
| `/` on Partner's address (`/partner` on one address) | `PartnerPage.tsx` | Vendors | Sign in, list a business or claim one PlusOne added from public pages, price packages on the standard sheet, see open briefs and send offers. In the demo, the offer also shows the way the customer sees it, line by line beside their quotes |
| `/demo` (`/partner/demo`) | `VendorDemoPage.tsx` | Visitors | The vendors' demo: straight in as a sample caterer, with a customer's catering request to answer (`demo.startVendor` in `convex/demo.ts`) |
| `/ops` | `OpsPage.tsx` | The PlusOne team | The queue of vendors and claims waiting, each vendor's profile and evidence, and the decision: verify, turn down or pause |
| | `shared.tsx` | Both | Pieces both pages use |

Signed out, Partner opens the vendors' own sign-in page (`VendorSignInPage` in `src/pages/SignInPage.tsx`), separate from the customers' one at `/signin`. Which address serves what is in `src/lib/hosts.ts`: the home page, the app and Partner are one build on three addresses.

## Backend: `convex/marketplace/`

| File | What it holds |
|---|---|
| `partner.ts` | A vendor's own side: register, claim a listing, edit the profile, add and remove packages, try it as a sample caterer |
| `listings.ts` | What Events reads: listing search, a city's band for a category and unit, finding a listing by its website |
| `briefs.ts` | A customer's ask: open, close and list the briefs for a need, and the open briefs a vendor can answer |
| `offers.ts` | A vendor's answer to a brief: send, withdraw, a vendor's own offers, and the offers for an event that Compare shows |
| `ops.ts` | The team's side: the queue, a vendor's profile with its evidence, the decision on a vendor or a claim, and team roles |
| `bands.ts` | Each city's price ranges, recomputed on a schedule |
| `samples.ts` | The sample vendors and their offers for the demo events |
| `vendors.ts` | Shared helpers: a vendor's identity and cleaning up their records |

The tables are `vendorProfiles`, `vendorOfferings`, `vendorClaims`, `vettingReviews`, `priceBands`, `vendorBriefs` and `vendorOffers`, in `convex/schema.ts`. The pure rules that Events, Partner and Ops all share are in `convex/lib/marketplace.ts`: city names (an older name like "Bombay" counts as Mumbai), where a price sits in its range (Value, Standard, Premium, Luxury), a vendor's level (New, then Trusted after 3 events, Top after 10), and the badges.

## Rules it keeps

- **A person decides.** Software gathers evidence and flags; someone on the PlusOne team verifies, turns down or pauses. Every decision is kept as an append-only record of who decided what, on what evidence.
- **Badges are worked out, never set by hand.** "Verified" comes from an Ops decision. "Transparent pricing" goes to a verified vendor whose every package states a price, its unit and what it includes.
- **Who customers see.** A vendor's own sign-up appears only once verified. A listing PlusOne added from public pages appears while it waits for a check, marked as added by PlusOne. Paused and turned-down vendors never appear.
- **A range places a price; it never calls one fair.** Fewer than eight prices means no range.
- **Samples stay apart from real vendors.** Sample vendors answer sample events only. Each range is worked out twice, from real vendors for real customers, and with the samples for the demo. A demo guest's own sample business answers only their own demo event and never shows up in a search or a range.

## Building next

| What | Meta model | Status |
|---|---|---|
| The verification agent in Ops: checks a vendor against their own site and public pages and lists the evidence with links, then a person decides | Muse Wonder | Building, by 1 Nov |
| Voice sign-up: a vendor describes their business and packages aloud, in Tamil or English | Muse Voice Transcribe, Muse Spark | Building, by 1 Nov |
| Portfolio photos tagged with the standard sheet's lines, so past work sits beside an offer's line | Muse Glimmer (open weights, on Modal) | Planned |

## Run and test

Partner runs with the rest of the app: `npm run dev` from the repository root serves Events, Partner and Ops together (setup in the main [README](../../README.md#run-it-yourself)). To use `/ops`, put your account on the PlusOne team:

```bash
npx convex run marketplace/ops:setStaffRole '{"email":"you@example.com","role":"reviewer"}'
```

```bash
npx vitest run convex/marketplace.test.ts convex/lib/marketplace.test.ts
```

Partner can move into its own repository later with its history intact: every commit that touches `src/partner/` or `convex/marketplace/` is also copied, one for one, into a repository that holds only Partner.
