import { describe, expect, test } from "vitest";
import { isHexColour } from "./colours";

describe("isHexColour", () => {
  test("only #RRGGBB passes", () => {
    expect(isHexColour("#F2A541")).toBe(true);
    expect(isHexColour("#f2a541")).toBe(true);
    expect(isHexColour("F2A541")).toBe(false);
    expect(isHexColour("#fff")).toBe(false);
    expect(isHexColour("marigold")).toBe(false);
    expect(isHexColour(undefined)).toBe(false);
  });
});
