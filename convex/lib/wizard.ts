import { DEFAULT_BUDGET, TYPE_SESSIONS, TYPE_SLOTS } from "./templates";
import type { EventType } from "./validators";

/**
 * The rules behind "describe your event in a sentence": what a reading of the
 * description must contain before a plan can be built, what is filled in when the
 * host didn't say, and how the result becomes an event. No Convex imports, so the
 * page and the server agree.
 */

export type Facts = {
  eventType: EventType | null;
  occasionLabel: string;
  name: string;
  host: string;
  coHost: string;
  organisation: string;
  city: string;
  area: string;
  /** YYYY-MM-DD, or "" when not fixed yet. */
  date: string;
  /** For events over more than one day; "" otherwise. */
  endDate: string;
  guests: number | null;
  budget: number | null;
  currency: string;
  sessions: { name: string; startTime: string; guests: number | null }[];
  /** Each vendor need in the family's words, and the parts (by name) it serves; no parts means all of them. */
  needs: { category: string; title: string; parts?: string[] }[];
  notes: string;
};

export const EMPTY_FACTS: Facts = {
  eventType: null,
  occasionLabel: "",
  name: "",
  host: "",
  coHost: "",
  organisation: "",
  city: "",
  area: "",
  date: "",
  endDate: "",
  guests: null,
  budget: null,
  currency: "INR",
  sessions: [],
  needs: [],
  notes: "",
};

/** What must be known before building; everything else has a sensible default. */
export type Required = "eventType" | "city" | "date" | "host";

export function missing(f: Facts): Required[] {
  const out: Required[] = [];
  if (!f.eventType) out.push("eventType");
  if (!f.name.trim() && !f.host.trim() && !f.organisation.trim()) out.push("host");
  if (!f.city.trim()) out.push("city");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) out.push("date");
  return out;
}

/** A rough rupee figure for the default budgets, which are kept in dollars. Shown as an assumption. */
const ROUGH_RATE: Record<string, number> = { USD: 1, INR: 84, GBP: 0.79, EUR: 0.92, AED: 3.67, SGD: 1.35, CAD: 1.37, AUD: 1.52 };

/** A budget rounded the way people say it: to the nearest 10,000 rupees or 500 dollars. */
function roundBudget(amount: number, currency: string): number {
  const step = currency === "INR" ? 10_000 : 500;
  return Math.max(step, Math.round(amount / step) * step);
}

/**
 * The facts with every gap filled, and a plain list of what was assumed, so the summary
 * can say "We assumed …" beside each one.
 */
export function withDefaults(f: Facts): { facts: Facts; assumed: string[] } {
  const type = f.eventType ?? "party";
  const assumed: string[] = [];
  const typeSessions = TYPE_SESSIONS[type];
  const typical = typeSessions.reduce((m, s) => Math.max(m, s.guestCount), 0) || 50;
  const guests = f.guests ?? f.sessions.find((s) => s.guests)?.guests ?? typical;
  if (f.guests == null) assumed.push(`about ${guests} people`);
  const currency = f.currency || "INR";
  let budget = f.budget;
  if (budget == null) {
    budget = roundBudget(DEFAULT_BUDGET[type] * (ROUGH_RATE[currency] ?? 1), currency);
    assumed.push("a starting budget you can change");
  }
  const sessions = f.sessions.length
    ? f.sessions
    : typeSessions.map((s) => ({ name: s.name, startTime: "", guests: s.guestCount }));
  if (!f.sessions.length && sessions.length > 1) assumed.push(`${sessions.length} parts: ${sessions.map((s) => s.name).join(" and ")}`);
  const needs = f.needs.length ? f.needs : TYPE_SLOTS[type].map((s) => ({ category: s.category, title: s.title, parts: s.sessionNames }));
  if (!f.needs.length && needs.length) assumed.push("the vendors this kind of event usually needs");
  const name = f.name.trim() || f.occasionLabel.trim() || defaultName(f, type);
  return { facts: { ...f, eventType: type, guests, budget, currency, sessions, needs, name }, assumed };
}

