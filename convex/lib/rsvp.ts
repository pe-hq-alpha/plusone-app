import { dayDate } from "./text";

/**
 * A guest's answer for each ceremony, whichever way it arrived: their own RSVP link, a
 * reply to the invitation email, or the couple setting it by hand. The overall answer and
 * head count are always worked out from these, so the link and the email can't disagree.
 *
 * No Convex imports: the Guests page reads answers exactly as the server does.
 */

export type RsvpSource = "link" | "email" | "couple";
export type Overall = "pending" | "yes" | "no" | "maybe";
export type SessionAnswer<E extends string = string> = {
  sessionId: E;
  coming: boolean;
  count: number;
  source?: RsvpSource;
  at?: number;
};

/** The parts of a guest these rules read. */
export type AnswerGuest<E extends string = string> = {
  sessionIds: E[];
  sessionRsvps?: SessionAnswer<E>[];
  rsvp: Overall;
  attendingCount: number;
  partySize: number;
};

/** What one reply says about the ceremonies. */
export type Reply<E extends string = string> =
  /** Clear answers for these ceremonies; the others stay as they were. */
  | { kind: "each"; answers: { sessionId: E; coming: boolean; count: number }[] }
  /** One clear answer for every ceremony: "we can't come after all", or the couple's "all coming". */
  | { kind: "all"; coming: boolean; count: number }
  /** A yes that names no ceremony: it fills the ones not answered yet and never overwrites one. */
  | { kind: "vagueYes"; count: number }
  /** The couple taking an answer back. */
  | { kind: "clear"; sessionIds: E[] };

/** How many are coming to one ceremony: at least one, at most their party. */
export function headCount(count: number, partySize: number): number {
  const cap = Math.max(1, Math.min(20, Math.floor(partySize) || 1));
  return Math.max(1, Math.min(cap, Math.round(Number.isFinite(count) ? count : cap) || 1));
}

/**
 * Their answer for each ceremony they're still invited to. Someone who answered before
 * ceremonies had answers of their own has their one answer stand for every ceremony.
 */
export function answersOf<E extends string>(guest: AnswerGuest<E>): SessionAnswer<E>[] {
  const invited = new Set(guest.sessionIds);
  if (guest.sessionRsvps) return guest.sessionRsvps.filter((a) => invited.has(a.sessionId));
  if (guest.rsvp !== "yes" && guest.rsvp !== "no") return [];
  const coming = guest.rsvp === "yes";
  return [...invited].map((sessionId) => ({
    sessionId,
    coming,
    count: coming ? headCount(guest.attendingCount || guest.partySize, guest.partySize) : 0,
  }));
}

/**
 * One reply laid over what they said before, ceremony by ceremony. A clear answer replaces
 * the older one; a vague yes only fills ceremonies with no answer yet, unless they had said
 * no to everything, when the yes is a change of mind; "can't come at all" is no to each.
 */
export function mergeAnswers<E extends string>(
  guest: AnswerGuest<E>,
  reply: Reply<E>,
  source: RsvpSource,
  at: number,
): SessionAnswer<E>[] {
  const invited = [...new Set(guest.sessionIds)];
  const isInvited = new Set(invited);
  const byId = new Map(answersOf(guest).map((a) => [a.sessionId, a] as const));
  const put = (sessionId: E, coming: boolean, count: number) =>
    byId.set(sessionId, { sessionId, coming, count: coming ? headCount(count, guest.partySize) : 0, source, at });
  switch (reply.kind) {
    case "each":
      for (const a of reply.answers) if (isInvited.has(a.sessionId)) put(a.sessionId, a.coming, a.count);
      break;
    case "all":
      for (const id of invited) put(id, reply.coming, reply.count);
      break;
    case "vagueYes":
      for (const id of invited) if (!byId.has(id)) put(id, true, reply.count);
      if (![...byId.values()].some((a) => a.coming)) for (const id of invited) put(id, true, reply.count);
      break;
    case "clear":
      for (const id of reply.sessionIds) byId.delete(id);
      break;
  }
  return invited.flatMap((id) => byId.get(id) ?? []);
}

/**
 * The overall answer, from the ceremonies: yes when they're coming to any, no once they've
 * said no to every one, otherwise still to come (or maybe, when that's what they said).
 */
export function overallFrom<E extends string>(
  sessionIds: E[],
  answers: SessionAnswer<E>[],
  undecided: "pending" | "maybe",
): { rsvp: Overall; attendingCount: number } {
  const invited = new Set(sessionIds);
  const mine = answers.filter((a) => invited.has(a.sessionId));
  const coming = mine.filter((a) => a.coming);
  if (coming.length) return { rsvp: "yes", attendingCount: Math.max(...coming.map((a) => a.count)) };
  if (invited.size > 0 && new Set(mine.map((a) => a.sessionId)).size >= invited.size) return { rsvp: "no", attendingCount: 0 };
  return { rsvp: undecided, attendingCount: 0 };
}

/**
 * Everything one reply changes: the answers to store and the overall answer that follows
 * from them. A guest invited to no ceremony in particular keeps a plain yes or no.
 */
export function settle<E extends string>(
  guest: AnswerGuest<E>,
  reply: Reply<E> | null,
  source: RsvpSource,
  at: number,
  undecided: "pending" | "maybe" = "pending",
): { sessionRsvps: SessionAnswer<E>[]; rsvp: Overall; attendingCount: number } {
  if (guest.sessionIds.length === 0) {
    const count = reply?.kind === "vagueYes" || (reply?.kind === "all" && reply.coming) ? reply.count : null;
    if (count !== null) return { sessionRsvps: [], rsvp: "yes", attendingCount: headCount(count, guest.partySize) };
    return { sessionRsvps: [], rsvp: reply?.kind === "all" ? "no" : undecided, attendingCount: 0 };
  }
  const sessionRsvps = reply ? mergeAnswers(guest, reply, source, at) : answersOf(guest);
  return { sessionRsvps, ...overallFrom(guest.sessionIds, sessionRsvps, undecided) };
}

