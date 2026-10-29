import { describe, expect, it } from "vitest";
import { costUsd, glimmerCostUsd, wonderCostUsd } from "./modelCost";

describe("glimmerCostUsd", () => {
  it("bills whole seconds of GPU time, at the rate set for Modal's GPU", () => {
    expect(glimmerCostUsd(0.1)).toBeCloseTo(4.65 / 3600, 8);
    expect(glimmerCostUsd(65)).toBeCloseTo((65 * 4.65) / 3600, 8);
  });
});

describe("wonderCostUsd", () => {
  it("adds the search price to the token price", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0 };
    // 1M input tokens at $4 is $4, plus no searches.
    expect(wonderCostUsd(usage, 0)).toBeCloseTo(4);
    // Two searches add $0.005.
    expect(wonderCostUsd(usage, 2)).toBeCloseTo(4 + 0.005);
    expect(wonderCostUsd(usage, 2)).toBeCloseTo((costUsd("muse-wonder-1.0", usage) ?? 0) + (2 * 2.5) / 1000);
  });
});
