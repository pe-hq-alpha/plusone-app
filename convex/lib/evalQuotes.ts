/**
 * The missing-charge evaluation's quotes: 18 replies in the shapes Chennai vendors really
 * send (shorthand, Tanglish, "GST extra", "at actuals"), for a 60th birthday lunch for 120.
 * The vendors are made up; the prices sit in the range Chennai vendors publish.
 *
 * Each `expected` is the answer key, marked by hand before any run: the sheet's charges a
 * careful planner would still have to ask this vendor about. A charge is expected when
 *   - the quote never mentions it and it is usually charged on top, or another quote in
 *     its group charges for it; or
 *   - the quote says it is extra but gives no amount or rate (a percentage is a rate).
 * A charge the quote says is included, prices, or says isn't offered is settled. "unit"
 * is expected when a per-plate need's quote never says how many plates it covers.
 */

export type EvalQuote = { vendor: string; text: string; expected: string[] };
export type EvalGroup = { category: string; quotes: EvalQuote[] };

export const EVAL_GROUPS: EvalGroup[] = [
  {
    category: "Catering",
    quotes: [
      {
        vendor: "Annapoorna Catering",
        text: "Vanakkam. For 120 guests, banana leaf lunch with 14 items and 2 sweets: Rs 420 per plate, total Rs 50,400. 8 serving staff included. Transport Rs 2,000. GST 5% extra. Plates, tumblers and serving vessels from our side. Drinking water you have to arrange.",
        expected: ["water"],
      },
      {
        vendor: "Saravana Caterers",
        text: "Sir, veg lunch Rs 380/plate. Minimum 100 plates. GST extra.",
        expected: ["gst", "service_staff", "transport", "crockery", "water"],
      },
      {
        vendor: "Mylai Kitchen",
        text: "All inclusive Rs 58,000 for 120 people: lunch on banana leaf (16 items), serving staff, transport, crockery, drinking water and GST all included.",
        expected: [],
      },
      {
        vendor: "Krishna Bhavan Caterers",
        text: "Lunch Rs 450 per plate x 120 = Rs 54,000. Service charge Rs 4,000 for 10 boys. Transport free within city limits. Mineral water Rs 1,200. GST Rs 2,700.",
        expected: ["crockery"],
      },
      {
        vendor: "Sri Vaari Foods",
        text: "Rs 400 per head for 120 persons. Plates and glasses Rs 1,500 extra. Transport at actuals.",
        expected: ["transport", "gst", "service_staff", "water"],
      },
      {
        vendor: "Thali Express",
        text: "Lunch packages for 120: Silver Rs 350 per plate (12 items), Gold Rs 450 per plate (16 items). Price includes service and GST. Water cans provided free.",
        expected: ["transport", "crockery"],
      },
    ],
  },
  {
    category: "Venue",
    quotes: [
      {
        vendor: "Thamarai Hall",
        text: "Hall rent Rs 80,000 for 11 am to 4:30 pm, including dining hall, kitchen, electricity and cleaning. AC Rs 6,000 extra. GST 18% extra. Extra hours Rs 5,000 per hour.",
        expected: [],
      },
      {
        vendor: "Sri Kalyana Mandapam",
        text: "Rent Rs 65,000 per day. EB charges as per meter reading. Generator extra.",
        expected: ["electricity", "gst", "ac", "cleaning", "overtime"],
      },
      {
        vendor: "Green Palace",
        text: "Package Rs 1,10,000 inclusive of AC, electricity, cleaning and GST. Dining hall for 150. Timing 10 am to 5 pm; after that Rs 8,000 per hour.",
        expected: [],
      },
      {
        vendor: "Lotus Hall",
        text: "Hall Rs 55,000. Cleaning Rs 2,500. AC Rs 1,000 per hour.",
        expected: ["gst", "electricity", "overtime"],
      },
    ],
  },
  {
    category: "Decor & Florals",
    quotes: [
      {
        vendor: "Jasmine Arch Decor",
        text: "Stage backdrop with jasmine and marigold, entrance arch and 2 flower stands: Rs 36,000. Includes setup and removal. Transport Rs 1,200. Lighting Rs 3,000 extra. GST 18% extra.",
        expected: [],
      },
      {
        vendor: "Rangoli Room",
        text: "Themed stage Rs 28,000, all inclusive of GST, transport, setup and lighting.",
        expected: [],
      },
      {
        vendor: "Pushpa Decorators",
        text: "Stage decoration Rs 22,000. Setup charges extra. Lights extra.",
        expected: ["setup", "lighting", "gst", "transport"],
      },
      {
        vendor: "Malar Florists",
        text: "Fresh flower stage Rs 31,500 + GST Rs 5,670. Transport within Chennai free.",
        expected: ["setup", "lighting"],
      },
    ],
  },
  {
    category: "Photographer",
    quotes: [
      {
        vendor: "Thinnai Photography",
        text: "One photographer, 3 hours, 150 edited photos in a week: Rs 12,500 including GST and travel. Extra hour Rs 3,000. Album Rs 6,500 optional. Drone Rs 5,000 optional.",
        expected: [],
      },
      {
        vendor: "Click Studio",
        text: "Candid + traditional, 2 photographers, Rs 18,000. Album extra.",
        expected: ["album", "gst", "travel", "overtime", "drone"],
      },
      {
        vendor: "Muthu Moments",
        text: "Photos + 1 minute reel, 4 hours, Rs 18,000 + GST. Travel Rs 1,000. Overtime Rs 2,500/hour. No album, digital only.",
        expected: ["gst", "drone"],
      },
      {
        vendor: "Vilakku Studio",
        text: "Full coverage Rs 15,000. GST 18% included. Drone coverage included free.",
        expected: ["travel", "overtime", "album"],
      },
    ],
  },
];
