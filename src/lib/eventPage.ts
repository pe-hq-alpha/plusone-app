/** Small pieces shared by the event's own page and a guest's RSVP page, so the two read as one. */

/** "In 8 days", "Tomorrow", "Today"; nothing once it's past. */
export function daysAway(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = date.split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
  if (days < 0) return null;
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
}

export function mapsLink(place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;
}