/** "coming to 3 of 4 (2 people)", "can't make it": what the history says they answered. */
export function answerSummary(sessionIds: string[], answers: SessionAnswer[], rsvp: Overall, attendingCount: number): string {
  const n = new Set(sessionIds).size;
  const people = attendingCount > 1 ? ` (${attendingCount} people)` : "";
  if (rsvp === "no") return "can't make it";
  if (rsvp === "yes") {
    const yes = answers.filter((a) => a.coming).length;
    return n > 1 ? `coming to ${yes} of ${n}${people}` : `coming${people}`;
  }
  const no = answers.filter((a) => !a.coming).length;
  if (no > 0) return `can't make ${no} of ${n}, not sure about the rest`;
  return rsvp === "maybe" ? "maybe" : "no answer yet";
}

/** One line of the invitation and of the list a reply is read against: "Nalangu, Fri 4 Dec 2026". */
export function ceremonyLine(e: { name: string; date: string }): string {
  return `${e.name}, ${dayDate(e.date)}`;
}

/**
 * The ceremonies a reply talks about, matched back to the ones this guest is invited to:
 * by the line as listed, then by name, then by a name that contains the other. A name
 * that could be two ceremonies, or none of theirs, is left out rather than guessed.
 */
export function matchCeremonies<E extends string>(
  invited: { _id: E; name: string; date: string }[],
  said: { ceremony: string; coming: boolean | null; count: number }[],
): { sessionId: E; coming: boolean | null; count: number }[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ");
  const only = (list: typeof invited) => (list.length === 1 ? list[0] : undefined);
  const out = new Map<E, { sessionId: E; coming: boolean | null; count: number }>();
  for (const s of said) {
    const want = norm(s.ceremony);
    if (!want) continue;
    const session =
      only(invited.filter((e) => norm(ceremonyLine(e)) === want)) ??
      only(invited.filter((e) => norm(e.name) === want)) ??
      only(invited.filter((e) => want.includes(norm(e.name)) || norm(e.name).includes(want)));
    if (session && !out.has(session._id)) out.set(session._id, { sessionId: session._id, coming: s.coming, count: s.count });
  }
  return [...out.values()];
}

/**
 * What an emailed reply means for the ceremonies. Named ceremonies are clear answers; a
 * yes naming none is vague; a no naming none is no to every one. Maybe, or nothing about
 * coming at all, changes no ceremony.
 */
export function replyFromEmail<E extends string>(parsed: {
  rsvp: Overall;
  attendingCount: number;
  ceremonies: { sessionId: E; coming: boolean | null; count: number }[];
  namedCeremonies: boolean;
}): Reply<E> | null {
  const said = parsed.ceremonies.filter((c): c is { sessionId: E; coming: boolean; count: number } => c.coming !== null);
  if (parsed.namedCeremonies && said.length > 0) {
    return { kind: "each", answers: said.map((c) => ({ ...c, count: c.count || parsed.attendingCount })) };
  }
  if (parsed.rsvp === "yes") return { kind: "vagueYes", count: parsed.attendingCount };
  if (parsed.rsvp === "no") return { kind: "all", coming: false, count: 0 };
  return null;
}

// ---- food, for the caterer ------------------------------------------------------

export type FoodGuest<E extends string = string> = AnswerGuest<E> & { name: string; dietary?: string; allergies?: string[] };

/**
 * Who a caterer cooks for: everyone invited to that ceremony who hasn't said no to it,
 * or, for the whole wedding, everyone who hasn't said no.
 */
export function eatingAt<E extends string, G extends FoodGuest<E>>(guests: G[], sessionId?: E): G[] {
  return guests.filter((g) => {
    if (sessionId === undefined) return g.rsvp !== "no";
    if (!g.sessionIds.includes(sessionId)) return false;
    return answersOf(g).find((a) => a.sessionId === sessionId)?.coming !== false;
  });
}

export type FoodNeeds = {
  allergens: { name: string; count: number; severe: number; who: string[] }[];
  prefs: { name: string; count: number; who: string[] }[];
};

/** Allergens with how many guests have each and how many severely, then preferences. */
export function foodNeeds(guests: { name: string; dietary?: string; allergies?: string[] }[]): FoodNeeds {
  const allergens = new Map<string, FoodNeeds["allergens"][number]>();
  const prefs = new Map<string, FoodNeeds["prefs"][number]>();
  for (const g of guests) {
    for (const a of g.allergies ?? []) {
      const [name, ...rest] = a.split(",");
      const key = name.replace(/\(.*\)/, "").trim().toLowerCase();
      if (!key) continue;
      const entry = allergens.get(key) ?? { name: key, count: 0, severe: 0, who: [] };
      entry.count += 1;
      if (rest.join(",").includes("severe")) entry.severe += 1;
      entry.who.push(g.name);
      allergens.set(key, entry);
    }
    const d = g.dietary?.trim().toLowerCase();
    if (d) {
      const entry = prefs.get(d) ?? { name: d, count: 0, who: [] };
      entry.count += 1;
      entry.who.push(g.name);
      prefs.set(d, entry);
    }
  }
  return { allergens: [...allergens.values()], prefs: [...prefs.values()] };
}
