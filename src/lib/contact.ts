/**
 * Reaching a vendor the way vendors in India are reached: WhatsApp and a call. A number is
 * read into international digits (an Indian 10-digit mobile gains 91), so wa.me and tel:
 * links work from any phone; anything that isn't a plausible number gives no link.
 */
export function phoneDigits(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = `91${d.slice(1)}`;
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** WhatsApp with the message already written; the person reads it and presses send. */
export function whatsappHref(raw: string | undefined | null, text: string): string | null {
  const d = phoneDigits(raw);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}

export function callHref(raw: string | undefined | null): string | null {
  const d = phoneDigits(raw);
  return d ? `tel:+${d}` : null;
}

/** The first message to a vendor about a need, in plain words. */
export function vendorHello(vendor: string, event: { name: string; date?: string; city?: string }, need: string): string {
  const when = event.date ? ` on ${event.date}` : "";
  const where = event.city ? ` in ${event.city}` : "";
  return `Hello ${vendor}, I'm planning ${event.name}${when}${where} and found you on PlusOne. Could we talk about ${need.toLowerCase()}?`;
}
