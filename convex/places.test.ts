/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function seed(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "priya@example.com", name: "Priya" });
    const viewerId = await ctx.db.insert("users", { email: "dad@example.com", name: "Dad" });
    const strangerId = await ctx.db.insert("users", { email: "x@example.com", name: "X" });
    const eventId = await ctx.db.insert("events", {
      name: "Amma's 60th", host: "Priya", coHost: "", startDate: "2027-02-12", endDate: "2027-02-12",
      city: "Chennai", currency: "INR", totalBudget: 400000, eventType: "birthday", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    return { ownerId, viewerId, strangerId, eventId };
  });
}

/** OpenStreetMap's lookup, answering every request with `hits`. Nothing reaches the network. */
function osmAnswers(hits: unknown[]) {
  const fetchFn = vi.fn(async () => Response.json(hits));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

describe("finding a venue on the map", () => {
  test("a Chennai area by name is answered without asking OpenStreetMap", async () => {
    const t = setup();
    const { ownerId } = await seed(t);
    const fetchFn = osmAnswers([]);
    const place = await as(t, ownerId).action(api.places.find, { text: "Mylapore", city: "Chennai" });
    expect(place).toMatchObject({ label: "Mylapore", precision: "area" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("a hall's name is looked up once, and the answer kept for the next person", async () => {
    const t = setup();
    const { ownerId, viewerId } = await seed(t);
    const fetchFn = osmAnswers([{ lat: "13.0415", lon: "80.2582", display_name: "Narada Gana Sabha, TTK Road, Alwarpet, Chennai, Tamil Nadu" }]);
    const first = await as(t, ownerId).action(api.places.find, { text: "Narada Gana Sabha", city: "Chennai" });
    expect(first).toEqual({ lat: 13.0415, lng: 80.2582, label: "Narada Gana Sabha, TTK Road", precision: "address" });
    const url = String((fetchFn.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("countrycodes=in");
    expect(url).toContain("Narada+Gana+Sabha%2C+Chennai");
    const again = await as(t, viewerId).action(api.places.find, { text: "narada gana sabha", city: "Chennai" });
    expect(again).toEqual(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("nothing found falls back to the city's middle, and isn't asked again", async () => {
    const t = setup();
    const { ownerId } = await seed(t);
    const fetchFn = osmAnswers([]);
    expect(await as(t, ownerId).action(api.places.find, { text: "Nowhere Hall", city: "Chennai" })).toMatchObject({ precision: "city" });
    expect(await as(t, ownerId).action(api.places.find, { text: "Nowhere Hall", city: "Chennai" })).toMatchObject({ precision: "city" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("a lookup that fails reads as not found, and nothing is kept", async () => {
    const t = setup();
    const { ownerId } = await seed(t);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await as(t, ownerId).action(api.places.find, { text: "Some Hall", city: "Chennai" })).toMatchObject({ precision: "city" });
    expect(await t.run((ctx) => ctx.db.query("placeLookups").collect())).toHaveLength(0);
  });
});

describe("pinning the venue", () => {
  const pin = { lat: 13.0415, lng: 80.2582, label: "Narada Gana Sabha", precision: "address" as const };

  test("a planner pins it and can take the pin away", async () => {
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    await as(t, ownerId).mutation(api.places.setVenue, { eventId, place: pin });
    expect((await t.run((ctx) => ctx.db.get(eventId)))?.venuePlace).toEqual(pin);
    await as(t, ownerId).mutation(api.places.setVenue, { eventId });
    expect((await t.run((ctx) => ctx.db.get(eventId)))?.venuePlace).toBeUndefined();
  });

  test("a viewer or a stranger can't move it, and a point off the map is refused", async () => {
    const t = setup();
    const { ownerId, viewerId, strangerId, eventId } = await seed(t);
    await expect(as(t, viewerId).mutation(api.places.setVenue, { eventId, place: pin })).rejects.toThrow();
    await expect(as(t, strangerId).mutation(api.places.setVenue, { eventId, place: pin })).rejects.toThrow();
    await expect(as(t, ownerId).mutation(api.places.setVenue, { eventId, place: { ...pin, lat: 120 } })).rejects.toThrow();
  });
});

describe("reading a vendor search", () => {
  test("an everyday search is read without a model", async () => {
    const t = setup();
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    expect(await t.action(api.marketplace.directory.read, { text: "photographers near Adyar under 20k" })).toEqual({
      category: "Photographer",
      city: "Chennai",
      area: "Adyar",
      maxPrice: 20_000,
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("one with no trade word goes to Muse Spark, and only a real trade and known places are kept", async () => {
    const t = setup();
    const { ownerId } = await seed(t);
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
    const answer = { category: "Catering", city: "Chennai", area: "Atlantis", maxPrice: 400 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ model: "muse-spark-1.3", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 300, completion_tokens: 40 } }),
      ),
    );
    const read = await as(t, ownerId).action(api.marketplace.directory.read, { text: "someone to feed 80 people at amma's pooja" });
    expect(read).toEqual({ category: "Catering", city: "Chennai", maxPrice: 400 });
    const calls = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(calls.map((c) => c.feature)).toEqual(["vendorSearchRead"]);
  });

  test("a trade the model invents is dropped, and a failed read leaves the search as it was", async () => {
    const t = setup();
    const { ownerId } = await seed(t);
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ model: "muse-spark-1.3", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ category: "Astrologer", city: null, area: null, maxPrice: null }) } }], usage: { prompt_tokens: 300, completion_tokens: 40 } }),
      ),
    );
    expect(await as(t, ownerId).action(api.marketplace.directory.read, { text: "someone for amma in Madurai" })).toEqual({ city: "Madurai" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    expect(await as(t, ownerId).action(api.marketplace.directory.read, { text: "someone nice for amma" })).toEqual({});
  });
});
