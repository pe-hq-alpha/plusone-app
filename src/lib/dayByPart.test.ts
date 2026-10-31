import { describe, expect, test } from "vitest";
import {
  dayHeading,
  groupByDay,
  inTimeOrder,
  needRow,
  needsOfPart,
  partProgress,
  placesOf,
  priceText,
  sharedAcrossEvent,
  timeChip,
  type BoardNeedLike,
  type SlotLike,
} from "./dayByPart";

const part = (id: string, dayIndex: number, order: number, startTime?: string, date = `2027-01-${String(30 + dayIndex).padStart(2, "0")}`) => ({
  _id: id,
  dayIndex,
  order,
  startTime,
  date,
});

const slot = (over: Partial<SlotLike> & { _id: string }): SlotLike => ({
  title: over._id,
  status: "research",
  sessionIds: ["a"],
  budget: 1000,
  vendorsCount: 0,
  bookedVendor: null,
  bestQuote: null,
  ...over,
});

const need = (slotId: string, vendors: BoardNeedLike["vendors"], over: Partial<BoardNeedLike> = {}): BoardNeedLike => {
  const totals = vendors.filter((v) => v.state !== "declined" && v.quote).map((v) => v.quote!.total);
  return {
    slotId,
    cheapest: totals.length ? Math.min(...totals) : null,
    dearest: totals.length ? Math.max(...totals) : null,
    basisLabel: "All in",
    units: 0,
    vendors,
    ...over,
  };
};

const vendor = (name: string, state: BoardNeedLike["vendors"][number]["state"], total?: number, flags: string[] = [], followUpCount = 0) => ({
  name,
  state,
  followUpCount,
  quote: total === undefined ? null : { total, flags },
});

describe("order and days", () => {
  test("parts sort by day, then start time, then saved order; untimed parts go last on their day", () => {
    const parts = [part("lunch", 0, 0, "12:30"), part("untimed", 0, 1), part("next-day", 1, 0, "08:00"), part("pooja", 0, 2, "09:00")];
    expect([...parts].sort(inTimeOrder).map((p) => p._id)).toEqual(["pooja", "lunch", "untimed", "next-day"]);
  });

  test("two parts with no time keep the hosts' order", () => {
    const parts = [part("b", 0, 1), part("a", 0, 0)];
    expect([...parts].sort(inTimeOrder).map((p) => p._id)).toEqual(["a", "b"]);
  });

  test("groups into days that have something on them, in order", () => {
    const days = groupByDay([part("c", 2, 0, "10:00"), part("a", 0, 0, "18:00"), part("b", 0, 1, "09:00")]);
    expect(days.map((d) => d.date)).toEqual(["2027-01-30", "2027-01-32"]);
    expect(days[0].parts.map((p) => p._id)).toEqual(["b", "a"]);
    expect(days[1].parts.map((p) => p._id)).toEqual(["c"]);
  });

  test("a single-day, single-part event is one day with one part", () => {
    const days = groupByDay([part("only", 0, 0)]);
    expect(days).toHaveLength(1);
    expect(days[0].parts).toHaveLength(1);
  });

  test("public copies without dayIndex group by date and keep the server's order for equal times", () => {
    const parts = [
      { _id: "x", date: "2027-01-31" },
      { _id: "y", date: "2027-01-30", startTime: "19:00" },
      { _id: "z", date: "2027-01-30" },
      { _id: "w", date: "2027-01-30" },
    ];
    expect(groupByDay(parts).map((d) => d.parts.map((p) => p._id))).toEqual([["y", "z", "w"], ["x"]]);
  });

  test("day heading, time chip and places", () => {
    expect(dayHeading("2027-01-30", "en-GB")).toBe("Saturday 30 January");
    expect(timeChip("09:00")).toBe("From 9 AM");
    expect(timeChip("12:30", "15:00")).toBe("12:30 PM–3 PM");
    expect(timeChip(undefined, "15:00")).toBe("");
    expect(placesOf([{ location: "At home" }, { location: " Hall " }, { location: "At home" }, {}])).toEqual(["At home", "Hall"]);
  });
});

