import { describe, expect, test } from "vitest";
import { readingsFrom } from "./charges";
import { gapsIn, sheetFor } from "./standardSheet";

const catering = sheetFor("Catering")!;

describe("readingsFrom", () => {
  test("gives every sheet line with its label, in the sheet's order", () => {
    const readings = readingsFrom([{ key: "water", status: "priced", amount: 1200 }], catering);
    expect(readings.map((r) => r.key)).toEqual(catering.lines.map((l) => l.key));
    expect(readings.map((r) => r.label)).toEqual(catering.lines.map((l) => l.label));
    expect(readings.find((r) => r.key === "water")).toMatchObject({ label: "Water", status: "priced", amount: 1200 });
  });

  test("each status maps as answersFrom does", () => {
    const readings = Object.fromEntries(
      readingsFrom(
        [
          { key: "gst", status: "extra_with_amount_or_rate", amount: null },
          { key: "service_staff", status: "included", amount: null },
          { key: "transport", status: "extra_without_price", amount: null },
          { key: "crockery", status: "not_offered", amount: null },
          { key: "water", status: "priced", amount: 900 },
        ],
        catering,
      ).map((r) => [r.key, r]),
    );
    // A rate settles it: extra with an amount, so the rules do not flag it.
    expect(readings.gst).toMatchObject({ status: "extra", amount: 0 });
    expect(gapsIn(readingsFrom([{ key: "gst", status: "extra_with_amount_or_rate", amount: null }], catering), catering, [], "INR").map((m) => m.key)).not.toContain("gst");
    expect(readings.service_staff).toMatchObject({ status: "included" });
    expect(readings.transport).toMatchObject({ status: "extra" });
    expect(readings.transport.amount).toBeUndefined();
    expect(readings.crockery).toMatchObject({ status: "included" });
    expect(readings.water).toMatchObject({ status: "priced", amount: 900 });
  });

  test("a key Muse Spark left out is unstated, and not_mentioned is unstated too", () => {
    const readings = readingsFrom([{ key: "gst", status: "not_mentioned", amount: null }], catering);
    for (const r of readings) expect(r.status).toBe("unstated");
  });
});
