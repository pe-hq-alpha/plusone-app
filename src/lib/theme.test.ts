import { describe, expect, it } from "vitest";
import { choiceFrom, cookieDomain } from "./theme";

describe("the theme choice", () => {
  it("comes from the shared cookie before this address's storage", () => {
    expect(choiceFrom("po_vid=abc; plusone.theme=light", null)).toBe("light");
    expect(choiceFrom("plusone.theme=dark", "light")).toBe("dark");
    expect(choiceFrom("plusone.theme=system; other=1", "light")).toBe("system");
  });

  it("falls back to storage, then to dark", () => {
    expect(choiceFrom("", "light")).toBe("light");
    expect(choiceFrom("plusone.theme=purple", null)).toBe("dark");
    expect(choiceFrom("", null)).toBe("dark");
  });

  it("is shared across the home page and the app, and kept to the host elsewhere", () => {
    expect(cookieDomain("plusoneevents.site", "plusoneevents.site")).toBe("plusoneevents.site");
    expect(cookieDomain("app.plusoneevents.site", "plusoneevents.site")).toBe("plusoneevents.site");
    expect(cookieDomain("localhost", "plusoneevents.site")).toBeUndefined();
    expect(cookieDomain("abc.plusone-app.pages.dev", "plusoneevents.site")).toBeUndefined();
  });
});
