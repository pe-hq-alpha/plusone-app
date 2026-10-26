import { describe, expect, test } from "vitest";
import {
  cleanUrl,
  firstUrl,
  linkSource,
  mergePreviews,
  oembedUrl,
  pictureType,
  previewFromHtml,
  previewFromImage,
  previewFromOembed,
  previewFromScrape,
  sniffPicture,
  titleFromFileName,
} from "./links";

describe("links kept in a Space", () => {
  test("finds the link in shared text and trims trailing punctuation", () => {
    expect(firstUrl("Look at this! https://pin.it/3xYz9ab, so pretty.")).toBe("https://pin.it/3xYz9ab");
    expect(firstUrl("no link here")).toBeNull();
  });

  test("keeps only plain web links", () => {
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(cleanUrl("https://user:pw@example.com/")).toBeNull();
    expect(cleanUrl("http://localhost/")).toBeNull();
    expect(cleanUrl("https://www.example.com/a?b=1")).toBe("https://www.example.com/a?b=1");
  });

  test("knows the social sites, short links included", () => {
    expect(linkSource("https://www.instagram.com/p/C9abc/")).toBe("instagram");
    expect(linkSource("https://vm.tiktok.com/ZMabc/")).toBe("tiktok");
    expect(linkSource("https://in.pinterest.com/pin/12345/")).toBe("pinterest");
    expect(linkSource("https://pin.it/3xYz9ab")).toBe("pinterest");
    expect(linkSource("https://youtu.be/abc")).toBe("youtube");
    expect(linkSource("https://notinstagram.com.evil.io/p/1")).toBe("web");
    expect(linkSource("https://example.com/")).toBe("web");
  });

  test("asks the site's own preview service where there is one", () => {
    expect(oembedUrl("https://www.tiktok.com/@a/video/1", "tiktok")).toContain("tiktok.com/oembed?url=https%3A%2F%2F");
    expect(oembedUrl("https://www.instagram.com/p/C9abc/", "instagram")).toBeNull();
  });

  test("reads preview tags in any attribute order, absolute pictures only", () => {
    const html = `<html><head><title>Fallback</title>
      <meta content="Garden &amp; candlelight" property="og:title">
      <meta name="description" content='A soft palette'>
      <meta property="og:image" content="/img/hero.jpg" />
      <meta property="og:site_name" content="Studio">
      </head></html>`;
    expect(previewFromHtml(html, "https://studio.example/post/1")).toEqual({
      title: "Garden & candlelight",
      description: "A soft palette",
      image: "https://studio.example/img/hero.jpg",
      siteName: "Studio",
    });
    expect(previewFromHtml(`<meta property="og:image" content="javascript:x">`, "https://a.example/").image).toBeUndefined();
  });

  test("keeps what an oEmbed answer has and leaves the rest out", () => {
    expect(previewFromOembed({ title: "Sangeet set", author_name: "Riya", thumbnail_url: "https://p16.example/t.jpg", html: "<blockquote/>" }, "https://www.tiktok.com/")).toEqual({
      title: "Sangeet set",
      author: "Riya",
      image: "https://p16.example/t.jpg",
    });
    expect(previewFromOembed("nope", "https://x.example/")).toEqual({});
    expect(mergePreviews({ title: "A" }, { title: "B", image: "https://i.example/x.jpg" })).toEqual({ title: "A", image: "https://i.example/x.jpg" });
  });

  test("a link that is a picture is its own preview, titled from its file name", () => {
    const url = "https://www.thegrandindianwedding.com/wp-content/uploads/2017/12/grand-indian-destination-weddings-scaled.jpg";
    expect(previewFromImage(url)).toEqual({ title: "Grand indian destination weddings", image: url, siteName: "thegrandindianwedding.com" });
    expect(titleFromFileName("https://cdn.example/mandap_marigold-arch-1024x768.webp")).toBe("Mandap marigold arch");
    expect(titleFromFileName("https://cdn.example/Haldi%20Morning@2x.png")).toBe("Haldi morning");
    expect(titleFromFileName("https://cdn.example/IMG_2034.JPG")).toBeUndefined();
    expect(titleFromFileName("https://cdn.example/3f9a0c2b7d1e4a5f9b8c.jpg")).toBeUndefined();
    expect(pictureType("image/jpeg; charset=binary")).toBe("image/jpeg");
    expect(pictureType("image/avif")).toBe("image/avif");
    expect(pictureType("image/svg+xml")).toBeNull();
    expect(pictureType("text/html")).toBeNull();
  });

  test("a kept copy must really be a picture, never an SVG", () => {
    expect(sniffPicture(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe("image/jpeg");
    expect(sniffPicture(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffPicture(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffPicture(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>'))).toBeNull();
    expect(sniffPicture(new TextEncoder().encode("<!doctype html><html>"))).toBeNull();
  });

  test("a page without preview tags still gives its picture: image_src, structured data, itemprop, then a big <img>", () => {
    const base = "https://blog.example/post/1";
    expect(previewFromHtml(`<link href="/i/cover.jpg" rel="image_src">`, base).image).toBe("https://blog.example/i/cover.jpg");
    const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
    expect(previewFromHtml(ld({ "@type": "Article", image: "https://cdn.example/a.jpg" }), base).image).toBe("https://cdn.example/a.jpg");
    expect(previewFromHtml(ld({ image: ["/b.jpg", "/c.jpg"] }), base).image).toBe("https://blog.example/b.jpg");
    expect(previewFromHtml(ld({ image: { "@type": "ImageObject", url: "https://cdn.example/d.jpg" } }), base).image).toBe("https://cdn.example/d.jpg");
    expect(
      previewFromHtml(
        ld({ "@graph": [{ "@type": "Article", image: { "@id": "https://blog.example/#primaryimage" } }, { "@id": "https://blog.example/#primaryimage", contentUrl: "https://cdn.example/e.jpg" }] }),
        base,
      ).image,
    ).toBe("https://cdn.example/e.jpg");
    expect(previewFromHtml(`<div itemscope><meta itemprop="image" content="https://cdn.example/f.jpg"></div>`, base).image).toBe("https://cdn.example/f.jpg");
    const imgs = `<img src="/logo.png" width="120"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/hero.jpg" width="1200" height="800"><img src="/later.jpg" width="900">`;
    expect(previewFromHtml(imgs, base).image).toBe("https://blog.example/hero.jpg");
    expect(previewFromHtml(`<img src="/small.jpg" width="64"><img src="/no-size.jpg">`, base).image).toBeUndefined();
  });

  test("the preview tags come first, and an SVG is never the picture", () => {
    const base = "https://shop.example/p";
    const html = `<meta property="og:image" content="/og.jpg"><link rel="image_src" href="/other.jpg"><img src="/big.jpg" width="800">`;
    expect(previewFromHtml(html, base).image).toBe("https://shop.example/og.jpg");
    expect(previewFromHtml(`<meta property="og:image" content="/logo.svg"><img src="/big.jpg" width="800">`, base).image).toBe("https://shop.example/big.jpg");
    expect(previewFromHtml(`<img src="/drawing.svg" width="800">`, base).image).toBeUndefined();
  });

  test("a scraping browser's view: its metadata first, a screenshot only as a last resort, nothing from an error page", () => {
    const url = "https://www.instagram.com/p/C9abc/";
    expect(previewFromScrape({ metadata: { ogImage: "https://cdn.example/post.jpg", ogTitle: "Mehndi night", statusCode: 200 }, screenshot: "https://shots.example/s.png" }, url)).toEqual({
      title: "Mehndi night",
      image: "https://cdn.example/post.jpg",
    });
    expect(previewFromScrape({ metadata: { title: "A page", statusCode: 200 }, html: "<p>no pictures</p>", screenshot: "https://shots.example/s.png" }, url)).toEqual({
      title: "A page",
      image: "https://shots.example/s.png",
    });
    expect(previewFromScrape({ metadata: { "og:image": ["/x.jpg", "/y.jpg"], sourceURL: "https://site.example/a" } }, url).image).toBe("https://site.example/x.jpg");
    expect(previewFromScrape({ metadata: { title: "Just a moment...", statusCode: 403 }, screenshot: "https://shots.example/s.png" }, url)).toEqual({});
  });
});

