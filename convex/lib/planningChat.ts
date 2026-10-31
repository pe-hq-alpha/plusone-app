import { NOUN } from "./occasion";
import { catalogueFor, traditionById, TRADITIONS, wantsSoundAndLighting, type CatalogueEvent, type Missed } from "./traditions";
import { EMPTY_FACTS, MAX_EVENTS, MAX_NEEDS, type Facts } from "./wizard";
import type { EventType } from "./validators";
import { VENDOR_NEEDS, type VendorNeedKey } from "./vocab";

/**
 * The rules of the planning conversation. The model only reads what the host writes; these
 * rules decide what happens next: fix anything that can't be right, ask for what is
 * missing one thing at a time, then read back everything gathered for the host to confirm.
 * Nothing is built until every essential has been confirmed. No Convex imports, so the
 * page and the server agree, and it is all tested without a model.
 */

/** What is asked for, in order. "events" is the events of the day, read back with everything else. */
export const FIELDS = ["eventType", "host", "city", "date", "guests", "budget", "events"] as const;
export type Field = (typeof FIELDS)[number];
/** Fields asked as plain questions; the events of the day are chosen from suggestions instead. */
const ASKED: Field[] = ["eventType", "host", "city", "date", "guests", "budget"];
/** Fields the host may answer with "not sure"; the plan then starts from a sensible figure. */
export const UNSURE_OK: readonly Field[] = ["guests", "budget"];

/** The suggestion stages: a wedding's style, the events of the day, their timings, and what is often missed. */
export type Slot = "tradition" | "events" | "timings" | "missed";

/** One suggestion to tick. An event or a vendor need carries what it adds to the plan. */
export type Option = {
  id: string;
  label: string;
  detail?: string;
  /** Ticked when offered. */
  on?: boolean;
  /** Muse Spark's suggestion rather than a checked one. */
  suggested?: boolean;
  event?: { name: string; offset: number; startTime: string; guestShare: number; kind?: string; needs: VendorNeedKey[] };
  need?: { category: string; title: string };
};

export type ChatState = {
  facts: Facts;
  confirmed: Field[];
  unsure: Field[];
  /** Suggestion stages already answered, so none is asked twice. */
  done?: Slot[];
  /** Events of the day Muse Spark suggested for this event, offered beside the checked ones. */
  proposed?: { name: string; offset: number; startTime: string; why: string }[];
};
export const EMPTY_CHAT: ChatState = { facts: EMPTY_FACTS, confirmed: [], unsure: [], done: [], proposed: [] };

export type Step =
  | { kind: "fix"; field: Field; problem: string }
  | { kind: "ask"; field: Field }
  | { kind: "choose"; slot: Slot; options: Option[]; multi: boolean }
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
    case "events":
      return f.sessions.length > 0;
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
  sessions: "events",
  needs: "events",
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

/**
 * What to do next, like a good planner: fix anything that can't be right; learn what it is;
 * for a wedding, its style; then the events of the day to pick from, and when each one is;
 * then the rest one thing at a time; what is often missed; then read everything back.
 */
export function nextStep(s: ChatState, today: string, weekdaySaid?: string | null): Step {
  const issue = problems(s.facts, today, weekdaySaid)[0];
  if (issue) return { kind: "fix", ...issue };
  const f = s.facts;
  const done = s.done ?? [];
  if (!has(f, "eventType")) return { kind: "ask", field: "eventType" };
  if (f.eventType === "wedding" && !f.tradition && !done.includes("tradition")) {
    return { kind: "choose", slot: "tradition", multi: false, options: traditionOptions() };
  }
  if (!done.includes("events")) {
    const options = eventOptions(s);
    if (options.length) return { kind: "choose", slot: "events", multi: true, options };
    if (!f.sessions.length) return { kind: "ask", field: "events" };
  }
  if (f.sessions.length && !done.includes("timings")) {
    return { kind: "choose", slot: "timings", multi: false, options: [{ id: "ok", label: "These look right" }] };
  }
  const gap = ASKED.find((x) => !has(f, x) && !s.unsure.includes(x));
  if (gap) return { kind: "ask", field: gap };
  if (!done.includes("missed")) {
    const options = missedOptions(s);
    if (options.length) return { kind: "choose", slot: "missed", multi: true, options: [...options, { id: "none", label: "None of these" }] };
  }
  const toConfirm = FIELDS.filter((x) => !s.confirmed.includes(x) && (x !== "events" || has(f, "events")));
  if (toConfirm.length) return { kind: "confirm", fields: toConfirm };
  return { kind: "ready" };
}

