import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { claimUpload } from "./lib/uploads";

/** For actions, which have no db: claim the upload for the caller, or refuse it. */
export const claim = internalMutation({
  args: { storageId: v.id("_storage"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await claimUpload(ctx, args.storageId, args.userId);
    return null;
  },
});
