/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof setup>;
const signedInAs = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function seed(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "maya@example.com" });
    const plannerId = await ctx.db.insert("users", { email: "sam@example.com" });
    const session = async (name: string, createdBy: Id<"users">) =>
      await ctx.db.insert("events", {
        name, host: "Maya", coHost: "", startDate: "2027-03-20", endDate: "2027-03-20", city: "Toronto",
        currency: "CAD", totalBudget: 2500, eventType: "birthday", createdBy,
      });
    // Maya's own event, with Sam invited as a planner.
    const mine = await session("Maya's birthday party", ownerId);
    await ctx.db.insert("members", { eventId: mine, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId: mine, userId: plannerId, role: "planner" });
    const slotId = await ctx.db.insert("vendorSlots", { eventId: mine, sessionIds: [], category: "Cake", title: "Cake", budget: 200, status: "research" });
    await ctx.db.insert("guests", { eventId: mine, name: "Priya", partySize: 1, rsvp: "pending", attendingCount: 0, sessionIds: [] });
    const fileId = await ctx.storage.store(new Blob(["quote"], { type: "application/pdf" }));
    await ctx.db.insert("contractChecks", { eventId: mine, storageId: fileId, filename: "quote.pdf", status: "pending", flags: [] });
    // Sam's event, which Maya co-owns.
    const shared = await session("Team offsite", plannerId);
    await ctx.db.insert("members", { eventId: shared, userId: plannerId, role: "owner" });
    await ctx.db.insert("members", { eventId: shared, userId: ownerId, role: "owner" });
    // Maya's sign-in records and a half-finished onboarding.
    const authSessionId = await ctx.db.insert("authSessions", { userId: ownerId, expirationTime: Date.now() + 1e9 });
    await ctx.db.insert("authAccounts", { userId: ownerId, provider: "password", providerAccountId: "maya@example.com" });
    await ctx.db.insert("onboardingDrafts", { userId: ownerId, name: "Maya", step: 1, state: "{}", pictures: [], updatedAt: 0 });
    return { ownerId, plannerId, mine, shared, slotId, fileId, authSessionId };
  });
}

async function finishDeleting(t: T) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } catch {
    // releaseInbox is an external call and is not part of what these tests check
  } finally {
    vi.useRealTimers();
  }
}

describe("deleting an event", () => {
  test("is refused to a planner", async () => {
    const t = setup();
    const { plannerId, mine } = await seed(t);
    await expect(
      signedInAs(t, plannerId).mutation(api.events.remove, { eventId: mine, confirmName: "Maya's birthday party" }),
    ).rejects.toThrow("This action requires the owner role");
  });

  test("is refused when the name typed does not match", async () => {
    const t = setup();
    const { ownerId, mine } = await seed(t);
    await expect(
      signedInAs(t, ownerId).mutation(api.events.remove, { eventId: mine, confirmName: "birthday" }),
    ).rejects.toThrow("That doesn't match the event's name");
    expect(await t.run((ctx) => ctx.db.get(mine))).not.toBeNull();
  });

  test("hides it from everyone at once and then removes every row and file", async () => {
    const t = setup();
    const { ownerId, plannerId, mine, shared, slotId, fileId } = await seed(t);
    await signedInAs(t, ownerId).mutation(api.events.remove, { eventId: mine, confirmName: "maya's birthday party" });
    // Gone from the planner's list straight away, before the background work runs.
    const listed = await signedInAs(t, plannerId).query(api.events.listMine, {});
    expect(listed.map((w) => w.event._id)).toEqual([shared]);
    await finishDeleting(t);
    const after = await t.run(async (ctx) => ({
      session: await ctx.db.get(mine),
      slot: await ctx.db.get(slotId),
      guests: await ctx.db.query("guests").collect(),
      file: await ctx.db.system.get(fileId),
      other: await ctx.db.get(shared),
    }));
    expect(after.session).toBeNull();
    expect(after.slot).toBeNull();
    expect(after.guests).toHaveLength(0);
    expect(after.file).toBeNull();
    expect(after.other).not.toBeNull();
  });
});

