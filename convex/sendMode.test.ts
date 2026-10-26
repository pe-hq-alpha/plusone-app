/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { insertEvent } from "./events";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

const party = {
  name: "Amma's 60th", host: "Lakshmi", coHost: "", startDate: "2027-02-10", endDate: "2027-02-10", city: "Chennai",
  currency: "INR", totalBudget: 300000, eventType: "birthday" as const,
};

test("a new event holds every email for the host to read first; a sample does not", async () => {
  const t = setup();
  const { real, sample } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "lakshmi@example.com" });
    return {
      real: await insertEvent(ctx, userId, party),
      sample: await insertEvent(ctx, userId, party, { demo: true }),
    };
  });
  expect((await t.run((ctx) => ctx.db.get(real)))?.sendMode).toBe("review");
  expect((await t.run((ctx) => ctx.db.get(sample)))?.sendMode).toBeUndefined();
});

test("a follow-up held for review counts toward the cap and waits for the host", async () => {
  const t = setup();
  const threadId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "lakshmi@example.com" });
    const eventId = await insertEvent(ctx, userId, party);
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [], category: "Catering", title: "Lunch", budget: 60000, status: "contacted" });
    const vendorId = await ctx.db.insert("vendors", {
      eventId, slotId, name: "Annam Caterers", email: "hello@annam.example", category: "Catering",
      packages: [], highlights: [], sourceUrls: [], shortlisted: true, scrapedAt: 0, reviewHighlights: [], pagesRead: [],
    });
    return await ctx.db.insert("threads", { eventId, slotId, vendorId, status: "sent", followUpCount: 1, nextFollowUpAt: 1 });
  });
  await t.mutation(internal.threads.holdFollowUp, { threadId });
  const thread = await t.run((ctx) => ctx.db.get(threadId));
  expect(thread?.followUpCount).toBe(2);
  expect(thread?.status).toBe("needs_attention");
  expect(thread?.attentionReason).toBe("reply_to_review");
  expect(thread?.nextFollowUpAt).toBeUndefined();
});
