/**
 * The names an event's inbox can take, most natural first.
 *
 * Vendors see this address on every email, and spam filters look at it too: a local
 * part that reads like a person ("priya.and.arjun") lands better than one that ends in
 * random characters. So the couple's first names come first, the wedding year is added
 * only when that name is already taken, then a number, and a short id only as a last
 * resort so creation never fails for want of a name.
 */
export function inboxUsernames(host: string, coHost: string, startDate: string, id: string): string[] {
  const first = (name: string) =>
    (name.trim().split(/\s+/)[0] ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20);
  const a = first(host);
  const b = first(coHost);
  const base = a && b ? `${a}.and.${b}` : a || b || "event";
  const year = /^\d{4}/.test(startDate) ? startDate.slice(0, 4) : "";
  const names = [base];
  if (year) names.push(`${base}.${year}`);
  for (let n = 2; n <= 4; n++) names.push(year ? `${base}.${year}.${n}` : `${base}.${n}`);
  const short = id.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (short) names.push(`${base}.${short}`);
  return names;
}
