import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { setCommittedForSlotHelper } from "./budget";
import { addBookingPayments, recountPaid } from "./dues";
import { insertEvent } from "./events";
import { logActivity } from "./lib/auth";
import { APP_ACTOR, BRAND } from "./lib/brand";
import { DAY, addVendor, conversation, longDateIN, researched, slotsOf, seedBoard } from "./lib/demoKit";
import { addDays } from "./lib/text";
import { siteSlug } from "./site";

/**
 * The office sample: Northwind Labs' Diwali party in Gurugram, organised by Ananya from
 * the people team for about 150 colleagues. A work event, so the guests are attendees
 * with their teams, the party is dry by company policy, and every vendor is written to
 * on the company's behalf. Two venues quoted in different shapes, set side by side by
 * their priced lines; the DJ is booked; the AV company is waiting on Ananya.
 */

const HOUR = 3_600_000;

/** Sign-off on every email PlusOne writes for Ananya. */
const SIGN = "\n\nThanks,\nAnanya\nPeople team, Northwind Labs";

export async function seedOfficeParty(ctx: MutationCtx, userId: Id<"users">): Promise<Id<"events">> {
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  // About five weeks out, on the nearest Friday.
  const around = addDays(todayIso, 35);
  const toFriday = (5 - new Date(`${around}T12:00:00Z`).getUTCDay() + 7) % 7;
  const start = addDays(around, toFriday > 3 ? toFriday - 7 : toFriday);
  const eventId = await insertEvent(
    ctx,
    userId,
    {
      name: "Northwind Labs Diwali party",
      host: "Ananya",
      coHost: "",
      startDate: start,
      endDate: start,
      city: "Gurugram",
      area: "Golf Course Road",
      country: "India",
      currency: "INR",
      totalBudget: 900000,
      eventType: "office_party",
      occasionLabel: "Diwali party",
      organisation: "Northwind Labs",
      guestEstimate: 150,
      styleVibes: ["Festive", "Warm lights", "Easy for everyone"],
      stylePalette: "Marigold, deep maroon and gold",
      styleFormality: "smart",
      sessions: [{ name: "Diwali party", date: start, guestCount: 150, budget: 1 }],
      needs: [
        { category: "Venue", title: "Venue", pct: 32, booked: false },
        { category: "Catering", title: "Catering", pct: 10, booked: false },
        { category: "Music/DJ", title: "DJ", pct: 7, booked: false },
        { category: "AV & sound", title: "Sound & lighting", pct: 8, booked: false },
        { category: "Decor & Florals", title: "Decor", pct: 10, booked: false },
        { category: "Emcee", title: "Emcee", pct: 5, booked: false },
        { category: "Photographer", title: "Photography", pct: 6, booked: false },
        { category: "Gifting", title: "Diwali hampers", pct: 22, booked: false },
      ],
    },
    { demo: true },
  );
  await ctx.db.patch(eventId, {
    styleSummary:
      "A warm, festive Friday evening for the whole company: diyas and paper lanterns, a flower rangoli at the door, " +
      "marigold and maroon with gold, a dance floor after the awards, and a mocktail counter in place of a bar.",
    assistantNotes: [
      "The party is dry by company policy: no alcohol anywhere, a mocktail counter instead.",
      "Every colleague gets a Diwali hamper, so about 150 pieces.",
    ],
  });

  const slot = await slotsOf(ctx, eventId);
  const venue = slot("Venue");
  const catering = slot("Catering");
  const dj = slot("DJ");
  const av = slot("Sound & lighting");
  const decor = slot("Decor");
  const emcee = slot("Emcee");
  const photo = slot("Photography");
  const hampers = slot("Diwali hampers");
  const dateText = longDateIN(start);
  const onThe = `Friday ${dateText}`;
  const headcountBy = addDays(start, -7);

  const [session] = await ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(1);
  await ctx.db.patch(session._id, {
    startTime: "19:00",
    endTime: "23:30",
    location: "Golf Course Road, venue to be confirmed",
    description: "Dinner, the Diwali awards, then the dance floor.",
    // The palette kept from the party's Space.
    choices: [
      {
        label: "Palette",
        value: "Marigold, deep maroon and gold",
        colors: [{ name: "Marigold", hex: "#F2A541" }, { name: "Maroon", hex: "#7A1E2C" }, { name: "Gold", hex: "#C9A227" }],
      },
    ],
  });

  // ---- Venue: two quotes in different shapes, laid side by side by their lines. -----
  await researched(ctx, eventId, venue, "Rooftop or banquet hall on Golf Course Road, Gurugram, for 150, Friday evening", 3, now - 12 * DAY);
  const kanak = await addVendor(ctx, eventId, venue, {
    name: "Kanak Hall", handle: "kanakhall-ggn", city: "Gurugram", startingPrice: 1850, priceUnit: "per_person",
    priceNotes: "Per head, venue and vegetarian buffet together, 150 minimum",
    highlights: ["Banquet hall for 200", "Venue and food in one package", "Jain dishes on request"],
    summary: "A banquet hall off Golf Course Road that sells the evening as one per-plate package.",
    score: 90, rankReason: "One price per head covers the hall and the food, GST included, and it comes in under the venue budget.", isTopPick: true, rating: 4.5, reviewCount: 312,
  }, now, "INR");
  const saffron = await addVendor(ctx, eventId, venue, {
    name: "Saffron Terrace", handle: "saffronterrace-ggn", city: "Gurugram", startingPrice: 120000, priceUnit: "total",
    priceNotes: "Rooftop hire for the evening; in-house catering priced per plate",
    highlights: ["Open rooftop with a skyline view", "Holds 180 standing", "Covered section if it's cold"],
    summary: "A rooftop on Golf Course Road, hired by the evening with its own kitchen.",
    score: 84, rankReason: "The better-looking evening, but hire, plates and GST together run well past the venue budget.", rating: 4.6, reviewCount: 188,
  }, now, "INR");
  await addVendor(ctx, eventId, venue, {
    name: "The Courtyard at Sector 54", handle: "courtyard54", city: "Gurugram", startingPrice: 2400, priceUnit: "per_person",
    priceNotes: "Per head, lawn and buffet",
    highlights: ["Lawn and indoor hall"],
    summary: "A lawn with an indoor hall, mostly booked for weddings in November.",
    score: 71, rankReason: "Lovely lawn, but the per-head price is high and November Fridays are mostly taken.",
  }, now, "INR");

  const venueSubject = `Diwali party for 150 on ${onThe}`;
  const kanakMail = await conversation(ctx, eventId, venue, kanak, "hello@kanakhall-ggn.example", venueSubject, [
    { dir: "out", kind: "inquiry", at: now - 11 * DAY, body: `Hello,\n\nI'm organising Northwind Labs' Diwali party on ${onThe}, 7 pm to 11:30 pm, for about 150 colleagues. We need dinner and space for a short awards segment and a dance floor. The event is alcohol-free by company policy, so we'd want a mocktail counter rather than a bar.\n\nAre you free that evening, and what would it cost?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 10 * DAY, body: `Dear Ananya,\n\nThank you for considering Kanak Hall. ${onThe} is available.\n\nOur Diwali dinner package is ₹1,850 per head, GST included: the hall from 7 pm to 11:30 pm, a vegetarian buffet with two live counters, a mocktail counter and service staff. Jain dishes can be made on request. Minimum billing is for 150 guests.\n\nAn advance of ₹50,000 holds the date, and we need the final headcount 7 days before. An extra hour after 11:30 pm is ₹15,000.\n\nRegards,\nBanquets team, Kanak Hall` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: venue._id, vendorId: kanak, threadId: kanakMail.threadId, messageId: kanakMail.messageIds[1],
    total: 277500, deposit: 50000, currency: "INR",
    includes: ["Hall, 7 pm to 11:30 pm", "Vegetarian buffet with two live counters", "Mocktail counter", "Service staff", "Jain dishes on request"],
    excludes: ["Decor", "Sound and the DJ"],
    validUntil: addDays(todayIso, 10),
    redFlags: ["Minimum billing is for 150 guests, so you pay for 150 even if fewer come."],
    summary: "₹1,850 a head for 150, hall and food together, GST included: ₹2,77,500 all in. ₹50,000 advance.",
    lines: [
      { item: "Diwali dinner package: hall, buffet, mocktail counter, staff", kind: "core", unit: "per_person", quantity: 150, unitPrice: 1850, amount: 277500 },
      { item: "Extra hour after 11:30 pm", kind: "extra", unit: "per_hour", quantity: 1, unitPrice: 15000, amount: 15000, optional: true },
    ],
    headcountAssumed: 150,
    taxIncluded: true,
  });
  const saffronMail = await conversation(ctx, eventId, venue, saffron, "hello@saffronterrace-ggn.example", venueSubject, [
    { dir: "out", kind: "inquiry", at: now - 11 * DAY, body: `Hello,\n\nI'm organising Northwind Labs' Diwali party on ${onThe}, 7 pm to 11:30 pm, for about 150 colleagues: dinner, a short awards segment, then dancing. It's alcohol-free by company policy, with a mocktail counter instead of a bar.\n\nIs the rooftop free that evening, and could you share your pricing?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 9 * DAY, body: `Hi Ananya,\n\nHappy to host you. The rooftop is open on ${onThe}.\n\nRooftop hire is ₹1,20,000 for the evening, 7 pm to midnight. Our in-house catering is ₹1,350 a plate (vegetarian, with a mocktail counter), minimum 120 plates. GST at 18% is extra on both. We take a 30% advance to confirm.\n\nBest,\nEvents desk, Saffron Terrace` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: venue._id, vendorId: saffron, threadId: saffronMail.threadId, messageId: saffronMail.messageIds[1],
    total: 322500, deposit: 96750, currency: "INR",
    includes: ["Rooftop, 7 pm to midnight", "Vegetarian dinner", "Mocktail counter"],
    excludes: ["Decor", "Sound and the DJ", "GST at 18%"],
    validUntil: addDays(todayIso, 14),
    redFlags: ["GST at 18% is extra: about ₹58,050 more, so about ₹3,80,550 in all."],
    summary: "₹1,20,000 rooftop hire plus ₹1,350 a plate for 150: ₹3,22,500 before GST. 30% advance.",
    lines: [
      { item: "Rooftop hire, 7 pm to midnight", kind: "fee", unit: "total", amount: 120000 },
      { item: "Dinner with mocktail counter", kind: "core", unit: "per_person", quantity: 150, unitPrice: 1350, amount: 202500 },
    ],
    headcountAssumed: 150,
    taxIncluded: false,
  });
  await ctx.db.patch(venue._id, { status: "quoted" });
  await ctx.db.insert("dues", { eventId, slotId: venue._id, kind: "deadline", label: `Final headcount to the venue by ${longDateIN(headcountBy)}`, dueDate: headcountBy });

  // ---- Catering: waits on the venue, since both venues bring their own food. ---------
  await ctx.db.patch(catering._id, { notes: "Both venues quoted with their own food. Only needed for extras, such as a chaat counter, if the venue's menu falls short." });
  await researched(ctx, eventId, catering, "Live chaat and mocktail counters for a corporate Diwali party, Gurugram", 2, now - 8 * DAY);
  for (const c of [
    { name: "Chaat Theory Live Counters", handle: "chaattheory", city: "Gurugram", startingPrice: 280, priceUnit: "per_person" as const, priceNotes: "Per head, two live counters", highlights: ["Golgappe and tikki", "Jain options"], summary: "Live chaat counters for office events.", score: 82, rankReason: "A good add-on if the venue's buffet is light on snacks; Jain options on hand.", isTopPick: true, rating: 4.4, reviewCount: 96 },
    { name: "Nimbu & Co. Mocktail Bar", handle: "nimbuandco", city: "Delhi NCR", startingPrice: 220, priceUnit: "per_person" as const, priceNotes: "Per head, four mocktails, four hours", highlights: ["Alcohol-free bar with bartenders", "Festive Diwali menu"], summary: "An alcohol-free bar with its own bartenders.", score: 78, rankReason: "Only needed if the venue's own mocktail counter isn't enough.", rating: 4.3, reviewCount: 54 },
  ]) {
    await addVendor(ctx, eventId, catering, c, now, "INR");
  }

  // ---- DJ: booked, advance paid, balance on the night. ----------------------------
  await researched(ctx, eventId, dj, "DJ for a corporate Diwali party in Gurugram, Bollywood and Punjabi", 2, now - 11 * DAY);
  const freq = await addVendor(ctx, eventId, dj, {
    name: "Frequency Seven DJs", handle: "frequency7", city: "Gurugram", startingPrice: 50000, priceUnit: "total",
    priceNotes: "Evening set with their own console",
    highlights: ["Plays a lot of office parties", "Bollywood, Punjabi and commercial", "Clean edits only"],
    summary: "A DJ collective that does corporate evenings across Gurugram.",
    score: 91, rankReason: "Used to office crowds, plays clean edits, and fits the DJ budget.", isTopPick: true, rating: 4.7, reviewCount: 143,
  }, now, "INR");
  await addVendor(ctx, eventId, dj, {
    name: "Bass Bazaar", handle: "bassbazaar", city: "New Delhi", startingPrice: 70000, priceUnit: "total",
    priceNotes: "DJ with a dhol player", highlights: ["DJ and dhol together"],
    summary: "A DJ and dhol duo, mostly at weddings.", score: 76, rankReason: "Great energy, but over the DJ budget and travelling from Delhi.",
  }, now, "INR");
  const freqMail = await conversation(ctx, eventId, dj, freq, "hello@frequency7.example", `DJ for our Diwali party on ${onThe}`, [
    { dir: "out", kind: "inquiry", at: now - 10 * DAY, body: `Hello,\n\nWe're holding Northwind Labs' Diwali party on ${onThe} on Golf Course Road, for about 150 colleagues. We'd like a DJ from about 9 pm, after dinner and the awards, until 11:30 pm, with some soft music during dinner. Bollywood and Punjabi mostly, and clean edits please, since it's a work event.\n\nAre you free, and what would it cost?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 9 * DAY, body: `Hi Ananya,\n\nWe're free on ${onThe}, and clean edits are standard for us at office parties.\n\nIt's ₹55,000 for the evening, 7 pm to 11:30 pm, with our own console and a lighting rig for the dance floor. We can add a dhol player for the first half hour of dancing for ₹12,000. ₹15,000 confirms the booking, and the balance is due on the night.\n\nCheers,\nSameer, Frequency Seven` },
    { dir: "out", kind: "booking_confirmation", at: now - 6 * DAY, body: `Hi Sameer,\n\nThank you. We'd like to go ahead for ₹55,000, without the dhol for now. I'll send the ₹15,000 advance today. Please share the booking confirmation and anything you need from the venue.${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 5 * DAY, body: `Got the advance, thank you. You're confirmed for ${onThe}. We'll need one 15 amp socket near the dance floor; we'll check with the venue once you've picked one.\n\nSameer` },
  ], { status: "booked" });
  await ctx.db.insert("quotes", {
    eventId, slotId: dj._id, vendorId: freq, threadId: freqMail.threadId, messageId: freqMail.messageIds[1],
    total: 55000, deposit: 15000, currency: "INR",
    includes: ["DJ, 7 pm to 11:30 pm", "Own console", "Dance-floor lighting rig", "Clean edits"],
    excludes: ["Dhol player (₹12,000)"],
    redFlags: [],
    summary: "₹55,000 for the evening with their own console and lights; ₹15,000 to confirm, balance on the night.",
    lines: [
      { item: "DJ for the evening, with console and lights", kind: "core", unit: "total", amount: 55000 },
      { item: "Dhol player, first half hour of dancing", kind: "extra", unit: "total", amount: 12000, optional: true },
    ],
    taxIncluded: true,
    state: "applied", appliedAt: now - 9 * DAY, before: { threadStatus: "sent", slotStatus: "contacted", committed: 0 },
  });
  await ctx.db.patch(dj._id, { status: "booked", bookedVendorId: freq });
  await setCommittedForSlotHelper(ctx, dj._id, 55000);
  const event = (await ctx.db.get(eventId))!;
  await addBookingPayments(ctx, { event, slotId: dj._id, vendorId: freq, total: 55000, deposit: 15000 });
  for (const due of await ctx.db.query("dues").withIndex("by_vendorId", (q) => q.eq("vendorId", freq)).take(5)) {
    if (due.label === "Deposit") await ctx.db.patch(due._id, { label: "Advance", dueDate: addDays(todayIso, -6), doneAt: now - 6 * DAY });
    if (due.label === "Balance") await ctx.db.patch(due._id, { label: "Balance, on the night", dueDate: start });
  }
  await recountPaid(ctx, dj._id);

  // ---- Sound & lighting: a question only Ananya can answer. -------------------------
  await researched(ctx, eventId, av, "Stage, sound and lighting hire for a corporate party in Gurugram, 150 people", 2, now - 9 * DAY);
  const lumos = await addVendor(ctx, eventId, av, {
    name: "Lumos Stage & Sound", handle: "lumos-stage", city: "Gurugram", startingPrice: 60000, priceUnit: "total",
    priceNotes: "Stage, PA, mics and wash lights",
    highlights: ["Stage and podium for awards", "Wireless mics", "LED screen on request"],
    summary: "Stage, sound and lighting for office events and awards nights.",
    score: 88, rankReason: "Does awards nights often, and their usual setup fits the budget.", isTopPick: true, rating: 4.6, reviewCount: 77,
  }, now, "INR");
  await addVendor(ctx, eventId, av, {
    name: "Echo Grid AV", handle: "echogrid", city: "Gurugram", startingPrice: 85000, priceUnit: "total",
    priceNotes: "Full production package", highlights: ["LED wall", "Live mixing"],
    summary: "A production company for larger shows.", score: 74, rankReason: "More production than a 150-person party needs, and over budget.",
  }, now, "INR");
  await conversation(ctx, eventId, av, lumos, "hello@lumos-stage.example", `Sound and lighting for ${onThe}`, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: `Hello,\n\nWe're holding Northwind Labs' Diwali party on ${onThe}, 7 pm to 11:30 pm, for about 150 colleagues on Golf Course Road. We need a small stage and sound for a short address and an awards segment, and warm lighting for the room. The DJ brings their own console.\n\nAre you available, and what would it cost?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 20 * HOUR, body: `Hi Ananya,\n\nWe're available on ${onThe}. Two things before we quote, since they change the setup quite a bit:\n\n1. Will it be indoors in a hall, or on a rooftop? Outdoors we need weather covers and more power.\n2. For the address and the awards, how many wireless mics would you like, and do you want a screen for slides or award photos?\n\nThanks,\nRitu, Lumos Stage & Sound` },
  ], {
    status: "needs_attention",
    attentionReason: "vendor_question",
    pendingQuestion: "Lumos Stage & Sound asks whether the party will be indoors or on a rooftop, how many wireless mics you need for the address and awards, and whether you want a screen for slides.",
  });
  await ctx.db.patch(av._id, { status: "contacted" });

  // ---- Decor: one quote, already in the budget with an undo. ----------------------
  await researched(ctx, eventId, decor, "Diwali decor for an office party in Gurugram: diyas, lanterns, flower rangoli", 2, now - 9 * DAY);
  const deepam = await addVendor(ctx, eventId, decor, {
    name: "Deepam Decor Studio", handle: "deepam-decor", city: "Gurugram", startingPrice: 65000, priceUnit: "total",
    priceNotes: "Diwali setup, priced by piece and by installation",
    highlights: ["Brass and clay diyas", "Paper lanterns", "Flower rangoli by their own artists"],
    summary: "A decor studio that does a lot of Diwali setups for offices.",
    score: 89, rankReason: "Diyas, lanterns and rangoli in one setup, inside the decor budget.", isTopPick: true, rating: 4.7, reviewCount: 102,
  }, now, "INR");
  await addVendor(ctx, eventId, decor, {
    name: "Rangrez Events", handle: "rangrez-events", city: "Gurugram", startingPrice: 95000, priceUnit: "total",
    priceNotes: "Themed decor packages", highlights: ["Photo booth backdrops"],
    summary: "Themed decor packages with photo booths.", score: 77, rankReason: "Nice photo booths, but their Diwali package starts above budget.",
  }, now, "INR");
  const deepamMail = await conversation(ctx, eventId, decor, deepam, "hello@deepam-decor.example", `Diwali decor for ${onThe}`, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: `Hello,\n\nWe're holding Northwind Labs' Diwali party on ${onThe} for about 150 colleagues on Golf Course Road. We'd love diyas, paper lanterns and a flower rangoli at the entrance, in marigold, maroon and gold.\n\nCould you share what that would cost?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 2 * DAY, body: `Dear Ananya,\n\nLovely brief. For 150 guests we'd suggest:\n\n- 300 clay and brass diyas at ₹60 each: ₹18,000\n- 40 paper lanterns at ₹450 each: ₹18,000\n- A flower rangoli at the entrance: ₹22,000\n- Marigold strings and an entrance arch: ₹20,000\n\n₹78,000 in all, GST included, with setup and clearing. Half confirms the booking.\n\nWarm regards,\nDeepam Decor Studio` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: decor._id, vendorId: deepam, threadId: deepamMail.threadId, messageId: deepamMail.messageIds[1],
    total: 78000, deposit: 39000, currency: "INR",
    includes: ["300 diyas", "40 paper lanterns", "Flower rangoli at the entrance", "Marigold strings and entrance arch", "Setup and clearing"],
    excludes: [],
    redFlags: [],
    summary: "Diyas, lanterns, a flower rangoli and marigold strings for ₹78,000, GST included; half to confirm.",
    lines: [
      { item: "Clay and brass diyas", kind: "core", unit: "per_piece", quantity: 300, unitPrice: 60, amount: 18000 },
      { item: "Paper lanterns", kind: "core", unit: "per_piece", quantity: 40, unitPrice: 450, amount: 18000 },
      { item: "Flower rangoli at the entrance", kind: "core", unit: "total", amount: 22000 },
      { item: "Marigold strings and entrance arch", kind: "core", unit: "total", amount: 20000 },
    ],
    taxIncluded: true,
    state: "applied", appliedAt: now - 2 * DAY, before: { threadStatus: "sent", slotStatus: "contacted", committed: 0 },
  });
  await ctx.db.patch(decor._id, { status: "quoted" });
  await setCommittedForSlotHelper(ctx, decor._id, 78000);

  // ---- Emcee: written to, follow-up scheduled. ------------------------------------
  await researched(ctx, eventId, emcee, "Bilingual emcee for a corporate Diwali party and awards, Gurugram", 2, now - 6 * DAY);
  const micdrop = await addVendor(ctx, eventId, emcee, {
    name: "Mic Drop Hosts", handle: "micdrop-hosts", city: "Gurugram", startingPrice: 35000, priceUnit: "total",
    priceNotes: "Evening of hosting, awards and games",
    highlights: ["Hindi and English", "Runs office games", "Awards scripts"],
    summary: "Hosts for office parties and awards nights, in Hindi and English.",
    score: 87, rankReason: "Bilingual, used to awards segments, and within the emcee budget.", isTopPick: true, rating: 4.6, reviewCount: 64,
  }, now, "INR");
  await addVendor(ctx, eventId, emcee, {
    name: "Spotlight Anchors", handle: "spotlight-anchors", city: "New Delhi", startingPrice: 48000, priceUnit: "total",
    priceNotes: "Anchor for the evening", highlights: ["Big-stage experience"],
    summary: "Anchors for conferences and big stages.", score: 75, rankReason: "Polished, but more stage show than an office party needs, and over budget.",
  }, now, "INR");
  await conversation(ctx, eventId, emcee, micdrop, "hello@micdrop-hosts.example", `Emcee for our Diwali party on ${onThe}`, [
    { dir: "out", kind: "inquiry", at: now - 4 * DAY, body: `Hello,\n\nWe're holding Northwind Labs' Diwali party on ${onThe}, 7 pm to 11:30 pm, for about 150 colleagues. We're looking for an emcee to host in Hindi and English: a welcome, a 20-minute awards segment and a couple of short games before the dance floor opens.\n\nAre you free that evening, and what would it cost?${SIGN}` },
  ], { status: "sent", nextFollowUpAt: now + 1 * DAY });
  await ctx.db.patch(emcee._id, { status: "contacted" });

  // ---- Photography: researched and ranked, not written to yet. ---------------------
  await researched(ctx, eventId, photo, "Event photographer in Gurugram for a corporate Diwali party", 3, now - 3 * DAY);
  for (const p of [
    { name: "Glasshouse Photo Co.", handle: "glasshouse-photo", city: "Gurugram", startingPrice: 32000, priceUnit: "total" as const, priceNotes: "Evening coverage, edited photos in 3 days", highlights: ["Candid office events", "Quick turnaround for Slack and LinkedIn"], summary: "Event photographers who turn office parties round in three days.", score: 90, rankReason: "Candid style and a three-day turnaround suit a company party.", isTopPick: true, rating: 4.8, reviewCount: 119 },
    { name: "Pixel Mela", handle: "pixelmela", city: "Gurugram", startingPrice: 6500, priceUnit: "per_hour" as const, priceNotes: "Per hour, two-hour minimum", highlights: ["Photo booth with instant prints"], summary: "Event photography with an optional photo booth.", score: 83, rankReason: "The photo booth would be fun; hourly pricing makes the evening about ₹30,000.", rating: 4.5, reviewCount: 71 },
    { name: "Click & Kin Studio", handle: "clickandkin", city: "New Delhi", startingPrice: 45000, priceUnit: "total" as const, priceNotes: "Photo and short film", highlights: ["Highlight reel"], summary: "Photo and short film packages.", score: 72, rankReason: "A highlight reel is a nice extra, but it runs over the photography budget." },
  ]) {
    await addVendor(ctx, eventId, photo, p, now, "INR");
  }

  // ---- Hampers: two per-piece quotes; the cheaper one makes you buy 200. ------------
  await researched(ctx, eventId, hampers, "Corporate Diwali hampers in Gurugram, 150 pieces, with branded T-shirts", 2, now - 7 * DAY);
  const mitti = await addVendor(ctx, eventId, hampers, {
    name: "Mitti & Mithai Gifting", handle: "mittiandmithai", city: "Gurugram", startingPrice: 1250, priceUnit: "per_piece",
    priceNotes: "Per hamper, no minimum order",
    highlights: ["Brass diya, dry fruits and mithai", "Branded T-shirt in each hamper", "Delivered to the office"],
    summary: "Corporate Diwali hampers, packed with the company's own T-shirt.",
    score: 89, rankReason: "Exactly 150 pieces, a T-shirt in each, and inside the hamper budget.", isTopPick: true, rating: 4.6, reviewCount: 208,
  }, now, "INR");
  const kesar = await addVendor(ctx, eventId, hampers, {
    name: "Kesar Box Co.", handle: "kesarbox", city: "Delhi NCR", startingPrice: 1050, priceUnit: "per_piece",
    priceNotes: "Per hamper, minimum order 200",
    highlights: ["Dry fruits and a scented candle", "Bulk pricing"],
    summary: "Bulk Diwali hampers at a lower price per piece.",
    score: 79, rankReason: "Cheaper per piece, but the 200-piece minimum costs more overall, and no T-shirts.", rating: 4.3, reviewCount: 156,
  }, now, "INR");
  const hamperSubject = `Diwali hampers for 150, delivered by ${longDateIN(addDays(start, -2))}`;
  const mittiMail = await conversation(ctx, eventId, hampers, mitti, "hello@mittiandmithai.example", hamperSubject, [
    { dir: "out", kind: "inquiry", at: now - 7 * DAY, body: `Hello,\n\nWe'd like 150 Diwali hampers for Northwind Labs, delivered to our office on Golf Course Road by ${longDateIN(addDays(start, -2))}. Ideally each one has a branded T-shirt in the colleague's size; we'll share the sizes.\n\nWhat would that cost per piece?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 5 * DAY, body: `Hi Ananya,\n\nHappy to help. Our Diwali hamper is ₹1,250 a piece, GST included: a brass diya, 250 g of dry fruits, a box of mithai and a branded T-shirt, packed with a card. For 150 that's ₹1,87,500, delivered free to your office. We'll need the T-shirt sizes and your logo 14 days before delivery, and 50% to place the order.\n\nRegards,\nMitti & Mithai Gifting` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: hampers._id, vendorId: mitti, threadId: mittiMail.threadId, messageId: mittiMail.messageIds[1],
    total: 187500, deposit: 93750, currency: "INR",
    includes: ["Brass diya", "250 g dry fruits", "Box of mithai", "Branded T-shirt", "Delivery to the office"],
    excludes: [],
    redFlags: [],
    summary: "₹1,250 a hamper for 150, GST included: ₹1,87,500 with a T-shirt in each. Sizes and logo due 14 days before.",
    lines: [{ item: "Diwali hamper with branded T-shirt", kind: "core", unit: "per_piece", quantity: 150, unitPrice: 1250, amount: 187500 }],
    headcountAssumed: 150,
    taxIncluded: true,
  });
  const kesarMail = await conversation(ctx, eventId, hampers, kesar, "hello@kesarbox.example", hamperSubject, [
    { dir: "out", kind: "inquiry", at: now - 7 * DAY, body: `Hello,\n\nWe'd like 150 Diwali hampers for Northwind Labs, delivered to our office on Golf Course Road by ${longDateIN(addDays(start, -2))}. Could you share your price per piece, and whether a branded T-shirt can go in each?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 4 * DAY, body: `Dear Ananya,\n\nOur corporate hamper is ₹1,050 a piece, GST included: dry fruits, a scented candle and a greeting card. Our minimum order is 200 pieces, so it would be ₹2,10,000. We don't do T-shirts, sorry.\n\nThanks,\nKesar Box Co.` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: hampers._id, vendorId: kesar, threadId: kesarMail.threadId, messageId: kesarMail.messageIds[1],
    total: 210000, currency: "INR",
    includes: ["Dry fruits", "Scented candle", "Greeting card"],
    excludes: ["Branded T-shirts"],
    redFlags: ["Minimum order is 200 pieces: you need 150, so 50 hampers (₹52,500) would be extra."],
    summary: "₹1,050 a hamper, but a 200-piece minimum makes it ₹2,10,000, and there are no T-shirts.",
    lines: [
      { item: "Corporate hamper", kind: "core", unit: "per_piece", quantity: 150, unitPrice: 1050, amount: 157500 },
      // The minimum order, as its own line: comparing at 150 pieces still counts the 50 extra.
      { item: "50 more hampers to reach the 200-piece minimum", kind: "fee", unit: "total", amount: 52500 },
    ],
    headcountAssumed: 200,
    taxIncluded: true,
  });
  await ctx.db.patch(hampers._id, { status: "quoted" });
  await ctx.db.insert("dues", { eventId, slotId: hampers._id, kind: "deadline", label: "T-shirt sizes and logo to the hamper maker", dueDate: addDays(start, -16) });

  // ---- To-dos for Ananya. -------------------------------------------------------------
  const todos: { title: string; inDays?: number; done?: boolean; slotId?: Id<"vendorSlots"> }[] = [
    { title: "Get finance sign-off on the ₹9 lakh budget", done: true },
    { title: "Send the save-the-date on Slack", done: true },
    { title: "Collect T-shirt sizes for the hampers", inDays: 10, slotId: hampers._id },
    { title: "Pick the venue: Kanak Hall or Saffron Terrace", inDays: 4, slotId: venue._id },
    { title: "Share the Jain and vegan list with the venue", inDays: 21, slotId: venue._id },
    { title: "Finalise the Diwali award categories with the leadership team", inDays: 14 },
    { title: "Book cabs home for anyone leaving after 11 pm", inDays: 28 },
  ];
  for (const [order, todo] of todos.entries()) {
    await ctx.db.insert("tasks", {
      eventId,
      title: todo.title,
      done: todo.done ?? false,
      order,
      sessionId: session._id,
      ...(todo.inDays !== undefined ? { dueAt: now + todo.inDays * DAY } : {}),
      ...(todo.slotId ? { slotId: todo.slotId } : {}),
    });
  }

  // ---- Attendees: colleagues by team, answering from the Slack link. -----------------
  const people: Array<[string, string, "pending" | "yes" | "no" | "maybe", string | undefined, string[], string | undefined]> = [
    ["Rohan Mehta", "Engineering", "yes", undefined, [], undefined],
    ["Priya Nair", "Engineering", "yes", "Vegan", [], undefined],
    ["Ishaan Gupta", "Engineering", "yes", "Jain: no onion, garlic or root vegetables", [], undefined],
    ["Arjun Kapoor", "Engineering", "pending", undefined, [], undefined],
    ["Sneha Iyer", "Design", "yes", undefined, [], undefined],
    ["Kabir Sethi", "Design", "maybe", undefined, [], "Might be travelling back from a client visit"],
    ["Meera Jain", "Sales", "yes", "Jain: no onion, garlic or root vegetables", [], undefined],
    ["Vikram Singh", "Sales", "yes", undefined, [], undefined],
    ["Aisha Khan", "Sales", "no", undefined, [], "On leave that week"],
    ["Dev Malhotra", "Product", "yes", "Vegan", [], undefined],
    ["Tara Bose", "Product", "pending", undefined, [], undefined],
    ["Nikhil Rao", "Finance", "yes", undefined, ["Peanuts, severe (Nikhil)"], undefined],
  ];
  for (const [i, [name, team, rsvp, dietary, allergies, notes]] of people.entries()) {
    await ctx.db.insert("guests", {
      eventId,
      name,
      email: `${name.split(" ")[0].toLowerCase()}@northwindlabs.example`,
      side: team,
      partySize: 1,
      rsvp,
      attendingCount: rsvp === "yes" ? 1 : 0,
      dietary,
      ...(allergies.length ? { allergies } : {}),
      sessionIds: [session._id],
      lastInvitedAt: now - 9 * DAY,
      ...(rsvp !== "pending" ? { respondedAt: now - (8 - (i % 6)) * DAY } : {}),
      notes,
    });
  }

  // ---- The event page: written, not published (the demo's never is). ---------------
  await ctx.db.insert("eventSites", {
    eventId,
    slug: siteSlug("Northwind", ""),
    published: false,
    welcome: `Diyas, dinner and a dance floor: join the whole Northwind Labs team for our Diwali party on ${onThe}, from 7 pm. Come festive, bring your best moves, and let us know you're coming so we can plan the food.`,
    showSchedule: true,
    showTravel: false,
    showRsvp: true,
    hiddenSessionIds: [],
    showGifts: false,
    updatedAt: now - 3 * DAY,
  });

  // ---- What the activity feed would have shown along the way. --------------------
  for (const text of [
    `${BRAND.name} found 3 venues on Golf Course Road for 150 and wrote to the top 2 from the event's inbox.`,
    "Kanak Hall quoted ₹1,850 a head with the food, GST included: ₹2,77,500 for 150.",
    "Saffron Terrace quoted ₹1,20,000 hire plus ₹1,350 a plate: ₹3,22,500 before GST, about ₹3,80,550 with it.",
    "You booked Frequency Seven DJs for ₹55,000. The ₹15,000 advance is paid; the balance is due on the night.",
    "Deepam Decor Studio quoted ₹78,000 for diyas, lanterns and a flower rangoli. It's in your budget, with an undo.",
    "Kesar Box Co. is cheaper per hamper, but their minimum is 200 pieces, so it costs more than Mitti & Mithai for 150.",
    "Lumos Stage & Sound wrote back with questions only you can answer: indoors or rooftop, how many mics, and a screen or not.",
    `${BRAND.name} wrote to Mic Drop Hosts about an emcee for the awards.`,
    "10 colleagues have replied and 8 are coming. Two are Jain, two vegan, and Nikhil Rao has a severe peanut allergy.",
  ]) {
    await logActivity(ctx, { eventId, actorLabel: APP_ACTOR, actorKind: "app", type: "note", text });
  }
  await seedBoard(ctx, eventId, [
    {
      sessionId: session._id,
      notes: ["No alcohol: mocktail counter and chai bar instead.", "Awards at 8:30, then the DJ until 11.", "Diyas on every table; nothing with open flame near the stage."],
      colors: [{ name: "Marigold", hex: "#F2A541" }, { name: "Maroon", hex: "#7A1E2C" }, { name: "Gold", hex: "#C9A227" }],
      vendors: [freq],
    },
  ]);
  return eventId;
}
