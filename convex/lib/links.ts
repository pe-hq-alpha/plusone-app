// Links pasted or shared into a Space: which site they come from, where to ask for a
// preview, and how to read a page's own preview tags. Pure, so it is tested without the
// network. The preview names the site's own picture; the Space keeps a copy of it only
// so the thumbnail survives the site's picture link expiring.

import { decodeEntities } from "./entities";

export type LinkSource = "instagram" | "tiktok" | "pinterest" | "youtube" | "web";

export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

/** The first web address in a shared or pasted bit of text, if any. */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;
  return cleanUrl(m[0].replace(/[),.;!?]+$/, ""));
}

/** A link worth keeping: http or https, a real host, no credentials, at most 2,000 characters. */
export function cleanUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (!u.hostname.includes(".")) return null;
    const s = u.toString();
    return s.length <= 2000 ? s : null;
  } catch {
    return null;
  }
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Which site a link belongs to. Short links (pin.it, vm.tiktok.com, youtu.be) count too. */
export function linkSource(url: string): LinkSource {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "web";
  }
  if (hostIs(host, "instagram.com") || host === "instagr.am") return "instagram";
  if (hostIs(host, "tiktok.com")) return "tiktok";
  if (/(^|\.)pinterest\.[a-z.]+$/.test(host) || host === "pin.it") return "pinterest";
  if (hostIs(host, "youtube.com") || host === "youtu.be") return "youtube";
  return "web";
}

/** The site's own oEmbed address for a link, where it offers one without a key. */
export function oembedUrl(url: string, source: LinkSource): string | null {
  const q = encodeURIComponent(url);
  switch (source) {
    case "tiktok":
      return `https://www.tiktok.com/oembed?url=${q}`;
    case "youtube":
      return `https://www.youtube.com/oembed?format=json&url=${q}`;
    case "pinterest":
      return `https://www.pinterest.com/oembed.json?url=${q}`;
    default:
      // Instagram's oEmbed needs an approved app and a token, so it is read like any page.
      return null;
  }
}

const str = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? decodeEntities(v.trim()).slice(0, max) : undefined;

/** The fields we keep from an oEmbed answer; anything missing stays missing. */
export function previewFromOembed(json: unknown, base: string): LinkPreview {
  if (!json || typeof json !== "object") return {};
  const o = json as Record<string, unknown>;
  return tidy({
    title: str(o.title, 300),
    author: str(o.author_name, 120),
    siteName: str(o.provider_name, 80),
    image: absoluteImage(typeof o.thumbnail_url === "string" ? o.thumbnail_url : undefined, base),
  });
}

/**
 * Reads a page's Open Graph and Twitter preview tags, falling back to <title> and the
 * description tag. Attribute order and quoting vary, so each <meta> is parsed whole.
 * A page without a preview picture is searched for one, in order: its image_src link,
 * its structured data (JSON-LD), an itemprop="image", then the first <img> that says it
 * is at least 300 pixels wide.
 */
export function previewFromHtml(html: string, base: string): LinkPreview {
  const head = html.slice(0, 400_000);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attr(tag, "property") ?? attr(tag, "name");
    const content = attr(tag, "content");
    if (key && content !== undefined && !meta.has(key.toLowerCase())) meta.set(key.toLowerCase(), content);
  }
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const tagged = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"].map((k) => meta.get(k));
  return tidy({
    title: str(meta.get("og:title") ?? meta.get("twitter:title") ?? title, 300),
    description: str(meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"), 500),
    image: firstPicture(tagged, base) ?? linkedPicture(head, base) ?? jsonLdPicture(head, base) ?? itempropPicture(head, base) ?? bigPicture(head, base),
    siteName: str(meta.get("og:site_name"), 80),
  });
}

/** <link rel="image_src" href="…">, the older way of naming a page's picture. */
function linkedPicture(html: string, base: string): string | undefined {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (words(attr(tag, "rel")).includes("image_src")) {
      const url = pictureUrl(attr(tag, "href"), base);
      if (url) return url;
    }
  }
  return undefined;
}

