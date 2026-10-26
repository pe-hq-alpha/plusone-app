import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { memberDoc, userSummary } from "./lib/docs";
import { role } from "./lib/validators";

export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(v.object({ member: memberDoc, user: v.union(userSummary, v.null()) })),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    const members = await ctx.db
      .query("members")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(50);
    const out = [];
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      out.push({ member, user: user ? { _id: user._id, name: user.name, email: user.email } : null });
    }
    return out;
  },
});

export const setRole = mutation({
  args: { memberId: v.id("members"), role },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new ConvexError("Member not found.");
    const { userId } = await requireMember(ctx, member.eventId, "owner");
    if (member.userId === userId && args.role !== "owner") {
      throw new ConvexError("You cannot demote yourself. Make someone else an owner first.");
    }
    await ctx.db.patch(args.memberId, { role: args.role });
    return null;
  },
});

export const remove = mutation({
  args: { memberId: v.id("members") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new ConvexError("Member not found.");
    const { userId } = await requireMember(ctx, member.eventId, "owner");
    if (member.userId === userId) throw new ConvexError("You cannot remove yourself.");
    await ctx.db.delete(args.memberId);
    // Close whatever link they came in on, so a removed person can't walk back in with it.
    // Links are single-use already; this also covers rows from before that rule.
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_eventId", (q) => q.eq("eventId", member.eventId))
      .take(200);
    for (const invite of invites) {
      if ((invite._id === member.inviteId || invite.acceptedBy === member.userId) && !invite.revokedAt) {
        await ctx.db.patch(invite._id, { revokedAt: Date.now() });
      }
    }
    return null;
  },
});

/** Who someone is to the couple. Anyone can say it of themselves; an owner can say it of anyone. */
export const setRelationship = mutation({
  args: { memberId: v.id("members"), relationship: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new ConvexError("Member not found.");
    const { userId, member: me } = await requireMember(ctx, member.eventId);
    if (member.userId !== userId && me.role !== "owner") {
      throw new ConvexError("Only an owner can change how someone else is described.");
    }
    const relationship = args.relationship.trim().replace(/\s+/g, " ").slice(0, 60);
    await ctx.db.patch(args.memberId, { relationship: relationship || undefined });
    return null;
  },
});
