import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { setCommittedForSlotHelper } from "./budget";
import { addBookingPayments, recountPaid } from "./dues";
import { insertEvent } from "./events";
import { logActivity } from "./lib/auth";
import { APP_ACTOR, BRAND } from "./lib/brand";
import { DAY, addVendor, conversation, longDateIN, researched, slotsOf, type SeedVendor, seedBoard } from "./lib/demoKit";
import { addDays } from "./lib/text";
import { siteSlug } from "./site";

/**
 * Amma's 60th in Chennai: a small homam at home in the morning and lunch for 120 at a
 * hall in Mylapore, organised by her daughter Divya. The hall is booked, three caterers
 * have quoted in three different shapes, and two vendors are being followed up.
 */

const HOUR = 3_600_000;
const SIGN = "\n\nWarm regards,\nDivya";
const POOJA = "Morning pooja";
const LUNCH = "Birthday lunch";

/** The first Saturday at least `days` from today. */
function saturdayAfter(todayIso: string, days: number): string {
  const d = addDays(todayIso, days);
  const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
  return addDays(d, (6 - weekday + 7) % 7);
}

/** This week's Friday, or next week's if today is Friday or later. */
function comingFriday(todayIso: string): string {
  const weekday = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
  return addDays(todayIso, (5 - weekday + 7) % 7 || 7);
}

