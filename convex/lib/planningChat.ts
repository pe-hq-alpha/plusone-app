import { NOUN } from "./occasion";
import { EMPTY_FACTS, type Facts } from "./wizard";
import type { EventType } from "./validators";

/**
 * The rules of the planning conversation. The model only reads what the host writes; these
 * rules decide what happens next: fix anything that can't be right, ask for what is
 * missing one thing at a time, then read back everything gathered for the host to confirm.
 * Nothing is built until every essential has been confirmed. No Convex imports, so the
 * page and the server agree, and it is all tested without a model.
 */

export const FIELDS = ["eventType", "host", "city", "date", "guests", "budget"] as const;
export type Field = (typeof FIELDS)[number];
/** Fields the host may answer with "not sure"; the plan then starts from a sensible figure. */
export const UNSURE_OK: readonly Field[] = ["guests", "budget"];

export type ChatState = { facts: Facts; confirmed: Field[]; unsure: Field[] };
export const EMPTY_CHAT: ChatState = { facts: EMPTY_FACTS, confirmed: [], unsure: [] };

export type Step =
  | { kind: "fix"; field: Field; problem: string }
  | { kind: "ask"; field: Field }
  | { kind: "confirm"; fields: Field[] }
  | { kind: "ready" };

const WORK: EventType[] = ["office_party", "team_offsite", "product_launch", "conference", "college_fest", "community_festival"];
const isWork = (t: EventType | null) => Boolean(t && WORK.includes(t));

export function has(f: Facts, field: Field): boolean {
  switch (field) {
    case "eventType":
      return Boolean(f.eventType);
    case "host":
      // What the event is called or whose it is: "Arjun and Meera's wedding", "Amma's 60th", a company's party.
      return Boolean(f.name.trim() || f.host.trim() || f.organisation.trim());
    case "city":
      return Boolean(f.city.trim());
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(f.date);
    case "guests":
      return f.guests != null;
    case "budget":
      return f.budget != null;
  }
}

