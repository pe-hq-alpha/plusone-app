import { describe, expect, test } from "vitest";
import { answersFrom } from "./charges";
import { keywordFlags } from "./evalSystems";
import { gapsIn, sheetFor } from "./standardSheet";

const catering = sheetFor("Catering")!;

describe("the evaluation's other systems", () => {
  test("Muse Spark's statuses become the sheet's answers, and the rules flag the same way Compare does", () => {
    const answers = answersFrom(
      [
        { key: "gst", status: "extra_with_amount_or_rate", amount: null },
        { key: "transport", status: "extra_without_price", amount: null },
        { key: "service_staff", status: "included", amount: null },
        { key: "crockery", status: "not_offered", amount: null },
      ],
      catering,
    );
    expect(answers.find((a) => a.key === "water")?.status).toBe("unstated");
    // Another caterer charges ₹1,200 for water, so this one's silence on it is asked about.
    const other = answersFrom([{ key: "water", status: "priced", amount: 1200 }], catering);
    const flagged = gapsIn(answers, catering, [other], "INR").map((m) => m.key);
    // A rate settles GST; "transport extra" with no price, and water another charges for, are asked about.
    expect(flagged).toContain("transport");
    expect(flagged).toContain("water");
    expect(flagged).not.toContain("gst");
    expect(flagged).not.toContain("service_staff");
    expect(flagged).not.toContain("crockery");
  });

  test("keywords alone call a charge settled whenever its word appears", () => {
    const flagged = keywordFlags("Lunch Rs 400 per plate. Transport extra. GST 5%.", catering);
    expect(flagged).not.toContain("transport");
    expect(flagged).not.toContain("gst");
    expect(flagged).toContain("water");
  });
});
