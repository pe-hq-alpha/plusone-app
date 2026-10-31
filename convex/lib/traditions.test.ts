import { describe, expect, test } from "vitest";
import { EVENT_TYPES } from "./occasion";
import { catalogueFor, TRADITIONS, TYPE_EVENTS, traditionNamed, wantsSoundAndLighting, type CatalogueEvent } from "./traditions";
import { CEREMONY_KINDS, VENDOR_NEED_KEYS } from "./vocab";

const check = (list: CatalogueEvent[], where: string) => {
  const keys = new Set<string>();
  for (const e of list) {
    expect(keys.has(e.key), `${where}: ${e.key} twice`).toBe(false);
    keys.add(e.key);
    if (e.kind) expect(CEREMONY_KINDS, `${where}: ${e.key}`).toContain(e.kind);
    for (const n of e.needs) expect(VENDOR_NEED_KEYS, `${where}: ${e.key}`).toContain(n);
    expect(e.startTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(Math.abs(e.offset)).toBeLessThanOrEqual(5);
    expect(e.guestShare).toBeGreaterThan(0);
    expect(e.guestShare).toBeLessThanOrEqual(1);
  }
  expect(list.some((e) => e.isDefault), `${where} has nothing ticked`).toBe(true);
};

describe("the events of the day PlusOne suggests", () => {
  test("every wedding style has its main events, each well formed", () => {
    expect(new Set(TRADITIONS.map((t) => t.id)).size).toBe(TRADITIONS.length);
    for (const t of TRADITIONS) {
      expect(t.events.length, t.id).toBeGreaterThanOrEqual(3);
      check(t.events, t.id);
      for (const m of t.oftenMissed) expect(VENDOR_NEED_KEYS).toContain(m.need);
    }
  });

  test("every other kind of event has events to offer", () => {
    for (const t of EVENT_TYPES) {
      if (t.id === "wedding") continue;
      const list = TYPE_EVENTS[t.id as keyof typeof TYPE_EVENTS];
      expect(list?.length, t.id).toBeGreaterThan(0);
      check(list, t.id);
    }
  });

  test("a style is only what the host's words name", () => {
    expect(traditionNamed("My sister's Iyer wedding in February")?.id).toBe("tamil_brahmin");
    expect(traditionNamed("a Punjabi wedding in Delhi")?.id).toBe("punjabi");
    expect(traditionNamed("our wedding in Chennai")).toBeNull();
    expect(catalogueFor("wedding", null)).toEqual([]);
    expect(catalogueFor("housewarming").map((e) => e.key)).toEqual(["griha_pravesam", "lunch", "evening"]);
  });

  test("evening events call for sound and lighting", () => {
    expect(wantsSoundAndLighting({ kind: "sangeet", startTime: "14:00" })).toBe(true);
    expect(wantsSoundAndLighting({ startTime: "18:00" })).toBe(true);
    expect(wantsSoundAndLighting({ kind: "fire", startTime: "07:30" })).toBe(false);
  });
});