function defaultName(f: Facts, type: EventType): string {
  const who = f.organisation.trim() || f.host.trim();
  const what: Record<EventType, string> = {
    birthday: "birthday",
    housewarming: "housewarming",
    naming_ceremony: "naming ceremony",
    pooja: "pooja",
    baby_shower: "baby shower",
    anniversary: "anniversary",
    engagement: "engagement",
    graduation: "graduation party",
    office_party: "office party",
    team_offsite: "team offsite",
    product_launch: "product launch",
    conference: "conference",
    college_fest: "college fest",
    community_festival: "festival",
    party: "event",
    wedding: "wedding",
  };
  return who ? `${who}'s ${what[type]}` : `Our ${what[type]}`;
}

/** Whole days between two dates, 0 when either is missing. */
function daySpan(start: string, end: string): number {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000));
}

/** The arguments `events.create` takes, from complete facts. */
export function toCreateArgs(f: Facts, place: { country?: string } = {}) {
  const type = f.eventType ?? "party";
  const span = Math.min(daySpan(f.date, f.endDate), 6);
  const endDate = span > 0 ? f.endDate : f.date;
  const sessions = f.sessions.slice(0, 12);
  const weights = sessions.map((s) => s.guests ?? f.guests ?? 1);
  return {
    name: f.name.trim().slice(0, 120),
    host: f.host.trim().slice(0, 80) || f.organisation.trim().slice(0, 80),
    coHost: f.coHost.trim().slice(0, 80),
    startDate: f.date,
    endDate,
    city: f.city.trim().slice(0, 80),
    area: f.area.trim().slice(0, 80) || undefined,
    country: place.country,
    currency: f.currency || "INR",
    totalBudget: f.budget ?? 0,
    eventType: type,
    occasionLabel: f.occasionLabel.trim().slice(0, 80) || undefined,
    organisation: f.organisation.trim().slice(0, 120) || undefined,
    guestEstimate: f.guests ?? undefined,
    helpNotes: f.notes.trim().slice(0, 1000) || undefined,
    sessions: sessions.length
      ? sessions.map((s, i) => ({
          name: s.name.trim().slice(0, 80) || "The event",
          // Multi-day events spread their parts across the days, in order.
          date: span > 0 ? addDays(f.date, Math.min(span, Math.round((i * span) / Math.max(1, sessions.length - 1)))) : f.date,
          guestCount: Math.max(0, Math.floor(s.guests ?? f.guests ?? 0)),
          budget: weights[i],
        }))
      : undefined,
    needs: f.needs.length
      ? f.needs.slice(0, 20).map((n) => ({
          category: n.category,
          title: n.title,
          booked: false,
          ...(n.parts?.length ? { sessionNames: n.parts.map((p) => p.trim().slice(0, 80) || "The event") } : {}),
        }))
      : undefined,
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Model output, made safe: unknown types dropped, sizes clamped, nothing invented filled in. */
export function clampReading(raw: Partial<Facts>, known: { types: readonly string[]; categories: readonly string[] }): Facts {
  const str = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : null);
  const iso = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");
  const type = typeof raw.eventType === "string" && known.types.includes(raw.eventType) ? (raw.eventType as EventType) : null;
  return {
    eventType: type,
    occasionLabel: str(raw.occasionLabel, 80),
    name: str(raw.name, 120),
    host: str(raw.host, 80),
    coHost: str(raw.coHost, 80),
    organisation: str(raw.organisation, 120),
    city: str(raw.city, 80),
    area: str(raw.area, 80),
    date: iso(raw.date),
    endDate: iso(raw.endDate),
    guests: num(raw.guests),
    budget: num(raw.budget),
    currency: /^[A-Z]{3}$/.test(str(raw.currency, 3)) ? str(raw.currency, 3) : "INR",
    sessions: (Array.isArray(raw.sessions) ? raw.sessions : []).slice(0, 8).map((s) => ({
      name: str(s?.name, 80),
      startTime: /^\d{2}:\d{2}$/.test(str(s?.startTime, 5)) ? str(s?.startTime, 5) : "",
      guests: num(s?.guests),
    })).filter((s) => s.name),
    needs: (Array.isArray(raw.needs) ? raw.needs : [])
      .filter((n) => known.categories.includes(n?.category))
      .slice(0, 14)
      .map((n) => {
        const parts = (Array.isArray(n.parts) ? n.parts : []).map((p) => str(p, 80)).filter(Boolean).slice(0, 8);
        return { category: n.category, title: str(n.title, 60) || n.category, ...(parts.length ? { parts } : {}) };
      }),
    notes: str(raw.notes, 600),
  };
}
