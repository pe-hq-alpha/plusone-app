import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Basis } from "../lib/comparable";
import { offerTotal, type OfferLine } from "../lib/marketplace";
import { recomputeBands } from "./bands";
import { openBrief } from "./briefs";

/**
 * Sample Partner vendors for the guest demo, in Chennai, and the offers they make on
 * a sample event. The names are made up; the prices are modelled on what Chennai
 * vendors publish on their own websites (28 Oct 2026: catering ₹150–900 a plate, median
 * ₹325; stage decor ₹11,000–40,000; photographers ₹1,499–4,999 an hour). No hall in
 * the city publishes its rent, so there are no sample halls. Sample vendors carry
 * `sample: true`: they are shown only on sample events and labelled as samples, and
 * they have no phone numbers, so nobody real is ever called.
 */

type SampleOffering = { title: string; unit: Basis; price: number; includes: string[]; taxIncluded?: boolean };
type SampleVendor = { name: string; area: string; category: string; about: string; completedEvents: number; offering: SampleOffering };

const leaf = ["Banana leaf", "Water bottle", "Serving staff"];
const lunch = (price: number, extra: string[] = []): SampleOffering => ({
  title: "Veg lunch on banana leaf",
  unit: "per_person",
  price,
  includes: ["Sweet, two curries, kootu, sambar, rasam, payasam, appalam", ...extra],
});
const stage = (price: number, includes: string[]): SampleOffering => ({ title: "Stage and entrance flowers", unit: "total", price, includes });
const shoot = (price: number, hours: number, includes: string[]): SampleOffering => ({
  title: `Candid and family photos, ${hours} hours`,
  unit: "total",
  price,
  includes: [`${hours} hours of coverage`, ...includes],
});

