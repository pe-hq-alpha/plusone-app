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

/** What a calendar file needs: the event, and its parts' times when it is one day. */
export type CalendarEvent = {
  name: string;
  startDate: string;
  endDate: string;
  area?: string;
  city: string;
  sessions: Array<{ startTime?: string; endTime?: string }>;
};

/** A calendar file for the whole event, made in the browser; nothing is sent anywhere. */
export function downloadIcs(ev: CalendarEvent): void {
  const day = (iso: string, add = 0) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + add);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };
  const esc = (t: string) => t.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const first = ev.sessions[0];
  const hhmm = (t?: string) => (t && /^\d{2}:\d{2}$/.test(t) ? t : undefined);
  const start = hhmm(first?.startTime);
  const timed = start && ev.startDate === ev.endDate;
  const when = timed
    ? `DTSTART:${day(ev.startDate)}T${start.replace(":", "")}00\r\nDTEND:${day(ev.startDate)}T${(hhmm(first?.endTime) ?? start).replace(":", "")}00`
    : `DTSTART;VALUE=DATE:${day(ev.startDate)}\r\nDTEND;VALUE=DATE:${day(ev.endDate, 1)}`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PlusOne//Event//EN", "BEGIN:VEVENT",
    `UID:${day(ev.startDate)}-${Math.random().toString(36).slice(2)}@plusoneevents.site`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    when,
    `SUMMARY:${esc(ev.name)}`,
    `LOCATION:${esc([ev.area, ev.city].filter(Boolean).join(", "))}`,
    `URL:${window.location.href.split("?")[0]}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${ev.name.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "event"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
