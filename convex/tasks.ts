import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { logActivity, requireMember } from "./lib/auth";

const taskDoc = v.object({
  _id: v.id("tasks"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  title: v.string(),
  dueAt: v.optional(v.number()),
  sessionId: v.optional(v.id("sessions")),
  done: v.boolean(),
  autoSource: v.optional(v.string()),
  slotId: v.optional(v.id("vendorSlots")),
  order: v.optional(v.number()),
});

/** Open first, then by due date (undated last), then in the order they were set out. */
function byPlan(a: Doc<"tasks">, b: Doc<"tasks">): number {
  return (
    Number(a.done) - Number(b.done) ||
    (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
    (a.order ?? 0) - (b.order ?? 0) ||
    a._creationTime - b._creationTime
  );
}

/** Every task on the wedding, or just one ceremony's checklist. */
export const list = query({
  args: { eventId: v.id("events"), sessionId: v.optional(v.id("sessions")) },
  returns: v.array(taskDoc),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId);
    const tasks = args.sessionId
      ? await ctx.db.query("tasks").withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId)).take(200)
      : await ctx.db.query("tasks").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).take(500);
    // Pre-made to-dos from before 1 Nov stay out of sight unless they were ticked; the host's own always show.
    return tasks.filter((t) => t.eventId === args.eventId && !(t.autoSource === "generation" && !t.done)).sort(byPlan);
  },
});

export const add = mutation({
  args: { eventId: v.id("events"), title: v.string(), sessionId: v.optional(v.id("sessions")), dueAt: v.optional(v.number()) },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    await requireMember(ctx, args.eventId, "planner");
    const title = args.title.trim().slice(0, 200);
    if (!title) throw new ConvexError("A task needs a few words.");
    if (args.sessionId) {
      const session = await ctx.db.get(args.sessionId);
      if (!session || session.eventId !== args.eventId) throw new ConvexError("That function isn't part of this event.");
    }
    return await ctx.db.insert("tasks", { eventId: args.eventId, title, sessionId: args.sessionId, dueAt: args.dueAt, done: false });
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    patch: v.object({
      title: v.optional(v.string()),
      done: v.optional(v.boolean()),
      dueAt: v.optional(v.union(v.number(), v.null())),
      sessionId: v.optional(v.union(v.id("sessions"), v.null())),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("That task is no longer there.");
    const { userId } = await requireMember(ctx, task.eventId, "planner");
    const { title, done, dueAt, sessionId } = args.patch;
    if (sessionId) {
      const session = await ctx.db.get(sessionId);
      if (!session || session.eventId !== task.eventId) throw new ConvexError("That function isn't part of this event.");
    }
    await ctx.db.patch(args.taskId, {
      ...(title !== undefined ? { title: title.trim().slice(0, 200) || task.title } : {}),
      ...(done !== undefined ? { done } : {}),
      ...(dueAt !== undefined ? { dueAt: dueAt ?? undefined } : {}),
      ...(sessionId !== undefined ? { sessionId: sessionId ?? undefined } : {}),
    });
    if (done && !task.done) {
      await logActivity(ctx, { eventId: task.eventId, actorUserId: userId, type: "note", text: `ticked off "${task.title}".`, refs: task.sessionId ? { sessionId: task.sessionId } : undefined });
    }
    return null;
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    await requireMember(ctx, task.eventId, "planner");
    await ctx.db.delete(args.taskId);
    return null;
  },
});
