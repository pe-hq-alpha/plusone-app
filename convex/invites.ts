import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { logActivity, requireAccount, requireMember } from "./lib/auth";
import { inviteDoc, eventDoc } from "./lib/docs";
import { role } from "./lib/validators";
import { hostsLabel } from "./lib/occasion";
import { comeBack, rateLimiter } from "./rateLimits";
import { track } from "./analytics";

/** How long an invite link works. It also works only once. */
export const INVITE_DAYS = 7;
const INVITE_MS = INVITE_DAYS * 24 * 60 * 60 * 1000;

/** When a link stops working. Rows made before expiry existed count from when they were made. */
export function inviteExpiresAt(invite: Doc<"invites">): number {
  return invite.expiresAt ?? invite._creationTime + INVITE_MS;
}

type InviteState = "open" | "used" | "cancelled" | "expired";

function inviteState(invite: Doc<"invites">, now: number): InviteState {
  if (invite.revokedAt) return "cancelled";
  if (invite.acceptedBy) return "used";
  if (inviteExpiresAt(invite) <= now) return "expired";
  return "open";
}

/** "p•••@gmail.com": enough for the right person to recognise, not enough to harvest. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

const cleanRelationship = (s?: string) => s?.trim().replace(/\s+/g, " ").slice(0, 60) || undefined;

export const create = mutation({
  args: { eventId: v.id("events"), role, email: v.optional(v.string()), relationship: v.optional(v.string()) },
  returns: v.object({ token: v.string(), inviteId: v.id("invites"), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<{ token: string; inviteId: Id<"invites">; expiresAt: number }> => {
    const { userId } = await requireMember(ctx, args.eventId, "planner");
    if (args.role === "owner") {
      // Only owners may mint owner invites.
      await requireMember(ctx, args.eventId, "owner");
    }
    const email = args.email?.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("That does not look like an email address.");
    // Links cost nothing to make, so they are limited too: a script could otherwise fill the table.
    const links = await rateLimiter.limit(ctx, "inviteLinks", { key: userId });
    if (!links.ok) throw new ConvexError(`That's a lot of invitations at once. Try again ${comeBack(links.retryAfter)}.`);
    if (email) {
      const room = await rateLimiter.limit(ctx, "memberInvites", { key: userId });
      if (!room.ok) {
        throw new ConvexError(`That's a lot of invitations at once. You can email more ${comeBack(room.retryAfter)}, or copy the link instead.`);
      }
    }
    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = Date.now() + INVITE_MS;
    const inviteId = await ctx.db.insert("invites", {
      eventId: args.eventId,
      token,
      role: args.role,
      email: email || undefined,
      relationship: cleanRelationship(args.relationship),
      createdBy: userId,
      expiresAt,
    });
    // Best-effort email from the event inbox; the link still works without it.
    if (email) await ctx.scheduler.runAfter(0, internal.agentmail.sendInvite, { inviteId });
    return { token, inviteId, expiresAt };
  },
});

/** Links still waiting to be used, so they can be seen and cancelled. */
export const listOpen = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      _id: v.id("invites"),
      role,
      email: v.optional(v.string()),
      relationship: v.optional(v.string()),
      expiresAt: v.number(),
      createdAt: v.number(),
      canCancel: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, member } = await requireMember(ctx, args.eventId, "planner");
    const now = Date.now();
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(100);
    return invites
      .filter((i) => inviteState(i, now) === "open")
      .map((i) => ({
        _id: i._id,
        role: i.role,
        email: i.email,
        relationship: i.relationship,
        expiresAt: inviteExpiresAt(i),
        createdAt: i._creationTime,
        canCancel: member.role === "owner" || i.createdBy === userId,
      }));
  },
});

/** Cancel an open link: an owner can cancel any, a planner the ones they made. */
export const revoke = mutation({
  args: { inviteId: v.id("invites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) return null;
    const { userId, member } = await requireMember(ctx, invite.eventId, "planner");
    if (member.role !== "owner" && invite.createdBy !== userId) {
      throw new ConvexError("Only an owner, or whoever made it, can cancel this invite.");
    }
    if (invite.revokedAt || invite.acceptedBy) return null;
    await ctx.db.patch(invite._id, { revokedAt: Date.now() });
    return null;
  },
});

/** Public: what the invite page shows before sign-in. A link that can't be used shows why. */
export const preview = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      state: v.union(v.literal("open"), v.literal("used"), v.literal("cancelled"), v.literal("expired")),
      eventName: v.string(),
      role,
      host: v.string(),
      coHost: v.string(),
      forEmail: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!invite) return null;
    const event = await ctx.db.get(invite.eventId);
    if (!event) return null;
    const state = inviteState(invite, Date.now());
    // Only an open link says anything about the wedding.
    if (state !== "open") return { state, eventName: "", role: invite.role, host: "", coHost: "" };
    return {
      state,
      eventName: event.name,
      role: invite.role,
      host: event.host,
      coHost: event.coHost,
      ...(invite.email ? { forEmail: maskEmail(invite.email) } : {}),
    };
  },
});

export const accept = mutation({
  args: { token: v.string() },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const userId = await requireAccount(ctx);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!invite) throw new ConvexError("This invite link is not valid.");
    const existing = await ctx.db
      .query("members")
      .withIndex("by_eventId_and_userId", (q) => q.eq("eventId", invite.eventId).eq("userId", userId))
      .unique();
    if (existing) return invite.eventId; // already in: idempotent, even on a used link
    const state = inviteState(invite, Date.now());
    if (state === "used") throw new ConvexError("This invite has already been used. Ask for a new link.");
    if (state === "cancelled") throw new ConvexError("This invite was cancelled. Ask for a new link.");
    if (state === "expired") throw new ConvexError(`Invite links work for ${INVITE_DAYS} days, and this one has run out. Ask for a new link.`);
    if (invite.email) {
      const user = await ctx.db.get(userId);
      if (user?.email?.toLowerCase() !== invite.email) {
        throw new ConvexError(`This invite was sent to ${maskEmail(invite.email)}. Sign in with that address to join.`);
      }
    }
    await ctx.db.insert("members", {
      eventId: invite.eventId,
      userId,
      role: invite.role,
      invitedEmail: invite.email,
      relationship: invite.relationship,
      inviteId: invite._id,
    });
    await ctx.db.patch(invite._id, { acceptedBy: userId, acceptedAt: Date.now() });
    await logActivity(ctx, {
      eventId: invite.eventId,
      actorUserId: userId,
      type: "member_joined",
      text: `joined as ${invite.role}.`,
    });
    await track(ctx, "planner.joined", userId, { role: invite.role });
    return invite.eventId;
  },
});

// ---- internal ---------------------------------------------------------------

export const getInternal = internalQuery({
  args: { inviteId: v.id("invites") },
  returns: v.union(v.object({ invite: inviteDoc, event: eventDoc, inviterLabel: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) return null;
    const event = await ctx.db.get(invite.eventId);
    if (!event) return null;
    const inviter = await ctx.db.get(invite.createdBy);
    return { invite, event, inviterLabel: inviter?.name ?? inviter?.email ?? hostsLabel(event) };
  },
});
