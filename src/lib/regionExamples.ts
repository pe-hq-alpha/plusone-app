import { sampleFor } from "../../convex/lib/regions";

/**
 * The made-up examples on the home page, How it works and the manual form. Names read
 * the same anywhere (no city, no one culture's names), in the visitor's own money: rupees for India (Delhi's vendors in the north, Chennai's
 * elsewhere), dollars everywhere else. Amounts are written the way people there would
 * quote them, never converted.
 */

export type RegionExamples = {
  /** The home page's example event at the top, and the first line of its running status (no city, so it reads anywhere). */
  hero: { event: string; people: number; plan: string };
  /** A search as a host there would ask it. */
  search: string;
  /** One need's quotes, read into the same unit, and the spread between them. */
  compare: { title: string; unit: string; rows: { name: string; quoted: string; per: string; total: string; tag?: string; best?: boolean }[]; totalLabel: string; range: string };
  /** Onboarding's placeholders. */
  city: string;
  area: string;
  areaHint: string;
};

const ELSEWHERE: RegionExamples = {
  hero: { event: "Mia's 1st birthday", people: 40, plan: "Plan set out: party at 11:00, cake at 12:30" },
  search: "venues near Austin for a two-day team offsite for 40",
  compare: {
    title: "Catering · team offsite dinner for 80",
    unit: "Per head",
    totalLabel: "For your 80",
    rows: [
      { name: "The Long Table", quoted: "$32 a head + $400 service", per: "$37", total: "$2,960", tag: "Best per head", best: true },
      { name: "Salt & Smoke", quoted: "$2,600 all in", per: "$43", total: "$3,467", tag: "Priced for 60" },
      { name: "Hill Country Table", quoted: "$38 a head + $150 delivery", per: "$40", total: "$3,190" },
    ],
    range: "Across these quotes: $37 to $43 a head",
  },
  city: "Austin",
  area: "East Austin",
  areaHint: "Beacon Hill",
};

const CHENNAI: RegionExamples = {
  hero: { event: "Mia's 1st birthday", people: 80, plan: "Plan set out: party at 5:00, cake at 6:30" },
  search: "caterers in Chennai for a 60th birthday lunch, under ₹500 a plate",
  compare: {
    title: "Catering · housewarming lunch for 150",
    unit: "Per plate",
    totalLabel: "For your 150",
    rows: [
      { name: "Harvest Table Caterers", quoted: "₹380 a plate + ₹6,000 service", per: "₹420", total: "₹63,000", tag: "Best per plate", best: true },
      { name: "Green Leaf Kitchen", quoted: "₹62,000 all in", per: "₹517", total: "₹77,500", tag: "Priced for 120" },
      { name: "Silver Spoon Co.", quoted: "₹450 a plate + ₹2,500 transport", per: "₹467", total: "₹70,000" },
    ],
    range: "Across these quotes: ₹420 to ₹517 a plate",
  },
  city: "Chennai",
  area: "T. Nagar",
  areaHint: "Mylapore",
};

const DELHI: RegionExamples = {
  hero: { event: "Mia's 1st birthday", people: 80, plan: "Plan set out: party at 5:00, cake at 6:30" },
  search: "banquet halls in Gurugram for an office Diwali party for 120",
  compare: {
    title: "Catering · office party dinner for 150",
    unit: "Per plate",
    totalLabel: "For your 150",
    rows: [
      { name: "Golden Fork Caterers", quoted: "₹450 a plate + ₹8,000 service", per: "₹503", total: "₹75,500", tag: "Best per plate", best: true },
      { name: "Olive & Thyme", quoted: "₹70,000 all in", per: "₹583", total: "₹87,500", tag: "Priced for 120" },
      { name: "The Feast House", quoted: "₹520 a plate + ₹3,000 transport", per: "₹540", total: "₹81,000" },
    ],
    range: "Across these quotes: ₹503 to ₹583 a plate",
  },
  city: "New Delhi",
  area: "Chhatarpur",
  areaHint: "Greater Kailash",
};

const BY_SAMPLE = { chennai: CHENNAI, delhi: DELHI, austin: ELSEWHERE } as const;

export function examplesFor(region: string | undefined): RegionExamples {
  return BY_SAMPLE[sampleFor(region)];
}
