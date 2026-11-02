import { describe, expect, test } from "vitest";
import { tally, tallyLine } from "./tally";

describe("a budget that adds up line by line", () => {
  test("a Diwali party: booked vendors paid in full, and ₹2,000 paid on a ₹2,500 quote never marked booked", () => {
    const t = tally([
      { committed: 30_000, paid: 30_000, slotStatus: "booked" },
      { committed: 7_550, paid: 7_550, slotStatus: "booked" },
      { committed: 2_500, paid: 2_000, slotStatus: "quoted" },
    ]);
    // Nothing is owed on a need that isn't booked; the ₹2,000 is shown as paid on it instead.
    expect(t).toEqual({ agreed: 37_550, weighing: 2_500, paid: 39_550, toPay: 0, paidNotBooked: 2_000, overpaid: 0 });
  });

  test("once it is booked at ₹2,500, the ₹500 is owed on that line", () => {
    expect(tallyLine({ committed: 2_500, paid: 2_000, slotStatus: "booked" })).toMatchObject({ state: "booked", agreed: 2_500, toPay: 500, paidNotBooked: 0 });
  });

  test("a cost that isn't a vendor is agreed as soon as it has an amount", () => {
    expect(tallyLine({ committed: 4_000, paid: 1_000 })).toMatchObject({ state: "cost", agreed: 4_000, toPay: 3_000 });
  });

  test("paying more than agreed is shown as overpaid, never as a negative amount to pay", () => {
    expect(tallyLine({ committed: 8_000, paid: 9_000, slotStatus: "booked" })).toMatchObject({ toPay: 0, overpaid: 1_000 });
  });

  test("a need still being researched owes nothing and weighs nothing", () => {
    expect(tallyLine({ committed: 0, paid: 0, slotStatus: "research" })).toMatchObject({ state: "weighing", agreed: 0, weighing: 0, toPay: 0 });
  });
});