describe("a need's state", () => {
  test("booked shows the booked vendor and the booked amount", () => {
    const row = needRow(
      slot({ _id: "hall", status: "booked", bookedVendor: { name: "Raja Hall" } }),
      need("hall", [vendor("Raja Hall", "booked", 136500), vendor("Other", "quoted", 120000)]),
    );
    expect(row.state).toBe("booked");
    expect(row.detail).toBe("Raja Hall, booked");
    expect(row.price).toEqual({ low: 136500, high: 136500 });
  });

  test("quotes in reads Compare with the range, its basis and a waiting question", () => {
    const row = needRow(
      slot({ _id: "food", status: "quoted" }),
      need(
        "food",
        [vendor("Kaveri", "needs_attention", 66150, ["GST extra"]), vendor("Annam", "quoted", 56500), vendor("Gone", "declined", 10)],
        { basisLabel: "Per plate", units: 120 },
      ),
    );
    expect(row.state).toBe("compare");
    expect(row.quotes).toBe(2);
    expect(row.price).toEqual({ low: 56500, high: 66150 });
    expect(row.priceNote).toBe("before GST");
    expect(row.detail).toBe("2 quotes in, per plate for your 120 · Kaveri has a question for you");
    expect(priceText(row.price, "INR")).toMatch(/56,500 – .*66,150/);
  });

  test("a quoted need still reads Compare before the board has loaded", () => {
    const row = needRow(slot({ _id: "f", status: "quoted", bestQuote: { total: 18000 } }));
    expect(row.state).toBe("compare");
    expect(row.price).toEqual({ low: 18000, high: 18000 });
  });

  test("written to and quiet reads Waiting, with the follow-ups", () => {
    expect(needRow(slot({ _id: "p", status: "contacted" }), need("p", [vendor("Nila Studio", "chased", undefined, [], 1)])).detail).toBe(
      "Nila Studio · followed up once",
    );
    const many = needRow(slot({ _id: "p", status: "contacted" }), need("p", [vendor("A", "emailed"), vendor("B", "emailed")]));
    expect(many.state).toBe("waiting");
    expect(many.detail).toBe("Written to 2 vendors");
    expect(many.price).toBeNull();
    expect(needRow(slot({ _id: "m", status: "contacted" }), need("m", [vendor("Mangala Isai", "emailed")])).detail).toBe("Written to Mangala Isai");
  });

  test("the line itself says only what matters: who is booked, or a question waiting on the host", () => {
    expect(needRow(slot({ _id: "hall", status: "booked", bookedVendor: { name: "Raja Hall" } }), need("hall", [vendor("Raja Hall", "booked", 136500)])).note).toBe("Raja Hall");
    const asked = needRow(slot({ _id: "food", status: "quoted" }), need("food", [vendor("Kaveri", "needs_attention", 66150), vendor("Annam", "quoted", 56500)]));
    expect(asked.note).toBe("Kaveri has a question for you");
    expect(needRow(slot({ _id: "f2", status: "quoted" }), need("f2", [vendor("Annam", "quoted", 56500)])).note).toBeUndefined();
    expect(needRow(slot({ _id: "p", status: "contacted" }), need("p", [vendor("Nila Studio", "chased", undefined, [], 1)])).note).toBeUndefined();
    expect(needRow(slot({ _id: "d", vendorsCount: 5 })).note).toBeUndefined();
  });

  test("nothing sent yet reads Next", () => {
    expect(needRow(slot({ _id: "d", vendorsCount: 5 })).detail).toBe("5 vendors found, not written to yet");
    const gifts = needRow(slot({ _id: "g" }));
    expect(gifts.state).toBe("next");
    expect(gifts.detail).toBe("To choose");
    expect(priceText(gifts.price, "INR")).toBe("—");
  });
});

describe("a part's needs and its line", () => {
  const slots = [
    slot({ _id: "gifts", sessionIds: ["lunch"] }),
    slot({ _id: "hall", status: "booked", sessionIds: ["lunch"] }),
    slot({ _id: "photo", status: "contacted", sessionIds: ["lunch"] }),
    slot({ _id: "priest", sessionIds: ["pooja"] }),
    slot({ _id: "everywhere", sessionIds: ["lunch", "pooja"] }),
  ];

  test("a part shows its own needs, booked first and not-started last, without the whole-event ones", () => {
    expect(needsOfPart("lunch", slots, undefined, 2).map((r) => r.slotId)).toEqual(["hall", "photo", "gifts"]);
    expect(sharedAcrossEvent(slots, 2).map((s) => s._id)).toEqual(["everywhere"]);
  });

  test("with one part nothing is shared, so every need is on its card", () => {
    expect(sharedAcrossEvent(slots, 1)).toEqual([]);
    expect(needsOfPart("pooja", slots, undefined, 1).map((r) => r.slotId)).toEqual(["priest", "everywhere"]);
  });

  test("the node and the fill follow how many vendors are booked", () => {
    const lunch = needsOfPart("lunch", slots, undefined, 2);
    expect(partProgress(lunch)).toEqual({ booked: 1, total: 3, fraction: 1 / 3, node: "now" });
    expect(partProgress(needsOfPart("pooja", slots, undefined, 2)).node).toBe("next");
    expect(partProgress([]).node).toBe("next");
    const done = needsOfPart("lunch", [slot({ _id: "hall", status: "booked", sessionIds: ["lunch"] })], undefined, 1);
    expect(partProgress(done)).toMatchObject({ node: "done", fraction: 1 });
  });
});
