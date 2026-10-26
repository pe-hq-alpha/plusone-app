import { describe, expect, test } from "vitest";
import { EMPTY_FACTS, clampReading, missing, toCreateArgs, withDefaults, type Facts } from "./wizard";

const facts = (f: Partial<Facts>): Facts => ({ ...EMPTY_FACTS, ...f });

describe("what must be known before building", () => {
  test("an empty reading asks for the type, the host, the city and the date", () => {
    expect(missing(EMPTY_FACTS)).toEqual(["eventType", "host", "city", "date"]);
  });

  test("an organisation stands in for a host on a work event", () => {
    expect(missing(facts({ eventType: "office_party", organisation: "Northwind Labs", city: "Gurugram", date: "2027-11-05" }))).toEqual([]);
  });

  test("a date that isn't a calendar date still has to be asked", () => {
    expect(missing(facts({ eventType: "birthday", host: "Divya", city: "Chennai", date: "next month" }))).toEqual(["date"]);
  });
});

describe("filling the gaps", () => {
  test("a birthday with no budget gets a rupee figure, said out loud as an assumption", () => {
    const { facts: f, assumed } = withDefaults(facts({ eventType: "birthday", host: "Divya", city: "Chennai", date: "2027-01-23" }));
    expect(f.budget).toBe(210_000);
    expect(f.guests).toBe(80);
    expect(assumed).toContain("a starting budget you can change");
    expect(f.needs.map((n) => n.category)).toContain("Catering");
    expect(f.name).toBe("Divya's birthday");
  });

  test("a housewarming starts with its two parts, and says so", () => {
    const { facts: f, assumed } = withDefaults(facts({ eventType: "housewarming", host: "Meena", city: "Bengaluru", date: "2027-01-10", budget: 300_000 }));
    expect(f.sessions.map((s) => s.name)).toEqual(["Griha pravesam", "Lunch"]);
    expect(assumed.some((a) => a.startsWith("2 parts"))).toBe(true);
    expect(f.budget).toBe(300_000);
  });

  test("what the host said is never overwritten", () => {
    const { facts: f, assumed } = withDefaults(facts({ eventType: "pooja", host: "Lakshmi", city: "Madurai", date: "2027-02-01", guests: 30, budget: 50_000, name: "Satyanarayana pooja" }));
    expect(f).toMatchObject({ guests: 30, budget: 50_000, name: "Satyanarayana pooja" });
    expect(assumed).not.toContain("a starting budget you can change");
  });
});

describe("from facts to a new event", () => {
  test("a two-day offsite puts its parts on its two days", () => {
    const { facts: f } = withDefaults(facts({ eventType: "team_offsite", organisation: "Northwind Labs", city: "Devanahalli", date: "2027-03-12", endDate: "2027-03-13", guests: 40, budget: 1_200_000 }));
    const args = toCreateArgs(f, { country: "India" });
    expect(args).toMatchObject({ startDate: "2027-03-12", endDate: "2027-03-13", host: "Northwind Labs", eventType: "team_offsite", currency: "INR" });
    expect(args.sessions?.map((s) => s.date)).toEqual(["2027-03-12", "2027-03-13"]);
  });
});

describe("a reading made safe", () => {
  test("unknown types and categories are dropped, and long text is cut", () => {
    const f = clampReading(
      { eventType: "rave" as never, city: "x".repeat(300), needs: [{ category: "Catering", title: "Lunch" }, { category: "Spaceships", title: "?" }], guests: -5 },
      { types: ["birthday"], categories: ["Catering"] },
    );
    expect(f.eventType).toBeNull();
    expect(f.city.length).toBe(80);
    expect(f.needs).toEqual([{ category: "Catering", title: "Lunch" }]);
    expect(f.guests).toBeNull();
  });
});

describe("a wedding set out in the family's own words", () => {
  const known = { types: ["wedding"], categories: ["Officiant", "Live band", "Catering"] };

  test("each need keeps the parts it serves, and they reach the new event by name", () => {
    const f = clampReading(
      {
        ...EMPTY_FACTS,
        eventType: "wedding",
        host: "Meena",
        city: "Chennai",
        date: "2027-02-10",
        sessions: [
          { name: "Muhurtham", startTime: "", guests: 300 },
          { name: "Reception", startTime: "", guests: 400 },
        ],
        needs: [
          { category: "Officiant", title: "Vadhyar", parts: ["Muhurtham"] },
          { category: "Live band", title: "Nadaswaram", parts: ["Muhurtham", ""] },
          { category: "Catering", title: "Catering" },
        ],
      },
      known,
    );
    expect(f.needs).toEqual([
      { category: "Officiant", title: "Vadhyar", parts: ["Muhurtham"] },
      { category: "Live band", title: "Nadaswaram", parts: ["Muhurtham"] },
      { category: "Catering", title: "Catering" },
    ]);
    const args = toCreateArgs(withDefaults(f).facts);
    expect(args.needs).toEqual([
      { category: "Officiant", title: "Vadhyar", booked: false, sessionNames: ["Muhurtham"] },
      { category: "Live band", title: "Nadaswaram", booked: false, sessionNames: ["Muhurtham"] },
      { category: "Catering", title: "Catering", booked: false },
    ]);
  });

  test("a wedding they haven't described yet starts from the wedding type, with a plain label for who leads it", () => {
    const { facts } = withDefaults({ ...EMPTY_FACTS, eventType: "wedding", host: "Meena", city: "Chennai", date: "2027-02-10" });
    expect(facts.sessions.map((s) => s.name)).toEqual(["Ceremony"]);
    const lead = facts.needs.find((n) => n.category === "Officiant");
    expect(lead).toEqual({ category: "Officiant", title: "Who leads the ceremony", parts: ["Ceremony"] });
  });
});
