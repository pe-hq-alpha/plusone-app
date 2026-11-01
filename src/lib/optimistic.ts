import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

/**
 * Optimistic updates for the actions people repeat most. The screen changes the moment
 * someone acts, and Convex replaces the guess with the server's answer when it arrives,
 * so a round trip to the backend never shows as a wait. Each one touches every loaded
 * copy of the list (the Overview's notes to self, and the guest list).
 */

type Task = Doc<"tasks">;

// Same order as the server: open first, then by due date, then as set out.
function byPlan(a: Task, b: Task): number {
  return (
    Number(a.done) - Number(b.done) ||
    (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
    (a.order ?? 0) - (b.order ?? 0) ||
    a._creationTime - b._creationTime
  );
}

export function addTask(store: OptimisticLocalStore, args: FunctionArgs<typeof api.tasks.add>) {
  const title = args.title.trim().slice(0, 200);
  if (!title) return;
  for (const { args: q, value } of store.getAllQueries(api.tasks.list)) {
    if (!value || q.eventId !== args.eventId) continue;
    if (q.sessionId && q.sessionId !== args.sessionId) continue;
    const draft: Task = {
      _id: `optimistic-${Date.now()}` as Id<"tasks">,
      _creationTime: Date.now(),
      eventId: args.eventId,
      title,
      done: false,
      sessionId: args.sessionId,
      dueAt: args.dueAt,
    };
    store.setQuery(api.tasks.list, q, [...value, draft].sort(byPlan));
  }
}

export function updateTask(store: OptimisticLocalStore, args: FunctionArgs<typeof api.tasks.update>) {
  // A null in the patch clears the field; undefined leaves it as it is.
  const { dueAt, sessionId, ...rest } = args.patch as typeof args.patch & { sessionId?: Id<"sessions"> | null };
  for (const { args: q, value } of store.getAllQueries(api.tasks.list)) {
    if (!value || !value.some((t) => t._id === args.taskId)) continue;
    const next = value.map((t): Task =>
      t._id === args.taskId
        ? {
            ...t,
            ...rest,
            ...(dueAt === undefined ? {} : { dueAt: dueAt ?? undefined }),
            ...(sessionId === undefined ? {} : { sessionId: sessionId ?? undefined }),
          }
        : t,
    );
    store.setQuery(api.tasks.list, q, next.sort(byPlan));
  }
}

export function removeTask(store: OptimisticLocalStore, args: FunctionArgs<typeof api.tasks.remove>) {
  for (const { args: q, value } of store.getAllQueries(api.tasks.list)) {
    if (value?.some((t) => t._id === args.taskId)) store.setQuery(api.tasks.list, q, value.filter((t) => t._id !== args.taskId));
  }
}

export function updateGuest(store: OptimisticLocalStore, args: FunctionArgs<typeof api.guests.update>) {
  for (const { args: q, value } of store.getAllQueries(api.guests.list)) {
    if (!value?.some((g) => g._id === args.guestId)) continue;
    store.setQuery(api.guests.list, q, value.map((g) => (g._id === args.guestId ? { ...g, ...args.patch } as typeof g : g)));
  }
}

export function removeGuest(store: OptimisticLocalStore, args: FunctionArgs<typeof api.guests.remove>) {
  for (const { args: q, value } of store.getAllQueries(api.guests.list)) {
    if (value?.some((g) => g._id === args.guestId)) store.setQuery(api.guests.list, q, value.filter((g) => g._id !== args.guestId));
  }
}
