/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof setup>;
const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

async function seed(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "emma@example.com", name: "Emma" });
    const plannerId = await ctx.db.insert("users", { email: "mum@example.com", name: "Mum" });
    const eventId = await ctx.db.insert("events", {
      name: "Emma & James", host: "Emma", coHost: "James", startDate: "2027-07-15", endDate: "2027-07-15",
      city: "Austin", currency: "USD", totalBudget: 60000, eventType: "wedding", createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    await ctx.db.insert("members", { eventId, userId: plannerId, role: "planner" });
    const sessionId = await ctx.db.insert("sessions", { eventId, name: "Reception", date: "2027-07-15", dayIndex: 0, budget: 30000, guestCount: 120, color: "#74162a", order: 0 });
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [sessionId], category: "Venue", title: "Venue", budget: 13000, status: "booked" });
    const vendorId = await ctx.db.insert("vendors", { eventId, slotId, name: "The Oak Barn", email: "maria@oakbarn.example", phone: "+1 512 555 0100", category: "Venue", packages: [], highlights: [], sourceUrls: [], shortlisted: true, scrapedAt: 0, reviewHighlights: [], pagesRead: [] });
    await ctx.db.patch(slotId, { bookedVendorId: vendorId });
    await ctx.db.insert("budgetLines", { eventId, slotId, label: "Venue", planned: 13000, committed: 12000, paid: 3000 });
    await ctx.db.insert("dues", { eventId, vendorId, slotId, kind: "payment", label: "Balance", amount: 9000, dueDate: "2027-06-15" });
    await ctx.db.insert("dues", { eventId, vendorId, slotId, kind: "deadline", label: "Final numbers", dueDate: "2027-06-30" });
    await ctx.db.insert("guests", { eventId, name: "Olivia Carter", email: "olivia@example.com", partySize: 2, rsvp: "yes", attendingCount: 2, sessionIds: [sessionId], dietary: "Vegetarian" });
    return { ownerId, plannerId, eventId };
  });
}

describe("read-only share links", () => {
  test("only the couple can make one", async () => {
    const t = setup();
    const { plannerId, eventId } = await seed(t);
    await expect(as(t, plannerId).mutation(api.shareLinks.create, { eventId, label: "Mum", showMoney: false })).rejects.toThrow();
  });

  test("shows the plan without contacts, names or money unless asked", async () => {
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    const token = await as(t, ownerId).mutation(api.shareLinks.create, { eventId, label: "Mum and Dad", showMoney: false });
    const plan = await t.query(api.shareLinks.view, { token });
    expect(plan?.name).toBe("Emma & James");
    expect(plan?.vendors[0].bookedName).toBe("The Oak Barn");
    expect(plan?.guests).toEqual({ invited: 1, coming: 2 });
    expect(plan?.budget).toBeNull();
    expect(plan?.dues.map((d) => d.label)).toEqual(["Final numbers"]);
    const text = JSON.stringify(plan);
    for (const secret of ["oakbarn", "555", "Olivia", "olivia@", "Vegetarian", "13000", "30000"]) expect(text).not.toContain(secret);

    const withMoney = await as(t, ownerId).mutation(api.shareLinks.create, { eventId, label: "The venue", showMoney: true });
    const full = await t.query(api.shareLinks.view, { token: withMoney });
    expect(full?.budget).toEqual({ total: 60000, committed: 12000, paid: 3000 });
    expect(full?.dues.map((d) => d.label).sort()).toEqual(["Balance", "Final numbers"]);
  });

  test("a turned-off or made-up link shows nothing", async () => {
    const t = setup();
    const { ownerId, eventId } = await seed(t);
    const token = await as(t, ownerId).mutation(api.shareLinks.create, { eventId, label: "Mum", showMoney: true });
    const [link] = await as(t, ownerId).query(api.shareLinks.list, { eventId });
    await as(t, ownerId).mutation(api.shareLinks.revoke, { linkId: link._id });
    expect(await t.query(api.shareLinks.view, { token })).toBeNull();
    expect(await t.query(api.shareLinks.view, { token: "not-a-real-token-at-all" })).toBeNull();
  });
});
