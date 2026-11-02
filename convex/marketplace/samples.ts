import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Basis } from "../lib/comparable";
import { offerTotal, type OfferLine } from "../lib/marketplace";
import { priceUnitOf, sheetFor, timesFor, type PackageCharge } from "../lib/standardSheet";
import { recomputeBands } from "./bands";
import { openBrief } from "./briefs";

/**
 * Sample Partner vendors for the guest demo, in Chennai (and Austin, further down, for the
 * American sample), and the offers they make on a sample event. The names are made up; the prices are modelled on what Chennai
 * vendors publish on their own websites (28 Oct 2026: catering ₹150–900 a plate, median
 * ₹325; stage decor ₹11,000–40,000; photographers ₹1,499–4,999 an hour). No hall in
 * the city publishes its rent, so there are no sample halls. Sample vendors carry
 * `sample: true`: they are shown only on sample events and labelled as samples, and
 * they have no phone numbers, so nobody real is ever called.
 */

type Quantities = Record<string, number>;
type SampleOffering = { title: string; unit: Basis; priceUnit: string; quantities: Quantities; price: number; includes: string[]; taxIncluded?: boolean };
type SampleVendor = { name: string; area: string; category: string; about: string; completedEvents: number; offering: SampleOffering };

const leaf = ["Banana leaf", "Water bottle", "Serving staff"];
// Sweet, two curries, kootu, sambar, rasam, payasam and appalam: eight dishes, two of them sweet.
type Menu = { title: string; dishes: number; sweets: number; menu: string };
const LEAF_LUNCH: Menu = { title: "Veg lunch on banana leaf", dishes: 8, sweets: 2, menu: "Sweet, two curries, kootu, sambar, rasam, payasam, appalam" };
/** A caterer's plate: each sample caterer has its own menu, so the directory doesn't read as one caterer ten times. */
const lunch = (price: number, extra: string[] = [], m: Menu = LEAF_LUNCH): SampleOffering => ({
  title: m.title,
  unit: "per_person",
  priceUnit: "per_plate",
  quantities: { dishes: m.dishes, sweets: m.sweets },
  price,
  includes: [m.menu, ...extra],
});
const stage = (price: number, areas: number, includes: string[]): SampleOffering => ({
  title: "Stage and entrance flowers",
  unit: "total",
  priceUnit: "for_setup",
  quantities: { areas },
  price,
  includes,
});
/** A shoot priced for the event: its hours, photographers, edited photos and weeks to deliver them. */
const shoot = (price: number, hours: number, crew: { photographers?: number; photos: number; weeks: number }, includes: string[]): SampleOffering => ({
  title: `Candid and family photos, ${hours} hours`,
  unit: "total",
  priceUnit: "for_event",
  quantities: { hours, photographers: crew.photographers ?? 1, photos: crew.photos, delivery: crew.weeks },
  price,
  includes: [`${hours} hours of coverage`, ...includes],
});

