import { describe, expect, test } from "vitest";
import { coverName, coverPath } from "./covers";

describe("coverName", () => {
  test("a festival in the name wins over the kind of event; else the kind; else party", () => {
    expect(coverName("party", "Padmanabhan & Sharmila's Diwali Party 2026")).toBe("festival_diwali");
    expect(coverName("office_party", "Team Deepavali lunch")).toBe("festival_diwali");
    expect(coverName("party", "Christmas dinner")).toBe("festival_christmas");
    expect(coverName("community_festival", "Pongal at the temple")).toBe("festival_pongal");
    expect(coverName("wedding", "Priya & Arjun")).toBe("wedding");
    expect(coverName(undefined)).toBe("party");
    expect(coverName("../etc", "x")).toBe("party");
    expect(coverName("party", "Holistic wellness day")).toBe("party");
    expect(coverPath("birthday", "Amma's 60th")).toBe("/covers/birthday.jpg");
  });
});
