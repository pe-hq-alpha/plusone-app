/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Keys come out mixed ("../schema" beside "./photos"); make them relative to convex/,
// which is what convex-test looks up.
const raw = import.meta.glob("../**/*.ts");
const modules: Record<string, () => Promise<unknown>> = Object.fromEntries(
  Object.entries(raw).map(([key, load]) => [
    key.startsWith("../") ? key.slice(3) : key.startsWith("./") ? `marketplace/${key.slice(2)}` : key,
    load as () => Promise<unknown>,
  ]),
);

afterEach(() => {
  vi.useRealTimers();
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

async function seedVendor(t: T, opts: { guest?: boolean; email?: string } = {}) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", opts.guest ? { isAnonymous: true } : { email: opts.email ?? "vendor@example.com" });
    const profileId = await ctx.db.insert("vendorProfiles", {
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
    return { userId, profileId };
  });
}

async function storePhoto(t: T, bytes: Uint8Array<ArrayBuffer>, type: string) {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([bytes], { type }));
    // A real upload records its content type; the test store never does, so say it here.
    await ctx.db.patch(storageId as never, { contentType: type } as never);
    return storageId;
  });
}

async function jpeg(t: T) {
  return await storePhoto(t, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), "image/jpeg");
}

/** Glimmer up, answering every check with the tags. Nothing reaches the network. */
function glimmerAnswers(tags: string[]) {
  vi.stubEnv("GLIMMER_BASE_URL", "https://glimmer.test");
  vi.stubEnv("MODAL_PROXY_TOKEN", "wk-abc.ws-xyz");
  vi.stubEnv("GLIMMER_MODEL", "inference-1");
  const fetchFn = vi.fn(async () =>
    Response.json({
      model: "inference-1",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              realWork: true,
              stock: false,
              watermark: false,
              faces: false,
              unsafe: false,
              shows: "A banana-leaf lunch for two hundred guests.",
              tags,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

describe("a vendor's work photo", () => {
  test("it ends checked with known tags only, and one Glimmer cost row", async () => {
    vi.useFakeTimers();
    glimmerAnswers(["banana-leaf-service", "made-up-tag"]);
    const t = setup();
    const { userId } = await seedVendor(t);

    const photoId = await as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const photo = await t.run((ctx) => ctx.db.get(photoId));
    expect(photo?.status).toBe("checked");
    expect(photo?.check).toMatchObject({ provider: "glimmer", tags: ["banana-leaf-service"] });

    const calls = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ feature: "vendorPhotoCheck", provider: "glimmer", model: "muse-glimmer-30b", fellBack: false });
  });

  test("an answer from Glimmer that can't be read is checked on Muse Spark instead of failing", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GLIMMER_BASE_URL", "https://glimmer.test");
    vi.stubEnv("MODAL_PROXY_TOKEN", "wk-abc.ws-xyz");
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
    const reply = (content: string, model: string) =>
      Response.json({ model, choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        String(url).startsWith("https://glimmer.test")
          ? reply("I think this is a stage, but I'm not sure.", "inference-1")
          : reply(
              JSON.stringify({ realWork: true, stock: false, watermark: false, faces: false, unsafe: false, shows: "A buffet laid out on a long table.", tags: ["buffet"] }),
              "muse-spark-1.3",
            ),
      ),
    );
    const t = setup();
    const { userId } = await seedVendor(t);

    const photoId = await as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const photo = await t.run((ctx) => ctx.db.get(photoId));
    expect(photo?.status).toBe("checked");
    expect(photo?.check?.provider).toBe("spark");
  });

  test("a placeholder for what the photo shows is not accepted from Glimmer", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GLIMMER_BASE_URL", "https://glimmer.test");
    vi.stubEnv("MODAL_PROXY_TOKEN", "wk-abc.ws-xyz");
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
    const reply = (content: string, model: string) =>
      Response.json({ model, choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        String(url).startsWith("https://glimmer.test")
          ? reply(JSON.stringify({ realWork: true, stock: false, watermark: false, faces: true, unsafe: false, shows: "...", tags: ["buffet"] }), "inference-1")
          : reply(
              JSON.stringify({ realWork: true, stock: false, watermark: false, faces: false, unsafe: false, shows: "A buffet laid out on a long table.", tags: ["buffet"] }),
              "muse-spark-1.3",
            ),
      ),
    );
    const t = setup();
    const { userId } = await seedVendor(t);

    const photoId = await as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const photo = await t.run((ctx) => ctx.db.get(photoId));
    expect(photo?.status).toBe("checked");
    expect(photo?.check?.provider).toBe("spark");
  });

  test("with the endpoint down it is checked on Muse Spark instead", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GLIMMER_BASE_URL", "https://glimmer.test");
    vi.stubEnv("MODAL_PROXY_TOKEN", "wk-abc.ws-xyz");
    vi.stubEnv("MODEL_PROVIDER", "meta");
    vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
    const fetchFn = vi.fn(async (url: unknown) => {
      if (String(url).startsWith("https://glimmer.test")) return new Response("starting", { status: 503 });
      return Response.json({
        model: "muse-spark-1.3",
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                realWork: true,
                stock: false,
                watermark: false,
                faces: true,
                unsafe: false,
                shows: "A buffet spread.",
                tags: ["buffet", "bogus"],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 60 },
      });
    });
    vi.stubGlobal("fetch", fetchFn);
    const t = setup();
    const { userId } = await seedVendor(t);

    const photoId = await as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const photo = await t.run((ctx) => ctx.db.get(photoId));
    expect(photo?.status).toBe("checked");
    expect(photo?.check).toMatchObject({ provider: "spark", tags: ["buffet"] });
    // Glimmer is asked until the seven-minute deadline, then Muse Spark takes the photo.
    expect(fetchFn.mock.calls.filter(([u]) => String(u).startsWith("https://glimmer.test")).length).toBeGreaterThan(5);

    const calls = await t.run((ctx) => ctx.db.query("modelCalls").collect());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ feature: "vendorPhotoCheck" });
  });

  test("the 13th photo is refused", async () => {
    vi.useFakeTimers();
    glimmerAnswers(["buffet"]);
    const t = setup();
    const { userId } = await seedVendor(t);

    for (let i = 0; i < 12; i++) {
      await as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) });
    }
    await expect(as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) })).rejects.toThrow(/Twelve photos/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run((ctx) => ctx.db.query("vendorPhotos").collect())).toHaveLength(12);
  });

  test("a text file is refused and leaves no photo", async () => {
    const t = setup();
    const { userId } = await seedVendor(t);
    const storageId = await storePhoto(t, new Uint8Array([104, 101, 108, 108, 111]), "text/plain");

    // The refusal throws, so the mutation's own delete of the file rolls back with it
    // (as in spaces); what matters is no photo is kept.
    await expect(as(t, userId).mutation(api.marketplace.photos.add, { storageId })).rejects.toThrow(/JPEG, PNG or WebP/);
    expect(await t.run((ctx) => ctx.db.query("vendorPhotos").collect())).toHaveLength(0);
  });

  test("another vendor can't remove it, while its own vendor can", async () => {
    const t = setup();
    const { userId } = await seedVendor(t, { email: "first@example.com" });
    const other = await seedVendor(t, { email: "second@example.com" });
    const photoId = await as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) });

    await expect(as(t, other.userId).mutation(api.marketplace.photos.remove, { photoId })).rejects.toThrow(/isn't yours/);
    const storageId = (await t.run((ctx) => ctx.db.get(photoId)))?.storageId;
    await as(t, userId).mutation(api.marketplace.photos.remove, { photoId });
    expect(await t.run((ctx) => ctx.db.get(photoId))).toBeNull();
    await t.run(async (ctx) => {
      expect(await ctx.storage.get(storageId!)).toBeNull();
    });
  });

  test("Ops approves and removes, and the vendor sees the decision", async () => {
    vi.useFakeTimers();
    glimmerAnswers(["banana-leaf-service"]);
    const t = setup();
    const { userId, profileId } = await seedVendor(t);
    const staffId = await t.run(async (ctx) => ctx.db.insert("users", { email: "ops@example.com", staffRole: "reviewer" }));

    const photoId = await as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const seen = await as(t, staffId).query(api.marketplace.photos.forOps, { profileId });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ provider: "glimmer", shows: "A banana-leaf lunch for two hundred guests." });
    expect(seen[0].tags).toEqual([{ key: "banana-leaf-service", label: "Banana-leaf service" }]);

    await as(t, staffId).mutation(api.marketplace.photos.review, { photoId, decision: "approved" });
    expect((await as(t, userId).query(api.marketplace.photos.mine))[0].review).toBe("approved");
    await as(t, staffId).mutation(api.marketplace.photos.review, { photoId, decision: "removed" });
    expect((await as(t, userId).query(api.marketplace.photos.mine))[0].review).toBe("removed");
  });

  test("a demo guest's 4th photo in a day is refused", async () => {
    vi.useFakeTimers();
    glimmerAnswers(["buffet"]);
    const t = setup();
    const { userId } = await seedVendor(t, { guest: true });

    for (let i = 0; i < 3; i++) {
      await as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) });
    }
    await expect(as(t, userId).mutation(api.marketplace.photos.add, { storageId: await jpeg(t) })).rejects.toThrow(
      /as many photos as you can today/,
    );
  });
});
