import { describe, expect, test } from "vitest";
import { isNoScrapeHost, parseRobots, robotsAllows, robotsChecker } from "./scrapePolicy";

describe("robots.txt", () => {
  const rules = parseRobots(
    [
      "# a vendor's site",
      "User-agent: Googlebot",
      "Disallow: /",
      "",
      "User-agent: *",
      "Disallow: /admin",
      "Disallow: /private/",
      "Allow: /private/prices",
      "Disallow: /*.pdf$",
      "Disallow:",
    ].join("\n"),
  );

  test("keeps only the rules for every crawler", () => {
    expect(rules).toEqual([
      { allow: false, pattern: "/admin" },
      { allow: false, pattern: "/private/" },
      { allow: true, pattern: "/private/prices" },
      { allow: false, pattern: "/*.pdf$" },
    ]);
  });

  test("allows what no rule names", () => {
    expect(robotsAllows(rules, "/")).toBe(true);
    expect(robotsAllows(rules, "/contact")).toBe(true);
  });

  test("blocks a disallowed path and anything under it", () => {
    expect(robotsAllows(rules, "/admin")).toBe(false);
    expect(robotsAllows(rules, "/admin/login?next=/")).toBe(false);
    expect(robotsAllows(rules, "/private/team")).toBe(false);
  });

  test("lets the longest rule win, so an Allow can open a door in a Disallow", () => {
    expect(robotsAllows(rules, "/private/prices")).toBe(true);
    expect(robotsAllows(rules, "/private/prices/2027")).toBe(true);
  });

  test("understands * and $", () => {
    expect(robotsAllows(rules, "/menus/wedding.pdf")).toBe(false);
    expect(robotsAllows(rules, "/menus/wedding.pdf?v=2")).toBe(true);
  });

  test("a group of several agents counts when one of them is *", () => {
    const shared = parseRobots("User-agent: bingbot\nUser-agent: *\nDisallow: /\n\nUser-agent: other\nAllow: /");
    expect(robotsAllows(shared, "/pricing")).toBe(false);
  });

  test("an empty or missing file allows everything", () => {
    expect(robotsAllows(parseRobots(""), "/anything")).toBe(true);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow:"), "/anything")).toBe(true);
  });
});

describe("the sites we never read", () => {
  test("covers the directories and their subdomains", () => {
    expect(isNoScrapeHost("wedmegood.com")).toBe(true);
    expect(isNoScrapeHost("www.justdial.com")).toBe(true);
    expect(isNoScrapeHost("m.yelp.com")).toBe(true);
    expect(isNoScrapeHost("weddingwire.in")).toBe(true);
    expect(isNoScrapeHost("annamcaterers.in")).toBe(false);
    expect(isNoScrapeHost("notyelp.com")).toBe(false);
  });
});

describe("checking a run's pages", () => {
  const fakeFetch = (body: string, status = 200) => {
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(url);
      return new Response(body, { status });
    }) as unknown as typeof fetch;
    return { fetcher, calls };
  };

  test("reads each host's robots.txt once and follows it", async () => {
    const { fetcher, calls } = fakeFetch("User-agent: *\nDisallow: /members");
    const mayRead = robotsChecker(fetcher);
    expect(await mayRead("https://annam.example/pricing")).toBe(true);
    expect(await mayRead("https://annam.example/members/list")).toBe(false);
    expect(calls).toEqual(["https://annam.example/robots.txt"]);
  });

  test("never reads a listing site, without asking it", async () => {
    const { fetcher, calls } = fakeFetch("");
    expect(await robotsChecker(fetcher)("https://www.justdial.com/Chennai/Caterers")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("fails open when robots.txt is missing or unreachable", async () => {
    expect(await robotsChecker(fakeFetch("Disallow: /", 404).fetcher)("https://a.example/")).toBe(true);
    const broken = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    expect(await robotsChecker(broken)("https://b.example/pricing")).toBe(true);
  });
});
