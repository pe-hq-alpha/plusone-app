import { sheetFor } from "./standardSheet";

/**
 * The tags a photo of a trade's past work can carry. One list per need with a
 * standard sheet, since the tag says what of the trade's work the photo shows.
 * Keys are lower-case with hyphens; labels read with a capital first letter.
 */

export type PhotoTag = { key: string; label: string };

const tags = (...labels: string[]): PhotoTag[] =>
  labels.map((label) => ({ key: label.toLowerCase().replace(/ /g, "-"), label }));

export const PHOTO_TAGS: Record<string, PhotoTag[]> = {
  venue: tags("Hall interior", "Stage", "Dining hall", "Outdoor lawn", "Entrance", "Parking"),
  catering: tags("Buffet", "Banana-leaf service", "Live counter", "Plated service", "Dessert counter", "Serving staff"),
  decor: tags(
    "Stage backdrop",
    "Entrance arch",
    "Fresh flowers",
    "Artificial flowers",
    "Lighting",
    "Photo corner",
    "Table centrepieces",
    "Balloons",
    "Kolam or rangoli",
  ),
  cake: tags("Tiered cake", "Theme cake", "Cupcakes", "Fondant finish", "Fresh-cream finish"),
  photography: tags("Candid", "Family portrait", "Group on stage", "Printed album", "Outdoor shoot"),
  videography: tags("Camera crew", "Drone", "LED screen", "Highlight reel still"),
  entertainment: tags("Live music", "DJ", "Magician", "Puppet show", "Games host"),
  gifting: tags("Return gift hampers", "Brass or steel items", "Personalised gifts", "Plant saplings"),
  officiant: tags("Homam setup", "Pooja items", "Kolu or altar"),
};

/** The tags for the vendor's categories, through their sheets, in order, without repeats. */
export function tagsFor(categories: string[]): PhotoTag[] {
  const seen = new Set<string>();
  const out: PhotoTag[] = [];
  for (const category of categories) {
    const sheet = sheetFor(category);
    if (!sheet) continue;
    for (const tag of PHOTO_TAGS[sheet.need] ?? []) {
      if (seen.has(tag.key)) continue;
      seen.add(tag.key);
      out.push(tag);
    }
  }
  return out;
}

/** Drop tags the model returned that aren't on the list, keeping at most five, without repeats. */
export function keepKnownTags(tags: string[], allowed: PhotoTag[]): string[] {
  const known = new Set(allowed.map((t) => t.key));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    if (!known.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 5) break;
  }
  return out;
}

/** What the check found on a photo. `realWork` false means it isn't event work at all. */
export type PhotoCheck = {
  realWork: boolean;
  stock: boolean;
  watermark: boolean;
  faces: boolean;
  unsafe: boolean;
};

export type PhotoFlag = { key: "stock" | "watermark" | "not_event" | "unsafe" | "faces"; text: string };

/** The check's findings in plain words. Faces are a note, not a reason to hide the photo. */
export function photoFlags(check: PhotoCheck): PhotoFlag[] {
  const flags: PhotoFlag[] = [];
  if (check.stock) flags.push({ key: "stock", text: "This looks like a stock photo, not your own work." });
  if (check.watermark) flags.push({ key: "watermark", text: "Another business's name or watermark is on this photo." });
  if (!check.realWork) flags.push({ key: "not_event", text: "This doesn't look like a photo of event work." });
  if (check.unsafe) flags.push({ key: "unsafe", text: "This photo can't be shown to customers." });
  if (check.faces) flags.push({ key: "faces", text: "People's faces are in this photo. Only keep it if they're happy to be shown." });
  return flags;
}

type StoredPhoto = {
  status: "checking" | "checked" | "failed";
  check?: PhotoCheck | null;
  /** The decision Ops made, if any. */
  review?: "approved" | "removed" | null;
};

/**
 * Whether customers see the photo. Only on a verified listing, and only when it was
 * checked with nothing worse than faces, or Ops approved it. A photo Ops removed, or
 * one still waiting for its check, never shows.
 */
export function shownToCustomers(photo: StoredPhoto, profileStatus: string): boolean {
  if (profileStatus !== "verified") return false;
  if (photo.review === "removed") return false;
  if (photo.review === "approved") return true;
  if (photo.status !== "checked" || !photo.check) return false;
  return photoFlags(photo.check).every((flag) => flag.key === "faces");
}

/**
 * The check in plain words: one photo of a vendor's past work, judged as their own
 * event work. The list of tags to choose from arrives with the photo itself.
 */
export const PHOTO_INSTRUCTIONS =
  "Look at one photo a vendor added to show their past work. Say whether it is a real photo of event work " +
  "(not a screenshot, a poster, a stock image or a render), whether another business's name, logo or watermark is on it " +
  "(the vendor's own name is fine), whether people's faces are clearly visible, and whether it is unsafe to show " +
  "(nudity, violence). Write one short plain sentence on what it shows ('A banana-leaf lunch laid out for a large group'), never a placeholder, and up to 5 tags chosen only from the list given " +
  "with the photo. If unsure about anything, say so in doubt rather than guess. Never invent a tag.";
