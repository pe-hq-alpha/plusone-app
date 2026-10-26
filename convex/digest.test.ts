/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { digestEmail, type DigestData } from "./lib/emailTemplates";
import { checkDigestUnsubscribe, digestUnsubscribeLink } from "./appEmails";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;

describe("weekly update", () => {
  const week = (over: Partial<DigestData> = {}): DigestData => ({
    firstName: "Emma", eventName: "Emma & James", eventType: "wedding", appUrl: "https://a", unsubscribeUrl: "https://u",
    daysToGo: 200, comingUp: [], changed: [], waiting: [], ...over,
  });

  test("a quiet week sends nothing", () => {
    expect(digestEmail(week())).toBeNull();
    const e = digestEmail(week({ comingUp: ["Mehndi, Feb 12"], waiting: ["Hill Country Table is waiting for your reply"] }))!;
    expect(e.subject).toBe("Emma & James: one thing needs you this week");
    expect(e.text).toContain("Turn off the weekly update: https://u");
    expect(e.text).toContain("WAITING ON YOU");
    expect(e.text).toContain("200 days until the wedding.");
  });

  test("the subject and countdown read right for one, many and none", () => {
    expect(digestEmail(week({ waiting: ["a", "b", "c"] }))!.subject).toBe("Emma & James: 3 things need you this week");
    expect(digestEmail(week({ changed: ["James booked the florist"] }))!.subject).toBe("Emma & James: your week ahead");
    expect(digestEmail(week({ daysToGo: 1, comingUp: ["x"] }))!.text).toContain("One day until the wedding.");
    expect(digestEmail(week({ daysToGo: 0, comingUp: ["x"] }))!.text).toContain("The wedding is here.");
  });

  test("any other event counts down to itself by name", () => {
    const birthday = (daysToGo: number) => digestEmail(week({ eventName: "Amma's 60th", eventType: "birthday", daysToGo, comingUp: ["x"] }))!;
    expect(birthday(30).text).toContain("30 days until Amma's 60th.");
    expect(birthday(1).text).toContain("One day until Amma's 60th.");
    expect(birthday(0).text).toContain("The day is here.");
    expect(birthday(30).text).not.toMatch(/wedding/i);
  });

  test("it greets someone without a name, and escapes what people typed", () => {
    const e = digestEmail(week({ firstName: "", eventName: "<b>Us</b>", comingUp: ["Tea & cake"] }))!;
    expect(e.text.startsWith("Hello,")).toBe(true);
    expect(e.html).toContain("&lt;b&gt;Us&lt;/b&gt;");
    expect(e.html).not.toContain("<b>Us</b>");
    expect(e.html).toContain("Tea &amp; cake");
  });

  test("it says what's waiting and coming, and it's on for the couple only by default", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const now = Date.parse("2030-06-01T10:00:00Z");
    const s = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { email: "emma@example.com", name: "Emma" });
      const mum = await ctx.db.insert("users", { email: "mum@example.com", name: "Mum" });
      const eventId = await ctx.db.insert("events", { name: "Emma & James", host: "Emma", coHost: "James", startDate: "2030-06-15", endDate: "2030-06-16", city: "Austin", currency: "USD", totalBudget: 40000, eventType: "wedding", createdBy: owner });
      await ctx.db.insert("members", { eventId, userId: owner, role: "owner" });
      await ctx.db.insert("members", { eventId, userId: mum, role: "viewer" });
      await ctx.db.insert("sessions", { eventId, name: "Reception", date: "2030-06-16", dayIndex: 1, budget: 1, guestCount: 100, color: "#74162a", order: 0 });
      await ctx.db.insert("dues", { eventId, kind: "payment", label: "Balance", amount: 9000, dueDate: "2030-05-25" });
      return { owner, mum, eventId };
    });
    const mine = await t.withIdentity({ subject: `${s.owner}|x` }).query(api.digest.preview, { eventId: s.eventId, now });
    expect(mine.on).toBe(true);
    expect(mine.email?.html).toContain("Balance payment, $9,000: was due May 25");
    expect(mine.email?.html).toContain("Reception, Jun 16");
    expect(mine.email?.html).toContain("14 days until the wedding.");
    const mums = await t.withIdentity({ subject: `${s.mum}|x` }).query(api.digest.preview, { eventId: s.eventId, now: now + DAY });
    expect(mums.on).toBe(false);
  });

  test("the stop link stops only the weekly update, and only for its own person", async () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "a-test-secret");
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
    const link = new URL(await digestUnsubscribeLink("k17abcdefghijklmnopq"));
    const token = link.searchParams.get("t")!;
    expect(link.searchParams.get("topic")).toBe("digest");
    expect(await checkDigestUnsubscribe("k17abcdefghijklmnopq", token)).toBe(true);
    expect(await checkDigestUnsubscribe("k17abcdefghijklmnopz", token)).toBe(false);
  });
});