// ---------------------------------------------------------------- suggestions

const NONE_STYLE = "none";
const MIXED_STYLE = "mix";
const OTHER_STYLE = "other";

function traditionOptions(): Option[] {
  return [
    ...TRADITIONS.map((t) => ({ id: t.id, label: t.label })),
    { id: NONE_STYLE, label: "None in particular" },
    { id: MIXED_STYLE, label: "A mix of two" },
    { id: OTHER_STYLE, label: "Something else" },
  ];
}

/** A wedding with no particular style: the ceremonies most weddings hold, to pick from. */
const GENERAL_WEDDING: CatalogueEvent[] = [
  { key: "engagement", name: "Engagement", offset: -1, startTime: "18:00", guestShare: 0.6, needs: ["decor", "catering", "photography"], significance: "", kind: "engagement", isDefault: false },
  { key: "haldi", name: "Haldi", offset: -1, startTime: "10:00", guestShare: 0.4, needs: ["decor", "photography"], significance: "", kind: "haldi", isDefault: false },
  { key: "mehndi", name: "Mehndi", offset: -1, startTime: "15:00", guestShare: 0.5, needs: ["mehndi_artist", "decor", "music"], significance: "", kind: "mehndi", isDefault: false },
  { key: "sangeet", name: "Sangeet", offset: -1, startTime: "19:30", guestShare: 0.8, needs: ["music", "sound_lighting", "decor", "catering"], significance: "", kind: "sangeet", isDefault: false },
  { key: "ceremony", name: "Wedding ceremony", offset: 0, startTime: "10:00", guestShare: 1, needs: ["venue", "officiant", "decor", "catering", "photography", "videography", "makeup_hair"], significance: "", isDefault: true },
  { key: "reception", name: "Reception", offset: 0, startTime: "19:00", guestShare: 1, needs: ["venue", "catering", "decor", "photography", "sound_lighting"], significance: "", kind: "reception", isDefault: true },
];

const toOption = (e: CatalogueEvent, on: boolean): Option => ({
  id: `c:${e.key}`,
  label: e.name,
  ...(e.significance ? { detail: e.significance } : {}),
  on,
  event: { name: e.name, offset: e.offset, startTime: e.startTime, guestShare: e.guestShare, ...(e.kind ? { kind: e.kind } : {}), needs: e.needs },
});

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The events of the day to pick from: the checked list for this kind of event or wedding
 * style, any the host named themselves (ticked), and Muse Spark's suggestions, marked.
 */
export function eventOptions(s: ChatState): Option[] {
  const f = s.facts;
  if (!f.eventType) return [];
  const style = f.tradition;
  const checked = f.eventType === "wedding" ? (style === NONE_STYLE ? GENERAL_WEDDING : catalogueFor("wedding", style)) : catalogueFor(f.eventType);
  const named = (e: CatalogueEvent) => f.sessions.some((x) => same(x.name, e.name) || (e.aka ?? []).some((a) => same(x.name, a)));
  const out: Option[] = checked.map((e) => toOption(e, f.sessions.length ? named(e) : e.isDefault));
  for (const [i, x] of f.sessions.entries()) {
    if (checked.some((e) => same(x.name, e.name) || (e.aka ?? []).some((a) => same(x.name, a)))) continue;
    out.push({ id: `h:${i}`, label: x.name, on: true, event: { name: x.name, offset: x.day ?? 0, startTime: x.startTime, guestShare: 1, ...(x.kind ? { kind: x.kind } : {}), needs: [] } });
  }
  for (const [i, p] of (s.proposed ?? []).entries()) {
    if (out.some((o) => same(o.label, p.name))) continue;
    out.push({ id: `p:${i}`, label: p.name, detail: p.why, suggested: true, on: false, event: { name: p.name, offset: p.offset, startTime: p.startTime, guestShare: 1, needs: [] } });
  }
  return out.slice(0, 16);
}

/** Often forgotten for this kind of event, and not in the plan yet. */
const GENERAL_MISSED: Missed[] = [
  { title: "Photographer", need: "photography", why: "Someone to keep the day" },
  { title: "Return gifts", need: "gifting", why: "For every family that comes" },
  { title: "Sound and lighting", need: "sound_lighting", why: "For anything in the evening" },
  { title: "Transport for elders", need: "transport", why: "To and from the venue" },
  { title: "Decor", need: "decor", why: "Flowers and the stage or backdrop" },
];