export const SAMPLE_VENDORS: SampleVendor[] = [
  { name: "Pongal Pot Caterers", area: "Kodambakkam", category: "Catering", about: "Home-style tiffin and meals for small functions.", completedEvents: 1, offering: lunch(260) },
  { name: "Annapoorani Leaf Caterers", area: "T. Nagar", category: "Catering", about: "Banana-leaf lunches for poojas and birthdays.", completedEvents: 4, offering: lunch(290, leaf.slice(0, 1)) },
  { name: "Neivedhyam Kitchen", area: "Mylapore", category: "Catering", about: "Traditional Tamil meals, no onion or garlic on request.", completedEvents: 12, offering: lunch(300, leaf) },
  { name: "Sambar & Co. Caterers", area: "Velachery", category: "Catering", about: "South Indian meals and North Indian counters.", completedEvents: 3, offering: lunch(320, leaf.slice(0, 2)) },
  { name: "Kalyana Saapadu Co.", area: "Mylapore", category: "Catering", about: "Full kalyana saapadu for 50 to 500.", completedEvents: 9, offering: lunch(340, leaf) },
  { name: "Thalaivazhai Caterers", area: "Adyar", category: "Catering", about: "Leaf meals with a live dosa counter on request.", completedEvents: 5, offering: lunch(380, leaf) },
  { name: "Paruppu Payasam Kitchen", area: "Mandaveli", category: "Catering", about: "Festive menus with two payasams.", completedEvents: 2, offering: lunch(420, [...leaf, "Transport in Chennai"]) },
  { name: "Komalam Caterers", area: "Nungambakkam", category: "Catering", about: "Elaborate menus for milestone birthdays and engagements.", completedEvents: 14, offering: { ...lunch(450, [...leaf, "Transport in Chennai"]), taxIncluded: true } },
  { name: "Kumudham Feast", area: "Anna Nagar", category: "Catering", about: "Premium leaf meals and sweet stalls.", completedEvents: 6, offering: lunch(520, [...leaf, "Transport in Chennai"]) },
  { name: "Vettrilai Caterers", area: "Besant Nagar", category: "Catering", about: "Heritage recipes, served in silver-rimmed leaves.", completedEvents: 7, offering: { ...lunch(600, [...leaf, "Transport in Chennai"]), taxIncluded: true } },

  { name: "Sevvanthi Stage Decor", area: "Saidapet", category: "Decor & Florals", about: "Marigold and chrysanthemum stages for home functions.", completedEvents: 3, offering: stage(11_000, ["Marigold backdrop", "Entrance string"]) },
  { name: "Kolam Corner Decor", area: "West Mambalam", category: "Decor & Florals", about: "Rangoli, kolam and simple flower decor.", completedEvents: 2, offering: stage(14_500, ["Flower backdrop", "Rangoli at the entrance"]) },
  { name: "Poo Kadai Events", area: "Mylapore", category: "Decor & Florals", about: "Fresh flowers from the Mylapore market, every time.", completedEvents: 8, offering: stage(18_000, ["Jasmine and marigold backdrop", "Entrance arch"]) },
  { name: "Kuthuvilakku Decor", area: "Alwarpet", category: "Decor & Florals", about: "Brass lamps, banana trees and traditional stages.", completedEvents: 6, offering: stage(21_000, ["Backdrop with brass lamps", "Banana trees at the door", "Setup and removal"]) },
  { name: "Jasmine Arch Decorators", area: "R.A. Puram", category: "Decor & Florals", about: "Jasmine-led stages for sixtieths and engagements.", completedEvents: 11, offering: stage(24_500, ["Jasmine and marigold backdrop", "Entrance arch", "Two flower stands", "Setup and removal"]) },
  { name: "Rangoli Room Events", area: "Kilpauk", category: "Decor & Florals", about: "Themed stages with fresh and silk flowers.", completedEvents: 4, offering: stage(28_000, ["Themed backdrop", "Entrance arch", "Photo corner"]) },
  { name: "Marigold Mandapam Designs", area: "Nungambakkam", category: "Decor & Florals", about: "Full-hall decor with lighting.", completedEvents: 9, offering: stage(34_000, ["Stage", "Entrance", "Hall pillars", "Warm lighting", "Setup and removal"]) },
  { name: "Thamarai Petal Studio", area: "Boat Club", category: "Decor & Florals", about: "Lotus and orchid stages, designed to a palette.", completedEvents: 5, offering: stage(40_000, ["Designed stage", "Entrance", "Table flowers", "Lighting", "Setup and removal"]) },

  { name: "Veranda Frames", area: "Mylapore", category: "Photographer", about: "Candid photos of family functions.", completedEvents: 3, offering: shoot(8_000, 3, ["Edited photos online"]) },
  { name: "Gopuram Lens Co.", area: "Triplicane", category: "Photographer", about: "Traditional and candid, one photographer.", completedEvents: 2, offering: shoot(10_500, 3, ["Edited photos online"]) },
  { name: "Thinnai Photography", area: "Mandaveli", category: "Photographer", about: "Quiet candid photos for small family days.", completedEvents: 10, offering: shoot(12_500, 3, ["Edited photos online", "Travel in Chennai"]) },
  { name: "Vilakku Light Studio", area: "Adyar", category: "Photographer", about: "Natural-light portraits and family groups.", completedEvents: 6, offering: shoot(15_000, 4, ["Edited photos online", "Travel in Chennai"]) },
  { name: "Muthu Moments", area: "T. Nagar", category: "Photographer", about: "Photos and a short highlight reel.", completedEvents: 8, offering: shoot(18_000, 4, ["Edited photos online", "1-minute reel"]) },
  { name: "Marina Light Photography", area: "Santhome", category: "Photographer", about: "Two photographers for larger groups.", completedEvents: 7, offering: shoot(21_000, 4, ["Two photographers", "Edited photos online"]) },
  { name: "Pattu Pavadai Pictures", area: "Anna Nagar", category: "Photographer", about: "Candid photos and printed albums.", completedEvents: 5, offering: shoot(25_000, 5, ["Edited photos online", "20-page album"]) },
  { name: "Rangam Studios", area: "Alwarpet", category: "Photographer", about: "Photo and video teams for milestone birthdays.", completedEvents: 12, offering: shoot(30_000, 5, ["Two photographers", "Edited photos online", "20-page album"]) },
];

/**
 * The sample vendors' answers to a sample event's briefs: complete on every line of the
 * sheet, so they sit beside web-found quotes that leave charges unsaid.
 */
