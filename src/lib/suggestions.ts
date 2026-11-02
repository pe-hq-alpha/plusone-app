/**
 * What to suggest telling or asking PlusOne, worked out from where this event stands: a
 * choice waiting between quotes, the next need nobody has started, a change in the event's
 * own numbers, who hasn't replied, the money. Never the same four lines for every event.
 */

export type SuggestionState = {
  needs: { title: string; status: "research" | "contacted" | "quoted" | "booked"; quoted: boolean }[];
  parts: { name: string; guestCount: number; startTime?: string }[];
  guests: { pending: number; yes: number; total: number };
  committed: number;
  totalBudget: number;
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "13:00" an hour later, as people say it: "2 pm", "11:30 am". */
function laterBy(time: string, minutes: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % (24 * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

export function suggestionsFor(s: SuggestionState, max = 4): string[] {
  const out: string[] = [];
  const add = (x: string | null | undefined) => {
    if (x && !out.includes(x)) out.push(x);
  };

  // A choice waiting: quotes in for a need that isn't booked.
  const deciding = s.needs.find((n) => n.status !== "booked" && n.quoted);
  if (deciding) add(`Which ${lower(deciding.title)} quote is best?`);

  // The next need nobody has started on.
  const fresh = s.needs.find((n) => n.status === "research");
  if (fresh) add(`Find vendors for your ${lower(fresh.title)}`);

  // A change in the event's own numbers: the biggest part's headcount, or a part's time.
  const biggest = [...s.parts].sort((a, b) => b.guestCount - a.guestCount)[0];
  if (biggest && biggest.guestCount > 0) {
    const more = biggest.guestCount + (biggest.guestCount >= 100 ? 20 : biggest.guestCount >= 30 ? 10 : 5);
    // A part's name is the host's own (often a proper name: "Diwali party"), so its case is kept.
    // Short enough to sit on one line under Tell PlusOne.
    add(s.parts.length > 1 ? `We're now ${more} for ${biggest.name}` : `We're now ${more} people`);
  }
  const timed = s.parts.find((p) => p.startTime && laterBy(p.startTime, 60));
  if (timed?.startTime) add(`Move ${timed.name} to ${laterBy(timed.startTime, 60)}`);

  // People and money.
  if (s.guests.pending > 0) add(`Who hasn't replied yet?`);
  else if (s.guests.total === 0) add(`Add people to the guest list`);
  if (s.committed > 0) add(`How much of the budget is left?`);

  // Something waiting on every booking when nothing more specific fits.
  const open = s.needs.filter((n) => n.status !== "booked");
  if (open.length > 0) add(`What should we book next?`);
  else if (s.needs.length > 0) add(`What's left to do before the day?`);

  return out.slice(0, max);
}
