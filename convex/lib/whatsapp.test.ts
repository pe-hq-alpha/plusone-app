import { describe, expect, test } from "vitest";
import { stopsIn, templateBody, validSignature } from "./whatsapp";

/** Signs a body the way Meta does, with Web Crypto. */
async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `sha256=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

describe("a WhatsApp template message", () => {
  test("fills the approved template's parts in order, to the number without its plus", () => {
    expect(templateBody("+919840012345", "quote_received", "en", ["Kaveri Feast Co.", "Catering", "https://app.example/e/1/decisions"])).toEqual({
      messaging_product: "whatsapp",
      to: "919840012345",
      type: "template",
      template: {
        name: "quote_received",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Kaveri Feast Co." },
              { type: "text", text: "Catering" },
              { type: "text", text: "https://app.example/e/1/decisions" },
            ],
          },
        ],
      },
    });
  });
});

describe("Meta's webhook signature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ entry: [] });

  test("accepts Meta's own signature", async () => {
    expect(await validSignature(body, await sign(body, secret), secret)).toBe(true);
  });

  test("refuses a missing, wrong or tampered one", async () => {
    const signed = await sign(body, secret);
    expect(await validSignature(body, null, secret)).toBe(false);
    expect(await validSignature(body, "sha256=00", secret)).toBe(false);
    expect(await validSignature(`${body} `, signed, secret)).toBe(false);
    expect(await validSignature(body, signed, "another-secret")).toBe(false);
  });
});

describe("a reply on WhatsApp", () => {
  const message = (from: string, body: string) => ({ entry: [{ changes: [{ value: { messages: [{ from, type: "text", text: { body } }] } }] }] });

  test("STOP turns updates off for that number", () => {
    expect(stopsIn(message("919840012345", " Stop "))).toEqual(["+919840012345"]);
    expect(stopsIn(message("15551234567", "unsubscribe"))).toEqual(["+15551234567"]);
  });

  test("anything else is not a stop", () => {
    expect(stopsIn(message("919840012345", "stop the music"))).toEqual([]);
    expect(stopsIn({})).toEqual([]);
  });
});
