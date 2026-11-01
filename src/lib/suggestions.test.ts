import { describe, expect, test } from "vitest";
import { suggestionsFor, type SuggestionState } from "./suggestions";

const base: SuggestionState = {
  needs: [],
  parts: [],
  guests: { pending: 0, yes: 0, total: 0 },
  committed: 0,
  totalBudget: 0,
};

describe("suggestions follow the event, not a fixed list", () => {
  test("a 60th with catering quotes in, flowers not started, a lunch at 12:30 and people still to reply", () => {
    const s = suggestionsFor({
      needs: [
        { title: "Hall", status: "booked", quoted: true },
        { title: "Catering", status: "quoted", quoted: true },
        { title: "Flowers & decoration", status: "research", quoted: false },
      ],
      parts: [{ name: "Morning pooja", guestCount: 40, startTime: "07:00" }, { name: "Birthday lunch", guestCount: 120, startTime: "12:30" }],
      guests: { pending: 3, yes: 5, total: 9 },
      committed: 136500,
      totalBudget: 450000,
    });
    expect(s).toEqual([
      "Which catering quote is the best value?",
      "Find vendors for your flowers & decoration",
      "We're now 140 people for Birthday lunch",
      "Move Morning pooja to 8 am",
    ]);
  });

  test("a small Diwali party with one part: its own numbers, and no line about quotes that aren't there", () => {
    const s = suggestionsFor({
      ...base,
      needs: [{ title: "Biryani place", status: "research", quoted: false }],
      parts: [{ name: "Diwali party", guestCount: 15, startTime: "19:30" }],
      guests: { pending: 0, yes: 0, total: 0 },
    });
    expect(s).toEqual(["Find vendors for your biryani place", "We're now 20 people", "Move Diwali party to 8:30 pm", "Add people to the guest list"]);
    expect(s.join(" ")).not.toMatch(/quote|140|photographer|lunch/);
  });

  test("everything booked: what's left before the day", () => {
    const s = suggestionsFor({ ...base, needs: [{ title: "Hall", status: "booked", quoted: true }], committed: 50000 });
    expect(s).toContain("What's left to do before the day?");
    expect(s).not.toContain("What should we book next?");
  });
});