/**
 * The first `image` in the page's structured data: a string, a list, or an object with
 * a `url`. Sites that list their data as a graph point at the picture by `@id`.
 */
function jsonLdPicture(html: string, base: string): string | undefined {
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/ld\+json/i.test(attr(m[1], "type") ?? "")) continue;
    let data: unknown;
    try {
      data = JSON.parse(m[2].trim());
    } catch {
      continue;
    }
    const nodes: Record<string, unknown>[] = [];
    const collect = (x: unknown, depth: number) => {
      if (depth > 3 || !x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.forEach((y) => collect(y, depth + 1));
      const o = x as Record<string, unknown>;
      nodes.push(o);
      if (o["@graph"]) collect(o["@graph"], depth + 1);
    };
    collect(data, 0);
    const byId = new Map(nodes.filter((n) => typeof n["@id"] === "string").map((n) => [n["@id"] as string, n]));
    const read = (x: unknown, depth: number): string | undefined => {
      if (typeof x === "string") return pictureUrl(x, base);
      if (depth > 2 || !x || typeof x !== "object") return undefined;
      if (Array.isArray(x)) {
        for (const y of x) {
          const url = read(y, depth + 1);
          if (url) return url;
        }
        return undefined;
      }
      const o = x as Record<string, unknown>;
      const ref = typeof o["@id"] === "string" ? byId.get(o["@id"]) : undefined;
      return read(o.url, depth + 1) ?? read(o.contentUrl, depth + 1) ?? (ref && ref !== o ? read(ref, depth + 1) : undefined);
    };
    for (const node of nodes) {
      const url = read(node.image, 0);
      if (url) return url;
    }
  }
  return undefined;
}

/** A picture marked up with itemprop="image", on a <meta>, <link> or <img>. */
function itempropPicture(html: string, base: string): string | undefined {
  for (const tag of html.match(/<(?:meta|link|img)\b[^>]*\bitemprop\s*=[^>]*>/gi) ?? []) {
    if (!words(attr(tag, "itemprop")).includes("image")) continue;
    const url = pictureUrl(attr(tag, "content") ?? attr(tag, "href") ?? attr(tag, "src"), base);
    if (url) return url;
  }
  return undefined;
}

/** The first <img> that states a width of 300 or more; a lazy-loaded one names it in data-src. */
function bigPicture(html: string, base: string): string | undefined {
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (!(parseInt(attr(tag, "width") ?? "", 10) >= 300)) continue;
    const url = firstPicture([attr(tag, "data-src"), attr(tag, "data-lazy-src"), attr(tag, "src")], base);
    if (url) return url;
  }
  return undefined;
}

const words = (s: string | undefined) => (s ?? "").toLowerCase().split(/\s+/);

/** The value of one attribute of a tag. `src` is never read from `data-src`, nor `name` from `data-name`. */
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** The first of some picture addresses that is usable. */
function firstPicture(srcs: (string | undefined)[], base: string): string | undefined {
  for (const src of srcs) {
    const url = pictureUrl(src, base);
    if (url) return url;
  }
  return undefined;
}

/** A picture address made absolute, and never an SVG (which can carry script). */
function pictureUrl(src: string | undefined, base: string): string | undefined {
  const url = absoluteImage(src, base);
  return url && !/\.svgz?$/i.test(new URL(url).pathname) ? url : undefined;
}

/** A picture address made absolute against the page, http or https only. */
export function absoluteImage(src: string | undefined, base: string): string | undefined {
  if (!src?.trim()) return undefined;
  try {
    const u = new URL(decodeEntities(src.trim()), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 2000) : undefined;
  } catch {
    return undefined;
  }
}

function tidy(p: LinkPreview): LinkPreview {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as LinkPreview;
}

/** Two previews joined: the first one's fields win, the second fills the gaps. */
export function mergePreviews(a: LinkPreview, b: LinkPreview): LinkPreview {
  return tidy({ ...b, ...a });
}

