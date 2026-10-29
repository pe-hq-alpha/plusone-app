# Hands-on test checklist

Every feature, checked by a person on the live site, the way a family, an event manager, a vendor, the PlusOne
team and a judge would use it. Run each section on **a phone** (a real one, or Chrome's device mode at 390 px)
and **a laptop** (1440 px), in **dark and light** themes where the section says so.

**How to mark it.** Tick the box when it passes on both. When something fails, leave it unticked and add a line
under it: `FAIL (phone, dark): what happened`, with a screenshot in the issue or the chat. Anything a judge would
see goes first.

**Every page, every time:** no sideways scroll on a phone; no text cut off or overlapping; buttons reachable with a
thumb; nothing says "AI", "model" or a model's name in the app's own words (Under the hood is the one place that
names Meta's models); customers are "families, teams and event managers", never one of them alone; money is in
rupees for a visit from India; any error reads as a plain sentence with what to do next.

Addresses: home `https://plusoneevents.site`, app `https://app.plusoneevents.site`, Partner
`https://partner.plusoneevents.site`, Ops `https://app.plusoneevents.site/ops`.

---

## 1. The judge's first two minutes (do this first, as a stranger)

- [ ] The repository's README opens with the banner, the buttons and the logo row; every button goes where it says (Live site, For the judges, Try the demo, Meta's models, How it works, Run it yourself, Measured results, Coming next).
- [ ] The architecture diagram shows, and its dots move (GitHub, laptop and phone).
- [ ] Every screenshot in the README matches today's app.
- [ ] `app.plusoneevents.site/demo` opens Amma's 60th with no sign-up, in under 10 seconds on a phone on mobile data.
- [ ] The demo bar says it's a sample and points at Under the hood; the dot on Under the hood shows until it's opened.
- [ ] Following the README's "Try it in two minutes" word for word works: Today → Vendors → Compare → the vendors' demo → Under the hood → "We're now 140 people".
- [ ] The demo video link plays (once it exists) and is public or unlisted.

## 2. Home site (plusoneevents.site)

- [ ] The hero reads "Plan it all in one place. Know what you're paying for." with Plan an event and See the demo; both work.
- [ ] The line drawing sits behind the hero; the page moves gently (hero rises in, sections rise into view) and nothing jumps.
- [ ] Theme: Light, Dark and Device each apply, and the choice carries into the app (dark and light).
- [ ] The example and prices show rupees from India (and dollars from the US, with a VPN if available).
- [ ] The consent bar appears once; Allow and Decline both close it and are remembered.
- [ ] `/pricing`: Basic free until launch then ₹1,000 a month; Premium ₹2,500 after launch; every feature listed.
- [ ] `/how-it-works`, `/privacy`, `/terms` open and read correctly.
- [ ] The line for vendors leads to PlusOne Partner.
- [ ] Footer links all work; no link points to the wedding game site.

## 3. Signing in and the account

- [ ] Sign in with Google (Clerk) from `/signin`; you land where you were going.
- [ ] Signing out and back in keeps your events.
- [ ] `/account`: name and email shown; delete account asks first, then removes the account and signs out (test with a throwaway account only).
- [ ] A guest demo visitor is never asked to sign in to look around.

## 4. Starting an event

- [ ] `/new`: the planning conversation asks one thing at a time, reads the plan back, and creates the event.
- [ ] Say a date with the wrong weekday ("Saturday 30 January 2027"): it points out the mismatch.
- [ ] It asks what the event is called, not who hosts it.
- [ ] Try each kind of event the launch is for: a birthday, a 60th, a housewarming, a naming ceremony, a baby shower, an engagement, an office party. The words follow the event (functions and guests; sessions and attendees for a conference).
- [ ] `/new/manual`: the step-by-step form makes the same event.
- [ ] The microphone in the planning chat records a spoken plan in English, in Tamil, and in both mixed; the words land in the box to check before sending (allow the microphone when asked).

## 5. Today

- [ ] Today shows done, under way, over to you and up next, each with the button that finishes it; each button does what it says.
- [ ] The "Tell PlusOne" box: "We're now 140 people" gives a card; pressing it changes the guest count everywhere (Plan, Compare's per-plate totals).
- [ ] "Move lunch to 1 pm" gives a card that moves the function.
- [ ] Nothing changes without pressing the card.
- [ ] The microphone in the box works; in the demo, "Play a sample" plays a recorded brief and its words appear in the box.
- [ ] On a phone the four lanes (Today, Plan, Vendors, People) sit in a bar along the bottom.

## 6. Plan lane

- [ ] The event, its money committed so far, its functions and the next to-dos are right.
- [ ] Open a function (`sessions/…`): time, place and guests show; edit and save.
- [ ] To-dos (`tasks`): add, tick, untick, delete.
- [ ] Budget (`budget`): lines add up; editing a line updates the total.
- [ ] Dues: every deposit, balance and vendor deadline in one list; "Add to calendar" downloads a file that opens in the phone's calendar.
- [ ] History (`history`) lists what happened, newest first.

## 7. Vendors: finding and writing

- [ ] On a real (non-demo) event, Find on a need searches the web and returns vendors ranked with a reason each; every price links to the page it came from. (Uses search credit: one or two runs only.)
- [ ] "Ask verified vendors" on a need sends the brief to Partner vendors in that trade and city.
- [ ] Writing to a vendor sends from the event's own inbox address.
- [ ] Inbox (`inbox`): each conversation shows its status; opening one shows the thread; follow-ups are scheduled, at most three.
- [ ] WhatsApp opens with the first message written for the event ("Hello …, I'm planning … on … in Chennai"); Call dials. In the demo, the buttons say what would happen instead.
- [ ] A vendor who says "please don't contact me" is never written to again.

## 8. Quotes that didn't come by email

- [ ] Add a quote as a pasted message: it is read into lines and lands in Compare.
- [ ] Add a photo or screenshot of a price list: the same.
- [ ] Add a PDF: the same.
- [ ] A file that isn't a photo or PDF, or over 10 MB, is refused with a plain message.
- [ ] "Add a recording of your call" with a real call recording (with the other person's consent): heard speaker by speaker, read into lines, lands in Compare.
- [ ] In the demo, "Try a sample call" adds Kaveri Feast Co.'s column in Catering: ₹460 a plate, GST ₹2,760, transport ₹2,500, water flagged.

## 9. Compare (the centrepiece)

- [ ] Catering in the demo: three caterers' emailed quotes and two verified vendors' offers, line by line, at the host's headcount.
- [ ] Missing charges flagged in words ("No water line, and one other charges ₹600").
- [ ] Each price placed in the city's range (or the event's own quotes' range, said so).
- [ ] "What's in it" shows hours, photographers, dishes, with the lower ones marked.
- [ ] Track record: each verified vendor's level (New, Trusted, Top) and events done; web-found vendors say they aren't on PlusOne yet.
- [ ] Past work: checked photos beside each Partner vendor's offer, with their tags; tapping a photo opens it.
- [ ] WhatsApp and Call in each column header.
- [ ] "See the Meta models behind this" opens Under the hood.
- [ ] On a phone the table scrolls sideways inside its box, and the page itself doesn't.
- [ ] Repeat for Decor & Florals and Photography in the demo.
- [ ] A quote that looks off (another currency, far from the plan) waits for the host instead of moving the budget; one that moves it can be undone.

## 10. See it on your venue

- [ ] From the decorators' Compare, open the venue view.
- [ ] "Try the sample hall": the stage and the wall behind it are found and dressed within about 10 seconds; a second visit is near-instant.
- [ ] Each look: marigold and mango leaf, jasmine and rose, pastel flowers, fairy lights. The chairs stay in front.
- [ ] A tap on the wall or the stage re-picks that part.
- [ ] Add your own hall photo (a real one you may show): found and dressed, or a plain message if it can't find a stage.
- [ ] It says it's a sketch, not a promise of the decorator's work.

## 11. Guests and the event page

- [ ] Guests (`guests`): add, edit, remove; import a spreadsheet of guests.
- [ ] Each guest gets an invitation with their own RSVP link (`/r/…`); replying saves per function, with head count and food needs.
- [ ] The event page (`website`, public at `/s/…`) is written from the plan; editing it updates the public page; search engines are asked not to list it.
- [ ] Gifts (`gifts`): add and mark received.
- [ ] Share the plan as a read-only link (`/p/…`): it opens signed out and can't be edited; revoking it stops it working.
- [ ] Print (`print`) fits the plan on one page.

## 12. Spaces

- [ ] `spaces`: the board pans and zooms (pinch on a phone, scroll on a laptop).
- [ ] Add a picture, a link (Instagram, Pinterest, any page shows its preview), a note, a colour swatch, a pinned vendor.
- [ ] "Suggest a palette" from the pictures.
- [ ] Each function has its own zone.
- [ ] On a phone, sharing a link from another app to PlusOne lands it in a Space (installed app only).

## 13. Planning together

- [ ] `members`: invite as planner and as viewer; the link works once (`/join/…`); a viewer can't edit; revoking an invite stops it.
- [ ] Roles: a planner can edit, a viewer only reads, only the owner can delete the event.

## 14. Settings and emails

- [ ] `settings`: rename the event, change dates and currency; delete the event (throwaway event only): it and its files are gone.
- [ ] The weekly update email arrives on Friday for an active event, skips a quiet week, and its stop link works.

## 15. Under the hood

- [ ] The top-bar button opens the panel: every step with its Meta model, time and cost.
- [ ] In the demo it opens on the recorded runs, each labelled recorded with its date: Muse Spark on the three quotes, Muse Spark and SAM 3.1 on the hall, Muse Glimmer on a photo, Muse Spark Open on a quote.
- [ ] "We're now 140 people" on Today adds a new live step to the panel.

## 16. PlusOne Partner, the vendors' demo (partner.plusoneevents.site/demo)

- [ ] Opens as a sample caterer with no sign-up, labelled as a sample.
- [ ] Badges: Verified, Transparent pricing, a range level, New.
- [ ] Customers asking: a catering request for a 60th for 120, with the occasion, date, guests and area, and never the customer's name, contact or budget.
- [ ] Answer it on the standard sheet: per-plate price, GST, in the price / added / extra for each line; the total the customer will see updates as you type; send.
- [ ] After sending, see the offer the way the customer sees it, line by line beside their quotes; change it, then withdraw it.
- [ ] Price a package as the trade charges (per plate, per event, per hour, per kg, per session) with what's in it; the exact customer line shows.
- [ ] Wording is tidied before customers see it ("rs.500/-" to "₹500"), shown before and after, the vendor chooses; numbers never change.
- [ ] Bring your price list: paste a typed list, then a photo of a printed rate card; each becomes packages to check and save; nothing saves until "Use this" and Save.
- [ ] Add photos of work: each is checked (a few seconds; up to a few minutes if the GPU is waking) and shows its tags or a flag; a 13th photo, or a fourth in a day in the demo, is refused politely.
- [ ] In the demo, changes save at once (a real verified vendor's would wait for Ops).

## 17. PlusOne Partner, a real vendor (use a test business, then remove it)

- [ ] Sign in at partner.plusoneevents.site and set up a business; it waits for a check and customers don't see it.
- [ ] Claim a listing PlusOne added from public pages.
- [ ] Once verified (in Ops, section 18), a changed price, a new package, a removed package and new contact details each show as waiting on Partner, and customers keep seeing the approved version until Ops approves.
- [ ] A new business name sends the listing back for a check.

## 18. PlusOne Ops (founders' accounts only)

- [ ] A non-staff account sees "This page is for the PlusOne team" and nothing else.
- [ ] The queue lists vendors and claims waiting; a vendor's page shows the evidence and the checklist.
- [ ] "Check this vendor" runs the Muse Wonder check: six findings, each with the pages behind it; it never ticks the checklist. (First live run: a few cents.)
- [ ] Verify, turn down and pause each work and are kept in the record of who decided what.
- [ ] Photos to check: approve and remove; the vendor sees the decision.
- [ ] Changes waiting: each shows now and after; approve puts it live in Compare, reject leaves the listing as it was.

## 19. Phone app, speed and safety

- [ ] Install to the home screen (Android Chrome and iPhone Safari); it opens like an app.
- [ ] First load on mobile data under 3 seconds for the home page; the demo usable under 10.
- [ ] Rapid repeated presses (search, voice, venue, price list) end in a plain "try again later" message, not an error screen.
- [ ] With the network off mid-action, the app says so and recovers when it's back.

## 20. Before submitting

- [ ] Everything above ticked, or its failure fixed and re-checked.
- [ ] The demo video watched on a phone and a laptop, sound on.
- [ ] A fresh clone of the repository runs with the README's steps (`test/README.md`, automated checks).