export async function seedBirthday(ctx: MutationCtx, userId: Id<"users">): Promise<Id<"events">> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const start = saturdayAfter(today, 91);
  const dateText = `Saturday, ${longDateIN(start)}`;

  const eventId = await insertEvent(
    ctx,
    userId,
    {
      name: "Amma's 60th",
      host: "Divya",
      coHost: "Karthik",
      startDate: start,
      endDate: start,
      city: "Chennai",
      area: "Mylapore",
      country: "India",
      currency: "INR",
      totalBudget: 450_000,
      eventType: "birthday",
      occasionLabel: "Amma's 60th",
      guestEstimate: 120,
      styleVibes: ["Traditional", "Family", "Jasmine and marigold"],
      stylePalette: "Jasmine white, marigold and maroon",
      styleFormality: "smart",
      // Session budgets are weights: the homam needs only the priest.
      sessions: [
        { name: POOJA, date: start, guestCount: 40, budget: 8, kind: "puja" },
        { name: LUNCH, date: start, guestCount: 120, budget: 92, kind: "dinner" },
      ],
      needs: [
        { category: "Officiant", title: "Priest", pct: 8, booked: false, sessionNames: [POOJA] },
        { category: "Catering", title: "Catering", pct: 24, booked: false, sessionNames: [LUNCH] },
        { category: "Venue", title: "Hall", pct: 20, booked: false, sessionNames: [LUNCH] },
        { category: "Decor & Florals", title: "Flowers & decoration", pct: 12, booked: false, sessionNames: [LUNCH] },
        { category: "Photographer", title: "Photography", pct: 10, booked: false, sessionNames: [LUNCH] },
        { category: "Cake", title: "Cake", pct: 3, booked: false, sessionNames: [LUNCH] },
        { category: "Gifting", title: "Return gifts", pct: 15, booked: false, sessionNames: [LUNCH] },
        { category: "Entertainment", title: "Nadaswaram or light music", pct: 8, booked: false, sessionNames: [LUNCH] },
      ],
    },
    { demo: true },
  );
  await ctx.db.patch(eventId, {
    styleSummary:
      "A warm, traditional day for Amma: a quiet homam at home with close family, then a banana-leaf lunch " +
      "in Mylapore with jasmine and marigold, nadaswaram as guests arrive, and silk sarees and veshtis.",
  });

  const sessions = await ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(10);
  const pooja = sessions.find((s) => s.name === POOJA)!;
  const lunch = sessions.find((s) => s.name === LUNCH)!;
  await ctx.db.patch(pooja._id, {
    startTime: "07:00",
    endTime: "09:00",
    location: "At home, Mylapore",
    description: "A small Ayush homam for Amma with close family, then coffee and tiffin at home.",
    significance: "A prayer for long life and good health, often done on a 60th birthday.",
    rites: [
      { name: "Ganapathi pooja", gloss: "A prayer to begin without obstacles" },
      { name: "Ayush homam", gloss: "Offerings into the fire for a long and healthy life" },
      { name: "Namaskaram", gloss: "Children and grandchildren take Amma's blessings" },
    ],
  });
  await ctx.db.patch(lunch._id, {
    startTime: "12:30",
    endTime: "15:30",
    location: "Thamarai Hall, Luz, Mylapore",
    description: "A banana-leaf lunch for about 120 relatives and friends, with nadaswaram and the cake after.",
    // The palette kept from the Lunch's Space.
    choices: [
      {
        label: "Palette",
        value: "Jasmine white, marigold and maroon",
        colors: [{ name: "Jasmine", hex: "#F7F3E8" }, { name: "Marigold", hex: "#E9A23B" }, { name: "Maroon", hex: "#7A1F2B" }],
      },
    ],
  });

  const slot = await slotsOf(ctx, eventId);
  const priest = slot("Priest");
  const catering = slot("Catering");
  const hall = slot("Hall");
  const decor = slot("Flowers & decoration");
  const photo = slot("Photography");
  const cake = slot("Cake");
  const gifting = slot("Return gifts");
  const music = slot("Nadaswaram or light music");
  const add = (s: Doc<"vendorSlots">, seed: SeedVendor) => addVendor(ctx, eventId, s, seed, now, "INR");

  // ---- Hall: written to, quoted and booked, with the advance paid. ----------------
  await researched(ctx, eventId, hall, "Hall in Mylapore for a 60th birthday lunch, 120 guests, with a lift", 3, now - 14 * DAY);
  const thamarai = await add(hall, {
    name: "Thamarai Hall", handle: "thamarai-hall", city: "Luz, Mylapore, Chennai", startingPrice: 65_000, priceUnit: "total",
    priceNotes: "Half day, with the dining hall", highlights: ["Seats 180, dining hall for 150", "Lift and ramp for elderly guests", "Two minutes from Luz Corner"],
    summary: "A mid-sized hall in Luz with its own dining hall and kitchen.", score: 92, rankReason: "Right size for 120, close to home, and easy for older relatives.", isTopPick: true, rating: 4.6, reviewCount: 184,
  });
  await add(hall, {
    name: "Mandaveli Mini Hall", handle: "mandaveli-minihall", city: "Mandaveli, Chennai", startingPrice: 48_000, priceUnit: "total",
    priceNotes: "Half day, hall only", highlights: ["Seats 120", "Lunch served in the same hall"],
    summary: "A small hall for family functions, without a separate dining room.", score: 78, rankReason: "Cheaper, but 120 is its limit and lunch would be in the same room.", rating: 4.2, reviewCount: 57,
  });
  await add(hall, {
    name: "Kalpa Hall", handle: "kalpa-hall", city: "Alwarpet, Chennai", startingPrice: 95_000, priceUnit: "total",
    priceNotes: "Full day only", highlights: ["Air-conditioned, seats 250", "Valet parking"],
    summary: "A large air-conditioned hall, let by the full day.", score: 74, rankReason: "Lovely, but full-day only and above what you set aside.", rating: 4.5, reviewCount: 102,
  });
  const hallMail = await conversation(ctx, eventId, hall, thamarai, "hello@thamarai-hall.example", `Lunch for 120 on ${dateText}`, [
    { dir: "out", kind: "inquiry", at: now - 13 * DAY, body: `Dear Sir/Madam,\n\nWe are celebrating my mother's 60th birthday on ${dateText}, with a lunch for about 120 relatives and friends. Would Thamarai Hall be free that day from about 11 am to 4 pm, with the dining hall? Many of our guests are elderly, so the lift matters a great deal to us.\n\nCould you kindly let me know the rent and what it includes?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 12 * DAY, body: `Dear Madam,\n\nThank you for your enquiry, and many happy returns to your mother in advance. The hall is available on ${dateText} from 11 am to 4:30 pm.\n\nHall rent: ₹68,000\nDining hall and kitchen: ₹8,000\nElectricity and cleaning: ₹4,000\nTotal: ₹80,000, inclusive of GST\n\nAn advance of ₹25,000 confirms the booking, and the balance is payable one month before the function. The lift is working, and we keep chairs near the stage for elders.\n\nRegards,\nSekar\nThamarai Hall, Luz` },
    { dir: "out", kind: "booking_confirmation", at: now - 10 * DAY, body: `Dear Mr. Sekar,\n\nThank you for the details. We would like to go ahead and book Thamarai Hall for ${dateText}. My brother Karthik will pay the advance of ₹25,000 this week. Kindly confirm once it is received.${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 9 * DAY, body: `Dear Madam,\n\nReceived the advance of ₹25,000 with thanks. The hall is blocked for you on ${dateText}. Kindly confirm the final headcount one week before.\n\nRegards,\nSekar` },
  ], { status: "booked" });
  await ctx.db.insert("quotes", {
    eventId, slotId: hall._id, vendorId: thamarai, threadId: hallMail.threadId, messageId: hallMail.messageIds[1],
    total: 80_000, deposit: 25_000, currency: "INR", includes: ["Hall, 11 am to 4:30 pm", "Dining hall and kitchen", "Electricity and cleaning", "GST"], excludes: ["Catering", "Decoration"],
    redFlags: [], summary: "The hall for the afternoon with the dining hall, ₹80,000 including GST; ₹25,000 advance.",
    lines: [
      { item: "Hall rent, 11 am to 4:30 pm", kind: "core", unit: "total", amount: 68_000 },
      { item: "Dining hall and kitchen", kind: "fee", unit: "total", amount: 8_000 },
      { item: "Electricity and cleaning", kind: "fee", unit: "total", amount: 4_000 },
    ],
    taxIncluded: true,
    state: "applied", appliedAt: now - 12 * DAY, before: { threadStatus: "sent", slotStatus: "contacted", committed: 0 },
  });
  await ctx.db.patch(hall._id, { status: "booked", bookedVendorId: thamarai });
  await setCommittedForSlotHelper(ctx, hall._id, 80_000);
  const event = (await ctx.db.get(eventId))!;
  await addBookingPayments(ctx, { event, slotId: hall._id, vendorId: thamarai, total: 80_000, deposit: 25_000 });
  for (const due of await ctx.db.query("dues").withIndex("by_vendorId", (q) => q.eq("vendorId", thamarai)).take(5)) {
    if (due.label === "Deposit") await ctx.db.patch(due._id, { dueDate: addDays(today, -9), doneAt: now - 9 * DAY });
  }
  await recountPaid(ctx, hall._id);
  await ctx.db.insert("dues", { eventId, slotId: hall._id, vendorId: thamarai, kind: "deadline", label: "Final headcount to the hall", dueDate: addDays(start, -7) });

  // ---- Catering: three replies, priced three different ways, lined up. -----------
  await researched(ctx, eventId, catering, "Caterer in Mylapore for a banana-leaf lunch, 120 guests, Jain and no onion-garlic", 4, now - 9 * DAY);
  await ctx.db.patch(catering._id, { notes: "A fair rate for a banana-leaf lunch in Chennai is about ₹400 to ₹520 a plate." });
  const annam = await add(catering, {
    name: "Annam Caterers", handle: "annam-caterers", city: "Mandaveli, Chennai", startingPrice: 380, priceUnit: "per_person",
    priceNotes: "A plate, minimum 150 plates", highlights: ["Traditional banana-leaf meals", "Jain and no onion-garlic on request", "Family functions in Mylapore for 30 years"],
    summary: "A long-standing family caterer for weddings and functions in Mylapore.", score: 84, rankReason: "Lowest rate a plate, but their minimum is 150 plates against your 120.", rating: 4.5, reviewCount: 312,
  });
  const saapadu = await add(catering, {
    name: "Saapadu Kitchen", handle: "saapadu-kitchen", city: "Alwarpet, Chennai", startingPrice: 520, priceUnit: "per_person",
    priceNotes: "Packages for 100 to 300 guests, all in", highlights: ["One price, nothing added", "Live dosa counter", "Steel tumblers, no plastic"],
    summary: "A newer caterer with fixed-price packages for family functions.", score: 83, rankReason: "Simple all-in pricing for family functions.", rating: 4.7, reviewCount: 141,
  });
  const kaveri = await add(catering, {
    name: "Kaveri Feast Co.", handle: "kaveri-feast", city: "R.A. Puram, Chennai", startingPrice: 450, priceUnit: "per_person",
    priceNotes: "A plate, GST extra", highlights: ["Iyer-style menu", "Separate kitchen for Jain food", "Served at the table on banana leaf"],
    summary: "A caterer known for traditional Iyer-style meals served at the table.", score: 90, rankReason: "Traditional meals at a fair rate, and Jain food from a separate kitchen.", isTopPick: true, rating: 4.8, reviewCount: 96,
  });
  await add(catering, {
    name: "Mylai Virundhu", handle: "mylai-virundhu", city: "Mylapore, Chennai", startingPrice: 600, priceUnit: "per_person",
    priceNotes: "A plate, minimum 200 plates", highlights: ["Elaborate festival menus"],
    summary: "A caterer for large weddings, with a 200-plate minimum.", score: 70, rankReason: "Well liked, but a 200-plate minimum is far above your 120, so it wasn't written to.", rating: 4.6, reviewCount: 220,
  });
  const cateringSubject = `Lunch for 120 on ${dateText}, Mylapore`;
  const cateringAsk = `Dear Sir/Madam,\n\nWe are celebrating my mother's 60th birthday on ${dateText} at Thamarai Hall in Luz, Mylapore. We are looking for a traditional vegetarian lunch on banana leaf for about 120 people, served from 12:30 pm. A few guests need Jain food, and two do not eat onion or garlic.\n\nCould you let me know if you are free that day, and your rates?${SIGN}`;

  const annamMail = await conversation(ctx, eventId, catering, annam, "hello@annam-caterers.example", cateringSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: cateringAsk },
    { dir: "in", kind: "vendor_reply", at: now - 6 * DAY, body: `Dear Divya Madam,\n\nVanakkam, and thank you for thinking of us. We are free on ${dateText} and know Thamarai Hall well.\n\nOur traditional meals are ₹380 a plate: two sweets, vadai, three vegetables, sambar, rasam, more kuzhambu, curd rice, appalam and payasam, on banana leaf. Our minimum order is 150 plates.\n\n150 plates at ₹380: ₹57,000\nService charge (serving staff and cleaning): ₹6,000\nGST at 5%: ₹3,150\nTotal: ₹66,150\n\nJain and no onion-garlic plates are made at the same rate. An advance of ₹15,000 confirms the date.\n\nWith regards,\nSrinivasan\nAnnam Caterers, Mandaveli` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: catering._id, vendorId: annam, threadId: annamMail.threadId, messageId: annamMail.messageIds[1],
    total: 66_150, deposit: 15_000, currency: "INR",
    includes: ["Banana-leaf lunch with two sweets", "Jain and no onion-garlic plates", "Serving staff and cleaning", "GST"], excludes: [],
    redFlags: ["Priced for a minimum of 150 plates; you expect about 120."],
    summary: "₹380 a plate for a 150-plate minimum, plus service and GST: ₹66,150.",
    lines: [
      { item: "Traditional lunch on banana leaf", kind: "core", unit: "per_person", quantity: 150, unitPrice: 380, amount: 57_000 },
      { item: "Service charge (staff and cleaning)", kind: "fee", unit: "total", amount: 6_000 },
      { item: "GST at 5%", kind: "tax", unit: "total", amount: 3_150 },
    ],
    headcountAssumed: 150, taxIncluded: true,
    state: "applied", appliedAt: now - 6 * DAY, before: { threadStatus: "sent", slotStatus: "contacted", committed: 0 },
  });

  const saapaduMail = await conversation(ctx, eventId, catering, saapadu, "hello@saapadu-kitchen.example", cateringSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: cateringAsk },
    { dir: "in", kind: "vendor_reply", at: now - 3 * DAY, body: `Hello Divya,\n\nThank you for writing to us, and a very happy 60th to your mother! We are available on ${dateText}.\n\nOur family-function package for 120 guests is ₹62,000, all in: a welcome drink, a full banana-leaf lunch with two sweets, a live dosa counter, serving staff, transport and GST. If the count goes up, each extra plate is ₹480.\n\nWe take half as advance (₹31,000) to block the date.\n\nRegards,\nMeenakshi\nSaapadu Kitchen, Alwarpet` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: catering._id, vendorId: saapadu, threadId: saapaduMail.threadId, messageId: saapaduMail.messageIds[1],
    total: 62_000, deposit: 31_000, currency: "INR",
    includes: ["Welcome drink", "Banana-leaf lunch with two sweets", "Live dosa counter", "Serving staff", "Transport", "GST"], excludes: ["Extra plates beyond 120 (₹480 each)"],
    redFlags: [], summary: "₹62,000 all in for 120 guests, about ₹517 a plate; extra plates ₹480.",
    lines: [{ item: "Family-function package for 120, all in", kind: "core", unit: "total", amount: 62_000 }],
    headcountAssumed: 120, taxIncluded: true,
    state: "applied", appliedAt: now - 3 * DAY, before: { threadStatus: "sent", slotStatus: "quoted", committed: 66_150 },
  });

  const kaveriMail = await conversation(ctx, eventId, catering, kaveri, "hello@kaveri-feast.example", cateringSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: cateringAsk },
    { dir: "in", kind: "vendor_reply", at: now - 20 * HOUR, body: `Dear Divya,\n\nVanakkam. We would be glad to cook for your mother's 60th, and we are free on ${dateText}.\n\nOur rate is ₹450 a plate for a full Iyer-style lunch, so for 120 guests it comes to ₹54,000, plus ₹2,500 to bring the vessels and staff to Luz. GST is extra. We cook Jain food in a separate kitchen.\n\nOne question before we fix the menu: would you like the lunch served on banana leaf at the tables, or as a buffet? And how many guests need Jain food?\n\nAn advance of ₹10,000 holds the date.\n\nRegards,\nPadmini\nKaveri Feast Co., R.A. Puram` },
  ], {
    status: "needs_attention",
    attentionReason: "vendor_question",
    pendingQuestion: "Kaveri Feast Co. asks whether lunch should be served on banana leaf at the tables or as a buffet, and how many guests need Jain food.",
  });
  await ctx.db.insert("quotes", {
    eventId, slotId: catering._id, vendorId: kaveri, threadId: kaveriMail.threadId, messageId: kaveriMail.messageIds[1],
    total: 56_500, deposit: 10_000, currency: "INR",
    includes: ["Iyer-style lunch", "Jain food from a separate kitchen", "Transport of vessels and staff"], excludes: ["GST"],
    redFlags: ["GST is not included."], summary: "₹450 a plate for 120 plus ₹2,500 transport: ₹56,500 before GST.",
    lines: [
      { item: "Iyer-style lunch", kind: "core", unit: "per_person", quantity: 120, unitPrice: 450, amount: 54_000 },
      { item: "Transport of vessels and staff", kind: "fee", unit: "total", amount: 2_500 },
    ],
    headcountAssumed: 120, taxIncluded: false,
    state: "applied", appliedAt: now - 20 * HOUR, before: { threadStatus: "sent", slotStatus: "quoted", committed: 62_000 },
  });
  // The budget follows the latest live quote until a caterer is chosen.
  await ctx.db.patch(catering._id, { status: "quoted" });
  await setCommittedForSlotHelper(ctx, catering._id, 56_500);

  // ---- Photography and music: written to, quiet, followed up once. ----------------
  await researched(ctx, eventId, photo, "Candid photographer in Mylapore for a family function", 3, now - 9 * DAY);
  const nila = await add(photo, {
    name: "Nila Studio", handle: "nila-studio", city: "Mylapore, Chennai", startingPrice: 35_000, priceUnit: "total",
    priceNotes: "Half day, candid and traditional", highlights: ["Candid family portraits", "Edited pictures in two weeks", "Used to elders and large families"],
    summary: "A two-person studio that photographs family functions around Mylapore.", score: 89, rankReason: "Candid style and a half-day rate that fits a three-hour lunch.", isTopPick: true, rating: 4.8, reviewCount: 73,
  });
  await add(photo, {
    name: "Santhome Lens", handle: "santhome-lens", city: "Santhome, Chennai", startingPrice: 28_000, priceUnit: "total",
    priceNotes: "Three hours, traditional", highlights: ["Posed group pictures", "Printed album option"],
    summary: "A traditional photographer for functions and pooja.", score: 80, rankReason: "Good value; more posed than candid.", rating: 4.4, reviewCount: 48,
  });
  await add(photo, {
    name: "Kaapi Stories Photography", handle: "kaapi-stories", city: "Adyar, Chennai", startingPrice: 45_000, priceUnit: "total",
    priceNotes: "Half day, photo and short film", highlights: ["Short film of the day"],
    summary: "Photographs and a short film, in a documentary style.", score: 76, rankReason: "Lovely film, but above what you set aside for photography.",
  });
  const photoSubject = `Photography for Amma's 60th, ${dateText}`;
  await conversation(ctx, eventId, photo, nila, "hello@nila-studio.example", photoSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: `Dear Sir/Madam,\n\nWe are celebrating my mother's 60th birthday with a lunch for about 120 people at Thamarai Hall, Luz, on ${dateText}, from 12:30 to 3:30 pm. We would like candid photographs of the family and guests, and a few group pictures with Amma.\n\nCould you let me know if you are available, and your charges for those three hours?${SIGN}` },
    { dir: "out", kind: "follow_up", at: now - 2 * DAY, body: `Dear Sir/Madam,\n\nI am writing again about my mother's 60th birthday lunch at Thamarai Hall on ${dateText}, 12:30 to 3:30 pm. We would love to have you photograph it. Could you let me know if you are free?${SIGN}` },
  ], { status: "sent", followUpCount: 1, nextFollowUpAt: now + 1 * DAY });

  await researched(ctx, eventId, music, "Nadaswaram or light music duo for a 60th birthday lunch in Chennai", 2, now - 9 * DAY);
  const mangala = await add(music, {
    name: "Mangala Isai Nadaswaram Group", handle: "mangala-isai", city: "Mylapore, Chennai", startingPrice: 22_000, priceUnit: "total",
    priceNotes: "Nadaswaram and thavil, three hours", highlights: ["Two nadaswaram, two thavil", "Plays at temples and family functions"],
    summary: "A traditional nadaswaram and thavil group from Mylapore.", score: 88, rankReason: "Traditional music for a 60th, within the music budget.", isTopPick: true, rating: 4.7, reviewCount: 39,
  });
  await add(music, {
    name: "Ragam Duo", handle: "ragam-duo", city: "T. Nagar, Chennai", startingPrice: 18_000, priceUnit: "total",
    priceNotes: "Keyboard and vocals, three hours", highlights: ["Old film songs and light classical", "Takes requests from elders"],
    summary: "A keyboard and vocal duo playing old film songs and light classical.", score: 81, rankReason: "A softer choice that suits lunch; less traditional than nadaswaram.", rating: 4.5, reviewCount: 22,
  });
  const musicSubject = `Nadaswaram for a 60th birthday lunch, ${dateText}`;
  await conversation(ctx, eventId, music, mangala, "hello@mangala-isai.example", musicSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: `Dear Sir,\n\nWe are celebrating my mother's 60th birthday at Thamarai Hall, Luz, on ${dateText}. We would love nadaswaram and thavil while guests arrive and during lunch, from about 12:30 to 3 pm.\n\nAre you available that day, and what would it cost?${SIGN}` },
    { dir: "out", kind: "follow_up", at: now - 2 * DAY, body: `Dear Sir,\n\nI am following up on my note about nadaswaram for my mother's 60th birthday at Thamarai Hall on ${dateText}, 12:30 to 3 pm. Kindly let me know if you are free that day.${SIGN}` },
  ], { status: "sent", followUpCount: 1, nextFollowUpAt: now + 1 * DAY });
  for (const s of [photo, music]) await ctx.db.patch(s._id, { status: "contacted" });

  // ---- Found and ranked, not written to yet. -------------------------------------
  await researched(ctx, eventId, priest, "Vadhyar in Mylapore for an Ayush homam at home", 2, now - 9 * DAY);
  await add(priest, {
    name: "Mylapore Vaidika Seva", handle: "vaidika-seva", city: "Mylapore, Chennai", startingPrice: 18_000, priceUnit: "total",
    priceNotes: "Ayush homam with two vadhyars, samagri included", highlights: ["Brings all the homam materials", "Explains each step for the family"],
    summary: "Vadhyars for homams and family ceremonies at home.", score: 90, rankReason: "Does Ayush homams at home and brings everything needed.", isTopPick: true, rating: 4.8, reviewCount: 61,
  });
  await add(priest, {
    name: "Sankara Purohit Services", handle: "sankara-purohit", city: "Mandaveli, Chennai", startingPrice: 15_000, priceUnit: "total",
    priceNotes: "Priest only, samagri separate", highlights: ["Early morning muhurtham"],
    summary: "Priests for poojas and homams across south Chennai.", score: 80, rankReason: "A little cheaper, but the materials are extra.", rating: 4.5, reviewCount: 34,
  });

  await researched(ctx, eventId, decor, "Jasmine and marigold decoration for a hall in Mylapore", 2, now - 9 * DAY);
  await add(decor, {
    name: "Malli Poo Decor", handle: "mallipoo-decor", city: "Mylapore, Chennai", startingPrice: 30_000, priceUnit: "total",
    priceNotes: "Stage, entrance and kolam", highlights: ["Fresh jasmine and marigold", "Stage backdrop for photographs"],
    summary: "Flower decoration for family functions, mostly jasmine and marigold.", score: 87, rankReason: "Matches the jasmine and marigold palette, well within budget.", isTopPick: true, rating: 4.6, reviewCount: 88,
  });
  await add(decor, {
    name: "Thoranam Events", handle: "thoranam-events", city: "Royapettah, Chennai", startingPrice: 42_000, priceUnit: "total",
    priceNotes: "Stage, entrance, tables and lighting", highlights: ["Brass lamps and uruli", "Lighting included"],
    summary: "Decoration with brass and lighting for halls.", score: 79, rankReason: "Fuller setup, but more than a lunch needs.", rating: 4.4, reviewCount: 41,
  });

  await researched(ctx, eventId, cake, "Eggless birthday cake for 120 in Mylapore", 2, now - 9 * DAY);
  await add(cake, {
    name: "Butter & Elaichi Bakes", handle: "butter-elaichi", city: "Alwarpet, Chennai", startingPrice: 3_500, priceUnit: "total",
    priceNotes: "2 kg eggless cake", highlights: ["Eggless only", "Delivers to the hall"],
    summary: "A home bakery making eggless cakes.", score: 88, rankReason: "Eggless, and delivers to the hall in time for after lunch.", isTopPick: true, rating: 4.9, reviewCount: 130,
  });
  await add(cake, {
    name: "Saffron Crumb Bakery", handle: "saffron-crumb", city: "Mandaveli, Chennai", startingPrice: 4_200, priceUnit: "total",
    priceNotes: "2 kg cake, eggless on request", highlights: ["Tiered cakes"],
    summary: "A bakery with tiered and themed cakes.", score: 82, rankReason: "Good for a tiered cake; eggless only on request.", rating: 4.6, reviewCount: 77,
  });

  await researched(ctx, eventId, gifting, "Return gifts for 120 guests at a 60th birthday, Chennai", 3, now - 9 * DAY);
  await add(gifting, {
    name: "Pithalai Gift House", handle: "pithalai-gifts", city: "Mylapore, Chennai", startingPrice: 42_000, priceUnit: "total",
    priceNotes: "Brass kumkum boxes for 120, with name tags", highlights: ["Brass, made in Kumbakonam", "Gift wrap and tags included"],
    summary: "Brass return gifts for weddings and family functions.", score: 86, rankReason: "A keepsake elders value, within the gifting budget.", isTopPick: true, rating: 4.7, reviewCount: 95,
  });
  await add(gifting, {
    name: "Thambulam Bags & More", handle: "thambulam-bags", city: "T. Nagar, Chennai", startingPrice: 30_000, priceUnit: "total",
    priceNotes: "Cloth bags with coconut, betel and a steel tumbler, for 120", highlights: ["Packed and delivered to the hall"],
    summary: "Ready thambulam bags for family functions.", score: 84, rankReason: "Traditional and practical, and they deliver packed.", rating: 4.5, reviewCount: 66,
  });
  await add(gifting, {
    name: "Green Return Gifts", handle: "green-return-gifts", city: "Adyar, Chennai", startingPrice: 24_000, priceUnit: "total",
    priceNotes: "Potted tulsi and seed kits for 120", highlights: ["Plastic-free"],
    summary: "Plants and seed kits as return gifts.", score: 78, rankReason: "Thoughtful and cheaper; harder to carry home on a bus.",
  });

  // ---- To-dos: a few for each part of the day. -----------------------------------
  const friday = comingFriday(today);
  const todos: { title: string; on?: Id<"sessions">; done?: boolean; slotId?: Id<"vendorSlots">; dueAt?: number }[] = [
    { title: "Book the hall", on: lunch._id, done: true, slotId: hall._id },
    { title: "Choose a caterer by Friday", on: lunch._id, slotId: catering._id, dueAt: Date.parse(`${friday}T12:30:00Z`) },
    { title: "Tell the caterer how many guests need Jain food", on: lunch._id, slotId: catering._id },
    { title: "Choose the return gifts", on: lunch._id, slotId: gifting._id },
    { title: "Order the eggless cake", on: lunch._id, slotId: cake._id },
    { title: "Confirm the vadhyar and the homam time", on: pooja._id, slotId: priest._id },
    { title: "Get the list of homam materials", on: pooja._id },
    { title: "Order flowers and garlands for the pooja", on: pooja._id },
    { title: "Send the invitation to relatives on WhatsApp" },
    { title: "Book Divya's flight to Chennai" },
  ];
  for (const [order, t] of todos.entries()) {
    await ctx.db.insert("tasks", {
      eventId, title: t.title, done: t.done ?? false, order,
      ...(t.on ? { sessionId: t.on } : {}), ...(t.slotId ? { slotId: t.slotId } : {}), ...(t.dueAt ? { dueAt: t.dueAt } : {}),
    });
  }

  // ---- Guests: family first; close family at the homam too. ---------------------
  const both = [pooja._id, lunch._id];
  const guests: Array<[string, string, number, Doc<"guests">["rsvp"], number, string | undefined, boolean]> = [
    ["Raghavan & Sudha Iyer", "Amma's family", 2, "yes", 2, undefined, true],
    ["Saroja Paati", "Amma's family", 1, "yes", 1, "No onion or garlic", true],
    ["Gopal Mama", "Amma's family", 1, "yes", 1, "No onion or garlic", true],
    ["Venkatesh & Family", "Appa's family", 4, "yes", 4, undefined, true],
    ["Prakash & Meena Jain", "Neighbours", 3, "yes", 3, "Jain food (all three)", false],
    ["Kamala Subramanian", "Amma's friends", 2, "maybe", 0, undefined, false],
    ["Hema Krishnan", "Appa's family", 2, "no", 0, undefined, false],
    ["Shanthi Raman", "Amma's friends", 2, "pending", 0, undefined, false],
    ["Arvind & Kavya", "Divya's friends", 2, "pending", 0, undefined, false],
    ["Uma Natarajan", "Amma's family", 2, "pending", 0, undefined, true],
  ];
  for (const [name, side, partySize, rsvp, attendingCount, dietary, family] of guests) {
    await ctx.db.insert("guests", {
      eventId, name, email: `${name.split(" ")[0].toLowerCase()}@guests.example`, side, partySize, rsvp, attendingCount, dietary,
      sessionIds: family ? both : [lunch._id], lastInvitedAt: now - 7 * DAY,
      ...(rsvp !== "pending" ? { respondedAt: now - 4 * DAY } : {}),
    });
  }

  // ---- The event page: written for relatives, not published; no gift list. -------
  await ctx.db.insert("eventSites", {
    eventId,
    slug: siteSlug("Divya", "Karthik"),
    published: false,
    welcome: "Amma turns sixty this year, and we would love to have you with us for lunch at Thamarai Hall in Mylapore. Come early for the nadaswaram, and stay for the payasam.",
    travel: "Thamarai Hall is a two-minute walk from Luz Corner. There is parking on the side street, and a lift for anyone who would rather not take the stairs.",
    showSchedule: true,
    showTravel: true,
    showRsvp: true,
    // The homam is at home with close family.
    hiddenSessionIds: [pooja._id],
    cashGiftNote: "No gifts, please. Your blessings are enough.",
    updatedAt: now - 2 * DAY,
  });

  // ---- What the activity feed would have shown along the way. --------------------
  const app = { eventId, actorLabel: APP_ACTOR, actorKind: "app" as const, type: "note" as const };
  await logActivity(ctx, { ...app, text: `${BRAND.name} set out the plan: a homam at home in the morning and lunch for 120 in Mylapore, with ₹4,50,000 shared across 8 needs.` });
  await logActivity(ctx, { ...app, text: `${BRAND.name} found vendors near Mylapore for all 8 needs, and ranked them.` });
  await logActivity(ctx, { ...app, text: `${BRAND.name} wrote to 6 vendors from the event's own inbox: the hall, 3 caterers, a photographer and a nadaswaram group.` });
  await logActivity(ctx, { eventId, actorLabel: "Divya", actorKind: "person", type: "booked", text: "booked Thamarai Hall for ₹80,000, and Karthik paid the ₹25,000 advance.", refs: { vendorId: thamarai, slotId: hall._id } });
  await logActivity(ctx, { ...app, text: "Annam Caterers quoted ₹66,150, priced for 150 plates though you expect 120.", refs: { vendorId: annam, threadId: annamMail.threadId } });
  await logActivity(ctx, { ...app, text: "Saapadu Kitchen quoted ₹62,000 all in for 120, about ₹517 a plate.", refs: { vendorId: saapadu, threadId: saapaduMail.threadId } });
  await logActivity(ctx, { ...app, text: "Kaveri Feast Co. quoted ₹56,500 for 120 before GST, and asked a question only you can answer.", refs: { vendorId: kaveri, threadId: kaveriMail.threadId } });
  await logActivity(ctx, { ...app, text: `${BRAND.name} lined up the three catering quotes per plate, for your 120 guests.`, refs: { slotId: catering._id } });
  await logActivity(ctx, { ...app, text: "Nila Studio and Mangala Isai haven't replied yet, so they were followed up once." });
  await logActivity(ctx, { ...app, text: "7 guests have replied. Prakash and Meena's family need Jain food, and Saroja Paati and Gopal Mama don't eat onion or garlic." });
  await seedBoard(ctx, eventId, [
    {
      sessionId: pooja._id,
      notes: ["Homam at 7: family only, so keep the hall of the house clear by 6:30.", "Amma wants jasmine strings on the doorway, not roses."],
      colors: [{ name: "Turmeric", hex: "#E3A21A" }, { name: "Mango leaf", hex: "#4F7A3A" }],
    },
    {
      sessionId: lunch._id,
      notes: ["Banana-leaf lunch for 120. Jain and no onion-garlic plates kept to one side.", "Cake after the payasam, not before."],
      colors: [{ name: "Jasmine", hex: "#F7F3E8" }, { name: "Marigold", hex: "#E9A23B" }, { name: "Maroon", hex: "#7A1F2B" }],
      vendors: [thamarai],
    },
  ]);
  return eventId;
}