export function missedOptions(s: ChatState): Option[] {
  const f = s.facts;
  const list = [...(traditionById(f.tradition)?.oftenMissed ?? []), ...GENERAL_MISSED];
  const out: Option[] = [];
  for (const m of list) {
    const category = VENDOR_NEEDS[m.need].category;
    const title = m.title;
    if (f.needs.some((n) => same(n.title, title) || (n.category === category && m.need !== "officiant" && m.need !== "live_band"))) continue;
    if (out.some((o) => same(o.label, title))) continue;
    out.push({ id: `m:${out.length}`, label: title, detail: m.why, on: false, need: { category, title } });
  }
  return out.slice(0, 6);
}

/**
 * A tap on the suggestions, applied without reading anything: the style chosen, the
 * events of the day ticked (each on its usual day, with its usual time and vendors), the
 * timings agreed, or what was missed added. Only offered options count.
 */
export function applyPick(s: ChatState, step: Step, ids: string[], other = ""): ChatState {
  if (step.kind !== "choose") return s;
  const chosen = step.options.filter((o) => ids.includes(o.id));
  const done = [...new Set([...(s.done ?? []), step.slot])];
  const facts: Facts = { ...s.facts };
  const extra = other.trim().slice(0, 200);
  let confirmed = s.confirmed;
  if (step.slot === "tradition") {
    const pick = chosen[0];
    facts.tradition = pick ? (pick.id === OTHER_STYLE && extra ? extra : pick.id) : extra || NONE_STYLE;
    // A new style changes what's offered, so the events are chosen again.
    return { ...s, facts, done: done.filter((d) => d !== "events" && d !== "timings"), proposed: [] };
  }
  if (step.slot === "events") {
    const events = chosen.flatMap((o) => (o.event ? [o.event] : []));
    for (const name of extra.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean)) events.push({ name: name.slice(0, 80), offset: 0, startTime: "", guestShare: 1, needs: [] });
    const first = events.length ? Math.min(...events.map((e) => e.offset)) : 0;
    const guests = facts.guests;
    facts.sessions = events.slice(0, MAX_EVENTS).map((e) => ({
      name: e.name,
      startTime: e.startTime,
      guests: guests ? Math.max(1, Math.round(guests * e.guestShare)) : null,
      day: e.offset - first,
      ...(e.kind ? { kind: e.kind } : {}),
    }));
    facts.needs = needsFor(events, facts.needs);
    confirmed = confirmed.filter((c) => c !== "events");
    return { ...s, facts, confirmed, done: done.filter((d) => d !== "timings") };
  }
  if (step.slot === "missed") {
    const add = chosen.flatMap((o) => (o.need ? [o.need] : []));
    for (const title of extra.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean)) add.push({ category: "Event staff", title: title.slice(0, 60) });
    facts.needs = [...facts.needs, ...add.map((n) => ({ category: n.category, title: n.title }))].slice(0, MAX_NEEDS);
    return { ...s, facts, done, confirmed: confirmed.filter((c) => c !== "events") };
  }
  return { ...s, facts, done };
}

/**
 * The vendors the chosen events call for: each need once, serving the events that need it;
 * evening events add sound and lighting; needs the host named themselves are kept.
 */
export function needsFor(events: { name: string; startTime: string; kind?: string; needs: VendorNeedKey[] }[], own: Facts["needs"]): Facts["needs"] {
  const by = new Map<VendorNeedKey, string[]>();
  for (const e of events) {
    const keys = new Set<VendorNeedKey>(e.needs);
    if (wantsSoundAndLighting({ kind: e.kind as never, startTime: e.startTime })) keys.add("sound_lighting");
    for (const k of keys) by.set(k, [...(by.get(k) ?? []), e.name]);
  }
  const out: Facts["needs"] = [];
  for (const [k, parts] of by) {
    const { category, title } = VENDOR_NEEDS[k];
    out.push({ category, title, ...(parts.length < events.length ? { parts } : {}) });
  }
  for (const n of own) if (!out.some((o) => same(o.title, n.title) || (o.category === n.category && !n.parts))) out.push(n);
  return out.slice(0, MAX_NEEDS);
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
  return { ...s, facts, confirmed, unsure };
}

function clear(f: Facts, field: Field) {
  if (field === "eventType") Object.assign(f, { eventType: null, occasionLabel: "" });
  if (field === "host") Object.assign(f, { host: "", coHost: "", organisation: "" });
  if (field === "city") Object.assign(f, { city: "", area: "" });
  if (field === "date") Object.assign(f, { date: "", endDate: "" });
  if (field === "guests") f.guests = null;
  if (field === "budget") f.budget = null;
  if (field === "events") Object.assign(f, { sessions: [] });
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
    case "events":
      return eventLines(f).join("\n• ");
  }
}

