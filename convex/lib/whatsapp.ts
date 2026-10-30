/**
 * WhatsApp updates through Meta's WhatsApp Cloud API: the request body for an approved
 * template, the signature Meta puts on every webhook, and what an incoming message asks
 * for. Pure, so it is tested without the network; `convex/whatsapp.ts` does the sending.
 */

export const GRAPH = "https://graph.facebook.com/v23.0";

/** Meta's message to a number: an approved template with its body's numbered parts filled in, in order. */
export function templateBody(to: string, template: string, language: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    to: to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: template,
      language: { code: language },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.slice(0, 120) })) }],
    },
  };
}

/** Meta signs each webhook with the app secret: `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`. */
export async function validSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7).toLowerCase();
  // Compared in full, whatever the first difference, so the time taken says nothing about the secret.
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** The numbers that wrote "STOP" (or "unsubscribe") in a webhook's messages, as +E.164. */
export function stopsIn(payload: unknown): string[] {
  const out: string[] = [];
  const entries = (payload as { entry?: { changes?: { value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[] } }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        const text = m.type === "text" ? m.text?.body?.trim().toLowerCase() : undefined;
        if (m.from && text && /^(stop|unsubscribe|stop updates)$/.test(text)) out.push(`+${m.from.replace(/\D/g, "")}`);
      }
    }
  }
  return out;
}
