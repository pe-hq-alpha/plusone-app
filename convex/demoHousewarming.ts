import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { setCommittedForSlotHelper } from "./budget";
import { addBookingPayments, recountPaid } from "./dues";
import { insertEvent } from "./events";
import { logActivity } from "./lib/auth";
import { APP_ACTOR, BRAND } from "./lib/brand";
import { DAY, addVendor, conversation, longDateIN, researched, slotsOf, seedBoard } from "./lib/demoKit";
import { seedGifts } from "./lib/demoGifts";
import { overallFrom, type SessionAnswer } from "./lib/rsvp";
import { addDays } from "./lib/text";
import type { QuoteLine } from "./lib/validators";
import { siteSlug } from "./site";

/**
 * The Raghavans' griha pravesam: a new flat in Whitefield, Bengaluru. A later stage than
 * the birthday: the priest and the caterer are booked, two rental quotes in different
 * shapes and two return-gift quotes wait to be compared, the florist has a question for
 * Meena, and photographers are found but not yet written to. Every vendor is made up.
 */

/** Sign-off on every email PlusOne writes for Meena. */
const SIGN = "\n\nRegards,\nMeena Raghavan";

const HOUR = 3_600_000;

/**
 * A Sunday about nine weeks out. Margazhi (mid-December to mid-January) is not a month
 * for entering a new house, so a date that lands in it moves to just before or after.
 */
function muhurthamSunday(today: string): string {
  const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  const sundayOnOrAfter = (iso: string) => addDays(iso, (7 - weekday(iso)) % 7);
  const date = sundayOnOrAfter(addDays(today, 63));
  const md = date.slice(5);
  if (md > "01-14" && md < "12-16") return date;
  const december = Number(date.slice(0, 4)) - (md <= "01-14" ? 1 : 0);
  const lastBefore = addDays(`${december}-12-15`, -weekday(`${december}-12-15`));
  return lastBefore >= addDays(today, 42) ? lastBefore : sundayOnOrAfter(`${december + 1}-01-15`);
}

