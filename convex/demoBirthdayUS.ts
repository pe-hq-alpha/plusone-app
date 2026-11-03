import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { setCommittedForSlotHelper } from "./budget";
import { addBookingPayments, recountPaid } from "./dues";
import { insertEvent } from "./events";
import { logActivity } from "./lib/auth";
import { APP_ACTOR, BRAND } from "./lib/brand";
import { DAY, addVendor, conversation, longDateUS, researched, slotsOf, type SeedVendor, seedBoard } from "./lib/demoKit";
import { addDays } from "./lib/text";
import { seedSampleOffers } from "./marketplace/samples";
import { siteSlug } from "./site";

/**
 * Dad's 60th in Austin, Texas: the sample birthday for visitors outside India, built the
 * same way as Amma's 60th (demoBirthday.ts) so every screen shows the same things. Sam and
 * his sister Priya are throwing it: an afternoon in the backyard for 40 and a dinner for
 * 120 in a rented event room in Travis Heights. The room is booked with the deposit paid,
 * three caterers have quoted in three different shapes (per person with tax extra, all in,
 * and for a minimum of 150), and the photographer and the DJ are being followed up. Every
 * vendor is made up, on the reserved `.example` domain; prices are in dollars, with
 * Austin's 8.25% sales tax and the service charges American caterers add.
 */

const HOUR = 3_600_000;
const SIGN = "\n\nThanks so much,\nSam";
const BACKYARD = "Backyard afternoon";
const DINNER = "Birthday dinner";

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

