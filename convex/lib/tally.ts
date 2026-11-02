/**
 * How a budget adds up, line by line, so every total on screen can be traced to the lines
 * behind it. A vendor need's committed figure follows its live quote until it is booked, so
 * a need that isn't booked is a quote being weighed: it counts against what's left, but
 * nothing is owed on it. What's still to pay is owed only on what's agreed: booked needs and
 * costs that aren't vendors.
 */
export type TallyInput = {
  committed: number;
  paid: number;
  /** A vendor need's status; absent for a cost that isn't a vendor (outfits, gifts, travel). */
  slotStatus?: "research" | "contacted" | "quoted" | "booked";
};

export type LineState = "booked" | "weighing" | "cost";

export type LineTally = {
  state: LineState;
  /** Agreed with a vendor (or for a cost that isn't one). */
  agreed: number;
  /** A quote on a need not booked yet. */
  weighing: number;
  /** What's agreed and not yet paid. */
  toPay: number;
  /** Paid on a need that isn't marked booked. */
  paidNotBooked: number;
  /** Paid beyond what was agreed. */
  overpaid: number;
};

export function tallyLine(l: TallyInput): LineTally {
  const state: LineState = l.slotStatus === undefined ? "cost" : l.slotStatus === "booked" ? "booked" : "weighing";
  const agreed = state === "weighing" ? 0 : l.committed;
  return {
    state,
    agreed,
    weighing: state === "weighing" ? l.committed : 0,
    toPay: state === "weighing" ? 0 : Math.max(0, l.committed - l.paid),
    paidNotBooked: state === "weighing" ? l.paid : 0,
    overpaid: state !== "weighing" && agreed > 0 ? Math.max(0, l.paid - agreed) : 0,
  };
}

export type Tally = { agreed: number; weighing: number; paid: number; toPay: number; paidNotBooked: number; overpaid: number };

export function tally(lines: TallyInput[]): Tally {
  const out: Tally = { agreed: 0, weighing: 0, paid: 0, toPay: 0, paidNotBooked: 0, overpaid: 0 };
  for (const l of lines) {
    const t = tallyLine(l);
    out.agreed += t.agreed;
    out.weighing += t.weighing;
    out.paid += l.paid;
    out.toPay += t.toPay;
    out.paidNotBooked += t.paidNotBooked;
    out.overpaid += t.overpaid;
  }
  return out;
}
