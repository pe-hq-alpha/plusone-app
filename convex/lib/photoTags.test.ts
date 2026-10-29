import { describe, expect, it } from "vitest";
import { keepKnownTags, photoFlags, PHOTO_TAGS, shownToCustomers, tagsFor } from "./photoTags";

describe("tagsFor", () => {
  it("lists a decorator's tags", () => {
    expect(tagsFor(["Decor & Florals"]).map((t) => t.key)).toEqual([
      "stage-backdrop",
      "entrance-arch",
      "fresh-flowers",
      "artificial-flowers",
      "lighting",
      "photo-corner",
      "table-centrepieces",
      "balloons",
      "kolam-or-rangoli",
    ]);
  });

  it("unions a caterer-and-decorator's tags in order", () => {
    const keys = tagsFor(["Catering", "Decor & Florals"]).map((t) => t.key);
    expect(keys.slice(0, 6)).toEqual([
      "buffet",
      "banana-leaf-service",
      "live-counter",
      "plated-service",
      "dessert-counter",
      "serving-staff",
    ]);
    expect(keys).toContain("stage-backdrop");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is empty for a category with no sheet", () => {
    expect(tagsFor(["Music/DJ"])).toEqual([]);
    expect(tagsFor(["No such trade"])).toEqual([]);
  });

  it("labels read with a capital first letter while keys stay hyphenated", () => {
    expect(PHOTO_TAGS.catering[1]).toEqual({ key: "banana-leaf-service", label: "Banana-leaf service" });
  });
});

describe("keepKnownTags", () => {
  it("drops unknown tags and duplicates, keeping at most five", () => {
    const allowed = tagsFor(["Catering"]);
    expect(keepKnownTags(["buffet", "nope", "buffet", "live-counter", "plated-service", "dessert-counter", "serving-staff", "buffet"], allowed)).toEqual([
      "buffet",
      "live-counter",
      "plated-service",
      "dessert-counter",
      "serving-staff",
    ]);
  });
});

describe("photoFlags", () => {
  const clean = { realWork: true, stock: false, watermark: false, faces: false, unsafe: false };

  it("says nothing for a clean photo", () => {
    expect(photoFlags(clean)).toEqual([]);
  });

  it("flags stock, watermark, non-event work, unsafe content and faces", () => {
    expect(photoFlags({ ...clean, stock: true })).toEqual([
      { key: "stock", text: "This looks like a stock photo, not your own work." },
    ]);
    expect(photoFlags({ ...clean, watermark: true })).toEqual([
      { key: "watermark", text: "Another business's name or watermark is on this photo." },
    ]);
    expect(photoFlags({ ...clean, realWork: false })).toEqual([
      { key: "not_event", text: "This doesn't look like a photo of event work." },
    ]);
    expect(photoFlags({ ...clean, unsafe: true })).toEqual([{ key: "unsafe", text: "This photo can't be shown to customers." }]);
    expect(photoFlags({ ...clean, faces: true })).toEqual([
      { key: "faces", text: "People's faces are in this photo. Only keep it if they're happy to be shown." },
    ]);
  });
});

describe("shownToCustomers", () => {
  const clean = { realWork: true, stock: false, watermark: false, faces: false, unsafe: false };

  it("shows a verified listing's clean checked photo", () => {
    expect(shownToCustomers({ status: "checked", check: clean }, "verified")).toBe(true);
  });

  it("hides a stock flag until Ops approves it", () => {
    const flagged = { status: "checked" as const, check: { ...clean, stock: true } };
    expect(shownToCustomers(flagged, "verified")).toBe(false);
    expect(shownToCustomers({ ...flagged, review: "approved" as const }, "verified")).toBe(true);
  });

  it("never shows a removed photo, an unchecked one, or an unverified listing", () => {
    expect(shownToCustomers({ status: "checked", check: clean, review: "removed" }, "verified")).toBe(false);
    expect(shownToCustomers({ status: "checking", check: null }, "verified")).toBe(false);
    expect(shownToCustomers({ status: "failed", check: null }, "verified")).toBe(false);
    expect(shownToCustomers({ status: "checked", check: clean }, "pending")).toBe(false);
  });

  it("shows a photo with only faces in it", () => {
    expect(shownToCustomers({ status: "checked", check: { ...clean, faces: true } }, "verified")).toBe(true);
  });
});
