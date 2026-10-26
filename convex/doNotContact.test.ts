/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { disclosureFooter, looksLikeOptOut, optOutFooter } from "./lib/optOut";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof setup>;

async function seedConversation(t: T) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { email: "maya@example.com" });
    const strangerId = await ctx.db.insert("users", { email: "stranger@example.com" });
    const eventId = await ctx.db.insert("events", {
      name: "Maya\u2019s birthday party",
      host: "Maya",
      coHost: "",
      startDate: "2027-03-20",
      endDate: "2027-03-20",
      city: "Toronto",
      currency: "CAD",
      totalBudget: 2500,
     
      eventType: "birthday",
      createdBy: ownerId,
    });
    await ctx.db.insert("members", { eventId, userId: ownerId, role: "owner" });
    const slotId = await ctx.db.insert("vendorSlots", { eventId, sessionIds: [], category: "Catering", title: "Catering", budget: 800, status: "contacted" });
    const vendorId = await ctx.db.insert("vendors", {
      eventId, slotId, name: "The Long Table", email: "Hello@LongTable.example", category: "Catering",
      packages: [], highlights: [], sourceUrls: [], shortlisted: true, scrapedAt: 0, reviewHighlights: [], pagesRead: [],
    });
    const threadId = await ctx.db.insert("threads", { eventId, vendorId, slotId, status: "sent", followUpCount: 1, nextFollowUpAt: 1 });
    const draftId = await ctx.db.insert("messages", {
      eventId, threadId, direction: "out", kind: "follow_up", status: "draft",
      fromAddress: "maya@inbox.example", toAddress: "hello@longtable.example", subject: "Following up", bodyText: "Hi again", attachments: [],
    });
    return { ownerId, strangerId, eventId, slotId, threadId, draftId };
  });
}

const signedInAs = (t: T, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

describe("looksLikeOptOut", () => {
  test("recognises a one-word answer to the footer", () => {
    expect(looksLikeOptOut("STOP")).toBe(true);
    expect(looksLikeOptOut("unsubscribe.\n\nOn Tue, Maya wrote:\n> Hi there")).toBe(true);
  });

  test("recognises people asking to be left alone", () => {
    expect(looksLikeOptOut("Please stop emailing us, we are not taking bookings.")).toBe(true);
    expect(looksLikeOptOut("Kindly remove me from your list.")).toBe(true);
    expect(looksLikeOptOut("Do not contact this address again.")).toBe(true);
  });

  test("does not mistake an ordinary reply, or a newsletter footer, for one", () => {
    expect(looksLikeOptOut("Thanks! We stop serving at 10pm and the package is $1,850.")).toBe(false);
    expect(looksLikeOptOut("We are fully booked that weekend, sorry.")).toBe(false);
    expect(looksLikeOptOut("Thanks for your enquiry, we will reply soon.\n\nTo unsubscribe from our newsletter click here.")).toBe(false);
  });

  test("ignores the quoted message it is replying to", () => {
    expect(looksLikeOptOut("Happy to help, quote attached.\n\nOn Mon, Maya wrote:\n> reply STOP and we will not write again")).toBe(false);
  });
});

test("the footer says AI drafted it, names the hosts and says how to stop", () => {
  expect(optOutFooter("Maya")).toContain("Drafted by PlusOne's AI assistant on behalf of Maya.");
  expect(optOutFooter("Maya")).toContain("reply STOP");
});

describe("the disclosure line", () => {
  test("first contact and follow-ups carry the opt-out footer", () => {
    expect(disclosureFooter("inquiry", "Maya")).toBe(optOutFooter("Maya"));
    expect(disclosureFooter("follow_up", "Maya")).toBe(optOutFooter("Maya"));
  });

  test("PlusOne's own replies to a vendor say AI drafted them, unless the host wrote the words", () => {
    for (const kind of ["agent_reply", "negotiation", "booking_confirmation", "no_thanks"]) {
      expect(disclosureFooter(kind, "Maya & Sam")).toContain("Drafted by PlusOne's AI assistant on behalf of Maya & Sam.");
      expect(disclosureFooter(kind, "Maya & Sam")).not.toContain("STOP");
    }
    expect(disclosureFooter("agent_reply", "Maya", true)).toBe("");
  });

  test("guest invitations say they were sent with the AI assistant", () => {
    expect(disclosureFooter("rsvp_invite", "Maya")).toContain("Sent with PlusOne's AI assistant on behalf of Maya.");
    expect(disclosureFooter("notification", "Maya")).toBe("");
  });
});

describe("a vendor who asks to be left alone", () => {
  test("is added to the list, whatever the capitalisation of their address", async () => {
    const t = setup();
    const { threadId } = await seedConversation(t);
    await t.mutation(internal.doNotContact.recordOptOut, { threadId });
    expect(await t.query(internal.doNotContact.check, { address: "hello@longtable.example" })).toBe(true);
    expect(await t.query(internal.doNotContact.check, { address: " HELLO@longtable.example " })).toBe(true);
    expect(await t.query(internal.doNotContact.check, { address: "someone@else.example" })).toBe(false);
  });

  test("has the conversation closed, the follow-up cancelled and the unsent email withdrawn", async () => {
    const t = setup();
    const { threadId, draftId } = await seedConversation(t);
    await t.mutation(internal.doNotContact.recordOptOut, { threadId });
    const { thread, draft } = await t.run(async (ctx) => ({ thread: await ctx.db.get(threadId), draft: await ctx.db.get(draftId) }));
    expect(thread).toMatchObject({ status: "declined" });
    expect(thread?.nextFollowUpAt).toBeUndefined();
    expect(draft).toMatchObject({ status: "failed", errorMessage: "Not sent: they asked not to be contacted." });
  });

  test("is listed only once however many times they ask", async () => {
    const t = setup();
    const { threadId } = await seedConversation(t);
    await t.mutation(internal.doNotContact.recordOptOut, { threadId });
    await t.mutation(internal.doNotContact.recordOptOut, { threadId });
    expect(await t.run((ctx) => ctx.db.query("doNotContact").collect())).toHaveLength(1);
  });
});

describe("the host's own Don't contact again", () => {
  test("blocks the vendor for a planner on the event", async () => {
    const t = setup();
    const { ownerId, threadId } = await seedConversation(t);
    await signedInAs(t, ownerId).mutation(api.doNotContact.block, { threadId });
    expect(await t.query(internal.doNotContact.check, { address: "hello@longtable.example" })).toBe(true);
  });

  test("is refused to someone who is not on the event", async () => {
    const t = setup();
    const { strangerId, threadId } = await seedConversation(t);
    await expect(signedInAs(t, strangerId).mutation(api.doNotContact.block, { threadId })).rejects.toThrow("You are not a member of this event.");
    expect(await t.query(internal.doNotContact.check, { address: "hello@longtable.example" })).toBe(false);
  });
});

test("sending everything for a need skips a blocked vendor and says why", async () => {
  const t = setup();
  const { ownerId, slotId, threadId, draftId } = await seedConversation(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("doNotContact", { address: "hello@longtable.example", reason: "asked_to_stop", threadId });
  });
  const result = await signedInAs(t, ownerId).mutation(api.outreach.sendAllForSlot, { slotId });
  expect(result).toEqual({ queued: 0, skipped: ["The Long Table asked not to be contacted"] });
  expect(await t.run((ctx) => ctx.db.get(draftId))).toMatchObject({ status: "draft" });
});
