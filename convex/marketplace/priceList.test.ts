/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// convex-test keys modules from the convex folder; a test one folder down sees them as "../" and "./".
const raw = import.meta.glob("../**/*.ts");
const modules: Record<string, () => Promise<unknown>> = Object.fromEntries(
  Object.entries(raw).map(([key, load]) => [
    key.startsWith("../") ? key.slice(3) : key.startsWith("./") ? `marketplace/${key.slice(2)}` : key,
    load as () => Promise<unknown>,
  ]),
);

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function seedVendor(t: T, opts: { guest?: boolean; listing?: boolean } = {}) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", opts.guest ? { isAnonymous: true } : { email: "vendor@example.com" });
    if (opts.listing !== false) {
      await ctx.db.insert("vendorProfiles", {
        name: "Anjali Catering",
        categories: ["Catering"],
        city: "Chennai",
        cityKey: "chennai",
        source: "vendor_signup",
        ownerUserId: userId,
        status: "verified",
        statusAt: Date.now(),
        joinedAt: Date.now(),
        completedEvents: 0,
        ...(opts.guest ? { sample: true } : {}),
      });
    }
    return userId;
  });
}

/** Muse Spark Open on Baseten answering with these packages. Nothing reaches the network. */
function sparkOpenAnswers(packages: unknown[]) {
  vi.stubEnv("BASETEN_API_KEY", "bt_test");
  const fetchFn = vi.fn(async (_url: unknown, _init?: RequestInit) =>
    Response.json({
      model: "meta-models/muse-spark-open-1026",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ packages }) } }],
      usage: { prompt_tokens: 700, completion_tokens: 400 },
    }),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

const lunch = { title: "Banana-leaf lunch", priceUnit: "per_plate", price: 380, quantities: [{ key: "dishes", value: 12 }], includes: ["Payasam"], taxIncluded: false };
const invented = { ...lunch, title: "Grand feast", price: 999 };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bring your price list", () => {
  test("a typed list comes back as packages on the sheet, with a made-up price dropped, on Spark Open", async () => {
    const fetchFn = sparkOpenAnswers([lunch, invented]);
    const t = setup();
    const userId = await seedVendor(t);
    const result = await as(t, userId).action(api.marketplace.priceList.read, { category: "Catering", text: "Banana leaf lunch Rs.380 per plate, 12 dishes, payasam. GST extra." });
    expect(result).toEqual({
      fromPhoto: false,
      packages: [{ title: "Banana-leaf lunch", priceUnit: "per_plate", price: 380, quantities: { dishes: 12 }, includes: ["Payasam"], taxIncluded: false }],
    });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://inference.baseten.co/v1/chat/completions");
    expect(JSON.parse(init.body as string).model).toBe("meta-models/muse-spark-open-1026");
    const calls = await t.run((ctx) => ctx.db.query("modelCalls").take(5));
    expect(calls).toMatchObject([{ feature: "priceListRead", provider: "spark_open", fellBack: false }]);
  });

  test("a photo of the list is read and then deleted, and its prices are left for the vendor to check", async () => {
    sparkOpenAnswers([invented]);
    const t = setup();
    const userId = await seedVendor(t);
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }));
      // A real upload records its content type; the test store never does.
      await ctx.db.patch(id as never, { contentType: "image/jpeg" } as never);
      return id;
    });
    const result = await as(t, userId).action(api.marketplace.priceList.read, { category: "Catering", storageId });
    expect(result.fromPhoto).toBe(true);
    expect(result.packages.map((p) => p.price)).toEqual([999]);
    expect(await t.run((ctx) => ctx.db.system.get("_storage", storageId))).toBeNull();
  });

  test("another person's upload is refused, and left as it was", async () => {
    sparkOpenAnswers([invented]);
    const t = setup();
    const owner = await seedVendor(t);
    const storageId = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }));
      await ctx.db.patch(id as never, { contentType: "image/jpeg" } as never);
      return id;
    });
    const other = await t.run((ctx) => ctx.db.insert("users", { email: "other@example.com" }));
    // The owner uses it first, then someone who learned its id tries.
    await t.run((ctx) => ctx.db.insert("uploadClaims", { storageId, userId: owner, claimedAt: Date.now() }));
    await expect(as(t, other).action(api.marketplace.priceList.read, { category: "Catering", storageId })).rejects.toThrow(/didn't come from you/);
    expect(await t.run((ctx) => ctx.db.system.get("_storage", storageId))).not.toBeNull();
  });

  test("someone without a listing, or for a service they don't offer, is refused", async () => {
    sparkOpenAnswers([lunch]);
    const t = setup();
    const stranger = await seedVendor(t, { listing: false });
    await expect(as(t, stranger).action(api.marketplace.priceList.read, { category: "Catering", text: "Rs.380" })).rejects.toThrow(/Set up your business/);
    const vendor = await seedVendor(t);
    await expect(as(t, vendor).action(api.marketplace.priceList.read, { category: "Photographer", text: "Rs.380" })).rejects.toThrow(/Add that kind of service/);
  });

  test("a demo guest reads five lists a day", async () => {
    sparkOpenAnswers([lunch]);
    const t = setup();
    const guest = await seedVendor(t, { guest: true });
    for (let i = 0; i < 5; i++) await as(t, guest).action(api.marketplace.priceList.read, { category: "Catering", text: "Lunch Rs.380 per plate" });
    await expect(as(t, guest).action(api.marketplace.priceList.read, { category: "Catering", text: "Lunch Rs.380 per plate" })).rejects.toThrow(/as many price lists/);
  });
});
