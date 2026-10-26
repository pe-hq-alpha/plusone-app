/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const CLERK = "https://clerk.example.test";
function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const clerkUser = (t: T, subject: string, email?: string, emailVerified = true, name?: string) =>
  t.withIdentity({ issuer: CLERK, subject, tokenIdentifier: `${CLERK}|${subject}`, email, emailVerified, name });
const guest = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

beforeEach(() => vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", CLERK));
afterEach(() => vi.unstubAllEnvs());

describe("signing in with Clerk", () => {
  test("a new person gets an account on their first sign-in, and the same one after", async () => {
    const t = setup();
    const first = await clerkUser(t, "user_new", "Anita@Example.com", true, "Anita Rao").mutation(api.users.syncClerk, {});
    expect(first.created).toBe(true);
    const again = await clerkUser(t, "user_new", "anita@example.com").mutation(api.users.syncClerk, {});
    expect(again).toEqual({ userId: first.userId, created: false });
    const me = await clerkUser(t, "user_new").query(api.users.me, {});
    expect(me).toMatchObject({ email: "anita@example.com", name: "Anita Rao" });
  });

  test("someone with an account from before keeps it, events and all, matched by verified email", async () => {
    const t = setup();
    const { oldId, eventId } = await t.run(async (ctx) => {
      const oldId = await ctx.db.insert("users", { email: "priya@example.com", name: "Priya" });
      const eventId = await ctx.db.insert("events", {
        name: "Priya & Arjun", host: "Priya", coHost: "Arjun", startDate: "2027-02-12", endDate: "2027-02-14",
        city: "Ahmedabad", currency: "INR", totalBudget: 2500000, eventType: "wedding", createdBy: oldId,
      });
      await ctx.db.insert("members", { eventId, userId: oldId, role: "owner" });
      return { oldId, eventId };
    });
    const { userId, created } = await clerkUser(t, "user_priya", "priya@example.com").mutation(api.users.syncClerk, {});
    expect(created).toBe(false);
    expect(userId).toBe(oldId);
    const event = await clerkUser(t, "user_priya").query(api.events.get, { eventId });
    expect(event?.event.name).toBe("Priya & Arjun");
  });

  test("an unverified email never takes over someone else's account", async () => {
    const t = setup();
    const oldId = await t.run((ctx) => ctx.db.insert("users", { email: "priya@example.com", name: "Priya" }));
    const { userId, created } = await clerkUser(t, "user_other", "priya@example.com", false).mutation(api.users.syncClerk, {});
    expect(created).toBe(true);
    expect(userId).not.toBe(oldId);
  });

  test("a demo guest is never matched, and still signs in with its own token", async () => {
    const t = setup();
    const guestId = await t.run((ctx) => ctx.db.insert("users", { isAnonymous: true, email: "x@example.com" }));
    const { userId } = await clerkUser(t, "user_x", "x@example.com").mutation(api.users.syncClerk, {});
    expect(userId).not.toBe(guestId);
    const me = await guest(t, guestId).query(api.users.me, {});
    expect(me?.isGuest).toBe(true);
  });

  test("a Clerk sign-in with no account yet is treated as signed out until it syncs", async () => {
    const t = setup();
    expect(await clerkUser(t, "user_later", "later@example.com").query(api.users.me, {})).toBeNull();
    await expect(clerkUser(t, "user_later").mutation(api.users.setName, { name: "Later" })).rejects.toThrow(/sign in/);
  });
});

describe("disposable email addresses", () => {
  test("a new account can't be made with one", async () => {
    const t = setup();
    await expect(clerkUser(t, "user_temp", "someone@mailinator.com").mutation(api.users.syncClerk, {})).rejects.toThrow(/disposable/);
    await expect(clerkUser(t, "user_temp2", "x@inbox.yopmail.com", false).mutation(api.users.syncClerk, {})).rejects.toThrow(/disposable/);
    const rows = await t.run((ctx) => ctx.db.query("users").take(10));
    expect(rows).toHaveLength(0);
  });
  test("an ordinary address is fine", async () => {
    const t = setup();
    const { created } = await clerkUser(t, "user_ok", "anita@gmail.com").mutation(api.users.syncClerk, {});
    expect(created).toBe(true);
  });
});
