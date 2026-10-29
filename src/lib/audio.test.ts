import { describe, expect, it } from "vitest";
import { callText } from "./audio";

describe("a call laid out for reading", () => {
  it("puts each turn on its own line under its speaker, and skips empty ones", () => {
    expect(callText("Kaveri Feast Co.", [{ speaker: "A", text: " Your rate? " }, { speaker: "B", text: "460 per plate." }, { speaker: "A", text: "  " }, { text: "Thank you." }])).toBe(
      "A recorded call with Kaveri Feast Co., speaker by speaker:\nSpeaker A: Your rate?\nSpeaker B: 460 per plate.\nSpeaker: Thank you.",
    );
  });
});
