/**
 * One order for a wedding's ceremonies everywhere: by day, then by the couple's order
 * within that day. No Convex imports, so the browser sorts the same way the server does.
 */
export function byDayThenOrder(a: { dayIndex: number; order: number }, b: { dayIndex: number; order: number }): number {
  return a.dayIndex - b.dayIndex || a.order - b.order;
}