/** "7:30 am", "6 pm". */
export function clock(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return "";
  const h = Number(m[1]);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m[2] === "00" ? `${h12} ${suffix}` : `${h12}:${m[2]} ${suffix}`;
}

/** The events of the day, one line per day: "Fri 12 Feb: Nichayathartham 6:30 pm, Reception 7:30 pm". */
export function eventLines(f: Facts): string[] {
  const byDay = new Map<number, Facts["sessions"]>();
  for (const x of f.sessions) byDay.set(x.day ?? 0, [...(byDay.get(x.day ?? 0) ?? []), x]);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  return days.map((d) => {
    const label = /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? shortDay(addDaysIso(f.date, d)) : days.length > 1 ? `Day ${d + 1}` : "On the day";
    const list = [...(byDay.get(d) ?? [])].sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99"));
    return `${label}: ${list.map((x) => [x.name, clock(x.startTime), x.guests ? `${x.guests} guests` : ""].filter(Boolean).join(" ")).join(", ")}`;
  });
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${cap(weekdayOf(iso)).slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

/** What a kind of event calls its events of the day. */
export const eventsWord = (t: EventType | null) => (t === "wedding" ? "ceremonies" : isWork(t) ? "sessions" : "events of the day");

const QUESTION: Record<Field, (f: Facts) => string> = {
  eventType: () => "What are you planning, and who is it for? A 60th birthday, a griha pravesam, an office party: in your own words.",
  host: (f) =>
    isWork(f.eventType)
      ? "What should we call it? Usually the company, team or college and the occasion, like the Acme Diwali party."
      : "What should we call it? Whose event is it, like Arjun and Meera's wedding or Amma's 60th.",
  city: () => "Which city is it in? The neighbourhood helps too, if you know it.",
  date: (f) =>
    f.sessions.some((x) => (x.day ?? 0) > 0)
      ? "What's the date of the first day? A date if you have one, or the month if it isn't fixed yet."
      : "When is it? A date if you have one, or the month if it isn't fixed yet.",
  guests: () => "Roughly how many people are you expecting? \"Not sure\" is fine.",
  budget: () => "Do you have a budget in mind? A rough figure is enough, or say \"not sure\".",
  events: (f) =>
    f.eventType === "wedding"
      ? "Which ceremonies are you having, and on which days? In your own words, like a mehndi the evening before and the wedding the next morning."
      : `What will happen on the day? Name the ${eventsWord(f.eventType)}, like a pooja in the morning and lunch after.`,
};

/** What PlusOne asks at each suggestion stage; the options themselves show as choices to tap. */
function choose(step: Extract<Step, { kind: "choose" }>, s: ChatState): string {
  const f = s.facts;
  const word = eventsWord(f.eventType);
  switch (step.slot) {
    case "tradition":
      return "Which traditions will the wedding follow? It tells me which ceremonies to suggest. Pick one below, or tell me in your own words.";
    case "events": {
      const style = traditionById(f.tradition)?.label;
      return `${style ? `These are the ${word} a ${style} wedding usually has.` : `These are the ${word} this kind of event usually has.`} Tick the ones you're having, and add any of your own.`;
    }
    case "timings":
      return `Here's when each one usually happens. Change anything in the plan beside us, or tell me:\n• ${eventLines(f).join("\n• ")}\nDo these look right?`;
    case "missed":
      return "Before I set it out: have you thought about any of these? Tick what you'd like me to add.";
  }
}

/** PlusOne's next message, from the step: a fix, a question, the read-back, or the go-ahead. */
export function say(step: Step, s: ChatState, note = ""): string {
  const lead = note.trim() ? `${note.trim()} ` : "";
  switch (step.kind) {
    case "fix":
      return `${lead}${step.problem} ${step.field === "date" ? "Which date did you mean?" : "Is that figure right?"}`;
    case "ask":
      return `${lead}${QUESTION[step.field](s.facts)}`;
    case "choose":
      return `${lead}${choose(step, s)}`;
    case "confirm":
      return `${lead}Let me check I have this right:\n${step.fields.map((f) => `• ${line(s.facts, f, s.unsure)}`).join("\n")}\nIs all of that correct? Tell me anything that's off.`;
    case "ready":
      return `${lead}That's everything I need. Here is the plan I'll set out; build it when you're happy, or tell me what to change.`;
  }
}

export const OPENING =
  "Hello. Tell me what you're planning, however it comes to you. I'll ask about the details, like the events of each day, their times and guests, and show you the plan as we go.";
