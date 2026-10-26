import { VENDOR_NEEDS, VENDOR_NEED_KEYS, type CeremonyKind, type VendorNeedKey } from "./vocab";

// The parts an event starts with, and the first guesses that hang off each one: which
// day it lands on, how many guests, what share of the budget, and which vendors it
// calls for. Shared by the onboarding screens and the server.

/** One part of an event as a plan starts with it. */
export type PlannedCeremony = {
  /** Unique within this plan. */
  key: string;
  name: string;
  significance: string;
  /** The moments inside it, for meaning only; they never create vendor needs. */
  rites: { name: string; gloss: string }[];
  vendorNeeds: VendorNeedKey[];
  kind?: CeremonyKind;
  isDefault: boolean;
  /** Days from the main day: negative before it, positive after. */
  offset: number;
  /** 0 morning, 1 daytime, 2 evening: orders parts that share a day. */
  timeOfDay: 0 | 1 | 2;
};

/**
 * Which day of the wedding's own dates each ceremony lands on (0 is the first day).
 * When the ceremonies' natural spacing fits the dates, it is kept as is; otherwise
 * each distinct day gets its own date counting back from the last, so the wedding
 * day and anything after it keep their place and the earliest rites share the
 * first day. Ceremonies that are off are placed too but don't stretch the run.
 */
export function placeOnDays(items: { offset: number; on: boolean }[], totalDays: number): number[] {
  const days = Math.max(1, Math.floor(totalDays));
  const counted = items.some((i) => i.on) ? items.filter((i) => i.on) : items;
  const distinct = [...new Set(counted.map((i) => i.offset))].sort((a, b) => a - b);
  if (!distinct.length) return items.map(() => 0);
  const clamp = (d: number) => Math.max(0, Math.min(days - 1, d));
  const first = distinct[0];
  const span = distinct[distinct.length - 1] - first + 1;
  if (span <= days) return items.map((i) => clamp(i.offset - first));
  const shift = Math.max(0, distinct.length - days);
  return items.map((i) => {
    let rank = -1;
    for (let k = 0; k < distinct.length && distinct[k] <= i.offset; k++) rank = k;
    return clamp(Math.max(0, rank) - shift);
  });
}

/** Roughly what share of the overall guest estimate each kind of gathering draws. */
const KIND_GUESTS: Record<CeremonyKind, number> = {
  reception: 1,
  fire: 1,
  nikah: 1,
  gurdwara: 1,
  chuppah: 1,
  church: 1,
  temple: 0.9,
  sangeet: 0.8,
  procession: 0.7,
  mehndi: 0.5,
  engagement: 0.5,
  dinner: 0.4,
  signing: 0.3,
  haldi: 0.3,
  tea: 0.25,
  puja: 0.25,
};

type Sizable = { kind?: string; vendorNeeds?: readonly string[]; offset?: number };

const needsOf = (c: Sizable): VendorNeedKey[] => (c.vendorNeeds ?? []).filter((k): k is VendorNeedKey => k in VENDOR_NEEDS);

/** The share of all guests a ceremony usually has, between 0.1 and 1. */
export function guestShare(c: Sizable): number {
  const needs = needsOf(c);
  let share = c.kind && c.kind in KIND_GUESTS ? KIND_GUESTS[c.kind as CeremonyKind] : needs.includes("venue") ? 0.8 : 0.4;
  // A gathering that books a hall and feeds people is never just the immediate family.
  if (needs.includes("venue") && needs.includes("catering")) share = Math.max(share, 0.6);
  // Rites held well before the wedding are for the close circle.
  if ((c.offset ?? 0) <= -14) share = Math.min(share, 0.5);
  return Math.max(0.1, Math.min(1, share));
}

/** How heavily each vendor need draws on a ceremony's budget, relative to the others. */
const NEED_WEIGHT: Record<VendorNeedKey, number> = {
  venue: 10,
  catering: 10,
  decor: 5,
  photography: 3,
  attire: 3,
  videography: 2,
  music: 2,
  live_band: 2,
  bar: 2,
  sound_lighting: 1.5,
  makeup_hair: 1.5,
  transport: 1.5,
  entertainment: 1.5,
  mehndi_artist: 1,
  officiant: 1,
  celebrant: 1,
  cake: 1,
  fireworks: 1,
  stationery: 0.5,
  childcare: 0.5,
  rentals: 2,
  gifting: 1,
  accommodation: 8,
  event_staff: 1,
  emcee: 0.5,
};

/** A ceremony's weight when the total budget is split across ceremonies. */
export function budgetWeight(c: Sizable): number {
  const sum = needsOf(c).reduce((s, k) => s + NEED_WEIGHT[k], 0);
  return Math.max(1, sum * (0.4 + 0.6 * guestShare(c)));
}

/** One vendor to find, with its starting share of the budget and the ceremonies it serves. */
export type Need = { key: VendorNeedKey; category: string; title: string; pct: number; ceremonyNames: string[] };

/**
 * The vendors a set of ceremonies calls for, in a steady order, each with a first
 * percentage of the budget: its weight across the ceremonies it serves, scaled by how
 * big each of those ceremonies is. The percentages add up to 100.
 */
export function needsFor(chosen: (Sizable & { name: string })[]): Need[] {
  const weight = new Map<VendorNeedKey, number>();
  const serves = new Map<VendorNeedKey, string[]>();
  for (const c of chosen) {
    const scale = guestShare(c);
    for (const k of new Set(needsOf(c))) {
      weight.set(k, (weight.get(k) ?? 0) + NEED_WEIGHT[k] * scale);
      const names = serves.get(k) ?? [];
      if (!names.includes(c.name)) names.push(c.name);
      serves.set(k, names);
    }
  }
  const keys = VENDOR_NEED_KEYS.filter((k) => weight.has(k));
  const total = keys.reduce((s, k) => s + weight.get(k)!, 0);
  if (!keys.length || total <= 0) return [];
  const pcts = keys.map((k) => Math.max(1, Math.round((100 * weight.get(k)!) / total)));
  const largest = pcts.indexOf(Math.max(...pcts));
  pcts[largest] += 100 - pcts.reduce((a, b) => a + b, 0);
  return keys.map((k, i) => ({ key: k, ...VENDOR_NEEDS[k], pct: pcts[i], ceremonyNames: serves.get(k)! }));
}

/** Every kind of vendor, for adding one by hand. */
export const ALL_NEEDS = VENDOR_NEED_KEYS.map((key) => ({ key, ...VENDOR_NEEDS[key] }));
