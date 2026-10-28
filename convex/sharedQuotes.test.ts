/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

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

/** Meta on, answering every call with the reading; the requests are kept to look at. Nothing reaches the network. */
function metaReads() {
  vi.stubEnv("MODEL_PROVIDER", "meta");
  vi.stubEnv("MODEL_API_KEY", "LLM_1_test");
  const fetchFn = vi.fn(async (_url: unknown, _init?: RequestInit) =>
    Response.json({
      model: "muse-spark-1.3",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(READING) } }],
      usage: { prompt_tokens: 1_500, completion_tokens: 900 },
    }),
  );
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

describe("a quote the host was sent outside the inbox", () => {
  test("a photo of it (a WhatsApp screenshot) is read into a quote on the vendor's thread", async () => {
    vi.useFakeTimers();
    const fetchFn = metaReads();
    const t = setup();
    const { ownerId, eventId, slotId, vendorId, storageId } = await eventWithVendor(t);

    await as(t, ownerId).mutation(api.sharedQuotes.add, { vendorId, storageId, filename: "WhatsApp Image.jpeg", contentType: "image/jpeg" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchFn).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    const parts = body.messages.at(-1).content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.some((p) => p.type === "image_url" && p.image_url!.url.startsWith("data:image/jpeg;base64,"))).toBe(true);

    const quotes = await t.run((ctx) => ctx.db.query("quotes").collect());
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ eventId, slotId, vendorId, total: 48000, headcountAssumed: 120, taxIncluded: false, fromAttachment: "WhatsApp Image.jpeg" });
    const thread = await t.run((ctx) => ctx.db.get(quotes[0].threadId));
    expect(thread?.status).toBe("quoted");
  });

  test("pasted text works too; nothing to read, or a viewer, is refused", async () => {
    vi.useFakeTimers();
    metaReads();
    const t = setup();
    const { ownerId, viewerId, vendorId } = await eventWithVendor(t);

    await expect(as(t, ownerId).mutation(api.sharedQuotes.add, { vendorId, text: "  " })).rejects.toThrow(/Paste their message or add a photo/);
    await expect(as(t, viewerId).mutation(api.sharedQuotes.add, { vendorId, text: "₹400 a plate" })).rejects.toThrow(/planner/);

    await as(t, ownerId).mutation(api.sharedQuotes.add, { vendorId, text: "Sir, ₹400 per plate for 120, GST extra. Advance ₹10,000." });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const messages = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ direction: "in", kind: "vendor_reply", bodyText: "Sir, ₹400 per plate for 120, GST extra. Advance ₹10,000." });
    expect(await t.run((ctx) => ctx.db.query("quotes").collect())).toHaveLength(1);
  });
});
