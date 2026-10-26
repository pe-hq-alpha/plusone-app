import { describe, expect, it } from "vitest";
import { EMPTY_CHAT, apply, nextStep, problems, say, type ChatState, type Reading } from "./planningChat";
import { EMPTY_FACTS } from "./wizard";

const TODAY = "2026-10-25";
const read = (r: Partial<Reading>): Reading => ({ changes: {}, confirmed: [], wrong: [], unsure: [], weekdaySaid: null, ...r });

const amma: ChatState = {
  facts: { ...EMPTY_FACTS, eventType: "birthday", occasionLabel: "Amma's 60th", host: "Divya", coHost: "Karthik", city: "Chennai", area: "Mylapore", date: "2027-01-23", guests: 120, budget: 400_000 },
  confirmed: [],
  unsure: [],
};

describe("what the conversation does next", () => {
  it("starts by asking what the event is, then one missing thing at a time", () => {
    expect(nextStep(EMPTY_CHAT, TODAY)).toEqual({ kind: "ask", field: "eventType" });
    const partly = apply(EMPTY_CHAT, read({ changes: { eventType: "birthday", city: "Chennai" } }), { kind: "ask", field: "eventType" });
    expect(nextStep(partly, TODAY)).toEqual({ kind: "ask", field: "host" });
  });

  it("reads everything back once it has it all, and builds only after every line is confirmed", () => {
    expect(nextStep(amma, TODAY)).toEqual({ kind: "confirm", fields: ["eventType", "host", "city", "date", "guests", "budget"] });
    const asked = nextStep(amma, TODAY);
    const yes = apply(amma, read({ confirmed: ["eventType", "host", "city", "date", "guests", "budget"] }), asked);
    expect(nextStep(yes, TODAY)).toEqual({ kind: "ready" });
  });

  it("a correction replaces the fact and asks for that line again; the rest stay confirmed", () => {
    const asked = nextStep(amma, TODAY);
    const fixed = apply(amma, read({ changes: { area: "T. Nagar" }, confirmed: ["eventType", "host", "date", "guests", "budget"] }), asked);
    expect(fixed.facts.area).toBe("T. Nagar");
    expect(fixed.confirmed).not.toContain("city");
    expect(nextStep(fixed, TODAY)).toEqual({ kind: "confirm", fields: ["city"] });
  });

  it("'that's wrong' without a new value clears the fact and asks for it", () => {
    const asked = nextStep(amma, TODAY);
    const wrong = apply(amma, read({ wrong: ["host"], confirmed: ["eventType", "city", "date", "guests", "budget"] }), asked);
    expect(wrong.facts.host).toBe("");
    expect(nextStep(wrong, TODAY)).toEqual({ kind: "ask", field: "host" });
  });

  it("never counts a confirmation for something that wasn't read back", () => {
    const asked = { kind: "ask", field: "eventType" } as const;
    const s = apply(EMPTY_CHAT, read({ changes: { eventType: "pooja" }, confirmed: ["eventType", "budget"] }), asked);
    expect(s.confirmed).toEqual([]);
  });

  it("'not sure' is fine for people and budget, not for the date", () => {
    const base = { ...amma, facts: { ...amma.facts, guests: null, budget: null } };
    const s = apply(base, read({ unsure: ["guests", "budget", "date"] }), { kind: "ask", field: "guests" });
    expect(s.unsure).toEqual(["guests", "budget"]);
    expect(nextStep(s, TODAY)).toEqual({ kind: "confirm", fields: ["eventType", "host", "city", "date"] });
    expect(say(nextStep(s, TODAY), s)).not.toContain("not known");
  });
});

describe("what can't be right", () => {
  it("catches a date already gone, a weekday that doesn't match, and a budget missing a zero", () => {
    const f = { ...amma.facts, date: "2026-01-23" };
    expect(problems(f, TODAY)[0].problem).toMatch(/already passed/);
    expect(problems(amma.facts, TODAY, "Sunday")[0].problem).toBe("23 January 2027 is a Saturday, not a Sunday.");
    expect(problems(amma.facts, TODAY, "saturday")).toEqual([]);
    expect(problems({ ...amma.facts, budget: 4_000 }, TODAY)[0]).toMatchObject({ field: "budget" });
  });

  it("asks about a problem before anything else, in plain words", () => {
    const s = { ...amma, facts: { ...amma.facts, budget: 4_000 } };
    const step = nextStep(s, TODAY);
    expect(step.kind).toBe("fix");
    expect(say(step, s)).toMatch(/for 120 people is about ₹33 each\. Is that figure right\?/);
  });
});

describe("what PlusOne says", () => {
  it("reads the facts back as lines a host can check", () => {
    const text = say(nextStep(amma, TODAY), amma, "Lovely.");
    expect(text).toContain("Lovely. Let me check I have this right:");
    expect(text).toContain("• Amma's 60th (birthday party)");
    expect(text).toContain("• Hosted by Divya and Karthik");
    expect(text).toContain("• Mylapore, Chennai");
    expect(text).toContain("• Saturday 23 January 2027");
    expect(text).toContain("• A budget of ₹4,00,000");
  });

  it("asks a work event who is holding it", () => {
    const s = apply(EMPTY_CHAT, read({ changes: { eventType: "office_party" } }), { kind: "ask", field: "eventType" });
    expect(say(nextStep(s, TODAY), s)).toMatch(/company, team or college/);
  });
});