const SAMPLE_OFFERS: { vendor: string; category: string; price: number; covers: string; lines: OfferLine[]; notes?: string }[] = [
  {
    vendor: "Kalyana Saapadu Co.",
    category: "Catering",
    price: 340,
    covers: "Veg lunch on banana leaf: sweet, two curries, kootu, sambar, rasam, payasam, vadai, appalam",
    lines: [
      { key: "gst", status: "priced", amount: 2040 },
      { key: "service_staff", status: "included" },
      { key: "transport", status: "priced", amount: 1500 },
      { key: "crockery", status: "included" },
      { key: "water", status: "included" },
    ],
    notes: "No onion or garlic for the elders' rows, at no extra cost.",
  },
  {
    vendor: "Komalam Caterers",
    category: "Catering",
    price: 450,
    covers: "Festive lunch on banana leaf with two sweets, two payasams and a live appalam counter",
    lines: [
      { key: "gst", status: "included" },
      { key: "service_staff", status: "included" },
      { key: "transport", status: "included" },
      { key: "crockery", status: "included" },
      { key: "water", status: "extra", amount: 600 },
    ],
  },
  {
    vendor: "Jasmine Arch Decorators",
    category: "Decor & Florals",
    price: 24_500,
    covers: "Jasmine and marigold stage backdrop, entrance arch and two flower stands",
    lines: [
      { key: "gst", status: "extra", amount: 4410 },
      { key: "transport", status: "priced", amount: 1200 },
      { key: "setup", status: "included" },
      { key: "lighting", status: "extra", amount: 3000 },
    ],
    notes: "Jasmine strings on the doorway, as asked.",
  },
  {
    vendor: "Thinnai Photography",
    category: "Photographer",
    price: 12_500,
    covers: "One photographer for 3 hours, candid and family groups, edited photos online in a week",
    lines: [
      { key: "gst", status: "included" },
      { key: "travel", status: "included" },
      { key: "overtime", status: "extra", amount: 3000 },
      { key: "album", status: "extra", amount: 6500 },
      { key: "drone", status: "extra", amount: 5000 },
    ],
  },
];

/** Adds the sample vendors that aren't there yet, and works out the ranges again if any were. */
export async function ensureSampleVendors(ctx: MutationCtx): Promise<Map<string, Id<"vendorProfiles">>> {
  const ids = new Map<string, Id<"vendorProfiles">>();
  for await (const p of ctx.db.query("vendorProfiles").withIndex("by_cityKey_and_status", (q) => q.eq("cityKey", "chennai").eq("status", "verified"))) {
    if (p.sample) ids.set(p.name, p._id);
  }
  let added = 0;
  const now = Date.now();
  for (const s of SAMPLE_VENDORS) {
    if (ids.has(s.name)) continue;
    const profileId = await ctx.db.insert("vendorProfiles", {
      name: s.name,
      categories: [s.category],
      city: "Chennai",
      cityKey: "chennai",
      serviceArea: [s.area],
      languages: ["Tamil", "English"],
      about: s.about,
      source: "vendor_signup",
      status: "verified",
      statusAt: now,
      joinedAt: now,
      completedEvents: s.completedEvents,
      sample: true,
    });
    await ctx.db.insert("vendorOfferings", { profileId, category: s.category, currency: "INR", ...s.offering });
    ids.set(s.name, profileId);
    added++;
  }
  if (added) await recomputeBands(ctx);
  return ids;
}

/**
 * Opens a brief for each of a sample event's needs that has sample offers, and puts the
 * sample vendors' offers on it. Run once, when the sample event is made.
 */
export async function seedSampleOffers(ctx: MutationCtx, eventId: Id<"events">): Promise<number> {
  const event = await ctx.db.get(eventId);
  if (!event?.demo) throw new ConvexError("Sample offers go on sample events only.");
  const vendors = await ensureSampleVendors(ctx);
  const slots = await ctx.db
    .query("vendorSlots")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(50);
  let seeded = 0;
  for (const offer of SAMPLE_OFFERS) {
    const slot = slots.find((s) => s.category === offer.category && s.status !== "booked");
    const profileId = vendors.get(offer.vendor);
    if (!slot || !profileId) continue;
    const briefId = await openBrief(ctx, eventId, slot._id);
    const brief = (await ctx.db.get(briefId))!;
    const quantity = brief.unit === "total" ? 1 : (brief.guests ?? 1);
    await ctx.db.insert("vendorOffers", {
      briefId,
      profileId,
      eventId,
      slotId: slot._id,
      category: offer.category,
      unit: brief.unit,
      price: offer.price,
      quantity,
      currency: "INR",
      covers: offer.covers,
      lines: offer.lines,
      total: offerTotal(offer.price, quantity, offer.lines),
      notes: offer.notes,
      status: "sent",
      submittedAt: brief.openedAt,
    });
    seeded++;
  }
  return seeded;
}

/** For a sample event made before sample offers existed: `npx convex run marketplace/samples:seedForEvent '{"eventId":"…"}'`. */
export const seedForEvent = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.number(),
  handler: async (ctx, args) => await seedSampleOffers(ctx, args.eventId),
});

/** Adds the sample vendors and their ranges on their own (dev and staging). */
export const ensureVendors = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await ensureSampleVendors(ctx)).size,
});