// ---------------------------------------------------------------- links that are pictures

/** Picture types a link may answer with directly. SVG never: it can carry script. */
const LINKED_PICTURES: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
  "image/avif": "image/avif",
};

/** The picture type a Content-Type header names, if it is one a link may be. */
export function pictureType(contentType: string | null | undefined): string | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return LINKED_PICTURES[type] ?? null;
}

/**
 * What a picture file really is, from its first bytes: JPEG, PNG, GIF or WebP, the
 * types a kept copy may be. A server's own label is not trusted for a stored file.
 */
export function sniffPicture(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  const at = (i: number, ...b: number[]) => b.every((x, j) => bytes[i + j] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/**
 * A title from a picture's file name: the extension, the size a site adds ("-scaled",
 * "-1024x768", "@2x") and the dashes go, in sentence case. A camera's or a hash's name
 * ("IMG_2034", "3f9a0c…") says nothing, so it gives no title.
 */
export function titleFromFileName(url: string): string | undefined {
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return undefined;
  }
  name = name.replace(/\.[a-z0-9]{2,5}$/i, "");
  for (let before = ""; before !== name; ) {
    before = name;
    name = name.replace(/(?:[-_ ](?:scaled|rotated|\d{2,5}x\d{2,5}|e\d{10,13})|@\dx)$/i, "");
  }
  const text = name.replace(/[-_+.\s]+/g, " ").trim();
  if (!/\p{L}{3}/u.test(text)) return undefined;
  if (/^(img|dsc|dscn|dcim|pxl|mvimg|image|photo|screenshot|whatsapp image)\s?\d/i.test(text)) return undefined;
  if (/^[0-9a-f]{12,}$/i.test(text.replace(/ /g, ""))) return undefined;
  const lower = text.toLowerCase();
  return str(lower.charAt(0).toUpperCase() + lower.slice(1), 300);
}

/**
 * A link that answers with a picture is its own preview: the picture, the site it is
 * on, and a title from its file name. `pageUrl` is the link as pasted, `imageUrl` where
 * it ended up after any redirects.
 */
export function previewFromImage(imageUrl: string, pageUrl: string = imageUrl): LinkPreview {
  let siteName: string | undefined;
  try {
    siteName = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "") || undefined;
  } catch {
    siteName = undefined;
  }
  return tidy({
    title: titleFromFileName(pageUrl) ?? titleFromFileName(imageUrl),
    image: pictureUrl(imageUrl, imageUrl),
    siteName,
  });
}

// ---------------------------------------------------------------- a scraping browser's view

const firstString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : Array.isArray(v) ? v.find((x): x is string => typeof x === "string") : undefined;

/**
 * A page as a scraping browser saw it, after its scripts ran: the metadata it read, then
 * the page's own tags, and its screenshot only when nothing names a picture. A page that
 * answered with an error gives nothing, so a "verify you are human" screen never becomes
 * a thumbnail.
 */
export function previewFromScrape(
  scrape: { metadata?: Record<string, unknown>; html?: string; screenshot?: string },
  url: string,
): LinkPreview {
  const meta = scrape.metadata ?? {};
  if (typeof meta.statusCode === "number" && meta.statusCode >= 400) return {};
  const base = [firstString(meta.url), firstString(meta.sourceURL)].find((u): u is string => !!u && cleanUrl(u) !== null) ?? url;
  const told = tidy({
    title: str(firstString(meta.ogTitle) ?? firstString(meta.title), 300),
    description: str(firstString(meta.ogDescription) ?? firstString(meta.description), 500),
    image: firstPicture([firstString(meta.ogImage), firstString(meta["og:image"]), firstString(meta["twitter:image"])], base),
    siteName: str(firstString(meta.ogSiteName), 80),
  });
  const preview = mergePreviews(told, previewFromHtml(scrape.html ?? "", base));
  const shot = preview.image ? undefined : pictureUrl(scrape.screenshot, base);
  return shot ? { ...preview, image: shot } : preview;
}
