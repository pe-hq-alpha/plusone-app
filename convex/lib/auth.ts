import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { APP_ACTOR } from "./brand";
import type { ActivityActorKind, ActivityType, Role } from "./validators";

const ROLE_RANK: Record<Role, number> = { viewer: 0, planner: 1, owner: 2 };

/** Clerk's issuer for this deployment, when accounts sign in with Clerk. */
export function clerkIssuer(): string | undefined {
  return process.env.CLERK_JWT_ISSUER_DOMAIN?.replace(/\/$/, "") || undefined;
}

/** Whether a token came from Clerk (an account) rather than a demo guest's own token. */
export function isClerkIdentity(identity: { issuer: string } | null): boolean {
  const issuer = clerkIssuer();
  return Boolean(identity && issuer && identity.issuer.replace(/\/$/, "") === issuer);
}

/**
 * The signed-in user, or null. An account is found by its Clerk user; a demo guest by
 * its own token. An account's row is made on its first sign-in (`users.syncClerk`).
 */
export async function currentUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  if (isClerkIdentity(identity)) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    return user?._id ?? null;
  }
  return await getAuthUserId(ctx);
}

/** Throws a readable ConvexError when the caller is not signed in. */
export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await currentUserId(ctx);
  if (!userId) throw new ConvexError("Please sign in to continue.");
  return userId;
}

/**
 * Like `requireUserId`, but refuses demo guests. Anyone can become a guest in one
 * request, so anything that creates a real wedding or joins one needs an account:
 * a guest's own wedding would otherwise get the full sending and search allowances.
 */
export async function requireAccount(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId);
  if (!user || user.isAnonymous) throw new ConvexError("Create an account to plan your own event.");
  return userId;
}

/**
 * Verifies the caller is a member of the wedding with at least `minRole`.
 * Role order: viewer < planner < owner.
 */
export async function requireMember(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  minRole: Role = "viewer",
): Promise<{ userId: Id<"users">; member: Doc<"members">; event: Doc<"events"> }> {
  const userId = await requireUserId(ctx);
  const member = await ctx.db
    .query("members")
    .withIndex("by_eventId_and_userId", (q) => q.eq("eventId", eventId).eq("userId", userId))
    .unique();
  if (!member) throw new ConvexError("You are not a member of this event.");
  if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
    throw new ConvexError(`This action requires the ${minRole} role (you are a ${member.role}).`);
  }
  const event = await ctx.db.get(eventId);
  if (!event) throw new ConvexError("Event not found.");
  return { userId, member, event };
}

/**
 * Verifies the caller is on PlusOne's own team (Ops). Admins can do everything a
 * reviewer can. Demo guests never are, whatever their row says.
 */
export async function requireStaff(
  ctx: QueryCtx | MutationCtx,
  minRole: "reviewer" | "admin" = "reviewer",
): Promise<{ userId: Id<"users">; role: "reviewer" | "admin" }> {
  const userId = await requireUserId(ctx);
  const user = await ctx.db.get(userId);
  const role = user && !user.isAnonymous ? user.staffRole : undefined;
  if (!role || (minRole === "admin" && role !== "admin")) throw new ConvexError("This page is for the PlusOne team.");
  return { userId, role };
}

/** Human label for the acting user, used in the activity feed. */
export async function actorLabelFor(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<string> {
  const user = await ctx.db.get(userId);
  return user?.name?.trim() || nameFromEmail(user?.email) || "Someone";
}

/** "olivia.carter@…" becomes "Olivia Carter": a name to show, never the address itself. */
export function nameFromEmail(email: string | undefined): string | undefined {
  const local = email?.split("@")[0];
  if (!local) return undefined;
  return (
    local
      .replace(/[._-]+/g, " ")
      .replace(/\d+/g, "")
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || undefined
  );
}

export async function logActivity(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    actorUserId?: Id<"users">;
    actorLabel?: string;
    actorKind?: ActivityActorKind;
    type: ActivityType;
    text: string;
    refs?: {
      vendorId?: Id<"vendors">;
      threadId?: Id<"threads">;
      slotId?: Id<"vendorSlots">;
      guestId?: Id<"guests">;
      sessionId?: Id<"sessions">;
    };
  },
): Promise<Id<"activity">> {
  // No label and no user means the app did it itself.
  const byApp = args.actorLabel === undefined && !args.actorUserId;
  const actorLabel = args.actorLabel ?? (args.actorUserId ? await actorLabelFor(ctx, args.actorUserId) : APP_ACTOR);
  const actorKind = args.actorKind ?? (byApp ? "app" : args.actorUserId ? "person" : undefined);
  return await ctx.db.insert("activity", {
    eventId: args.eventId,
    actorUserId: args.actorUserId,
    actorLabel,
    actorKind,
    type: args.type,
    text: args.text,
    refs: args.refs,
  });
}

/** Clamp a client-supplied limit to a sane integer range. */
export function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(limit)));
}
