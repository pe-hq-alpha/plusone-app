import { describe, expect, test } from "vitest";
import { areaIn, businessName, findPhones, LEAD_CATEGORIES, leadKey, linkKind, matchLead, nameMatches, ownSite, profileUrl } from "./leads";
import { VENDOR_CATEGORIES } from "./vendorNeeds";

describe("vendor leads", () => {
  test("every trade maps to one PlusOne lists, or to none", () => {
    for (const c of Object.values(LEAD_CATEGORIES)) if (c) expect(VENDOR_CATEGORIES).toContain(c);
  });

  test("a name matches a title by its own words, not the trade's", () => {
    expect(nameMatches("Sri Ganesh Caterers", "Sri Ganesh Caterers | Veg catering in Chennai")).toBe(true);
    expect(nameMatches("Sri Ganesh Caterers", "Best caterers in Chennai | Top 10")).toBe(false);
    expect(nameMatches("Makeup by Divya", "Divya Makeup Artist - Bridal makeup Chennai")).toBe(true);
    expect(leadKey("Sri Ganesh Caterers ", "Catering")).toBe(leadKey("sri  ganesh caterers", "Catering"));
  });

  test("directories are never read or linked; maps and social pages are only linked", () => {
    expect(linkKind("https://www.justdial.com/Chennai/Sri-Ganesh")).toBe("blocked");
    expect(linkKind("https://www.wedmegood.com/profile/x")).toBe("blocked");
    expect(linkKind("https://www.google.com/maps/place/Sri+Ganesh")).toBe("maps");
    expect(linkKind("https://maps.app.goo.gl/abc")).toBe("maps");
    expect(linkKind("https://www.google.com/search?q=x")).toBe("blocked");
    expect(linkKind("https://www.instagram.com/divyamakeup/")).toBe("instagram");
    expect(linkKind("https://sriganeshcaterers.in/contact")).toBe("site");
  });

  test("only results that name the business are kept, each with its source", () => {
    const m = matchLead("Sri Ganesh Caterers", [
      { url: "https://www.justdial.com/x", title: "Sri Ganesh Caterers in Mylapore - Justdial" },
      { url: "https://sriganeshcaterers.in/", title: "Sri Ganesh Caterers | Veg catering" },
      { url: "https://www.google.com/maps/place/Sri+Ganesh+Caterers", title: "Sri Ganesh Caterers - Google Maps" },
      { url: "https://other.in/", title: "Annam Caterers" },
    ]);
    expect(m).toEqual({
      name: "Sri Ganesh Caterers",
      website: "https://sriganeshcaterers.in/",
      maps: "https://www.google.com/maps/place/Sri+Ganesh+Caterers",
      sources: ["https://sriganeshcaterers.in/", "https://www.google.com/maps/place/Sri+Ganesh+Caterers"],
    });
    expect(matchLead("Sri Ganesh Caterers", [{ url: "https://other.in/", title: "Annam Caterers" }])).toBeNull();
    expect(businessName("Divya Makeup Artist - Bridal makeup Chennai")).toBe("Divya Makeup Artist");
    expect(businessName("Benzz Park Chennai")).toBe("Benzz Park");
    // A one-word name needs its map or social page to say where or what it is.
    expect(matchLead("Adoniya", [{ url: "https://www.facebook.com/adoniya", title: "Adoniya | Facebook" }])).toBeNull();
    expect(matchLead("DJ AK", [{ url: "https://www.instagram.com/deejayakmumbai/", title: "DJ AK (@deejayakmumbai)", description: "DJ in Mumbai" }], ["DJ"])).toBeNull();
    expect(matchLead("Adoniya", [{ url: "https://www.facebook.com/adoniya", title: "Adoniya | Facebook", description: "Banquet hall in Chetpet, Chennai" }], ["hall", "Chetpet"])?.facebook).toBe(
      "https://www.facebook.com/adoniya/",
    );
  });

  test("a site is the business's own only when its address carries the name", () => {
    expect(ownSite("Benzz Park", "https://benzzpark.com/")).toBe(true);
    expect(ownSite("AA Gifts", "https://aagifts.in/")).toBe(true);
    expect(ownSite("Ambassador Pallava", "https://www.ambassadorindia.com/chennai")).toBe(true);
    expect(ownSite("11th Avenue", "https://dreamweddinghub.com/vendors/11th-avenue")).toBe(false);
    expect(ownSite("A.S. Rajashekar Caterers", "https://www.tradeindia.com/x")).toBe(false);
    expect(ownSite("Adoniya", "https://www.district.in/cafe-adoniya")).toBe(false);
    expect(matchLead("Adoniya", [{ url: "https://www.district.in/cafe-adoniya", title: "Cafe Adoniya, Chetpet" }])).toBeNull();
    expect(ownSite("Chennai Travel", "https://www.tourtravelworld.com/travel-agents/x")).toBe(false);
    expect(ownSite("Astro Kumaran", "https://astrotalk.com/best-astrologer/kumaran")).toBe(false);
    expect(ownSite("Crowne Plaza", "https://crowne-plaza-adyar-park.hotelinchennai.com/en/")).toBe(false);
    expect(ownSite("Aavaranaa", "https://aavaranaa.com/?srsltid=x")).toBe(true);
    // A post or reel isn't the account; an account's page is kept without its tracking.
    expect(profileUrl("https://www.instagram.com/reel/Ddnpdj5vwpD/", "instagram")).toBeNull();
    expect(profileUrl("https://www.instagram.com/anitadesignerstudio/?hl=en", "instagram")).toBe("https://www.instagram.com/anitadesignerstudio/");
    expect(profileUrl("https://aavaranaa.com/?srsltid=AYC", "site")).toBe("https://aavaranaa.com/");
  });

  test("phones and areas a page publishes", () => {
    expect(findPhones("Call 98400 12345 or +91 44 2434 5678")).toEqual(["+919840012345", "+914424345678"]);
    expect(findPhones("Order no. 12345")).toEqual([]);
    expect(findPhones("Call +91 6789101112")).toEqual([]);
    expect(areaIn("No 12, Luz Church Road, Mylapore, Chennai 600004")).toBe("Mylapore");
    expect(areaIn("Somewhere far away")).toBeUndefined();
  });
});
