import { describe, expect, it } from "vitest";
import { changeOf, problemsIn, uptimeUrls } from "./uptime";

describe("the uptime check", () => {
  it("looks at the home page, both demos and the backend's health", () => {
    expect(uptimeUrls("https://example.convex.site/")).toEqual([
      "https://plusoneevents.site",
      "https://app.plusoneevents.site/demo",
      "https://partner.plusoneevents.site/demo",
      "https://example.convex.site/health",
    ]);
  });

  it("passes when every address answers and model calls go to Meta", () => {
    const probes = [
      { url: "https://plusoneevents.site", status: 200 },
      { url: "https://x.convex.site/health", status: 200, body: '{"ok":true,"database":true,"models":"meta"}' },
    ];
    expect(problemsIn(probes)).toEqual([]);
  });

  it("names an address that's down, answers wrongly, or has fallen back from Meta", () => {
    const probes = [
      { url: "https://plusoneevents.site", status: null, error: "timeout" },
      { url: "https://app.plusoneevents.site/demo", status: 502 },
      { url: "https://x.convex.site/health", status: 200, body: '{"ok":true,"database":true,"models":"fallback"}' },
    ];
    expect(problemsIn(probes)).toEqual([
      { url: "https://plusoneevents.site", problem: "unreachable: timeout" },
      { url: "https://app.plusoneevents.site/demo", problem: "answered 502" },
      { url: "https://x.convex.site/health", problem: "model calls are not going to Meta" },
    ]);
  });

  it("tells people only when the site goes down or comes back", () => {
    expect(changeOf(true, false)).toBe("down");
    expect(changeOf(false, true)).toBe("back");
    expect(changeOf(true, true)).toBeNull();
    expect(changeOf(false, false)).toBeNull();
    expect(changeOf(null, true)).toBeNull();
    expect(changeOf(null, false)).toBe("down");
  });
});
