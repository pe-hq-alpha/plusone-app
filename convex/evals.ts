import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { readVendorReply } from "./claude";
import { EVAL_GROUPS } from "./lib/evalQuotes";
import { type QuoteScore, scoreQuote, totals } from "./lib/evalScore";
import { missingCharges as flagMissing, sheetFor } from "./lib/standardSheet";
import type { QuoteLine } from "./lib/validators";

type Read = { total: number; currency: string; includes: string[]; excludes: string[]; lines: QuoteLine[]; headcountAssumed?: number; taxIncluded?: boolean };

/**
 * The missing-charge evaluation, run by hand on the deployment whose models it should
 * measure (`npx convex run evals:missingCharges` on production, for Muse Spark): each of
 * the 18 quotes in `lib/evalQuotes.ts` is read by the same reader real replies go through,
 * then the same fixed rules flag what it leaves unsettled against the others in its group,
 * and the flags are scored against the hand-marked answer key.
 */

// The hosts' side of the prompt: a 60th birthday lunch for 120 in Chennai. Not a stored
// event, so its calls are costed without one.
const EVENT = { startDate: "2027-01-30", endDate: "2027-01-30", currency: "INR", eventType: "birthday" } as unknown as Doc<"events">;

export const missingCharges = internalAction({
  args: {},
  returns: v.any(),
  handler: async (ctx): Promise<{ ranAt: string; seconds: number; totals: ReturnType<typeof totals>; scores: QuoteScore[] }> => {
    const started = Date.now();
    const scores: QuoteScore[] = [];
    for (const group of EVAL_GROUPS) {
      const sheet = sheetFor(group.category);
      if (!sheet) throw new Error(`No standard sheet for ${group.category}`);
      // Read the group's quotes three at a time, then flag each against the rest of its group.
      const read: Read[] = [];
      for (let i = 0; i < group.quotes.length; i += 3) {
        read.push(
          ...(await Promise.all(
            group.quotes.slice(i, i + 3).map(async (q): Promise<Read> => {
              const r = await readVendorReply(ctx, { event: EVENT, slot: null, vendorName: q.vendor, subject: "Re: your enquiry", body: q.text });
              return {
                total: r.total ?? 0,
                currency: r.currency ?? "INR",
                includes: r.includes,
                excludes: r.excludes,
                lines: r.lines.map((l) => ({ item: l.item, kind: l.kind, unit: l.unit, quantity: l.quantity ?? undefined, unitPrice: l.unitPrice ?? undefined, amount: l.amount, optional: l.optional || undefined })),
                headcountAssumed: r.headcountAssumed ?? undefined,
                taxIncluded: r.taxIncluded ?? undefined,
              };
            }),
          )),
        );
      }
      group.quotes.forEach((q, i) => {
        const others = read.filter((_, j) => j !== i);
        const flagged = flagMissing(read[i], sheet, others).map((m) => m.key);
        scores.push(scoreQuote(q.vendor, group.category, q.expected, flagged));
      });
    }
    return { ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), totals: totals(scores), scores };
  },
});