export const SAMPLE_VENDORS: SampleVendor[] = [
  { name: "Pongal Pot Caterers", area: "Kodambakkam", category: "Catering", about: "Home-style tiffin and meals for small functions.", completedEvents: 1, offering: lunch(260, [], { title: "Tiffin and mini meals", dishes: 6, sweets: 1, menu: "Pongal, vada, two chutneys, sambar, mini meals with curd rice" }) },
  { name: "Annapoorani Leaf Caterers", area: "T. Nagar", category: "Catering", about: "Banana-leaf lunches for poojas and birthdays.", completedEvents: 4, offering: lunch(290, leaf.slice(0, 1)) },
  { name: "Neivedhyam Kitchen", area: "Mylapore", category: "Catering", about: "Traditional Tamil meals, no onion or garlic on request.", completedEvents: 12, offering: lunch(300, leaf, { title: "Satvik meals, no onion or garlic", dishes: 10, sweets: 2, menu: "Sweet pongal, two kootus, poriyal, sambar, rasam, curd rice, appalam" }) },
  { name: "Sambar & Co. Caterers", area: "Velachery", category: "Catering", about: "South Indian meals and North Indian counters.", completedEvents: 3, offering: lunch(320, leaf.slice(0, 2), { title: "South and North Indian lunch", dishes: 12, sweets: 2, menu: "Paneer curry, dal, rotis, sambar, rasam, two poriyals, curd rice" }) },
  { name: "Kalyana Saapadu Co.", area: "Mylapore", category: "Catering", about: "Full kalyana saapadu for 50 to 500.", completedEvents: 9, offering: lunch(340, leaf, { title: "Kalyana saapadu, full leaf", dishes: 16, sweets: 3, menu: "Two payasams, vadai, three poriyals, kootu, sambar, mor kuzhambu, rasam, curd rice" }) },
  { name: "Thalaivazhai Caterers", area: "Adyar", category: "Catering", about: "Leaf meals with a live dosa counter on request.", completedEvents: 5, offering: lunch(380, leaf, { title: "Leaf lunch with a live dosa counter", dishes: 12, sweets: 2, menu: "Live dosa counter, sambar, two chutneys, poriyal, kootu, rasam, curd rice, payasam" }) },
  { name: "Paruppu Payasam Kitchen", area: "Mandaveli", category: "Catering", about: "Festive menus with two payasams.", completedEvents: 2, offering: lunch(420, [...leaf, "Transport in Chennai"], { title: "Festive lunch with two payasams", dishes: 12, sweets: 3, menu: "Paruppu and semiya payasam, vadai, two poriyals, sambar, rasam, curd rice" }) },
  { name: "Komalam Caterers", area: "Nungambakkam", category: "Catering", about: "Elaborate menus for milestone birthdays and engagements.", completedEvents: 14, offering: { ...lunch(450, [...leaf, "Transport in Chennai"], { title: "Milestone-birthday feast", dishes: 16, sweets: 3, menu: "Welcome drink, three sweets, vadai, bajji, three poriyals, sambar, rasam, curd rice" }), taxIncluded: true } },
  { name: "Kumudham Feast", area: "Anna Nagar", category: "Catering", about: "Premium leaf meals and sweet stalls.", completedEvents: 6, offering: lunch(520, [...leaf, "Transport in Chennai"], { title: "Premium leaf meal with a sweet stall", dishes: 18, sweets: 4, menu: "Sweet stall, live jalebi, three poriyals, two kootus, biryani, sambar, rasam, curd rice" }) },
  { name: "Vettrilai Caterers", area: "Besant Nagar", category: "Catering", about: "Heritage recipes, served in silver-rimmed leaves.", completedEvents: 7, offering: { ...lunch(600, [...leaf, "Transport in Chennai"], { title: "Heritage Chettinad veg feast", dishes: 20, sweets: 3, menu: "Chettinad kuzhambu, paniyaram, three poriyals, kootu, sambar, rasam, curd rice, two payasams" }), taxIncluded: true } },

  { name: "Sevvanthi Stage Decor", area: "Saidapet", category: "Decor & Florals", about: "Marigold and chrysanthemum stages for home functions.", completedEvents: 3, offering: stage(11_000, 2, ["Marigold backdrop", "Entrance string"]) },
  { name: "Kolam Corner Decor", area: "West Mambalam", category: "Decor & Florals", about: "Rangoli, kolam and simple flower decor.", completedEvents: 2, offering: stage(14_500, 2, ["Flower backdrop", "Rangoli at the entrance"]) },
  { name: "Poo Kadai Events", area: "Mylapore", category: "Decor & Florals", about: "Fresh flowers from the Mylapore market, every time.", completedEvents: 8, offering: stage(18_000, 2, ["Jasmine and marigold backdrop", "Entrance arch"]) },
  { name: "Kuthuvilakku Decor", area: "Alwarpet", category: "Decor & Florals", about: "Brass lamps, banana trees and traditional stages.", completedEvents: 6, offering: stage(21_000, 2, ["Backdrop with brass lamps", "Banana trees at the door", "Setup and removal"]) },
  { name: "Jasmine Arch Decorators", area: "R.A. Puram", category: "Decor & Florals", about: "Jasmine-led stages for sixtieths and engagements.", completedEvents: 11, offering: stage(24_500, 2, ["Jasmine and marigold backdrop", "Entrance arch", "Two flower stands", "Setup and removal"]) },
  { name: "Rangoli Room Events", area: "Kilpauk", category: "Decor & Florals", about: "Themed stages with fresh and silk flowers.", completedEvents: 4, offering: stage(28_000, 3, ["Themed backdrop", "Entrance arch", "Photo corner"]) },
  { name: "Marigold Mandapam Designs", area: "Nungambakkam", category: "Decor & Florals", about: "Full-hall decor with lighting.", completedEvents: 9, offering: stage(34_000, 3, ["Stage", "Entrance", "Hall pillars", "Warm lighting", "Setup and removal"]) },
  { name: "Thamarai Petal Studio", area: "Boat Club", category: "Decor & Florals", about: "Lotus and orchid stages, designed to a palette.", completedEvents: 5, offering: stage(40_000, 3, ["Designed stage", "Entrance", "Table flowers", "Lighting", "Setup and removal"]) },

  { name: "Veranda Frames", area: "Mylapore", category: "Photographer", about: "Candid photos of family functions.", completedEvents: 3, offering: shoot(8_000, 3, { photos: 100, weeks: 2 }, ["Edited photos online"]) },
  { name: "Gopuram Lens Co.", area: "Triplicane", category: "Photographer", about: "Traditional and candid, one photographer.", completedEvents: 2, offering: shoot(10_500, 3, { photos: 120, weeks: 2 }, ["Edited photos online"]) },
  { name: "Thinnai Photography", area: "Mandaveli", category: "Photographer", about: "Quiet candid photos for small family days.", completedEvents: 10, offering: shoot(12_500, 3, { photos: 150, weeks: 1 }, ["Edited photos online", "Travel in Chennai"]) },
  { name: "Vilakku Light Studio", area: "Adyar", category: "Photographer", about: "Natural-light portraits and family groups.", completedEvents: 6, offering: shoot(15_000, 4, { photos: 200, weeks: 2 }, ["Edited photos online", "Travel in Chennai"]) },
  { name: "Muthu Moments", area: "T. Nagar", category: "Photographer", about: "Photos and a short highlight reel.", completedEvents: 8, offering: shoot(18_000, 4, { photos: 200, weeks: 2 }, ["Edited photos online", "1-minute reel"]) },
  { name: "Marina Light Photography", area: "Santhome", category: "Photographer", about: "Two photographers for larger groups.", completedEvents: 7, offering: shoot(21_000, 4, { photographers: 2, photos: 300, weeks: 2 }, ["Two photographers", "Edited photos online"]) },
  { name: "Pattu Pavadai Pictures", area: "Anna Nagar", category: "Photographer", about: "Candid photos and printed albums.", completedEvents: 5, offering: shoot(25_000, 5, { photos: 300, weeks: 3 }, ["Edited photos online", "20-page album"]) },
  { name: "Rangam Studios", area: "Alwarpet", category: "Photographer", about: "Photo and video teams for milestone birthdays.", completedEvents: 12, offering: shoot(30_000, 5, { photographers: 2, photos: 400, weeks: 3 }, ["Two photographers", "Edited photos online", "20-page album"]) },
];

