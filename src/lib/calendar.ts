import { BRAND } from "./brand";
// A calendar file (.ics) of the event: every session at its time, and every payment
// and deadline on its day, for Google, Apple or Outlook calendars. Made in the browser.

type Ceremony = { _id: string; name: string; date: string; startTime?: string; endTime?: string; location?: string };
type Due = { _id: string; label: string; dueDate: string; kind: "payment" | "deadline"; amount?: number; vendorName?: string; doneAt?: number };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const day = (iso: string) => iso.replace(/-/g, "");
const next = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines folded at 75 characters, as the format asks. */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push((i ? " " : "") + line.slice(i, i + 74));
  return out.join("\r\n");
}

export function calendarFile(eventName: string, sessions: Ceremony[], dues: Due[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${BRAND.name}//Event plan//EN`, "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(eventName)}`];
  for (const e of sessions) {
    lines.push("BEGIN:VEVENT", `UID:ceremony-${e._id}@${BRAND.domain}`, `DTSTAMP:${stamp()}`, `SUMMARY:${esc(`${e.name} · ${eventName}`)}`);
    if (e.startTime) {
      // Floating local time: the event happens at that clock time wherever it is.
      lines.push(`DTSTART:${day(e.date)}T${e.startTime.replace(":", "")}00`);
      if (e.endTime) lines.push(`DTEND:${day(e.date)}T${e.endTime.replace(":", "")}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day(e.date)}`, `DTEND;VALUE=DATE:${day(next(e.date))}`);
    }
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push("END:VEVENT");
  }
  for (const d of dues) {
    if (d.doneAt) continue;
    const title = `${d.kind === "payment" ? "Pay" : "Due"}: ${d.label}${d.vendorName ? ` (${d.vendorName})` : ""}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:due-${d._id}@${BRAND.domain}`,
      `DTSTAMP:${stamp()}`,
      `SUMMARY:${esc(title)}`,
      `DTSTART;VALUE=DATE:${day(d.dueDate)}`,
      `DTEND;VALUE=DATE:${day(next(d.dueDate))}`,
      "BEGIN:VALARM",
      "TRIGGER:-P3D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadCalendar(eventName: string, sessions: Ceremony[], dues: Due[]): void {
  const blob = new Blob([calendarFile(eventName, sessions, dues)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${eventName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
