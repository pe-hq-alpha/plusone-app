import { describe, expect, it } from "vitest";
import { callHref, phoneDigits, vendorHello, whatsappHref } from "./contact";

describe("reaching a vendor on WhatsApp or by phone", () => {
  it("reads Indian numbers written every common way into international digits", () => {
    expect(phoneDigits("98400 12345")).toBe("919840012345");
    expect(phoneDigits("+91 98400-12345")).toBe("919840012345");
    expect(phoneDigits("098400 12345")).toBe("919840012345");
    expect(phoneDigits("0091 9840012345")).toBe("919840012345");
    expect(phoneDigits("+1 (415) 555-0100")).toBe("14155550100");
  });

  it("gives no link for something that isn't a number", () => {
    expect(phoneDigits("12345")).toBeNull();
    expect(phoneDigits("")).toBeNull();
    expect(phoneDigits(undefined)).toBeNull();
    expect(whatsappHref("call us", "hi")).toBeNull();
  });

  it("opens WhatsApp with the message written, and calls with a plus", () => {
    expect(whatsappHref("9840012345", "Hello & thanks?")).toBe("https://wa.me/919840012345?text=Hello%20%26%20thanks%3F");
    expect(callHref("9840012345")).toBe("tel:+919840012345");
  });

  it("writes the first message with the event, the date, the city and the need", () => {
    expect(vendorHello("Kaveri Feast Co.", { name: "Amma's 60th", date: "30 Jan", city: "Chennai" }, "Catering")).toBe(
      "Hello Kaveri Feast Co., I'm planning Amma's 60th on 30 Jan in Chennai and found you on PlusOne. Could we talk about catering?",
    );
  });
});