/**
 * The sample vendors' answers to a sample event's briefs: complete on every line of the
 * sheet, so they sit beside web-found quotes that leave charges unsaid.
 */
const SAMPLE_OFFERS: { vendor: string; category: string; price: number; priceUnit: string; quantities: Quantities; covers: string; lines: OfferLine[]; notes?: string }[] = [
  {
    vendor: "Kalyana Saapadu Co.",
    category: "Catering",
    price: 340,
    priceUnit: "per_plate",
    // The plates are the brief's guests, added when the offer is made.
    quantities: { dishes: 9, sweets: 2, staff: 6 },
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
    priceUnit: "per_plate",
    quantities: { dishes: 12, sweets: 4, staff: 8 },
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
    priceUnit: "for_setup",
    quantities: { areas: 2 },
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
    priceUnit: "for_event",
    quantities: { hours: 3, photographers: 1, photos: 150, delivery: 1 },
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

/**
 * The charges a sample package states, worked out from what it includes, so the demo shows
 * packages that say everything beside ones that leave a little unsaid (the cheapest caterer).
 */
export function sampleCharges(category: string, o: { price: number; includes: string[]; taxIncluded?: boolean }): PackageCharge[] {
  const has = (word: string) => o.includes.some((i) => i.toLowerCase().includes(word));
  const gst: PackageCharge = { key: "gst", status: o.taxIncluded ? "included" : "extra" };
  if (category === "Catering") {
    if (o.price < 280) return [gst, { key: "transport", status: "extra" }];
    return [
      gst,
      has("serving staff") ? { key: "service_staff", status: "included" } : { key: "service_staff", status: "priced", amount: 1800 },
      has("transport") ? { key: "transport", status: "included" } : { key: "transport", status: "priced", amount: o.price < 340 ? 1500 : 2500 },
      has("banana leaf") ? { key: "crockery", status: "included" } : { key: "crockery", status: "extra" },
      has("water") ? { key: "water", status: "included" } : { key: "water", status: "none" },
    ];
  }
  if (category === "Decor & Florals") {
    return [gst, { key: "transport", status: "priced", amount: 2000 }, { key: "setup", status: "included" }, { key: "lighting", status: "extra" }];
  }
  if (category === "Photographer") {
    return [gst, { key: "travel", status: "included" }, { key: "overtime", status: "priced", amount: 3000 }, { key: "album", status: "priced", amount: 6500 }, { key: "drone", status: "none" }];
  }
  return [gst];
}

// ---------------------------------------------------------------- Austin

/*
 * Sample Partner vendors in Austin, Texas, for the American sample event (Dad's 60th). The
 * names are made up and every one carries `sample: true`, as the Chennai ones do. No prices
 * were scraped: the figures are our own estimates of what Austin vendors charged for a
 * private party of about 120 in 2025–26, from general knowledge of the market, and should be
 * read as plausible, not quoted:
 * - Catering, per person before tax and service: drop-off barbecue and taco bars $18–28,
 *   full-service buffets $32–50, plated dinners $50–75. Austin's sales tax is 8.25% (6.25%
 *   Texas plus 2% city and transit), and full-service caterers add an 18–22% service charge
 *   or bill servers separately, plus delivery ($100–250) and rentals ($6–15 a guest).
 * - Flowers and decor for a dinner of 120 (centerpieces for 12–15 tables, an entrance piece,
 *   sometimes a backdrop): $1,200–4,500.
 * - Event photography, 3–5 hours with edited photos online: $900–3,000.
 * No venue in the samples, as in Chennai: rooms are priced by date and hours, not listed.
 */
const BUFFET_STAFF = ["Serving staff", "Delivery and setup"];
const usDinner = (price: number, title: string, menu: string, dishes: number, sweets: number, extra: string[] = []): SampleOffering => ({
  title,
  unit: "per_person",
  // The sheet's key for a price per guest; an event in dollars reads it "per person" (lib/standardSheet localSheet).
  priceUnit: "per_plate",
  quantities: { dishes, sweets },
  price,
  includes: [menu, ...extra],
});
const usFlowers = (price: number, areas: number, includes: string[]): SampleOffering => ({
  title: "Table and entrance flowers",
  unit: "total",
  priceUnit: "for_setup",
  quantities: { areas },
  price,
  includes,
});

export const AUSTIN_SAMPLE_VENDORS: SampleVendor[] = [
  { name: "Pecan Smoke BBQ Catering", area: "East Austin", category: "Catering", about: "Drop-off barbecue for backyard parties.", completedEvents: 3, offering: usDinner(22, "Drop-off barbecue", "Brisket, sausage, two sides, pickles and white bread", 5, 0) },
  { name: "Lone Star Taco Bar Co.", area: "North Loop", category: "Catering", about: "Build-your-own taco bars, set up and left for you.", completedEvents: 2, offering: usDinner(24, "Taco bar", "Two meats, rice, beans, three salsas, chips and queso", 7, 0, ["Delivery and setup"]) },
  { name: "Barton Creek Kitchen", area: "Barton Hills", category: "Catering", about: "Southern comfort food for family gatherings.", completedEvents: 6, offering: usDinner(29, "Southern buffet", "Fried chicken, mac and cheese, greens, cornbread, peach cobbler", 6, 1, ["Delivery and setup"]) },
  { name: "Cedar & Salt Catering", area: "Mueller", category: "Catering", about: "Hill Country buffets for birthdays and reunions.", completedEvents: 11, offering: usDinner(34, "Hill Country buffet", "Smoked chicken, brisket, three sides, salad, rolls and banana pudding", 8, 1, ["Delivery and setup"]) },
  { name: "Bluebonnet Supper Co.", area: "Travis Heights", category: "Catering", about: "Family-style dinners served at long tables.", completedEvents: 7, offering: usDinner(38, "Family-style dinner", "Two mains, four sides, salad, rolls and a dessert table", 8, 2, BUFFET_STAFF) },
  { name: "Rio Verde Table", area: "Holly", category: "Catering", about: "Tex-Mex buffets with a live fajita station.", completedEvents: 5, offering: usDinner(42, "Tex-Mex buffet with a fajita station", "Fajita station, enchiladas, rice, beans, guacamole, tres leches", 9, 1, [...BUFFET_STAFF, "Iced tea and water"]) },
  { name: "Live Oak Provisions", area: "Hyde Park", category: "Catering", about: "Seasonal buffets with a carving station.", completedEvents: 14, offering: usDinner(46, "Seasonal buffet with a carving station", "Carving station, two mains, three seasonal sides, salad, rolls, dessert", 9, 1, [...BUFFET_STAFF, "Plates, glassware and linens"]) },
  { name: "Rainey Street Kitchen", area: "Rainey Street", category: "Catering", about: "Plated dinners for private rooms downtown.", completedEvents: 8, offering: usDinner(52, "Plated three-course dinner", "Salad, a choice of two mains, dessert", 5, 1, [...BUFFET_STAFF, "Plates, glassware and linens"]) },
  { name: "Mesquite & Rye", area: "Clarksville", category: "Catering", about: "Chef-led dinners with a raw bar.", completedEvents: 6, offering: usDinner(58, "Plated dinner with a raw bar", "Raw bar, salad, two mains, three sides, dessert", 8, 1, [...BUFFET_STAFF, "Plates, glassware and linens", "Iced tea and water"]) },
  { name: "Tarrytown Table", area: "Tarrytown", category: "Catering", about: "Four-course dinners, tax and service included.", completedEvents: 9, offering: { ...usDinner(68, "Four-course dinner, all inclusive", "Passed appetizers, salad, two mains, dessert", 7, 1, [...BUFFET_STAFF, "Plates, glassware and linens", "Iced tea and water"]), taxIncluded: true } },

  { name: "Wildflower Stems", area: "Bouldin Creek", category: "Decor & Florals", about: "Loose, seasonal arrangements for small parties.", completedEvents: 4, offering: usFlowers(1_200, 2, ["Table centerpieces", "Welcome-table flowers"]) },
  { name: "Prairie & Pine Florals", area: "Crestview", category: "Decor & Florals", about: "Wildflowers and greenery, delivered and set.", completedEvents: 3, offering: usFlowers(1_500, 2, ["Table centerpieces", "Entrance arrangement"]) },
  { name: "Bluebonnet Petal Studio", area: "South Lamar", category: "Decor & Florals", about: "Flowers for birthdays, anniversaries and showers.", completedEvents: 10, offering: usFlowers(1_850, 2, ["Centerpieces for 15 tables", "Entrance arrangement", "Setup and removal"]) },
  { name: "Hill Country Bloom Co.", area: "Allandale", category: "Decor & Florals", about: "Garden roses and Texas greenery.", completedEvents: 6, offering: usFlowers(2_200, 2, ["Centerpieces", "Entrance arrangement", "Cake table flowers", "Setup and removal"]) },
  { name: "Agave & Rose Events", area: "East Austin", category: "Decor & Florals", about: "Desert plants and roses, styled to a palette.", completedEvents: 5, offering: usFlowers(2_600, 3, ["Centerpieces", "Entrance", "Photo backdrop"]) },
  { name: "Copper Lantern Decor", area: "Cherrywood", category: "Decor & Florals", about: "Flowers, lanterns and string lights for rooms and patios.", completedEvents: 8, offering: usFlowers(2_950, 3, ["Centerpieces", "Photo backdrop", "String lights", "Setup and removal"]) },
  { name: "Lady Bird Floral Design", area: "Zilker", category: "Decor & Florals", about: "Full-room flowers for milestone parties.", completedEvents: 9, offering: usFlowers(3_400, 3, ["Centerpieces", "Entrance", "Bar and cake tables", "Setup and removal"]) },
  { name: "Pedernales Event Design", area: "Tarrytown", category: "Decor & Florals", about: "Designed rooms with flowers, linens and lighting.", completedEvents: 7, offering: usFlowers(4_200, 3, ["Designed centerpieces", "Entrance", "Table linens", "Lighting", "Setup and removal"]) },

  { name: "Front Porch Photo", area: "Hyde Park", category: "Photographer", about: "Relaxed candid photos of family parties.", completedEvents: 3, offering: shoot(900, 3, { photos: 150, weeks: 2 }, ["Edited photos online"]) },
  { name: "Eastside Frames", area: "East Austin", category: "Photographer", about: "Candid and group photos, one photographer.", completedEvents: 2, offering: shoot(1_150, 3, { photos: 175, weeks: 2 }, ["Edited photos online"]) },
  { name: "Congress Avenue Photo", area: "Downtown Austin", category: "Photographer", about: "Party and portrait photos around central Austin.", completedEvents: 10, offering: shoot(1_350, 3, { photos: 200, weeks: 2 }, ["Edited photos online", "Travel in Austin"]) },
  { name: "Golden Hour ATX", area: "Zilker", category: "Photographer", about: "Natural-light portraits and family groups.", completedEvents: 6, offering: shoot(1_600, 4, { photos: 250, weeks: 2 }, ["Edited photos online", "Travel in Austin"]) },
  { name: "Barton Springs Studio", area: "Barton Hills", category: "Photographer", about: "Photos and a short highlight reel.", completedEvents: 8, offering: shoot(1_850, 4, { photos: 250, weeks: 2 }, ["Edited photos online", "1-minute reel"]) },
  { name: "Lamar Light Photography", area: "South Lamar", category: "Photographer", about: "Two photographers for larger parties.", completedEvents: 7, offering: shoot(2_100, 4, { photographers: 2, photos: 350, weeks: 2 }, ["Two photographers", "Edited photos online"]) },
  { name: "Hill Country Portraits", area: "Rosedale", category: "Photographer", about: "Candid photos and printed albums.", completedEvents: 5, offering: shoot(2_450, 5, { photos: 350, weeks: 3 }, ["Edited photos online", "20-page album"]) },
  { name: "Capitol View Photo & Film", area: "North Loop", category: "Photographer", about: "Photo and video teams for milestone parties.", completedEvents: 12, offering: shoot(2_900, 5, { photographers: 2, photos: 450, weeks: 3 }, ["Two photographers", "Edited photos online", "20-page album"]) },
];

/** The Austin sample vendors' answers to the American sample event's briefs, complete on every line. */
const AUSTIN_SAMPLE_OFFERS: typeof SAMPLE_OFFERS = [
  {
    vendor: "Cedar & Salt Catering",
    category: "Catering",
    price: 34,
    priceUnit: "per_plate",
    quantities: { dishes: 8, sweets: 1, staff: 4 },
    covers: "Hill Country buffet: smoked chicken, brisket, three sides, salad, rolls and banana pudding",
    lines: [
      // 8.25% Austin sales tax on the food and delivery for 120 ($4,230).
      { key: "gst", status: "priced", amount: 349 },
      { key: "service_staff", status: "priced", amount: 600 },
      { key: "transport", status: "priced", amount: 150 },
      { key: "crockery", status: "included" },
      { key: "water", status: "included" },
    ],
    notes: "Gluten-free and vegetarian plates kept to one end of the buffet, at no extra cost.",
  },
  {
    vendor: "Live Oak Provisions",
    category: "Catering",
    price: 46,
    priceUnit: "per_plate",
    quantities: { dishes: 9, sweets: 1, staff: 6 },
    covers: "Seasonal buffet with a carving station, three sides, salad, rolls and dessert, with plates, glassware and linens",
    lines: [
      { key: "gst", status: "extra", amount: 455 },
      { key: "service_staff", status: "included" },
      { key: "transport", status: "included" },
      { key: "crockery", status: "included" },
      { key: "water", status: "extra", amount: 90 },
    ],
  },
  {
    vendor: "Bluebonnet Petal Studio",
    category: "Decor & Florals",
    price: 1_850,
    priceUnit: "for_setup",
    quantities: { areas: 2 },
    covers: "Sage, cream and copper centerpieces for 15 tables and an entrance arrangement",
    lines: [
      { key: "gst", status: "extra", amount: 153 },
      { key: "transport", status: "priced", amount: 125 },
      { key: "setup", status: "included" },
      { key: "lighting", status: "extra", amount: 350 },
    ],
    notes: "Copper bud vases to match the palette, as asked.",
  },
  {
    vendor: "Congress Avenue Photo",
    category: "Photographer",
    price: 1_350,
    priceUnit: "for_event",
    quantities: { hours: 3, photographers: 1, photos: 200, delivery: 2 },
    covers: "One photographer for 3 hours of the dinner, candid and family groups, edited photos online in two weeks",
    lines: [
      { key: "gst", status: "included" },
      { key: "travel", status: "included" },
      { key: "overtime", status: "extra", amount: 250 },
      { key: "album", status: "extra", amount: 450 },
      { key: "drone", status: "extra", amount: 300 },
    ],
  },
];

/** The charges an Austin sample package states, from what it includes, as sampleCharges does for Chennai. */
export function sampleChargesUS(category: string, o: { price: number; includes: string[]; taxIncluded?: boolean }): PackageCharge[] {
  const has = (word: string) => o.includes.some((i) => i.toLowerCase().includes(word));
  const tax: PackageCharge = { key: "gst", status: o.taxIncluded ? "included" : "extra" };
  if (category === "Catering") {
    // The drop-off barbecue leaves delivery unpriced and the rest unsaid, as cheap caterers often do.
    if (o.price < 23) return [tax, { key: "transport", status: "extra" }];
    return [
      tax,
      has("serving staff") ? { key: "service_staff", status: "included" } : { key: "service_staff", status: "priced", amount: 450 },
      has("delivery") ? { key: "transport", status: "included" } : { key: "transport", status: "priced", amount: 150 },
      has("plates") ? { key: "crockery", status: "included" } : { key: "crockery", status: "extra" },
      has("water") ? { key: "water", status: "included" } : { key: "water", status: "none" },
    ];
  }
  if (category === "Decor & Florals") {
    return [tax, { key: "transport", status: "priced", amount: 125 }, { key: "setup", status: "included" }, { key: "lighting", status: "extra" }];
  }
  if (category === "Photographer") {
    return [tax, { key: "travel", status: "included" }, { key: "overtime", status: "priced", amount: 250 }, { key: "album", status: "priced", amount: 450 }, { key: "drone", status: "none" }];
  }
  return [tax];
}

/** One city's sample vendors, their answers to a sample event's briefs, and how their packages' charges read. */
type SampleSet = {
  city: string;
  cityKey: string;
  currency: string;
  languages: string[];
  vendors: SampleVendor[];
  offers: typeof SAMPLE_OFFERS;
  charges: typeof sampleCharges;
};

export const CHENNAI_SAMPLES: SampleSet = { city: "Chennai", cityKey: "chennai", currency: "INR", languages: ["Tamil", "English"], vendors: SAMPLE_VENDORS, offers: SAMPLE_OFFERS, charges: sampleCharges };
export const AUSTIN_SAMPLES: SampleSet = { city: "Austin", cityKey: "austin", currency: "USD", languages: ["English", "Spanish"], vendors: AUSTIN_SAMPLE_VENDORS, offers: AUSTIN_SAMPLE_OFFERS, charges: sampleChargesUS };

/** The sample set for a sample event: Austin's for an event in dollars, Chennai's otherwise. */
export function samplesFor(event: { currency: string }): SampleSet {
  return event.currency === "USD" ? AUSTIN_SAMPLES : CHENNAI_SAMPLES;
}

/** Gives sample vendors already in the database the package they're made with now (title, menu and charges). Run once by hand. */
export const refreshSamplePackages = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let changed = 0;
    for await (const p of ctx.db.query("vendorProfiles").withIndex("by_cityKey_and_status", (q) => q.eq("cityKey", "chennai").eq("status", "verified"))) {
      if (!p.sample || p.ownerUserId) continue;
      const s = SAMPLE_VENDORS.find((x) => x.name === p.name);
      if (!s) continue;
      for (const o of await ctx.db.query("vendorOfferings").withIndex("by_profileId", (q) => q.eq("profileId", p._id)).take(5)) {
        await ctx.db.patch(o._id, {
          title: s.offering.title,
          quantities: s.offering.quantities,
          includes: s.offering.includes,
          taxIncluded: s.offering.taxIncluded ?? false,
          charges: sampleCharges(s.category, s.offering),
        });
        changed++;
      }
    }
    return changed;
  },
});

