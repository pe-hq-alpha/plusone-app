/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { placeDrop } from "./quoteDrops";

const modules = import.meta.glob("./**/*.ts");

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

const READING = {
  classification: "quote", total: 48000, deposit: 10000, currency: "INR", availability: "free that day", availableOnDates: "yes",
  includes: ["Banana-leaf lunch"], excludes: [], headcountAssumed: 120, taxIncluded: false, deadline: null,
  summary: "₹400 a plate for 120, GST extra.", redFlags: [], attachmentKind: "quote", pricesFromAttachment: true, optOut: false,
  lines: [{ item: "Lunch, 120 plates at ₹400", kind: "core", unit: "per_person", quantity: 120, unitPrice: 400, amount: 48000, optional: false }],
};

const CHARGES = {
  charges: [
    { key: "gst", status: "extra_with_amount_or_rate", amount: null },
    { key: "service_staff", status: "not_mentioned", amount: null },
    { key: "transport", status: "priced", amount: 2500 },
    { key: "crockery", status: "included", amount: null },
    { key: "water", status: "extra_without_price", amount: null },
  ],
};


let ROUTE: { vendorName: string; need: string; newNeed: string } = { vendorName: "", need: "", newNeed: "" };

/** Meta on: the filing read, then the reply reading, then the charges. Nothing reaches the network. */
function metaReads() {
  vi.stubEnv("MODEL_PROVIDER", "meta");
  vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    const content = body.includes("Say who sent it") ? JSON.stringify(ROUTE) : body.includes("The charges for") ? JSON.stringify(CHARGES) : JSON.stringify(READING);
    return Response.json({
      model: "muse-spark-1.3",
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 1_500, completion_tokens: 300 },
    });
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

/** A real family's event with a caterer found on the web and never written to. */
async function eventWithVendor(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "host@example.com", name: "Host" });
    const viewerId = await ctx.db.insert("users", { email: "aunt@example.com", name: "Aunt" });
    const eventId = await ctx.db.insert("events", {
      name: "Amma's 60th", host: "Divya", coHost: "", startDate: "2027-01-30", endDate: "2027-01-30", city: "Chennai",
      currency: "INR", totalBudget: 450000, eventType: "birthday", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    const sessionId = await ctx.db.insert("sessions", { eventId, name: "Lunch", date: "2027-01-30", dayIndex: 0, budget: 200000, guestCount: 120, color: "#000", order: 0 });
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [sessionId], category: "Catering", title: "Catering", budget: 100000, status: "research" });
    const vendorId = await ctx.db.insert("vendors", {
      eventId, slotId, name: "Mylai Virundhu", category: "Catering", packages: [], highlights: [], sourceUrls: [], shortlisted: false, scrapedAt: 0, reviewHighlights: [], pagesRead: [],
    });
    const storageId = await ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: "image/jpeg" }));
    return { ownerId, viewerId, eventId, slotId, vendorId, storageId };
  });
}


describe("a quote dropped on the event, with no vendor or need chosen", () => {
  test("a new vendor's pasted WhatsApp message adds the need and the vendor, and is read into a quote", async () => {
    vi.useFakeTimers();
    ROUTE = { vendorName: "Sabari Lighting", need: "", newNeed: "sound_lighting" };
    metaReads();
    const t = setup();
    const { ownerId, eventId } = await eventWithVendor(t);

    await as(t, ownerId).mutation(api.quoteDrops.drop, { eventId, text: "Sabari Lighting\nSound & Lighting Package ₹4,500\nInstallation: Additional\nRemoval ₹500" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [drop] = await as(t, ownerId).query(api.quoteDrops.recent, { eventId });
    expect(drop).toMatchObject({ status: "filed", vendorName: "Sabari Lighting", slotTitle: "Sound & lighting", newNeed: true });
    const vendors = await t.run((ctx) => ctx.db.query("vendors").collect());
    expect(vendors.map((v) => v.name).sort()).toEqual(["Mylai Virundhu", "Sabari Lighting"]);
    const quotes = await t.run((ctx) => ctx.db.query("quotes").collect());
    expect(quotes).toHaveLength(1);
    expect(quotes[0].slotId).toBe(drop.slotId);
  });

  test("a screenshot from a vendor already on a need goes on their thread; no one is added", async () => {
    vi.useFakeTimers();
    ROUTE = { vendorName: "Mylai Virundhu Caterers", need: "Catering", newNeed: "" };
    const fetchFn = metaReads();
    const t = setup();
    const { ownerId, eventId, slotId, vendorId, storageId } = await eventWithVendor(t);

    await as(t, ownerId).mutation(api.quoteDrops.drop, { eventId, storageId, filename: "WhatsApp Image.jpeg", contentType: "image/jpeg" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const routing = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    expect(JSON.stringify(routing)).toContain("data:image/jpeg;base64,");
    const vendors = await t.run((ctx) => ctx.db.query("vendors").collect());
    expect(vendors).toHaveLength(1);
    const quotes = await t.run((ctx) => ctx.db.query("quotes").collect());
    expect(quotes[0]).toMatchObject({ slotId, vendorId });
  });

  test("when no need fits it says so; an empty drop or a viewer is refused", async () => {
    vi.useFakeTimers();
    ROUTE = { vendorName: "Someone", need: "Elephant hire", newNeed: "elephant_hire" };
    metaReads();
    const t = setup();
    const { ownerId, viewerId, eventId } = await eventWithVendor(t);

    await as(t, ownerId).mutation(api.quoteDrops.drop, { eventId, text: "Rates attached" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [drop] = await as(t, ownerId).query(api.quoteDrops.recent, { eventId });
    expect(drop.status).toBe("failed");
    expect(drop.error).toMatch(/which need/);
    expect(await t.run((ctx) => ctx.db.query("messages").collect())).toHaveLength(0);

    await expect(as(t, ownerId).mutation(api.quoteDrops.drop, { eventId, text: "  " })).rejects.toThrow(/Paste their message/);
    await expect(as(t, viewerId).mutation(api.quoteDrops.drop, { eventId, text: "₹4,500" })).rejects.toThrow();
  });
});

describe("placeDrop", () => {
  const slots = [
    { _id: "s1" as Id<"vendorSlots">, title: "Catering", category: "Catering" },
    { _id: "s2" as Id<"vendorSlots">, title: "Lights for the evening", category: "AV & sound" },
  ];
  test("an existing need by name, a kind already on the event under another title, a new kind, or nothing", () => {
    expect(placeDrop({ need: "catering", newNeed: "" }, slots)).toEqual({ slotId: "s1" });
    expect(placeDrop({ need: "", newNeed: "sound_lighting" }, slots)).toEqual({ slotId: "s2" });
    expect(placeDrop({ need: "", newNeed: "photography" }, slots)).toEqual({ add: { title: "Photography", category: "Photographer" } });
    expect(placeDrop({ need: "Elephant hire", newNeed: "elephant_hire" }, slots)).toBeNull();
  });
});
