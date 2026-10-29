import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Who an uploaded file belongs to. An upload's id is known only to the person who uploaded
 * it, so the first person to use it owns it; anyone else naming that id is refused before
 * the file is read, kept or deleted.
 */
export const NOT_YOURS = "That file didn't come from you. Add it again.";

export async function claimUpload(ctx: MutationCtx, storageId: Id<"_storage">, userId: Id<"users">): Promise<void> {
  const claim = await ctx.db
    .query("uploadClaims")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .unique();
  if (claim) {
    if (claim.userId !== userId) throw new ConvexError(NOT_YOURS);
    return;
  }
  await ctx.db.insert("uploadClaims", { storageId, userId, claimedAt: Date.now() });
}