describe("deleting an account", () => {
  test("needs the word DELETE", async () => {
    const t = setup();
    const { ownerId } = await seed(t);
    await expect(signedInAs(t, ownerId).mutation(api.users.deleteAccount, { confirm: "yes" })).rejects.toThrow("Type DELETE to confirm.");
    expect(await t.run((ctx) => ctx.db.get(ownerId))).not.toBeNull();
  });

  test("removes the person, their sign-in records, their draft and the sessions only they own", async () => {
    const t = setup();
    const { ownerId, plannerId, mine, shared, authSessionId } = await seed(t);
    await signedInAs(t, ownerId).mutation(api.users.deleteAccount, { confirm: "delete" });
    await finishDeleting(t);
    const after = await t.run(async (ctx) => ({
      user: await ctx.db.get(ownerId),
      authSession: await ctx.db.get(authSessionId),
      accounts: await ctx.db.query("authAccounts").collect(),
      drafts: await ctx.db.query("onboardingDrafts").collect(),
      mine: await ctx.db.get(mine),
      shared: await ctx.db.get(shared),
      sharedMembers: await ctx.db.query("members").withIndex("by_eventId", (q) => q.eq("eventId", shared)).collect(),
      other: await ctx.db.get(plannerId),
    }));
    expect(after.user).toBeNull();
    expect(after.authSession).toBeNull();
    expect(after.accounts).toHaveLength(0);
    expect(after.drafts).toHaveLength(0);
    expect(after.mine).toBeNull();
    // The event with another owner stays, and only that owner is left on it.
    expect(after.shared).not.toBeNull();
    expect(after.sharedMembers.map((m) => m.userId)).toEqual([plannerId]);
    expect(after.other).not.toBeNull();
  });

  test("also clears their chats, feedback, visit logs and linked browsers, deletes their Clerk user, and keeps do-not-contact", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_example");
    const calls: { url: string; method?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return new Response(null, { status: 200 });
    });
    try {
      const t = setup();
      const { ownerId, plannerId, shared } = await seed(t);
      const visit = { ip: "203.0.113.7", host: "app.plusoneevents.site", path: "/", method: "GET", isBot: false, likelyProxy: false };
      const ids = await t.run(async (ctx) => {
        await ctx.db.patch(ownerId, { clerkId: "user_maya" });
        await ctx.db.insert("planningChats", { userId: ownerId, messages: [], state: "{}", step: "start", updatedAt: 0 });
        await ctx.db.insert("feedback", { userId: ownerId, category: "idea", message: "More colours" });
        const mineChat = await ctx.db.insert("chatMessages", { eventId: shared, userId: ownerId, role: "user", content: "Find a DJ" });
        const theirChat = await ctx.db.insert("chatMessages", { eventId: shared, userId: plannerId, role: "user", content: "And a cake" });
        await ctx.db.insert("visits", { ...visit, at: 1, clerkUserId: "user_maya", visitorId: "browser-maya" });
        await ctx.db.insert("visits", { ...visit, at: 2, visitorId: "browser-maya" });
        await ctx.db.insert("visitorLinks", { visitorId: "browser-maya", clerkUserId: "user_maya", firstSeen: 1, lastSeen: 2 });
        const someoneElse = await ctx.db.insert("visits", { ...visit, at: 3, visitorId: "browser-sam", clerkUserId: "user_sam" });
        const blocked = await ctx.db.insert("doNotContact", { address: "dj@example.com", reason: "asked_to_stop" });
        return { mineChat, theirChat, someoneElse, blocked };
      });
      await signedInAs(t, ownerId).mutation(api.users.deleteAccount, { confirm: "DELETE" });
      await finishDeleting(t);
      const after = await t.run(async (ctx) => ({
        planning: await ctx.db.query("planningChats").collect(),
        feedback: await ctx.db.query("feedback").collect(),
        mineChat: await ctx.db.get(ids.mineChat),
        theirChat: await ctx.db.get(ids.theirChat),
        visits: await ctx.db.query("visits").collect(),
        links: await ctx.db.query("visitorLinks").collect(),
        blocked: await ctx.db.get(ids.blocked),
      }));
      expect(after.planning).toHaveLength(0);
      expect(after.feedback).toHaveLength(0);
      expect(after.mineChat).toBeNull();
      expect(after.theirChat).not.toBeNull();
      expect(after.visits.map((r) => r._id)).toEqual([ids.someoneElse]);
      expect(after.links).toHaveLength(0);
      expect(after.blocked).not.toBeNull();
      expect(calls).toContainEqual({ url: "https://api.clerk.com/v1/users/user_maya", method: "DELETE" });
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  test("skips Clerk without a secret key", async () => {
    const t = setup();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "ravi@example.com", clerkId: "user_ravi" }));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await t.action(internal.users.deleteClerkUser, { clerkUserId: "user_ravi" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("CLERK_SECRET_KEY not set"), "user_ravi");
    log.mockRestore();
    expect(await t.run((ctx) => ctx.db.get(userId))).not.toBeNull();
  });
});