/** Gives the sample vendors' packages already in the database the charges new ones are made with. Run once by hand. */
export const fillSampleCharges = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let filled = 0;
    for await (const p of ctx.db.query("vendorProfiles").withIndex("by_cityKey_and_status", (q) => q.eq("cityKey", "chennai").eq("status", "verified"))) {
      if (!p.sample || p.ownerUserId) continue;
      for (const o of await ctx.db.query("vendorOfferings").withIndex("by_profileId", (q) => q.eq("profileId", p._id)).take(20)) {
        if (o.charges?.length && o.taxIncluded !== undefined) continue;
        await ctx.db.patch(o._id, { charges: sampleCharges(o.category, o), taxIncluded: o.taxIncluded ?? false });
        filled++;
      }
    }
    return filled;
  },
});

/** Adds a city's sample vendors that aren't there yet (Chennai's unless another set is named), and works out the ranges again if any were. */
export async function ensureSampleVendors(ctx: MutationCtx, set: SampleSet = CHENNAI_SAMPLES): Promise<Map<string, Id<"vendorProfiles">>> {
  const ids = new Map<string, Id<"vendorProfiles">>();
  for await (const p of ctx.db.query("vendorProfiles").withIndex("by_cityKey_and_status", (q) => q.eq("cityKey", set.cityKey).eq("status", "verified"))) {
    if (p.sample && !p.ownerUserId) ids.set(p.name, p._id);
  }
  let added = 0;
  const now = Date.now();
  for (const s of set.vendors) {
    if (ids.has(s.name)) continue;
    const profileId = await ctx.db.insert("vendorProfiles", {
      name: s.name,
      categories: [s.category],
      city: set.city,
      cityKey: set.cityKey,
      serviceArea: [s.area],
      languages: set.languages,
      about: s.about,
      source: "vendor_signup",
      status: "verified",
      statusAt: now,
      joinedAt: now,
      completedEvents: s.completedEvents,
      sample: true,
    });
    await ctx.db.insert("vendorOfferings", { profileId, category: s.category, currency: set.currency, ...s.offering, taxIncluded: s.offering.taxIncluded ?? false, charges: set.charges(s.category, s.offering) });
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
  const set = samplesFor(event);
  const vendors = await ensureSampleVendors(ctx, set);
  const slots = await ctx.db
    .query("vendorSlots")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(50);
  let seeded = 0;
  for (const offer of set.offers) {
    const slot = slots.find((s) => s.category === offer.category && s.status !== "booked");
    const profileId = vendors.get(offer.vendor);
    if (!slot || !profileId) continue;
    const briefId = await openBrief(ctx, eventId, slot._id);
    const brief = (await ctx.db.get(briefId))!;
    const sheet = sheetFor(offer.category)!;
    const quantities = sheet.quantities.some((q) => q.key === "count") ? { ...offer.quantities, count: brief.guests ?? 1 } : offer.quantities;
    const quantity = timesFor(priceUnitOf(sheet, offer.priceUnit), quantities) ?? 1;
    await ctx.db.insert("vendorOffers", {
      briefId,
      profileId,
      eventId,
      slotId: slot._id,
      category: offer.category,
      unit: brief.unit,
      priceUnit: offer.priceUnit,
      quantities,
      price: offer.price,
      quantity,
      currency: set.currency,
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

/** The same for Austin's sample vendors, for the American sample event. */
export const ensureAustinVendors = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await ensureSampleVendors(ctx, AUSTIN_SAMPLES)).size,
});