export async function seedHousewarming(ctx: MutationCtx, userId: Id<"users">): Promise<Id<"events">> {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const date = muhurthamSunday(today);
  const dateText = longDateIN(date);
  const currency = "INR";

  const eventId = await insertEvent(
    ctx,
    userId,
    {
      name: "The Raghavans' griha pravesam",
      host: "Meena",
      coHost: "Raghavan",
      startDate: date,
      endDate: date,
      city: "Bengaluru",
      area: "Whitefield",
      country: "India",
      currency,
      totalBudget: 300_000,
      eventType: "housewarming",
      occasionLabel: "Griha pravesam",
      guestEstimate: 120,
      styleVibes: ["Traditional", "Homely", "Flowers everywhere"],
      stylePalette: "Marigold, mango-leaf green and turmeric yellow",
      styleFormality: "smart",
      sessions: [
        {
          name: "Griha pravesam",
          date,
          guestCount: 30,
          budget: 1,
        },
        {
          name: "Lunch",
          date,
          guestCount: 120,
          budget: 2,
        },
      ],
      needs: [
        { category: "Officiant", title: "Priest", pct: 12, booked: false, sessionNames: ["Griha pravesam"] },
        { category: "Catering", title: "Catering", pct: 36, booked: false },
        { category: "Decor & Florals", title: "Flowers & decoration", pct: 15, booked: false },
        { category: "Rentals", title: "Tents, chairs & rentals", pct: 13, booked: false, sessionNames: ["Lunch"] },
        { category: "Photographer", title: "Photography", pct: 8, booked: false },
        { category: "Gifting", title: "Return gifts", pct: 9, booked: false, sessionNames: ["Lunch"] },
      ],
    },
    { demo: true },
  );
  await ctx.db.patch(eventId, {
    styleSummary:
      "A traditional morning at home: the homam and the boiling of milk at dawn for close family, then a banana-leaf " +
      "lunch on the clubhouse lawn for everyone. Mango-leaf thoranams, a flower rangoli at the door, marigold and jasmine.",
  });

  // ---- The day: times, places and what happens in each part. ---------------------
  const sessions = await ctx.db.query("sessions").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(10);
  const sessionOf = (name: string) => {
    const s = sessions.find((e) => e.name === name);
    if (!s) throw new Error(`demo: no session named ${name}`);
    return s;
  };
  const pravesam = sessionOf("Griha pravesam");
  const lunch = sessionOf("Lunch");
  await ctx.db.patch(pravesam._id, {
    startTime: "05:30",
    endTime: "08:00",
    location: "Flat 1204, Tower C, Saptaparni Residency, Whitefield",
    description: "The Ganapathi homam, boiling milk in the new kitchen and entering the house at the muhurtham, for about 30 close family.",
    significance: "Entering a new home at an auspicious hour, with a homam to bless it and milk boiled over so the house is never short of plenty.",
    rites: [
      { name: "Ganapathi homam", gloss: "A fire ritual to clear the way for the new home." },
      { name: "Entering the house", gloss: "The family steps in together at the muhurtham, right foot first." },
      { name: "Boiling milk", gloss: "Milk is boiled until it overflows in the new kitchen, for abundance." },
    ],
  });
  await ctx.db.patch(lunch._id, {
    startTime: "11:30",
    endTime: "14:30",
    location: "Clubhouse lawn, Saptaparni Residency, Whitefield",
    description: "A banana-leaf lunch for family, neighbours and colleagues, about 120 people, under a shamiana on the clubhouse lawn.",
  });

  const slot = await slotsOf(ctx, eventId);
  const priest = slot("Priest");
  const catering = slot("Catering");
  const decor = slot("Flowers & decoration");
  const rentals = slot("Tents, chairs & rentals");
  const photo = slot("Photography");
  const gifts = slot("Return gifts");
  const event = (await ctx.db.get(eventId))!;

  // ---- Priest: booked, dakshina agreed, paid on the day. -------------------------
  await researched(ctx, eventId, priest, "Priest for griha pravesam homam in Whitefield, Bengaluru", 2, now - 20 * DAY);
  const gayatri = await addVendor(ctx, eventId, priest, {
    name: "Gayatri Purohit Seva", handle: "gayatri-purohit", city: "Bengaluru", startingPrice: 9_000, priceUnit: "total",
    priceNotes: "Griha pravesam with Ganapathi homam; samagri on request", highlights: ["Brings all homam samagri", "Tamil and Kannada", "Explains each step to the family"],
    summary: "A team of two priests who do griha pravesams across east Bengaluru, samagri included if asked.", score: 92,
    rankReason: "Does homams in flats often, brings everything, and explains each step as they go.", isTopPick: true, rating: 4.9, reviewCount: 86,
  }, now, currency);
  await addVendor(ctx, eventId, priest, {
    name: "Sri Vidya Vedic Services", handle: "srividya-vedic", city: "Bengaluru", startingPrice: 12_000, priceUnit: "total",
    priceNotes: "Homam and puja; samagri extra", highlights: ["Three priests for larger homams"],
    summary: "A larger group of priests, usually for bigger ceremonies.", score: 78,
    rankReason: "Very experienced, but three priests is more than a family homam needs.", rating: 4.7, reviewCount: 41,
  }, now, currency);
  const priestSubject = `Griha pravesam on ${dateText}, Whitefield`;
  const gayatriMail = await conversation(ctx, eventId, priest, gayatri, "hello@gayatri-purohit.example", priestSubject, [
    { dir: "out", kind: "inquiry", at: now - 19 * DAY, body: `Namaskaram,\n\nWe are moving into our new flat at Saptaparni Residency, Whitefield, and would like to do the griha pravesam with a Ganapathi homam on Sunday, ${dateText}, early in the morning. About 30 family members will be there.\n\nWould you be available, could you suggest the muhurtham, and what would the dakshina be? We would be grateful if you could bring the samagri as well.${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 18 * DAY, body: `Namaskaram Meena ji,\n\nWe are available on ${dateText}. The muhurtham that morning is 6:10 to 6:50 am, so we will start the homam at 5:30.\n\nDakshina for the griha pravesam with Ganapathi homam is ₹11,001 for two priests. Samagri (havan items, ghee, samidhas, navadhanyam) comes to ₹4,500, so ₹15,501 in all. Dakshina is given on the day. Please keep a new vessel for the milk and some mango leaves ready.\n\nRegards,\nSrinivasa Sharma, Gayatri Purohit Seva` },
    { dir: "out", kind: "booking_confirmation", at: now - 16 * DAY, body: `Namaskaram Sharma ji,\n\nThank you. We would like to go ahead for ${dateText}, starting at 5:30 am, with the samagri, for ₹15,501 in all. Please let us know if there is anything else we should keep ready.${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 15 * DAY, body: `Confirmed, Meena ji. We will reach by 5:15 am. Please keep a small table for the homam kundam near the balcony door so the smoke can go out.\n\nRegards,\nSrinivasa Sharma` },
  ], { status: "booked" });
  const priestTotal = 11_001 + 4_500;
  await ctx.db.insert("quotes", {
    eventId, slotId: priest._id, vendorId: gayatri, threadId: gayatriMail.threadId, messageId: gayatriMail.messageIds[1],
    total: priestTotal, currency, includes: ["Two priests", "Ganapathi homam", "Griha pravesam puja", "Homam samagri"], excludes: ["Flowers and fruits for the puja"],
    redFlags: [], summary: `Dakshina ₹11,001 for two priests, plus ₹4,500 for samagri; muhurtham 6:10 to 6:50 am.`,
    lines: [
      { item: "Griha pravesam with Ganapathi homam, dakshina for two priests", kind: "core", unit: "total", amount: 11_001 },
      { item: "Homam samagri: havan items, ghee, samidhas, navadhanyam", kind: "core", unit: "total", amount: 4_500 },
    ],
  });
  await ctx.db.patch(priest._id, { status: "booked", bookedVendorId: gayatri });
  await setCommittedForSlotHelper(ctx, priest._id, priestTotal);
  await addBookingPayments(ctx, { event, slotId: priest._id, vendorId: gayatri, total: priestTotal });
  // Dakshina is given on the day itself, not a month ahead.
  for (const due of await ctx.db.query("dues").withIndex("by_vendorId", (q) => q.eq("vendorId", gayatri)).take(5)) {
    await ctx.db.patch(due._id, { label: "Dakshina, on the day", dueDate: date });
  }

  // ---- Catering: booked with a deposit paid; a cheaper quote arrived too late. ----
  await researched(ctx, eventId, catering, "Banana-leaf meal caterer in Whitefield for 120, griha pravesam", 3, now - 18 * DAY);
  const kaveri = await addVendor(ctx, eventId, catering, {
    name: "Kaveri Leaf Caterers", handle: "kaverileaf-caterers", city: "Bengaluru", startingPrice: 750, priceUnit: "per_person",
    priceNotes: "Per plate, banana-leaf meal, vegetarian", highlights: ["Traditional banana-leaf service", "Serves in apartment clubhouses", "Brings its own serving staff"],
    summary: "A family-run caterer known for full banana-leaf meals at housewarmings and naming ceremonies.", score: 91,
    rankReason: "Their banana-leaf meal is exactly what you asked for, and they have served at clubhouses in Whitefield.", isTopPick: true, rating: 4.8, reviewCount: 214,
  }, now, currency);
  const udupi = await addVendor(ctx, eventId, catering, {
    name: "Udupi Thota Caterers", handle: "udupithota-caterers", city: "Bengaluru", startingPrice: 700, priceUnit: "per_person",
    priceNotes: "Per plate, Udupi-style meal", highlights: ["Udupi-style menu", "Good value"],
    summary: "An Udupi-style caterer that does many family functions in east Bengaluru.", score: 84,
    rankReason: "Good value and well liked, but slow to reply in busy season.", rating: 4.6, reviewCount: 158,
  }, now, currency);
  await addVendor(ctx, eventId, catering, {
    name: "Bisi Bele Kitchen", handle: "bisibele-kitchen", city: "Bengaluru", startingPrice: 550, priceUnit: "per_person",
    priceNotes: "Per plate, buffet only", highlights: ["Buffet service", "Karnataka menus"],
    summary: "A buffet caterer with simple Karnataka menus.", score: 72,
    rankReason: "Lower price, but buffet only: no banana-leaf service.", rating: 4.4, reviewCount: 63,
  }, now, currency);
  const cateringSubject = `Lunch for 120 on ${dateText}, Whitefield`;
  const kaveriMail = await conversation(ctx, eventId, catering, kaveri, "hello@kaverileaf-caterers.example", cateringSubject, [
    { dir: "out", kind: "inquiry", at: now - 17 * DAY, body: `Dear Sir/Madam,\n\nWe are having our griha pravesam on Sunday, ${dateText}, at Saptaparni Residency, Whitefield. We would like a traditional vegetarian banana-leaf lunch for about 120 people on the clubhouse lawn, from 11:30 am, and a simple breakfast for about 30 family members after the homam.\n\nCould you let us know if you are available and send a quote, with a sample menu?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 16 * DAY, body: `Dear Madam,\n\nThank you for writing. We are free on ${dateText}. Before I send the quote: should the menu be without onion and garlic, and will the society give us a place near the clubhouse to keep the vessels and a water connection?\n\nRegards,\nPrakash, Kaveri Leaf Caterers` },
    { dir: "out", kind: "agent_reply", at: now - 16 * DAY + 2 * HOUR, body: `Dear Prakash,\n\nThank you. Please keep the menu without onion and garlic, as several elders will be there. The clubhouse has a service room with a water connection next to the lawn, which you can use.${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 14 * DAY, body: `Dear Madam,\n\nPlease find our quote:\n- Banana-leaf lunch, 120 plates at ₹850: ₹1,02,000 (sweet, 2 curries, kootu, sambar, rasam, more kuzhambu, payasam, appalam, curd rice, banana)\n- Breakfast after the homam, 30 people at ₹220: ₹6,600 (pongal, vada, kesari, coffee)\n- Serving staff and clean-up: ₹7,500\n- GST at 5%: ₹5,805\nTotal: ₹1,21,905. An advance of ₹30,000 confirms the date; the balance is due one week before.\n\nRegards,\nPrakash` },
    { dir: "out", kind: "booking_confirmation", at: now - 10 * DAY, body: `Dear Prakash,\n\nThank you for the menu. We would like to go ahead for ${dateText} at ₹1,21,905, and will send the ₹30,000 advance this week. Please confirm the next steps.${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 8 * DAY, body: `Dear Madam,\n\nAdvance of ₹30,000 received, thank you. Your date is confirmed. Please send us the final count for lunch by ${longDateIN(addDays(date, -10))}, so we can order the leaves and vegetables.\n\nRegards,\nPrakash, Kaveri Leaf Caterers` },
  ], { status: "booked" });
  const kaveriLines: QuoteLine[] = [
    { item: "Banana-leaf lunch, vegetarian", kind: "core", unit: "per_person", quantity: 120, unitPrice: 850, amount: 102_000 },
    { item: "Breakfast after the homam", kind: "core", unit: "per_person", quantity: 30, unitPrice: 220, amount: 6_600 },
    { item: "Serving staff and clean-up", kind: "fee", unit: "total", amount: 7_500 },
    { item: "GST at 5%", kind: "tax", unit: "total", amount: 5_805 },
  ];
  const kaveriTotal = kaveriLines.reduce((a, l) => a + l.amount, 0); // ₹1,21,905
  const kaveriDeposit = 30_000;
  await ctx.db.insert("quotes", {
    eventId, slotId: catering._id, vendorId: kaveri, threadId: kaveriMail.threadId, messageId: kaveriMail.messageIds[3],
    total: kaveriTotal, deposit: kaveriDeposit, currency,
    includes: ["Banana-leaf lunch for 120", "Breakfast for 30", "No onion or garlic", "Serving staff and clean-up"], excludes: ["Shamiana, tables and chairs"],
    redFlags: [], summary: "Banana-leaf lunch for 120 and breakfast for 30, ₹1,21,905 with GST; ₹30,000 advance, balance a week before.",
    lines: kaveriLines, headcountAssumed: 120, taxIncluded: true,
  });
  const udupiMail = await conversation(ctx, eventId, catering, udupi, "hello@udupithota-caterers.example", cateringSubject, [
    { dir: "out", kind: "inquiry", at: now - 17 * DAY, body: `Dear Sir/Madam,\n\nWe are having our griha pravesam on Sunday, ${dateText}, at Saptaparni Residency, Whitefield, and would like a vegetarian banana-leaf lunch for about 120 people, and breakfast for about 30. Could you let us know if you are available, and send a quote?${SIGN}` },
    { dir: "out", kind: "no_thanks", at: now - 10 * DAY, body: `Dear Sir/Madam,\n\nThank you for your time. We have now booked another caterer for the day, so we will not need a quote after all. We hope to work with you another time.${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 5 * HOUR, body: `Dear Madam,\n\nSorry for the late reply, it has been a busy season. In case it helps: we can do the lunch for 120 at ₹780 a plate and breakfast for 30 at ₹200, ₹1,04,580 in all with GST, staff included.\n\nRegards,\nUdupi Thota Caterers` },
  ], { status: "declined" });
  const udupiLines: QuoteLine[] = [
    { item: "Banana-leaf lunch, Udupi style", kind: "core", unit: "per_person", quantity: 120, unitPrice: 780, amount: 93_600 },
    { item: "Breakfast", kind: "core", unit: "per_person", quantity: 30, unitPrice: 200, amount: 6_000 },
    { item: "GST at 5%", kind: "tax", unit: "total", amount: 4_980 },
  ];
  // A late quote after the caterer was booked: read, but held so it can't change the plan.
  await ctx.db.insert("quotes", {
    eventId, slotId: catering._id, vendorId: udupi, threadId: udupiMail.threadId, messageId: udupiMail.messageIds[2],
    total: udupiLines.reduce((a, l) => a + l.amount, 0), currency,
    includes: ["Lunch for 120", "Breakfast for 30", "Serving staff"], excludes: [], redFlags: [],
    summary: "A late quote: lunch for 120 and breakfast for 30, ₹1,04,580 with GST.",
    lines: udupiLines, headcountAssumed: 120, taxIncluded: true,
    state: "waiting", heldBecause: "You've already booked a caterer, so this won't change your plan unless you say so.",
  });
  await ctx.db.patch(catering._id, { status: "booked", bookedVendorId: kaveri });
  await setCommittedForSlotHelper(ctx, catering._id, kaveriTotal);
  // What's due to the caterer: the advance already paid, the balance a week before, and
  // the day they need the final count.
  await addBookingPayments(ctx, { event, slotId: catering._id, vendorId: kaveri, total: kaveriTotal, deposit: kaveriDeposit });
  for (const due of await ctx.db.query("dues").withIndex("by_vendorId", (q) => q.eq("vendorId", kaveri)).take(5)) {
    if (due.label === "Deposit") await ctx.db.patch(due._id, { label: "Advance", dueDate: addDays(today, -8), doneAt: now - 8 * DAY });
    if (due.label === "Balance") await ctx.db.patch(due._id, { dueDate: addDays(date, -7) });
  }
  await recountPaid(ctx, catering._id);
  await ctx.db.insert("dues", { eventId, slotId: catering._id, vendorId: kaveri, kind: "deadline", label: "Final count for lunch", dueDate: addDays(date, -10) });

  // ---- Flowers & decoration: the florist has a question only Meena can answer. ----
  await researched(ctx, eventId, decor, "Mango-leaf thoranam and flower rangoli decorator, Whitefield", 3, now - 9 * DAY);
  const sampige = await addVendor(ctx, eventId, decor, {
    name: "Sampige Flower Decor", handle: "sampige-decor", city: "Bengaluru", startingPrice: 12_000, priceUnit: "total",
    priceNotes: "Door thoranam, rangoli and pooja-room flowers", highlights: ["Fresh mango-leaf thoranams", "Flower rangoli at the door", "Sets up before dawn"],
    summary: "A flower decorator who does housewarmings in apartments, with the work done before the homam starts.", score: 90,
    rankReason: "Sets up before dawn, which a 5:30 am homam needs, and does both thoranam and rangoli.", isTopPick: true, rating: 4.8, reviewCount: 97,
  }, now, currency);
  const rangoli = await addVendor(ctx, eventId, decor, {
    name: "Rangoli Ratna", handle: "rangoli-ratna", city: "Bengaluru", startingPrice: 8_000, priceUnit: "total",
    priceNotes: "Flower and powder rangoli", highlights: ["Large flower rangolis", "Petal and powder designs"],
    summary: "Rangoli artists who also hang simple thoranams.", score: 83,
    rankReason: "Lovely rangolis; the thoranam work is simpler.", rating: 4.7, reviewCount: 52,
  }, now, currency);
  await addVendor(ctx, eventId, decor, {
    name: "Malligai Mandap Decor", handle: "malligai-mandap", city: "Bengaluru", startingPrice: 25_000, priceUnit: "total",
    priceNotes: "Full stage and mandap decoration", highlights: ["Stage backdrops", "Jasmine strings"],
    summary: "A decorator for bigger functions, with stage and mandap work.", score: 70,
    rankReason: "Beautiful work, but built for halls and stages, not a flat and a lawn.",
  }, now, currency);
  const decorSubject = `Thoranam and flower rangoli for ${dateText}`;
  await conversation(ctx, eventId, decor, sampige, "hello@sampige-decor.example", decorSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: `Hello,\n\nWe are having our griha pravesam on Sunday, ${dateText}, in Flat 1204, Tower C, Saptaparni Residency, Whitefield. The homam starts at 5:30 am. We would like a fresh mango-leaf thoranam for the main door, a flower rangoli at the entrance, and flowers for the pooja room.\n\nCould you let us know if you are available, and what it would cost?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 1 * DAY, body: `Hello Madam,\n\nWe are available and will come at 4:00 am to set up. Two questions before I quote: should the rangoli be all flowers (marigold, chrysanthemum and rose petals), or flowers with coloured powder, which costs less? And do you want thoranams only on the main door, or also on the pooja room and balcony doors?\n\nThank you,\nNandini, Sampige Flower Decor` },
  ], {
    status: "needs_attention",
    attentionReason: "vendor_question",
    pendingQuestion: "Sampige Flower Decor asks whether the rangoli should be all flowers or flowers with coloured powder (which costs less), and whether you want thoranams only on the main door or also on the pooja room and balcony doors.",
  });
  await conversation(ctx, eventId, decor, rangoli, "hello@rangoli-ratna.example", decorSubject, [
    { dir: "out", kind: "inquiry", at: now - 8 * DAY, body: `Hello,\n\nWe are having our griha pravesam on Sunday, ${dateText}, in Whitefield, starting at 5:30 am, and would love a large flower rangoli at the entrance and a mango-leaf thoranam on the main door. Are you available, and what would it cost?${SIGN}` },
    { dir: "out", kind: "follow_up", at: now - 3 * DAY, body: `Hello,\n\nJust following up on our note about the griha pravesam on ${dateText}. Do let us know if you are available.${SIGN}` },
  ], { status: "sent", followUpCount: 1, nextFollowUpAt: now + 2 * DAY });
  await ctx.db.patch(decor._id, { status: "contacted" });

  // ---- Rentals: two quotes in different shapes, made comparable line by line. ------
  await researched(ctx, eventId, rentals, "Shamiana, chairs and tables on rent for a clubhouse lawn, Whitefield, 120 guests", 2, now - 12 * DAY);
  const chandrika = await addVendor(ctx, eventId, rentals, {
    name: "Chandrika Tent & Chairs", handle: "chandrika-tents", city: "Bengaluru", startingPrice: 25, priceUnit: "per_piece",
    priceNotes: "Chairs from ₹25 each; shamiana priced by size", highlights: ["Shamianas in every size", "Chair covers included", "Itemised pricing"],
    summary: "A tent house that prices each item separately, so you pay only for what you take.", score: 87,
    rankReason: "Itemised, so it's easy to trim; GST is on top.", isTopPick: true, rating: 4.6, reviewCount: 121,
  }, now, currency);
  const mandap = await addVendor(ctx, eventId, rentals, {
    name: "Mandap Mane Rentals", handle: "mandapmane-rentals", city: "Bengaluru", startingPrice: 28_000, priceUnit: "total",
    priceNotes: "Lawn packages, GST included", highlights: ["One package for the lawn", "Pedestal fans included"],
    summary: "A rental company that sells one package for a lawn function: tent, seating, fans and setup.", score: 84,
    rankReason: "Simple and all in, with fans, which a noon lunch will want.", rating: 4.5, reviewCount: 88,
  }, now, currency);
  const rentalsSubject = `Shamiana and chairs for 120, ${dateText}`;
  const rentalsAsk = `Hello,\n\nWe are hosting a lunch for about 120 people on the clubhouse lawn at Saptaparni Residency, Whitefield, on Sunday, ${dateText}, from 11:30 am to 2:30 pm. We need a shamiana, chairs and long dining tables for a banana-leaf meal. Could you send a quote, including setup and removal?${SIGN}`;
  const chandrikaMail = await conversation(ctx, eventId, rentals, chandrika, "hello@chandrika-tents.example", rentalsSubject, [
    { dir: "out", kind: "inquiry", at: now - 11 * DAY, body: rentalsAsk },
    { dir: "in", kind: "vendor_reply", at: now - 7 * DAY, body: `Madam,\n\nQuote for ${dateText}:\n- Shamiana 40 x 30 ft with side curtains: ₹18,000\n- Chairs with white covers, 120 at ₹25: ₹3,000\n- Dining tables with paper roll, 12 at ₹200: ₹2,400\n- Transport, setup on Saturday evening and removal: ₹2,500\nTotal ₹25,900, plus GST at 18%. 50% advance on booking.\n\nChandrika Tent & Chairs` },
  ], { status: "quoted" });
  const chandrikaLines: QuoteLine[] = [
    { item: "Shamiana, 40 x 30 ft, with side curtains", kind: "core", unit: "total", amount: 18_000 },
    { item: "Chairs with white covers", kind: "core", unit: "per_piece", quantity: 120, unitPrice: 25, amount: 3_000 },
    { item: "Dining tables with paper roll", kind: "core", unit: "per_piece", quantity: 12, unitPrice: 200, amount: 2_400 },
    { item: "Transport, setup and removal", kind: "fee", unit: "total", amount: 2_500 },
  ];
  const chandrikaTotal = chandrikaLines.reduce((a, l) => a + l.amount, 0); // ₹25,900
  await ctx.db.insert("quotes", {
    eventId, slotId: rentals._id, vendorId: chandrika, threadId: chandrikaMail.threadId, messageId: chandrikaMail.messageIds[1],
    total: chandrikaTotal, deposit: chandrikaTotal / 2, currency,
    includes: ["Shamiana 40 x 30 ft", "120 chairs with covers", "12 dining tables", "Setup and removal"], excludes: ["GST at 18%", "Fans"],
    redFlags: ["GST at 18% is on top, so about ₹30,562 in all."],
    summary: "Itemised: shamiana ₹18,000, chairs and tables ₹5,400, setup ₹2,500; ₹25,900 plus GST.",
    lines: chandrikaLines, headcountAssumed: 120, taxIncluded: false,
  });
  const mandapMail = await conversation(ctx, eventId, rentals, mandap, "hello@mandapmane-rentals.example", rentalsSubject, [
    { dir: "out", kind: "inquiry", at: now - 11 * DAY, body: rentalsAsk },
    { dir: "in", kind: "vendor_reply", at: now - 6 * DAY, body: `Dear Madam,\n\nOur Lawn Package for 120 guests is ₹32,000 including GST: a 40 x 30 ft shamiana, 120 covered chairs, 12 dining tables with cloth, 2 pedestal fans, setup and removal. If it is a hot day, we can add 2 more fans at ₹500 each. ₹10,000 confirms the booking.\n\nRegards,\nMandap Mane Rentals` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: rentals._id, vendorId: mandap, threadId: mandapMail.threadId, messageId: mandapMail.messageIds[1],
    total: 32_000, deposit: 10_000, currency,
    includes: ["Shamiana 40 x 30 ft", "120 covered chairs", "12 dining tables with cloth", "2 pedestal fans", "Setup and removal", "GST"], excludes: [],
    redFlags: [], summary: "One lawn package for 120, ₹32,000 with GST, fans included; 2 more fans for ₹1,000 if wanted.",
    lines: [
      { item: "Lawn Package for 120: shamiana, chairs, tables, 2 fans, setup and removal", kind: "core", unit: "total", amount: 32_000 },
      { item: "Two more pedestal fans", kind: "extra", unit: "per_piece", quantity: 2, unitPrice: 500, amount: 1_000, optional: true },
    ],
    headcountAssumed: 120, taxIncluded: true,
  });
  await ctx.db.patch(rentals._id, { status: "quoted" });

  // ---- Return gifts: priced per piece, one with a minimum order. --------------------
  await researched(ctx, eventId, gifts, "Return gifts for housewarming in Bengaluru: steel dabbas or plants, 100 pieces", 2, now - 10 * DAY);
  const thamboola = await addVendor(ctx, eventId, gifts, {
    name: "Thamboola Gift House", handle: "thamboola-gifts", city: "Bengaluru", startingPrice: 140, priceUnit: "per_piece",
    priceNotes: "Steel dabba sets from ₹140 a piece", highlights: ["Steel dabba sets", "Name printing on cloth bags", "Delivers in Whitefield"],
    summary: "A return-gift shop for family functions: steel, brass and cloth bags with names printed.", score: 88,
    rankReason: "Steel dabbas are useful and last, and they deliver to the society.", isTopPick: true, rating: 4.7, reviewCount: 143,
  }, now, currency);
  const hasiru = await addVendor(ctx, eventId, gifts, {
    name: "Hasiru Saplings", handle: "hasiru-saplings", city: "Bengaluru", startingPrice: 120, priceUnit: "per_piece",
    priceNotes: "Potted plants from ₹120; minimum order applies", highlights: ["Tulsi and money plants", "Terracotta pots"],
    summary: "A nursery that supplies potted plants as return gifts.", score: 82,
    rankReason: "A lovely gift for a new home, but they have a minimum order.", rating: 4.6, reviewCount: 74,
  }, now, currency);
  const giftsSubject = `Return gifts for 100, ${dateText}`;
  const thamboolaMail = await conversation(ctx, eventId, gifts, thamboola, "hello@thamboola-gifts.example", giftsSubject, [
    { dir: "out", kind: "inquiry", at: now - 9 * DAY, body: `Hello,\n\nWe need about 100 return gifts for our griha pravesam lunch on ${dateText} in Whitefield. We were thinking of small steel dabba sets. Could you send prices, and let us know if you deliver?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 7 * DAY, body: `Namaste Madam,\n\nFor 100 pieces: 3-piece steel dabba set at ₹165 each, ₹16,500. Cloth bags with "Meena & Raghavan, Griha Pravesam" printed, ₹20 each, ₹2,000. Delivery to Whitefield ₹500. Total ₹19,000, GST included. Half in advance, ready in 10 days.\n\nThamboola Gift House` },
  ], { status: "quoted" });
  const thamboolaLines: QuoteLine[] = [
    { item: "3-piece steel dabba set", kind: "core", unit: "per_piece", quantity: 100, unitPrice: 165, amount: 16_500 },
    { item: "Cloth bags with names printed", kind: "extra", unit: "per_piece", quantity: 100, unitPrice: 20, amount: 2_000 },
    { item: "Delivery to Whitefield", kind: "fee", unit: "total", amount: 500 },
  ];
  const thamboolaTotal = thamboolaLines.reduce((a, l) => a + l.amount, 0); // ₹19,000
  await ctx.db.insert("quotes", {
    eventId, slotId: gifts._id, vendorId: thamboola, threadId: thamboolaMail.threadId, messageId: thamboolaMail.messageIds[1],
    total: thamboolaTotal, deposit: thamboolaTotal / 2, currency,
    includes: ["100 steel dabba sets", "Printed cloth bags", "Delivery"], excludes: [],
    redFlags: [], summary: "100 steel dabba sets at ₹165, with printed bags and delivery: ₹19,000 with GST.",
    lines: thamboolaLines, taxIncluded: true,
  });
  const hasiruMail = await conversation(ctx, eventId, gifts, hasiru, "hello@hasiru-saplings.example", giftsSubject, [
    { dir: "out", kind: "inquiry", at: now - 9 * DAY, body: `Hello,\n\nWe need about 100 return gifts for our griha pravesam lunch on ${dateText} in Whitefield, and would love to give small potted plants. Could you send prices, and let us know if you deliver?${SIGN}` },
    { dir: "in", kind: "vendor_reply", at: now - 4 * DAY, body: `Hello Meena,\n\nTulsi or money plant in a small terracotta pot is ₹120 each, delivered free in Whitefield. Our minimum order is 150 pieces, so that would be ₹18,000.\n\nWarm regards,\nHasiru Saplings` },
  ], { status: "quoted" });
  await ctx.db.insert("quotes", {
    eventId, slotId: gifts._id, vendorId: hasiru, threadId: hasiruMail.threadId, messageId: hasiruMail.messageIds[1],
    total: 18_000, currency,
    includes: ["Tulsi or money plant in terracotta pot", "Free delivery in Whitefield"], excludes: [],
    redFlags: ["Minimum order is 150 plants; you need about 100, so 50 would be left over (₹180 a gift in effect)."],
    summary: "Potted plants at ₹120 each, but a minimum of 150: ₹18,000.",
    lines: [{ item: "Tulsi or money plant in terracotta pot (minimum 150)", kind: "core", unit: "per_piece", quantity: 150, unitPrice: 120, amount: 18_000 }],
  });
  await ctx.db.patch(gifts._id, { status: "quoted" });

  // ---- Photography: found and ranked, not written to yet. ---------------------------
  await researched(ctx, eventId, photo, "Photographer for griha pravesam in Whitefield, early morning homam and lunch", 3, now - 2 * DAY);
  for (const p of [
    { name: "Mallige Frames", handle: "mallige-frames", city: "Bengaluru", startingPrice: 18_000, priceUnit: "total" as const, priceNotes: "Six hours, edited photos in two weeks", highlights: ["Candid family photos", "Comfortable in low light"], summary: "A candid photographer who shoots many homams and housewarmings.", score: 90, rankReason: "Used to dim, smoky homams at dawn, and six hours covers the whole morning.", isTopPick: true, rating: 4.8, reviewCount: 69 },
    { name: "Ankur Clicks", handle: "ankur-clicks", city: "Bengaluru", startingPrice: 3_000, priceUnit: "per_hour" as const, priceNotes: "Per hour, three hours minimum", highlights: ["Hourly booking", "Quick delivery"], summary: "A photographer who books by the hour.", score: 82, rankReason: "Good value if you only want the homam covered.", rating: 4.5, reviewCount: 38 },
    { name: "Ten to Two Studio", handle: "tentotwo-studio", city: "Bengaluru", startingPrice: 25_000, priceUnit: "total" as const, priceNotes: "Photo and short film", highlights: ["Photo and video together", "A two-minute film"], summary: "A small studio doing photos with a short film.", score: 76, rankReason: "Lovely film, but it runs a little over the planned budget." },
  ]) {
    await addVendor(ctx, eventId, photo, p, now, currency);
  }

  // ---- To-dos: a few for each part of the day, some already done. ----------------
  const by = (iso: string) => Date.parse(`${iso}T10:00:00+05:30`);
  const todos: { title: string; session?: Id<"sessions">; slot?: Id<"vendorSlots">; dueAt?: number; done?: boolean }[] = [
    { title: "Buy new vessels for boiling milk", dueAt: by(addDays(date, -7)) },
    { title: "Tell the society office about parking for guests", dueAt: by(addDays(date, -14)) },
    { title: "Steel dabbas or plants for return gifts?", slot: gifts._id },
  ];
  for (const [order, t] of todos.entries()) {
    await ctx.db.insert("tasks", {
      eventId, title: t.title, done: t.done ?? false, order,
      ...(t.session ? { sessionId: t.session } : {}),
      ...(t.slot ? { slotId: t.slot } : {}),
      ...(t.dueAt ? { dueAt: t.dueAt } : {}),
    });
  }

  // ---- Guests: close family at both, everyone else at lunch. ----------------------
  const both = [pravesam._id, lunch._id];
  const lunchOnly = [lunch._id];
  type GuestSeed = {
    name: string; side: string; partySize: number; sessions: Id<"sessions">[];
    /** Each session's answer as a head count, `false` for no; missing means not answered. */
    answers?: (number | false)[]; maybe?: boolean; dietary?: string; allergies?: string[]; notes?: string;
  };
  const guestSeeds: GuestSeed[] = [
    { name: "Lakshmi Srinivasan", side: "Family", partySize: 3, sessions: both, answers: [3, 3], dietary: "No onion or garlic", notes: "Meena's sister" },
    { name: "Ramesh Raghavan", side: "Family", partySize: 4, sessions: both, answers: [4, 4], allergies: ["Peanuts, severe (Aditya)"], notes: "Raghavan's brother" },
    { name: "Kamala Venkatesh", side: "Family", partySize: 2, sessions: both, answers: [2, 2], dietary: "One diabetic, less sweet please", notes: "Meena's aunt" },
    { name: "Gopal Krishnan", side: "Family", partySize: 2, sessions: both, answers: [false, 2], notes: "Raghavan's uncle; too early for the homam" },
    { name: "Sundar Iyer", side: "Family", partySize: 2, sessions: both },
    { name: "Shobha Deshpande", side: "Neighbours", partySize: 2, sessions: lunchOnly, answers: [2], notes: "Flat 1102, Tower C" },
    { name: "Farhan Siddiqui", side: "Neighbours", partySize: 3, sessions: lunchOnly, answers: [3], notes: "Flat 1201, Tower C" },
    { name: "Sarah Mathew", side: "Neighbours", partySize: 2, sessions: lunchOnly },
    { name: "Anjali Rao", side: "Work", partySize: 1, sessions: lunchOnly, maybe: true, notes: "Meena's colleague" },
    { name: "Vikram Hegde", side: "Work", partySize: 2, sessions: lunchOnly, answers: [false], notes: "Raghavan's colleague; away that weekend" },
    { name: "Deepa Nair", side: "Work", partySize: 1, sessions: lunchOnly, notes: "Meena's colleague" },
  ];
  for (const [i, g] of guestSeeds.entries()) {
    const at = now - (6 - (i % 5)) * DAY;
    const sessionRsvps: SessionAnswer<Id<"sessions">>[] | undefined = g.answers?.map((a, j) => ({
      sessionId: g.sessions[j], coming: a !== false, count: a === false ? 0 : a, source: "link", at,
    }));
    const { rsvp, attendingCount } = overallFrom(g.sessions, sessionRsvps ?? [], g.maybe ? "maybe" : "pending");
    await ctx.db.insert("guests", {
      eventId,
      name: g.name,
      email: `${g.name.split(" ")[0].toLowerCase()}@guests.example`,
      side: g.side,
      partySize: g.partySize,
      rsvp,
      attendingCount,
      dietary: g.dietary,
      ...(g.allergies ? { allergies: g.allergies } : {}),
      sessionIds: g.sessions,
      lastInvitedAt: now - 12 * DAY,
      notes: g.notes,
      ...(sessionRsvps ? { sessionRsvps, respondedAt: at } : {}),
    });
  }

  // ---- The event page: written, not published (a demo's never is). -----------------
  await ctx.db.insert("eventSites", {
    eventId,
    slug: siteSlug("Meena", "Raghavan"),
    published: false,
    welcome: "We've finally moved into our new home, and we'd love you to come and bless it. Do join us for lunch on the clubhouse lawn.",
    travel:
      "Saptaparni Residency is off Whitefield Main Road, about ten minutes by auto from Whitefield (Kadugodi) metro station. " +
      "Tell the guard at Gate 2 you're here for the Raghavans in Tower C. Guest parking is in the Tower C basement, and the clubhouse lawn is on your left as you come in.",
    showSchedule: true,
    showTravel: true,
    showRsvp: true,
    // The homam is for close family; the public page shows only the lunch.
    hiddenSessionIds: [pravesam._id],
    showGifts: true,
    cashGiftNote: "Please don't feel you must bring anything. Your blessings are more than enough.",
    updatedAt: now - 3 * DAY,
  });
  await seedGifts(ctx, eventId, now, [
    { title: "Brass kuthu vilakku", note: "For the pooja room", price: 4_500, takenBy: "Lakshmi Srinivasan" },
    { title: "Pressure cooker, 5 litre", price: 3_200 },
    { title: "Plants for the balcony", note: "Anything that likes the afternoon sun", price: 1_500, takenBy: "Shobha Deshpande" },
    { title: "Dinner set for eight", price: 6_000 },
  ]);

  // ---- What the activity feed would have shown along the way. --------------------
  for (const text of [
    `${BRAND.name} found 2 priests and 3 caterers near Whitefield for a griha pravesam and a banana-leaf lunch.`,
    `${BRAND.name} wrote to Gayatri Purohit Seva, Kaveri Leaf Caterers and Udupi Thota Caterers from your event inbox.`,
    "Gayatri Purohit Seva suggested the muhurtham, 6:10 to 6:50 am, and quoted ₹15,501 with samagri.",
    `You booked Gayatri Purohit Seva. ${BRAND.name} confirmed the 5:30 am start with them.`,
    `${BRAND.name} told Kaveri Leaf Caterers the menu should have no onion or garlic, and that the clubhouse has a service room with water.`,
    "Kaveri Leaf Caterers quoted ₹1,21,905 for lunch for 120 and breakfast for 30, with GST.",
    `You booked Kaveri Leaf Caterers and paid the ₹30,000 advance. ${BRAND.name} thanked Udupi Thota Caterers.`,
    "Kaveri Leaf Caterers need the final count for lunch 10 days before. It's on your list of what's due.",
    "Chandrika Tent & Chairs quoted ₹25,900 plus GST, item by item; Mandap Mane Rentals quoted ₹32,000 with GST as one package.",
    "Thamboola Gift House quoted ₹165 a dabba set; Hasiru Saplings quoted ₹120 a plant, but with a minimum of 150.",
    "7 guests have replied. Aditya, Ramesh's son, has a severe peanut allergy.",
    `${BRAND.name} found 3 photographers who are used to early-morning homams.`,
    "Sampige Flower Decor wrote back with a question for you: an all-flower rangoli or flowers with powder, and which doors get thoranams.",
    "Udupi Thota Caterers replied late with ₹1,04,580. It's waiting for you, since the caterer is booked.",
  ]) {
    await logActivity(ctx, { eventId, actorLabel: APP_ACTOR, actorKind: "app", type: "note", text });
  }
  await seedBoard(ctx, eventId, [
    {
      sessionId: pravesam._id,
      notes: ["Muhurtham 6:10 to 6:50 am. Milk boils over at the new stove first.", "Mango-leaf thoranam on the main door and the kitchen door."],
      colors: [{ name: "Marigold", hex: "#F2A10F" }, { name: "Mango leaf", hex: "#3F6B35" }, { name: "Turmeric", hex: "#E8B012" }],
      vendors: [gayatri],
    },
    {
      sessionId: lunch._id,
      notes: ["Lunch for 120 at the clubhouse. No onion or garlic anywhere on the menu.", "Aditya has a severe peanut allergy: tell the caterer again the week before."],
      vendors: [kaveri],
    },
  ]);
  return eventId;
}