export async function seedBirthdayUS(ctx: MutationCtx, userId: Id<"users">): Promise<Id<"events">> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const start = saturdayAfter(today, 91);
  const dateText = `Saturday, ${longDateUS(start)}`;

  const eventId = await insertEvent(
    ctx,
    userId,
    {
      name: "Dad's 60th",
      host: "Sam",
      coHost: "Priya",
      startDate: start,
      endDate: start,
      city: "Austin",
      area: "Travis Heights",
      country: "United States",
      currency: "USD",
      totalBudget: 20_000,
      eventType: "birthday",
      occasionLabel: "Dad's 60th",
      guestEstimate: 120,
      styleVibes: ["Relaxed", "Family", "Hill Country"],
      stylePalette: "Sage green, cream and copper",
      styleFormality: "smart",
      // Session budgets are weights: the backyard needs only a tent, tables and chairs.
      sessions: [
        { name: BACKYARD, date: start, guestCount: 40, budget: 6 },
        { name: DINNER, date: start, guestCount: 120, budget: 94, kind: "dinner" },
      ],
      needs: [
        { category: "Rentals", title: "Backyard rentals", pct: 6, booked: false, sessionNames: [BACKYARD] },
        { category: "Catering", title: "Catering", pct: 30, booked: false, sessionNames: [DINNER] },
        { category: "Venue", title: "Event room", pct: 22, booked: false, sessionNames: [DINNER] },
        { category: "Decor & Florals", title: "Flowers & decor", pct: 10, booked: false, sessionNames: [DINNER] },
        { category: "Photographer", title: "Photography", pct: 9, booked: false, sessionNames: [DINNER] },
        { category: "Cake", title: "Cake", pct: 3, booked: false, sessionNames: [DINNER] },
        { category: "Bar", title: "Drinks & bar", pct: 12, booked: false, sessionNames: [DINNER] },
        { category: "Music/DJ", title: "DJ", pct: 8, booked: false, sessionNames: [DINNER] },
      ],
    },
    { demo: true },
  );
  await ctx.db.patch(eventId, {
    styleSummary:
      "A relaxed, warm day for Dad: burgers and lawn games in the backyard with close family, then dinner for 120 " +
      "in Travis Heights with sage and copper on the tables, toasts, a slideshow of sixty years and his favorite records.",
  });

  const sessions = await ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(10);
  const backyard = sessions.find((s) => s.name === BACKYARD)!;
  const dinner = sessions.find((s) => s.name === DINNER)!;
  await ctx.db.patch(backyard._id, {
    startTime: "14:00",
    endTime: "17:00",
    location: "At home, Allandale",
    description: "Burgers and brisket on the grill for close family and the neighbors, lawn games, and Dad's old records on the porch speaker.",
  });
  await ctx.db.patch(dinner._id, {
    startTime: "18:30",
    endTime: "22:30",
    location: "The Cypress Room, Travis Heights",
    description: "A buffet dinner for about 120 family and friends, toasts and a slideshow of Dad's sixty years, then cake and dancing.",
    // The palette kept from the dinner's Space.
    choices: [
      {
        label: "Palette",
        value: "Sage green, cream and copper",
        colors: [{ name: "Sage", hex: "#9CAF88" }, { name: "Cream", hex: "#F4EEDC" }, { name: "Copper", hex: "#B87333" }],
      },
    ],
  });

  const slot = await slotsOf(ctx, eventId);
  const rentals = slot("Backyard rentals");
  const catering = slot("Catering");
  const room = slot("Event room");
  const decor = slot("Flowers & decor");
  const photo = slot("Photography");
  const cake = slot("Cake");
  const bar = slot("Drinks & bar");
  const dj = slot("DJ");
  const add = (s: Doc<"vendorSlots">, seed: SeedVendor) => addVendor(ctx, eventId, s, seed, now, "USD");

  // ---- Event room: written to, quoted and booked, with the deposit paid. ----------
  await researched(ctx, eventId, room, "Private event room in Austin for a 60th birthday dinner, 120 guests, with parking", 3, now - 14 * DAY);
  const cypress = await add(room, {
    name: "The Cypress Room", handle: "cypress-room", city: "Travis Heights, Austin", startingPrice: 3_400, priceUnit: "total",
    priceNotes: "Saturday evening, 6 hours, tables and chairs included", highlights: ["Seats 150 at round tables", "Free lot behind the building", "Ramp and step-free restrooms"],
    summary: "A private event room off South Congress with its own catering kitchen.", score: 92, rankReason: "Right size for 120, step-free for older guests, and a kitchen your caterer can use.", isTopPick: true, rating: 4.7, reviewCount: 212,
  });
  await add(room, {
    name: "Riverside Loft", handle: "riverside-loft", city: "East Austin, Austin", startingPrice: 2_600, priceUnit: "total",
    priceNotes: "4 hours, room only", highlights: ["Seats 110", "Exposed brick and string lights"],
    summary: "An industrial loft with string lights and a small patio.", score: 78, rankReason: "Cheaper, but 110 is its limit and there's no lift to the second floor.", rating: 4.4, reviewCount: 88,
  });
  await add(room, {
    name: "Laurel Hall at Zilker", handle: "laurel-hall", city: "Zilker, Austin", startingPrice: 5_800, priceUnit: "total",
    priceNotes: "Full evening, in-house catering only", highlights: ["Garden terrace", "Valet parking"],
    summary: "A large hall with a garden terrace and its own caterer.", score: 74, rankReason: "Lovely, but in-house catering only and above what you set aside.", rating: 4.6, reviewCount: 140,
  });
  const roomMail = await conversation(ctx, eventId, room, cypress, "events@cypress-room.example", `Dinner for 120 on ${dateText}`, [
    { dir: "out", kind: "inquiry", at: now - 13 * DAY, body: `Hi there,\n\nWe're throwing our dad's 60th birthday on ${dateText}: a dinner for about 120 family and friends. Would The Cypress Room be free that evening, roughly 5 to 11 pm? A few of our guests use walkers, so step-free access matters a lot to us.\n\nCould you let me know the rental and what it includes?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 12 * DAY, body: `Hi Sam,\n\nThanks for reaching out, and happy early birthday to your dad! The room is open on ${dateText} from 5 to 11 pm.\n\nRoom rental, 5 to 11 pm, with tables and chairs for 150: $3,400\nCleaning fee: $350\nAV and sound (mics, speakers, projector): $450\nTotal: $4,200, all taxes included\n\nA $1,000 deposit holds the date, and the balance is due 30 days before the event. Your caterer is welcome to use our kitchen, and there's a ramp at the side entrance.\n\nBest,\nMaria\nThe Cypress Room, Travis Heights` },
    { dir: "out", kind: "booking_confirmation", at: now - 10 * DAY, body: `Hi Maria,\n\nThat's perfect. We'd love to book The Cypress Room for ${dateText}. My sister Priya will pay the $1,000 deposit this week; please confirm once it's in.${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 9 * DAY, body: `Hi Sam,\n\nGot the $1,000 deposit, thank you. You're booked for ${dateText}. Please send us the final headcount one week before.\n\nBest,\nMaria` },
  ], { status: "booked" });
  await ctx.db.insert("quotes", {
    eventId, slotId: room._id, vendorId: cypress, threadId: roomMail.threadId, messageId: roomMail.messageIds[1],
    total: 4_200, deposit: 1_000, currency: "USD", includes: ["Room, 5 to 11 pm", "Tables and chairs for 150", "AV and sound", "Cleaning", "Tax"], excludes: ["Catering", "Decor"],
    redFlags: [], summary: "The room for the evening with tables, chairs and AV, $4,200 with tax; $1,000 deposit.",
    lines: [
      { item: "Room rental, 5 to 11 pm", kind: "core", unit: "total", amount: 3_400 },
      { item: "Cleaning fee", kind: "fee", unit: "total", amount: 350 },
      { item: "AV and sound", kind: "fee", unit: "total", amount: 450 },
    ],
    taxIncluded: true,
    state: "applied", appliedAt: now - 12 * DAY, before: { threadStatus: "sent", slotStatus: "contacted", committed: 0 },
  });
  await ctx.db.patch(room._id, { status: "booked", bookedVendorId: cypress });
  await setCommittedForSlotHelper(ctx, room._id, 4_200);
  const event = (await ctx.db.get(eventId))!;
  await addBookingPayments(ctx, { event, slotId: room._id, vendorId: cypress, total: 4_200, deposit: 1_000 });
  for (const due of await ctx.db.query("dues").withIndex("by_vendorId", (q) => q.eq("vendorId", cypress)).take(5)) {
    if (due.label === "Deposit") await ctx.db.patch(due._id, { dueDate: addDays(today, -9), doneAt: now - 9 * DAY });
  }
  await recountPaid(ctx, room._id);
  await ctx.db.insert("dues", { eventId, slotId: room._id, vendorId: cypress, kind: "deadline", label: "Final headcount to the room", dueDate: addDays(start, -7) });

  // ---- Catering: three replies, priced three different ways, lined up. -----------
  await researched(ctx, eventId, catering, "Caterer in Austin for a buffet dinner, 120 guests, with gluten-free and vegetarian options", 4, now - 9 * DAY);
  // The host's own words for the need; the city's range comes from listed prices, on both sides, never from a note.
  await ctx.db.patch(catering._id, { notes: "A buffet dinner with brisket, a vegetarian main and a gluten-free dessert." });
  const brisket = await add(catering, {
    name: "Brisket & Bloom Catering", handle: "brisket-bloom", city: "East Austin, Austin", startingPrice: 32, priceUnit: "per_person",
    priceNotes: "Per person, minimum 150 guests", highlights: ["Smoked brisket and chicken buffets", "Gluten-free and vegetarian plates on request", "Family parties across Austin for 20 years"],
    summary: "A long-standing barbecue caterer for weddings and family parties.", score: 84, rankReason: "Lowest rate per person, but their minimum is 150 guests against your 120.", rating: 4.5, reviewCount: 318,
  });
  const mockingbird = await add(catering, {
    name: "Mockingbird Kitchen", handle: "mockingbird-kitchen", city: "South Lamar, Austin", startingPrice: 45, priceUnit: "per_person",
    priceNotes: "Packages for 80 to 200 guests, all in", highlights: ["One price, tax and gratuity included", "Lemonade and iced tea station", "Real plates and glassware"],
    summary: "A newer caterer with all-in packages for family parties.", score: 83, rankReason: "Simple all-in pricing for parties your size.", rating: 4.7, reviewCount: 146,
  });
  const juniper = await add(catering, {
    name: "Juniper & Sage Catering", handle: "juniper-sage", city: "Bouldin Creek, Austin", startingPrice: 38, priceUnit: "per_person",
    priceNotes: "Per person, tax extra", highlights: ["Hill Country menus", "Gluten-free dishes made in a separate kitchen", "Plated or buffet"],
    summary: "A caterer known for seasonal Hill Country dinners, plated or as a buffet.", score: 90, rankReason: "Seasonal food in the middle of the city's range, and gluten-free dishes from a separate kitchen.", isTopPick: true, rating: 4.8, reviewCount: 97,
  });
  await add(catering, {
    name: "Hill Country Smokehouse Catering", handle: "hc-smokehouse", city: "Mueller, Austin", startingPrice: 55, priceUnit: "per_person",
    priceNotes: "Per person, minimum 200 guests", highlights: ["Whole-hog and brisket pits on site"],
    summary: "A caterer for large weddings, with a 200-guest minimum.", score: 70, rankReason: "Well liked, but a 200-guest minimum is far above your 120, so it wasn't written to.", rating: 4.6, reviewCount: 224,
  });
  const cateringSubject = `Dinner for 120 on ${dateText}, Travis Heights`;
  const cateringAsk = `Hi there,\n\nWe're throwing our dad's 60th birthday on ${dateText} at The Cypress Room in Travis Heights, and we're looking for a buffet dinner for about 120 people, served from 7 pm. A few guests are vegetarian, a few need gluten-free food, and one has a nut allergy.\n\nAre you free that evening, and what would it cost?${SIGN}`;

  const brisketMail = await conversation(ctx, eventId, catering, brisket, "hello@brisket-bloom.example", cateringSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: cateringAsk },
    { dir: "in", kind: "vendor_reply", at: now - 6 * DAY, body: `Hi Sam,\n\nHowdy, and thanks for thinking of us! We're free on ${dateText} and we know The Cypress Room well.\n\nOur smokehouse buffet is $32 per person: brisket, smoked chicken, mac and cheese, slaw, beans, salad, rolls and peach cobbler. Our minimum is 150 guests.\n\n150 guests at $32: $4,800\nService charge (18%): $864\nDelivery and setup: $150\nSales tax (8.25%): $480\nTotal: $6,294\n\nGluten-free and vegetarian plates are the same price. A $1,500 deposit locks in the date.\n\nCheers,\nTravis\nBrisket & Bloom Catering, East Austin` },
    // Over the catering budget, so PlusOne asked them to come closer to it.
    { dir: "out", kind: "negotiation", at: now - 5 * DAY, body: `Hi Travis,\n\nThank you for the quick and detailed quote, and it's good to hear you know The Cypress Room.\n\nWe've set aside about $6,000 for catering, and we're expecting about 120 guests rather than 150. Could you price the smokehouse buffet for 120, or suggest a way to bring the total closer to our budget? We'd love to make it work with you.${SIGN}` },
  ], { status: "quoted", negotiatedAt: now - 5 * DAY });
  await ctx.db.insert("quotes", {
    eventId, slotId: catering._id, vendorId: brisket, threadId: brisketMail.threadId, messageId: brisketMail.messageIds[1],
    total: 6_294, deposit: 1_500, currency: "USD",
    includes: ["Smokehouse buffet with peach cobbler", "Gluten-free and vegetarian plates", "Service staff", "Delivery and setup", "Sales tax"], excludes: [],
    redFlags: ["Priced for a minimum of 150 guests; you expect about 120."],
    summary: "$32 per person for a 150-guest minimum, plus service, delivery and tax: $6,294.",
    lines: [
      { item: "Smokehouse buffet", kind: "core", unit: "per_person", quantity: 150, unitPrice: 32, amount: 4_800 },
      { item: "Service charge (18%)", kind: "fee", unit: "total", amount: 864 },
      { item: "Delivery and setup", kind: "fee", unit: "total", amount: 150 },
      { item: "Sales tax (8.25%)", kind: "tax", unit: "total", amount: 480 },
    ],
    headcountAssumed: 150, taxIncluded: true,
    state: "applied", appliedAt: now - 6 * DAY, before: { threadStatus: "sent", slotStatus: "contacted", committed: 0 },
  });

  const mockingbirdMail = await conversation(ctx, eventId, catering, mockingbird, "hello@mockingbird-kitchen.example", cateringSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: cateringAsk },
    { dir: "in", kind: "vendor_reply", at: now - 3 * DAY, body: `Hi Sam,\n\nThanks for writing, and a very happy 60th to your dad! We're available on ${dateText}.\n\nOur family-party package for 120 guests is $5,400, all in: a lemonade and iced tea station, a buffet with two mains and four sides, dessert, serving staff and gratuity, plates, glassware and linens, delivery, and sales tax. If the count goes up, each extra guest is $42.\n\nWe take half as a deposit ($2,700) to hold the date.\n\nAll the best,\nDana\nMockingbird Kitchen, South Lamar` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: catering._id, vendorId: mockingbird, threadId: mockingbirdMail.threadId, messageId: mockingbirdMail.messageIds[1],
    total: 5_400, deposit: 2_700, currency: "USD",
    includes: ["Lemonade and iced tea station", "Buffet with two mains and four sides", "Serving staff and gratuity", "Plates, glassware and linens", "Delivery", "Sales tax"], excludes: ["Extra guests beyond 120 ($42 each)"],
    redFlags: [], summary: "$5,400 all in for 120 guests, about $45 per person; extra guests $42.",
    lines: [{ item: "Family-party package for 120, all in", kind: "core", unit: "total", amount: 5_400 }],
    headcountAssumed: 120, taxIncluded: true,
    state: "applied", appliedAt: now - 3 * DAY, before: { threadStatus: "sent", slotStatus: "quoted", committed: 6_294 },
  });

  const juniperMail = await conversation(ctx, eventId, catering, juniper, "hello@juniper-sage.example", cateringSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: cateringAsk },
    { dir: "in", kind: "vendor_reply", at: now - 20 * HOUR, body: `Hi Sam,\n\nWe'd be glad to cook for your dad's 60th, and we're free on ${dateText}.\n\nOur Hill Country dinner is $38 per person, so for 120 guests it comes to $4,560, plus $200 for delivery and setup. Sales tax is extra. Gluten-free dishes are made in a separate kitchen, and we keep everything nut-free on request.\n\nOne question before we set the menu: would you like dinner plated at the tables, or as a buffet? And how many guests need gluten-free food?\n\nA $500 deposit holds the date.\n\nWarmly,\nElena\nJuniper & Sage Catering, Bouldin Creek` },
  ], {
    status: "needs_attention",
    attentionReason: "vendor_question",
    pendingQuestion: "Juniper & Sage Catering asks whether dinner should be plated at the tables or a buffet, and how many guests need gluten-free food.",
  });
  await ctx.db.insert("quotes", {
    eventId, slotId: catering._id, vendorId: juniper, threadId: juniperMail.threadId, messageId: juniperMail.messageIds[1],
    total: 4_760, deposit: 500, currency: "USD",
    includes: ["Hill Country dinner", "Gluten-free dishes from a separate kitchen", "Delivery and setup"], excludes: ["Sales tax"],
    redFlags: ["Sales tax is not included."], summary: "$38 per person for 120 plus $200 delivery: $4,760 before tax.",
    lines: [
      { item: "Hill Country dinner", kind: "core", unit: "per_person", quantity: 120, unitPrice: 38, amount: 4_560 },
      { item: "Delivery and setup", kind: "fee", unit: "total", amount: 200 },
    ],
    headcountAssumed: 120, taxIncluded: false,
    state: "applied", appliedAt: now - 20 * HOUR, before: { threadStatus: "sent", slotStatus: "quoted", committed: 5_400 },
  });
  // The budget follows the latest live quote until a caterer is chosen.
  await ctx.db.patch(catering._id, { status: "quoted" });
  await setCommittedForSlotHelper(ctx, catering._id, 4_760);

  // ---- Photography and the DJ: written to, quiet, followed up once. ---------------
  await researched(ctx, eventId, photo, "Candid event photographer in Austin for a 60th birthday dinner", 3, now - 9 * DAY);
  const moontower = await add(photo, {
    name: "Moontower Photo Co.", handle: "moontower-photo", city: "Hyde Park, Austin", startingPrice: 1_400, priceUnit: "total",
    priceNotes: "3 hours, candid and family groups", highlights: ["Candid family photos", "Edited photos in two weeks", "Great with big families and grandparents"],
    summary: "A two-person studio that photographs family parties around central Austin.", score: 89, rankReason: "Candid style and a three-hour rate that fits the dinner.", isTopPick: true, rating: 4.8, reviewCount: 74,
  });
  await add(photo, {
    name: "Lens & Lantern Studio", handle: "lens-lantern", city: "North Loop, Austin", startingPrice: 1_100, priceUnit: "total",
    priceNotes: "3 hours, posed and candid", highlights: ["Posed group photos", "Printed album option"],
    summary: "A photographer for parties and family portraits.", score: 80, rankReason: "Good value; more posed than candid.", rating: 4.4, reviewCount: 51,
  });
  await add(photo, {
    name: "Southpaw Films", handle: "southpaw-films", city: "East Austin, Austin", startingPrice: 2_600, priceUnit: "total",
    priceNotes: "4 hours, photo and a short film", highlights: ["Short film of the night"],
    summary: "Photos and a short film, in a documentary style.", score: 76, rankReason: "Lovely film, but above what you set aside for photography.",
  });
  await conversation(ctx, eventId, photo, moontower, "hello@moontower-photo.example", `Photos for Dad's 60th, ${dateText}`, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: `Hi there,\n\nWe're throwing our dad's 60th birthday dinner for about 120 people at The Cypress Room in Travis Heights on ${dateText}, from 6:30 to 10:30 pm. We'd love candid photos of family and friends, the toasts, and a few group shots with Dad.\n\nAre you available, and what would three hours cost?${SIGN}` },
    { dir: "out", kind: "follow_up", at: now - 2 * DAY, body: `Hi there,\n\nJust following up on our dad's 60th birthday dinner at The Cypress Room on ${dateText}, 6:30 to 10:30 pm. We'd love to have you photograph it. Could you let me know if you're free?${SIGN}` },
  ], { status: "sent", followUpCount: 1, nextFollowUpAt: now + 1 * DAY });

  await researched(ctx, eventId, dj, "DJ in Austin for a 60th birthday dinner, classic rock and Motown", 2, now - 9 * DAY);
  const groove = await add(dj, {
    name: "Groove Ranch DJs", handle: "groove-ranch", city: "North Loop, Austin", startingPrice: 1_200, priceUnit: "total",
    priceNotes: "4 hours, with sound and a wireless mic", highlights: ["Motown, classic rock and country", "Brings mics for the toasts"],
    summary: "A DJ duo that plays family parties and anniversaries.", score: 88, rankReason: "Plays the music Dad grew up on, within the music budget.", isTopPick: true, rating: 4.7, reviewCount: 43,
  });
  await add(dj, {
    name: "Two-Step Duo", handle: "two-step-duo", city: "South Congress, Austin", startingPrice: 1_600, priceUnit: "total",
    priceNotes: "Acoustic guitar and vocals, three hours", highlights: ["Live country and singer-songwriter", "Takes requests"],
    summary: "A live acoustic duo playing country and old favorites.", score: 81, rankReason: "Live music that suits dinner; less for dancing later.", rating: 4.5, reviewCount: 26,
  });
  await conversation(ctx, eventId, dj, groove, "hello@groove-ranch.example", `DJ for a 60th birthday dinner, ${dateText}`, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: `Hi there,\n\nWe're throwing our dad's 60th birthday at The Cypress Room in Travis Heights on ${dateText}. We'd love a DJ from about 6:30 to 10:30 pm: easy music over dinner, mics for the toasts, then Motown and classic rock for dancing.\n\nAre you available that night, and what would it cost?${SIGN}` },
    { dir: "out", kind: "follow_up", at: now - 2 * DAY, body: `Hi there,\n\nFollowing up on my note about a DJ for our dad's 60th at The Cypress Room on ${dateText}, 6:30 to 10:30 pm. Let me know if you're free that night.${SIGN}` },
  ], { status: "sent", followUpCount: 1, nextFollowUpAt: now + 1 * DAY });
  for (const s of [photo, dj]) await ctx.db.patch(s._id, { status: "contacted" });

  // ---- Found and ranked, not written to yet. -------------------------------------
  await researched(ctx, eventId, rentals, "Tent, table and chair rentals in Austin for a backyard party of 40", 2, now - 9 * DAY);
  await add(rentals, {
    name: "Big Sky Party Rentals", handle: "big-sky-rentals", city: "Crestview, Austin", startingPrice: 650, priceUnit: "total",
    priceNotes: "20x20 tent, 6 tables and 40 chairs, delivered and set up", highlights: ["Delivers and sets up the day before", "Picks up on Sunday"],
    summary: "Tents, tables and chairs for backyard parties.", score: 89, rankReason: "Everything the backyard needs, set up the day before.", isTopPick: true, rating: 4.8, reviewCount: 160,
  });
  await add(rentals, {
    name: "Hill Country Tent & Event", handle: "hc-tent", city: "Brentwood, Austin", startingPrice: 900, priceUnit: "total",
    priceNotes: "Tent, tables, chairs and string lights", highlights: ["String lights and a fan"],
    summary: "Tent and lighting rentals for parties and weddings.", score: 80, rankReason: "Adds lights and a fan, but more than an afternoon needs.", rating: 4.5, reviewCount: 72,
  });

  await researched(ctx, eventId, decor, "Sage and copper table flowers for a dinner of 120 in Austin", 2, now - 9 * DAY);
  await add(decor, {
    name: "Sagebrush Flower Co.", handle: "sagebrush-flowers", city: "Zilker, Austin", startingPrice: 1_600, priceUnit: "total",
    priceNotes: "Centerpieces for 15 tables and an entrance piece", highlights: ["Eucalyptus, garden roses and Texas wildflowers", "Copper vessels to borrow"],
    summary: "Seasonal flowers for parties and dinners.", score: 87, rankReason: "Matches the sage and copper palette, well within budget.", isTopPick: true, rating: 4.7, reviewCount: 91,
  });
  await add(decor, {
    name: "Copperleaf Events", handle: "copperleaf-events", city: "Holly, Austin", startingPrice: 2_400, priceUnit: "total",
    priceNotes: "Centerpieces, a photo backdrop and lighting", highlights: ["Photo backdrop", "Lighting included"],
    summary: "Flowers, backdrops and lighting for event rooms.", score: 79, rankReason: "A fuller setup, but more than a dinner needs.", rating: 4.4, reviewCount: 38,
  });

  await researched(ctx, eventId, cake, "Birthday cake for 120 in Austin, with a gluten-free option", 2, now - 9 * DAY);
  await add(cake, {
    name: "Little Bird Cake Studio", handle: "little-bird-cakes", city: "Cherrywood, Austin", startingPrice: 420, priceUnit: "total",
    priceNotes: "Two-tier cake for 120 servings, with a gluten-free tier", highlights: ["A gluten-free tier on request", "Delivers to the venue"],
    summary: "A small bakery making layer cakes to order.", score: 88, rankReason: "A gluten-free tier, and it delivers in time for after dinner.", isTopPick: true, rating: 4.9, reviewCount: 133,
  });
  await add(cake, {
    name: "Bluebird Bakeshop", handle: "bluebird-bakeshop", city: "Rosedale, Austin", startingPrice: 520, priceUnit: "total",
    priceNotes: "Three-tier cake for 120 servings", highlights: ["Tiered and themed cakes"],
    summary: "A bakery with tiered and themed cakes.", score: 82, rankReason: "Good for a show cake; gluten-free only as cupcakes.", rating: 4.6, reviewCount: 79,
  });

  await researched(ctx, eventId, bar, "Mobile bar and bartenders in Austin for a party of 120", 3, now - 9 * DAY);
  await add(bar, {
    name: "Thirsty Armadillo Mobile Bar", handle: "thirsty-armadillo", city: "East Austin, Austin", startingPrice: 1_800, priceUnit: "total",
    priceNotes: "Two licensed bartenders, beer, wine and a signature cocktail for 120, 4 hours", highlights: ["Licensed and insured bartenders", "A signature cocktail named for Dad"],
    summary: "A mobile bar for private parties, with drinks packages.", score: 86, rankReason: "A full drinks package for 120 within the bar budget.", isTopPick: true, rating: 4.7, reviewCount: 102,
  });
  await add(bar, {
    name: "Lone Star Pour Co.", handle: "lonestar-pour", city: "Downtown, Austin", startingPrice: 2_600, priceUnit: "total",
    priceNotes: "Full bar with spirits for 120, 4 hours", highlights: ["Full bar with spirits"],
    summary: "Bartending and full-bar packages for events.", score: 79, rankReason: "A full bar, but above what you set aside.", rating: 4.5, reviewCount: 64,
  });
  await add(bar, {
    name: "Rambling Rose Bar Service", handle: "rambling-rose-bar", city: "Windsor Park, Austin", startingPrice: 1_450, priceUnit: "total",
    priceNotes: "Beer and wine for 120, 4 hours, one bartender", highlights: ["Beer and wine only"],
    summary: "Beer and wine service for small parties.", score: 77, rankReason: "Cheaper, but one bartender is thin for 120.",
  });

  // ---- Notes to self: a few things the hosts jotted down. ------------------------
  const friday = comingFriday(today);
  const todos: { title: string; done?: boolean; slotId?: Id<"vendorSlots">; dueAt?: number }[] = [
    { title: "Choose a caterer by Friday", slotId: catering._id, dueAt: Date.parse(`${friday}T18:00:00Z`) },
    { title: "Ask Brisket & Bloom if they'll do 120, not 150", slotId: catering._id },
    { title: "Get the slideshow photos from Mom" },
    { title: "Book The Cypress Room", slotId: room._id, done: true },
  ];
  for (const [order, t] of todos.entries()) {
    await ctx.db.insert("tasks", {
      eventId, title: t.title, done: t.done ?? false, order,
      ...(t.slotId ? { slotId: t.slotId } : {}), ...(t.dueAt ? { dueAt: t.dueAt } : {}),
    });
  }

  // ---- Guests: family and neighbors at the backyard too. ------------------------
  const both = [backyard._id, dinner._id];
  const guests: Array<[string, string, number, Doc<"guests">["rsvp"], number, string | undefined, boolean]> = [
    ["Linda & Tom Becker", "Dad's family", 2, "yes", 2, undefined, true],
    ["Aunt Carol", "Dad's family", 1, "yes", 1, "Gluten-free", true],
    ["Uncle Ray & Diane", "Dad's family", 2, "yes", 2, "Gluten-free (Diane)", true],
    ["Raj & Meera Shah", "Neighbors", 2, "yes", 2, "Vegetarian", true],
    ["Dave & Marcy Lin", "Golf friends", 2, "yes", 2, "Nut allergy (Dave)", false],
    ["Jim Alvarez", "Work friends", 2, "maybe", 0, undefined, false],
    ["Susan Park", "Mom's friends", 2, "no", 0, undefined, false],
    ["Greg & Ana Morales", "Work friends", 2, "pending", 0, undefined, false],
    ["Ben & Chloe", "Sam's friends", 2, "pending", 0, undefined, false],
    ["Grandma June", "Dad's family", 1, "pending", 0, undefined, true],
  ];
  for (const [name, side, partySize, rsvp, attendingCount, dietary, family] of guests) {
    const handle = name.toLowerCase().split(/\s+&\s+|\s+/).slice(0, 2).join(".").replace(/[^a-z.]/g, "");
    await ctx.db.insert("guests", {
      eventId, name, email: `${handle}@guests.example`, side, partySize, rsvp, attendingCount, dietary,
      sessionIds: family ? both : [dinner._id], lastInvitedAt: now - 7 * DAY,
      ...(rsvp !== "pending" ? { respondedAt: now - 4 * DAY } : {}),
    });
  }

  // ---- The event page: written for family and friends, not published; no gift list. ----
  await ctx.db.insert("eventSites", {
    eventId,
    slug: siteSlug("Sam", "Priya"),
    published: false,
    welcome: "Dad turns sixty this year, and we'd love you to celebrate with us over dinner at The Cypress Room in Travis Heights. Bring your best Dad story for the toasts, and your dancing shoes for after.",
    travel: "The Cypress Room is just off South Congress, ten minutes from downtown. There's a free lot behind the building and a ramp at the side entrance.",
    showSchedule: true,
    showTravel: true,
    showRsvp: true,
    // The backyard afternoon is for close family and the neighbors.
    hiddenSessionIds: [backyard._id],
    cashGiftNote: "No gifts, please. Your company is the best present.",
    updatedAt: now - 2 * DAY,
  });

  // ---- What the activity feed would have shown along the way. --------------------
  const app = { eventId, actorLabel: APP_ACTOR, actorKind: "app" as const, type: "note" as const };
  await logActivity(ctx, { ...app, text: `${BRAND.name} set out the plan: an afternoon in the backyard and dinner for 120 in Travis Heights, with $20,000 shared across 8 needs.` });
  await logActivity(ctx, { ...app, text: `${BRAND.name} found vendors near Travis Heights for all 8 needs, and ranked them.` });
  await logActivity(ctx, { ...app, text: `${BRAND.name} wrote to 6 vendors from the event's own inbox: the event room, 3 caterers, a photographer and a DJ.` });
  await logActivity(ctx, { eventId, actorLabel: "Sam", actorKind: "person", type: "booked", text: "booked The Cypress Room for $4,200, and Priya paid the $1,000 deposit.", refs: { vendorId: cypress, slotId: room._id } });
  await logActivity(ctx, { ...app, type: "quote_received", text: "Brisket & Bloom Catering quoted $6,294, priced for 150 guests though you expect 120.", refs: { vendorId: brisket, threadId: brisketMail.threadId } });
  await logActivity(ctx, { ...app, text: `${BRAND.name} asked Brisket & Bloom Catering whether they can come closer to your budget.`, refs: { vendorId: brisket, threadId: brisketMail.threadId } });
  await logActivity(ctx, { ...app, type: "quote_received", text: "Mockingbird Kitchen quoted $5,400 all in for 120, about $45 per person.", refs: { vendorId: mockingbird, threadId: mockingbirdMail.threadId } });
  await logActivity(ctx, { ...app, type: "quote_received", text: "Juniper & Sage Catering quoted $4,760 for 120 before tax, and asked a question only you can answer.", refs: { vendorId: juniper, threadId: juniperMail.threadId } });
  await logActivity(ctx, { ...app, text: `${BRAND.name} lined up the three catering quotes per person, for your 120 guests.`, refs: { slotId: catering._id } });
  await logActivity(ctx, { ...app, type: "follow_up_sent", text: "Moontower Photo Co. and Groove Ranch DJs haven't replied yet, so they were followed up once." });
  await logActivity(ctx, { ...app, text: "7 guests have replied. Aunt Carol and Diane need gluten-free food, the Shahs are vegetarian, and Dave has a nut allergy." });
  await seedBoard(ctx, eventId, [
    {
      sessionId: backyard._id,
      notes: ["Grill going by 1:30. Veggie burgers for the Shahs.", "Dad's records on the porch speaker, not a playlist."],
      colors: [{ name: "Sage", hex: "#9CAF88" }, { name: "Cream", hex: "#F4EEDC" }],
    },
    {
      sessionId: dinner._id,
      notes: ["Buffet for 120. Gluten-free and vegetarian dishes at one end, labelled. Nothing with nuts.", "Slideshow before the toasts; cake after."],
      colors: [{ name: "Sage", hex: "#9CAF88" }, { name: "Cream", hex: "#F4EEDC" }, { name: "Copper", hex: "#B87333" }],
      vendors: [cypress],
    },
  ]);
  // Verified Partner vendors in Austin answer the same brief on the standard sheet, beside the quotes found on the web.
  await seedSampleOffers(ctx, eventId);
  return eventId;
}
