import { describe, expect, it } from "vitest";
import { keepPackages, priceListInstructions, type PriceListAnswer } from "./priceList";
import { sheetFor } from "./standardSheet";

const catering = sheetFor("Catering")!;
const pkg = (over: Partial<PriceListAnswer["packages"][number]> = {}): PriceListAnswer["packages"][number] => ({
  title: "Banana-leaf lunch",
  priceUnit: "per_plate",
  price: 380,
  quantities: [{ key: "dishes", value: 12 }],
  includes: ["Payasam", "Appalam"],
  taxIncluded: false,
  ...over,
});

describe("a vendor's price list turned into packages", () => {
  it("tells the model the trade's ways of charging and quantities by key", () => {
    const text = priceListInstructions("Catering", catering);
    expect(text).toContain("per_plate");
    expect(text).toContain("dishes: Dishes on the menu");
  });

  it("keeps a package priced the sheet's way, with a price the list really has", () => {
    const kept = keepPackages({ packages: [pkg()] }, catering, "Banana leaf lunch Rs.380/- per plate, 12 items, payasam, appalam. GST extra");
    expect(kept).toEqual([{ title: "Banana-leaf lunch", priceUnit: "per_plate", price: 380, quantities: { dishes: 12 }, includes: ["Payasam", "Appalam"], taxIncluded: false }]);
  });

  it("lists what's included without the word 'included' again", () => {
    const kept = keepPackages({ packages: [pkg({ includes: ["serving staff included", "Incl. banana leaf", "transport inclusive", "Included", "Payasam"] })] }, catering, null);
    expect(kept[0].includes).toEqual(["serving staff", "banana leaf", "transport", "Payasam"]);
  });

  it("drops a price the list doesn't have, a way of charging the trade doesn't use, and a quantity it doesn't count", () => {
    const answer = { packages: [pkg({ price: 420 }), pkg({ priceUnit: "per_hour" }), pkg({ quantities: [{ key: "hours", value: 4 }, { key: "dishes", value: 12 }] })] };
    const kept = keepPackages(answer, catering, "Lunch Rs.380 per plate, 12 dishes");
    expect(kept).toHaveLength(1);
    expect(kept[0].quantities).toEqual({ dishes: 12 });
  });

  it("reads a lakh figure written as lakh", () => {
    const kept = keepPackages({ packages: [pkg({ priceUnit: "per_plate", price: 120000 })] }, catering, "Full day package 1.2 lakh");
    expect(kept[0].price).toBe(120000);
  });

  it("keeps a photo's packages without a text check, and never more than six", () => {
    const many = { packages: Array.from({ length: 6 }, (_, i) => pkg({ title: `Menu ${i + 1}`, price: 300 + i })) };
    expect(keepPackages(many, catering, null)).toHaveLength(6);
  });

  it("drops a nameless or unpriced package", () => {
    expect(keepPackages({ packages: [pkg({ title: "  " }), pkg({ price: 0 })] }, catering, null)).toEqual([]);
  });
});
