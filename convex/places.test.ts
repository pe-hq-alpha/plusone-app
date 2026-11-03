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

async function vendor() {
  const t = setup();
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "v@example.com", name: "V" }));
  return t.withIdentity({ subject: `${userId}|s` });
}

/** A stand-in for the web: Google's short links answer with redirects, Nominatim with what `found` holds. */
function web(redirects: Record<string, string>, found: Record<string, { lat: string; lon: string; display_name: string }> = {}) {
  const asked: string[] = [];
  const fetchFn = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    asked.push(url);
    if (url.startsWith("https://nominatim.openstreetmap.org/")) {
      const q = new URL(url).searchParams.get("q") ?? "";
      return Response.json(found[q] ? [found[q]] : []);
    }
    const to = redirects[url];
    return to ? new Response(null, { status: 302, headers: { location: to } }) : new Response("<html></html>", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchFn);
  return asked;
}

const SHORT = "https://maps.app.goo.gl/PinkBridles1?g_st=ic";
const SHOP_PLACE =
  "https://www.google.com/maps/place/16,+1st+floor,+Shingar+Bridal+Makeup+And+Mehandi+Studio,+CTA+Garden+Main+Rd,+Manali+Saravana+Nagar,+Kamatchiamman+Nagar,+Poonamallee,+Chennai,+Tamil+Nadu+600056,+India/data=!4m2!3m1!1s0x3a5261dba56e2713:0x766115f5356c17fd?utm_source=mstt_1&entry=gps";

describe("finding a pasted Google Maps link", () => {
  test("a short link to a marked place pins the marker, with the shop's name, and never opens the map page", async () => {
    const full = "https://www.google.com/maps/place/Pink+Bridles/@13.0,80.2,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d12.9801!4d80.2209?entry=ttu";
    const asked = web({ [SHORT]: full });
    const me = await vendor();
    const place = await me.action(api.places.find, { text: `Pink Bridles\n${SHORT}`, city: "Chennai" });
    expect(place).toEqual({ lat: 12.9801, lng: 80.2209, label: "Pink Bridles", precision: "address" });
    expect(asked).toEqual([SHORT]);
  });

  test("a short link that only carries the shop's address is looked up, and its locality is marked as an area", async () => {
    const asked = web(
      { [SHORT]: SHOP_PLACE },
      { "Poonamallee, Chennai, Tamil Nadu 600056": { lat: "13.0417404", lon: "80.1006863", display_name: "Poonamallee, Chennai Metropolitan Area, Tamil Nadu, India" } },
    );
    const me = await vendor();
    const place = await me.action(api.places.find, { text: SHORT, city: "Chennai" });
    expect(place).toEqual({ lat: 13.0417404, lng: 80.1006863, label: "Poonamallee, Chennai Metropolitan Area", precision: "area" });
    // The short link, then the whole address, its last four parts and its last three: no Google map page.
    expect(asked.filter((u) => u.includes("google.com/maps"))).toEqual([]);
    expect(asked.filter((u) => u.includes("nominatim"))).toHaveLength(3);
  }, 15_000);

  test("an address found whole is the place itself", async () => {
    const q = "MUA Trend, 5911 Edsall Rd, Alexandria, VA 22304, United States";
    web({ [SHORT]: `https://maps.google.com?q=${encodeURIComponent(q)}&ftid=0x1:0x2&entry=gps` }, { [q]: { lat: "38.8", lon: "-77.15", display_name: "5911, Edsall Road, Alexandria" } });
    const me = await vendor();
    expect(await me.action(api.places.find, { text: SHORT })).toEqual({ lat: 38.8, lng: -77.15, label: "5911, Edsall Road", precision: "address" });
  });

  test("steps past Google's consent page", async () => {
    const full = "https://www.google.com/maps/place/Pink+Bridles/data=!3d13.0102!4d80.2157";
    web({ [SHORT]: `https://consent.google.com/ml?continue=${encodeURIComponent(full)}&gl=IE&hl=en` });
    const me = await vendor();
    expect(await me.action(api.places.find, { text: SHORT })).toMatchObject({ lat: 13.0102, lng: 80.2157 });
  });

  test("where the runtime follows the redirects itself, reads the address it ended on", async () => {
    const full = "https://www.google.com/maps/place/Pink+Bridles/data=!3d13.0102!4d80.2157";
    vi.stubGlobal("fetch", async () => {
      const res = new Response("<html></html>", { status: 200 });
      Object.defineProperty(res, "url", { value: full });
      return res;
    });
    const me = await vendor();
    expect(await me.action(api.places.find, { text: SHORT })).toMatchObject({ lat: 13.0102, lng: 80.2157 });
  });

  test("a short link that leads nowhere says so, instead of guessing", async () => {
    web({});
    const me = await vendor();
    await expect(me.action(api.places.find, { text: SHORT })).rejects.toThrow("We couldn't read a place from that link");
  });

  test("an address nobody can find says what the link said", async () => {
    web({ [SHORT]: "https://www.google.com/maps/place/Pink+Bridles/data=!4m2!3m1!1s0x1:0x2" });
    const me = await vendor();
    await expect(me.action(api.places.find, { text: SHORT, city: "Chennai" })).rejects.toThrow('That link says "Pink Bridles"');
  });

  test("a short link never leads off Google's own addresses", async () => {
    const asked = web({ [SHORT]: "https://evil.example/maps/place/x/data=!3d1.5!4d2.5" });
    const me = await vendor();
    await expect(me.action(api.places.find, { text: SHORT })).rejects.toThrow("We couldn't read a place from that link");
    expect(asked).toEqual([SHORT]);
  });
});
