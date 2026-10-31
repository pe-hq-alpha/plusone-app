import { describe, expect, it } from "vitest";
import { EMPTY_CHAT, apply, applyPick, eventLines, nextStep, problems, say, type ChatState, type Reading, type Step } from "./planningChat";
import { EMPTY_FACTS } from "./wizard";

const TODAY = "2026-10-25";
const read = (r: Partial<Reading>): Reading => ({ changes: {}, confirmed: [], wrong: [], unsure: [], weekdaySaid: null, ...r });

const amma: ChatState = {
  facts: { ...EMPTY_FACTS, eventType: "birthday", occasionLabel: "Amma's 60th", host: "Divya", coHost: "Karthik", city: "Chennai", area: "Mylapore", date: "2027-01-23", guests: 120, budget: 400_000 },
  confirmed: [],
  unsure: [],
  // The suggestion stages are covered below; these tests are about the essentials.
  done: ["tradition", "events", "timings", "missed"],
};
/** A state whose suggestion stages are answered, for testing the essentials alone. */
const settled = (s: ChatState): ChatState => ({ ...s, done: ["tradition", "events", "timings", "missed"] });

describe("what the conversation does next", () => {
  it("starts by asking what the event is, then one missing thing at a time", () => {
    expect(nextStep(EMPTY_CHAT, TODAY)).toEqual({ kind: "ask", field: "eventType" });
    const partly = settled(apply(EMPTY_CHAT, read({ changes: { eventType: "birthday", city: "Chennai" } }), { kind: "ask", field: "eventType" }));
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
    const s = settled(apply(EMPTY_CHAT, read({ changes: { eventType: "office_party" } }), { kind: "ask", field: "eventType" }));
    expect(say(nextStep(s, TODAY), s)).toMatch(/company, team or college/);
  });
});

describe("probing like a planner", () => {
  const wedding: ChatState = { ...EMPTY_CHAT, facts: { ...EMPTY_FACTS, eventType: "wedding", guests: 400 } };

  it("asks a wedding's tradition before anything else, never assuming one", () => {
    const step = nextStep(wedding, TODAY);
    expect(step).toMatchObject({ kind: "choose", slot: "tradition", multi: false });
    const ids = (step as Extract<Step, { kind: "choose" }>).options.map((o) => o.id);
    expect(ids).toContain("tamil_brahmin");
    expect(ids.slice(-3)).toEqual(["none", "mix", "other"]);
  });

  it("then offers that tradition's ceremonies, ticked as usual, and places the picks on their days", () => {
    const styled = applyPick(wedding, nextStep(wedding, TODAY), ["tamil_brahmin"]);
    expect(styled.facts.tradition).toBe("tamil_brahmin");
    const step = nextStep(styled, TODAY) as Extract<Step, { kind: "choose" }>;
    expect(step).toMatchObject({ kind: "choose", slot: "events", multi: true });
    expect(step.options.filter((o) => o.on).map((o) => o.label)).toEqual(["Nichayathartham", "Reception", "Kashi Yatra", "Oonjal", "Muhurtham"]);
    const picked = applyPick(styled, step, ["c:nichayathartham", "c:reception", "c:muhurtham"], "Nalangu");
    expect(picked.facts.sessions).toEqual([
      { name: "Nichayathartham", startTime: "18:30", guests: 280, day: 0, kind: "engagement" },
      { name: "Reception", startTime: "19:30", guests: 400, day: 0, kind: "reception" },
      { name: "Muhurtham", startTime: "07:30", guests: 400, day: 1, kind: "fire" },
      // An event of their own lands on the main day, the Muhurtham's.
      { name: "Nalangu", startTime: "", guests: 400, day: 1 },
    ]);
    // The evening reception brings sound and lighting with it; a need for one event says which.
    expect(picked.facts.needs.find((n) => n.title === "Sound & lighting")).toMatchObject({ category: "AV & sound" });
    expect(picked.facts.needs.find((n) => n.category === "Officiant")?.parts).toEqual(["Nichayathartham", "Muhurtham"]);
  });

  it("checks the timings, then asks the rest, then what is often missed, once", () => {
    let s = applyPick(wedding, nextStep(wedding, TODAY), ["tamil_brahmin"]);
    s = applyPick(s, nextStep(s, TODAY), ["c:reception", "c:muhurtham"]);
    const timings = nextStep(s, TODAY);
    expect(timings).toMatchObject({ kind: "choose", slot: "timings" });
    expect(say(timings, s)).toContain("Day 1: Reception 7:30 pm 400 guests");
    s = applyPick(s, timings, ["ok"]);
    expect(nextStep(s, TODAY)).toEqual({ kind: "ask", field: "host" });
    s = { ...s, facts: { ...s.facts, name: "Priya and Arun's wedding", city: "Chennai", date: "2027-02-12", budget: 2_500_000 } };
    const missed = nextStep(s, TODAY) as Extract<Step, { kind: "choose" }>;
    expect(missed).toMatchObject({ kind: "choose", slot: "missed" });
    expect(missed.options.map((o) => o.label)).toContain("Nadaswaram and thavil");
    s = applyPick(s, missed, [missed.options[0].id]);
    expect(nextStep(s, TODAY)).toMatchObject({ kind: "confirm" });
    expect(eventLines(s.facts)).toEqual(["Fri 12 Feb: Reception 7:30 pm 400 guests", "Sat 13 Feb: Muhurtham 7:30 am 400 guests"]);
  });

  it("an event with no checked list asks in words; a mixed wedding too", () => {
    const mixed = applyPick(wedding, nextStep(wedding, TODAY), ["mix"]);
    expect(nextStep(mixed, TODAY)).toEqual({ kind: "ask", field: "events" });
    const housewarming: ChatState = { ...EMPTY_CHAT, facts: { ...EMPTY_FACTS, eventType: "housewarming" } };
    expect(nextStep(housewarming, TODAY)).toMatchObject({ kind: "choose", slot: "events" });
  });

  it("Muse Spark's suggestions are offered beside the checked ones, marked, never ticked", () => {
    const party: ChatState = { ...EMPTY_CHAT, facts: { ...EMPTY_FACTS, eventType: "party", occasionLabel: "Diwali party" }, proposed: [{ name: "Lighting the diyas", offset: 0, startTime: "18:30", why: "To open the evening" }] };
    const step = nextStep(party, TODAY) as Extract<Step, { kind: "choose" }>;
    expect(step.options.find((o) => o.label === "Lighting the diyas")).toMatchObject({ suggested: true, on: false });
  });

  it("only what was offered can be picked", () => {
    const step = nextStep(wedding, TODAY);
    expect(applyPick(wedding, step, ["made_up"]).facts.tradition).toBe("none");
  });
});