/** The fields each kind of fact belongs to, so a change to one asks for it to be confirmed again. */
const FIELD_OF: Partial<Record<keyof Facts, Field>> = {
  eventType: "eventType",
  occasionLabel: "eventType",
  name: "host",
  host: "host",
  coHost: "host",
  organisation: "host",
  city: "city",
  area: "city",
  date: "date",
  endDate: "date",
  guests: "guests",
  budget: "budget",
  currency: "budget",
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const weekdayOf = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A figure per head below this is almost certainly a missing zero. */
const LOW_PER_HEAD: Record<string, number> = { INR: 100, USD: 3, GBP: 2, EUR: 3, AED: 10, SGD: 4, CAD: 4, AUD: 4 };

/**
 * What can't be right, and needs the host before going further: a date already gone, a
 * weekday that doesn't match the date, an end before the start, a budget that would be
 * a few rupees a head.
 */
export function problems(f: Facts, today: string, weekdaySaid?: string | null): { field: Field; problem: string }[] {
  const out: { field: Field; problem: string }[] = [];
  if (has(f, "date")) {
    if (f.date < today) out.push({ field: "date", problem: `${longDate(f.date)} has already passed.` });
    const said = weekdaySaid?.trim().toLowerCase();
    if (said && WEEKDAYS.includes(said) && weekdayOf(f.date) !== said) {
      out.push({ field: "date", problem: `${plainDate(f.date)} is a ${cap(weekdayOf(f.date))}, not a ${cap(said)}.` });
    }
    if (f.endDate && f.endDate < f.date) out.push({ field: "date", problem: "The last day is before the first." });
  }
  if (f.budget != null && f.guests) {
    const floor = LOW_PER_HEAD[f.currency] ?? 3;
    if (f.budget / f.guests < floor) {
      out.push({ field: "budget", problem: `${money(f.budget, f.currency)} for ${f.guests} people is about ${money(Math.round(f.budget / f.guests), f.currency)} each.` });
    }
  }
  return out;
}

/** What to do next: fix, then ask, then read everything back, then build. */
export function nextStep(s: ChatState, today: string, weekdaySaid?: string | null): Step {
  const issue = problems(s.facts, today, weekdaySaid)[0];
  if (issue) return { kind: "fix", ...issue };
  const gap = FIELDS.find((f) => !has(s.facts, f) && !s.unsure.includes(f));
  if (gap) return { kind: "ask", field: gap };
  const toConfirm = FIELDS.filter((f) => !s.confirmed.includes(f));
  if (toConfirm.length) return { kind: "confirm", fields: toConfirm };
  return { kind: "ready" };
}

/** The model's reading of one message, before it is trusted. */
export type Reading = {
  changes: Partial<Facts>;
  /** Fields the host said were right, from those just read back to them. */
  confirmed: Field[];
  /** Fields the host said were wrong without saying what is right. */
  wrong: Field[];
  /** Fields the host said they don't know yet. */
  unsure: Field[];
  /** The weekday the host named alongside a date, if any. */
  weekdaySaid: string | null;
};

/**
 * One message applied: changed facts are taken, and anything that changed must be
 * confirmed again; confirmations count only for what was just read back; "not sure"
 * counts only where a starting figure is fine.
 */
export function apply(s: ChatState, r: Reading, asked: Step): ChatState {
  const facts = { ...s.facts };
  const touched = new Set<Field>();
  for (const [key, value] of Object.entries(r.changes) as [keyof Facts, unknown][]) {
    if (value === undefined || !(key in facts)) continue;
    const before = JSON.stringify(facts[key]);
    (facts as Record<string, unknown>)[key] = value;
    const field = FIELD_OF[key];
    if (field && JSON.stringify(value) !== before) touched.add(field);
  }
  const readBack = asked.kind === "confirm" ? asked.fields : [];
  let confirmed = s.confirmed.filter((f) => !touched.has(f) && !r.wrong.includes(f));
  for (const f of r.confirmed) if (readBack.includes(f) && !touched.has(f) && !r.wrong.includes(f) && !confirmed.includes(f)) confirmed.push(f);
  for (const f of r.wrong) {
    // "That's wrong" with no new value: clear it and ask again.
    if (!touched.has(f)) clear(facts, f);
  }
  let unsure = s.unsure.filter((f) => !touched.has(f) && !has(facts, f));
  for (const f of r.unsure) if (UNSURE_OK.includes(f) && !has(facts, f) && !unsure.includes(f)) unsure.push(f);
  // A field answered "not sure" is confirmed as such: the plan will say what it started from.
  confirmed = [...confirmed, ...unsure.filter((f) => !confirmed.includes(f))];
  unsure = unsure.filter((f) => !has(facts, f));
  return { facts, confirmed, unsure };
}

function clear(f: Facts, field: Field) {
  if (field === "eventType") Object.assign(f, { eventType: null, occasionLabel: "" });
  if (field === "host") Object.assign(f, { host: "", coHost: "", organisation: "" });
  if (field === "city") Object.assign(f, { city: "", area: "" });
  if (field === "date") Object.assign(f, { date: "", endDate: "" });
  if (field === "guests") f.guests = null;
  if (field === "budget") f.budget = null;
}

// ---------------------------------------------------------------- what PlusOne says

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "23 January 2027". */
export function plainDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Saturday 23 January 2027". */
export function longDate(iso: string): string {
  return `${cap(weekdayOf(iso))} ${plainDate(iso)}`;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** Each fact as a line the host can check at a glance. */
export function line(f: Facts, field: Field, unsure: Field[]): string {
  switch (field) {
    case "eventType": {
      const noun = f.eventType ? NOUN[f.eventType] : "an event";
      const label = f.occasionLabel.trim();
      return label && label.toLowerCase() !== noun.toLowerCase() ? `${label} (${noun})` : cap(noun);
    }
    case "host":
      if (f.name.trim()) return `Called ${f.name.trim()}`;
      if (f.organisation.trim() && !f.host.trim()) return `Held by ${f.organisation.trim()}`;
      return `Hosted by ${[f.host.trim(), f.coHost.trim()].filter(Boolean).join(" and ")}${f.organisation.trim() ? ` for ${f.organisation.trim()}` : ""}`;
    case "city":
      return [f.area.trim(), f.city.trim()].filter(Boolean).join(", ");
    case "date":
      return f.endDate && f.endDate !== f.date ? `${longDate(f.date)} to ${longDate(f.endDate)}` : longDate(f.date);
    case "guests":
      return unsure.includes("guests") ? "Number of people not known yet" : `About ${f.guests} people`;
    case "budget":
      return unsure.includes("budget") ? "Budget not decided yet" : `A budget of ${money(f.budget ?? 0, f.currency)}`;
  }
}

const QUESTION: Record<Field, (f: Facts) => string> = {
  eventType: () => "What are you planning, and who is it for? A 60th birthday, a griha pravesam, an office party: in your own words.",
  host: (f) =>
    isWork(f.eventType)
      ? "What should we call it? Usually the company, team or college and the occasion, like the Acme Diwali party."
      : "What should we call it? Whose event is it, like Arjun and Meera's wedding or Amma's 60th.",
  city: () => "Which city is it in? The neighbourhood helps too, if you know it.",
  date: () => "When is it? A date if you have one, or the month if it isn't fixed yet.",
  guests: () => "Roughly how many people are you expecting? \"Not sure\" is fine.",
  budget: () => "Do you have a budget in mind? A rough figure is enough, or say \"not sure\".",
};

/** PlusOne's next message, from the step: a fix, a question, the read-back, or the go-ahead. */
export function say(step: Step, s: ChatState, note = ""): string {
  const lead = note.trim() ? `${note.trim()} ` : "";
  switch (step.kind) {
    case "fix":
      return `${lead}${step.problem} ${step.field === "date" ? "Which date did you mean?" : "Is that figure right?"}`;
    case "ask":
      return `${lead}${QUESTION[step.field](s.facts)}`;
    case "confirm":
      return `${lead}Let me check I have this right:\n${step.fields.map((f) => `• ${line(s.facts, f, s.unsure)}`).join("\n")}\nIs all of that correct? Tell me anything that's off.`;
    case "ready":
      return `${lead}That's everything I need. Here is the plan I'll set out; build it when you're happy, or tell me what to change.`;
  }
}

export const OPENING = "Hello. Tell me about the event you're planning: what it is, who it's for, where and when. Write it however it comes to you, and I'll ask about anything I still need.";
