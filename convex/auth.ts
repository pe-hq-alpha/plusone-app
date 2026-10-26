import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { rateLimiter } from "./rateLimits";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Accounts sign in with Clerk (convex/auth.config.ts, convex/users.ts). This is only
  // the demo's guest: no details asked, lands in a sample wedding (convex/demo.ts).
  providers: [Anonymous],
  callbacks: {
    // Runs inside the sign-in transaction, so a refusal here creates nothing. Only
    // brand-new users are counted: returning visitors are never slowed down.
    async afterUserCreatedOrUpdated(ctx, { existingUserId }) {
      if (existingUserId) return;
      const room = await rateLimiter.limit(ctx, "guestSignIns");
      if (!room.ok) throw new ConvexError("The demo is very busy right now. Try again in a few minutes.");
    },
  },
});
