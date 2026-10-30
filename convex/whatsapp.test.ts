/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
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

async function seed(t: T, demo = false) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "priya@example.com", name: "Priya", whatsappNumber: "+919840012345", whatsappOptInAt: 1 });
    const viewerId = await ctx.db.insert("users", { email: "dad@example.com", name: "Dad", whatsappNumber: "+919840099999", whatsappOptInAt: 1 });
    const plannerId = await ctx.db.insert("users", { email: "anu@example.com", name: "Anu" });
    const eventId = await ctx.db.insert("events", {
      name: "Amma's 60th", host: "Priya", coHost: "", startDate: "2027-02-12", endDate: "2027-02-12",
      city: "Chennai", currency: "INR", totalBudget: 400000, eventType: "birthday", createdBy: ownerId, ...(demo ? { demo: true } : {}),
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: viewerId, role: "viewer" });
    await ctx.db.insert("members", { eventId, userId: plannerId, role: "planner" });
    return { ownerId, viewerId, plannerId, eventId };
  });
}

function whatsappOn() {
  vi.stubEnv("WHATSAPP_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456");
  vi.stubEnv("SITE_URL", "https://app.example");
  const fetchFn = vi.fn(async () => Response.json({ messages: [{ id: "wamid.1" }] }));
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

describe("asking for WhatsApp updates", () => {
  test("a number is kept in +E.164, and one that isn't a number is refused", async () => {
    const t = setup();
    const { plannerId } = await seed(t);
    expect(await as(t, plannerId).mutation(api.whatsapp.optIn, { number: "98400 55555" })).toBe("+919840055555");
    expect((await as(t, plannerId).query(api.whatsapp.mine, {})).number).toBe("+919840055555");
    await expect(as(t, plannerId).mutation(api.whatsapp.optIn, { number: "12" })).rejects.toThrow(/doesn't look like/);
    await as(t, plannerId).mutation(api.whatsapp.optOut, {});
    expect((await as(t, plannerId).query(api.whatsapp.mine, {})).number).toBeNull();
  });
});

describe("a vendor's quote on WhatsApp", () => {
  test("goes to the planners who asked, never a viewer, as the approved template with a link to Compare", async () => {
    const t = setup();
    const { eventId } = await seed(t);
    const fetchFn = whatsappOn();
    await t.action(internal.whatsapp.notifyQuote, { eventId, vendorName: "Kaveri Feast Co.", needTitle: "Catering" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/123456/messages");
    const body = JSON.parse(String(init.body));
    expect(body.to).toBe("919840012345");
    expect(body.template.name).toBe("quote_received");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      "Kaveri Feast Co.",
      "Catering",
      `https://app.example/e/${eventId}/decisions`,
    ]);
  });

  test("a sample event, or keys not set, sends nothing", async () => {
    const t = setup();
    const demo = await seed(t, true);
    const fetchFn = whatsappOn();
    await t.action(internal.whatsapp.notifyQuote, { eventId: demo.eventId, vendorName: "Kaveri", needTitle: "Catering" });
    expect(fetchFn).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    const real = await seed(t);
    await t.action(internal.whatsapp.notifyQuote, { eventId: real.eventId, vendorName: "Kaveri", needTitle: "Catering" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("a failed send is logged and doesn't throw: the quote is already in Compare", async () => {
    const t = setup();
    const { eventId } = await seed(t);
    whatsappOn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(t.action(internal.whatsapp.notifyQuote, { eventId, vendorName: "Kaveri", needTitle: "Catering" })).resolves.toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("Meta's webhook", () => {
  async function sign(body: string, secret: string) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    return `sha256=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  test("answers Meta's check only with our verify token", async () => {
    const t = setup();
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify-me");
    const ok = await t.fetch("/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    expect((await t.fetch("/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42")).status).toBe(403);
  });

  test("a signed STOP turns that number off; an unsigned one is refused", async () => {
    const t = setup();
    const { ownerId } = await seed(t);
    vi.stubEnv("WHATSAPP_APP_SECRET", "app-secret");
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "919840012345", type: "text", text: { body: "STOP" } }] } }] }] });
    expect((await t.fetch("/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": "sha256=00" } })).status).toBe(401);
    expect((await t.run((ctx) => ctx.db.get(ownerId)))?.whatsappNumber).toBe("+919840012345");
    const res = await t.fetch("/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": await sign(body, "app-secret") } });
    expect(res.status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(ownerId)))?.whatsappNumber).toBeUndefined();
  });
});
