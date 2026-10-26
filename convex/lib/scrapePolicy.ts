/**
 * What PlusOne will and won't read when it researches vendors. Directories and listing
 * sites whose terms forbid automated reading are never fetched, and a vendor's own
 * site is read only where its robots.txt lets any crawler in.
 */

/** Never fetched or scraped, whether found by a search or added by hand. */
export const NO_SCRAPE_DOMAINS = [
  "wedmegood.com",
  "justdial.com",
  "theknot.com",
  "weddingwire.com",
  "weddingwire.in",
  "yelp.com",
  "sulekha.com",
  "indiamart.com",
  "zola.com",
  "hitched.co.uk",
  "bridebook.com",
  "weddingz.in",
  "shaadisaga.com",
];

/** True for one of the domains above or any of its subdomains. */
export function isNoScrapeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return NO_SCRAPE_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

export type RobotsRule = { allow: boolean; pattern: string };

/**
 * The rules robots.txt sets for every crawler (`User-agent: *`), RFC 9309 style: a group
 * is one or more User-agent lines followed by its rules, and every `*` group counts.
 */
export function parseRobots(text: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      inRules = true;
      // An empty Disallow allows everything, so it adds no rule.
      if (agents.includes("*") && value) rules.push({ allow: field === "allow", pattern: value });
    }
  }
  return rules;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

/** Whether a path (with its query string) may be read: the longest matching rule wins, and Allow wins a tie. */
export function robotsAllows(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

const ROBOTS_TIMEOUT_MS = 3_000;

/**
 * Checks one research run's pages against their sites' robots.txt, fetching each
 * host's file once. Fails open: a site whose robots.txt can't be read is not blocked.
 */
export function robotsChecker(fetcher: typeof fetch = fetch): (url: string) => Promise<boolean> {
  const byHost = new Map<string, Promise<RobotsRule[]>>();
  const load = async (origin: string): Promise<RobotsRule[]> => {
    try {
      const res = await fetcher(`${origin}/robots.txt`, { signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS), redirect: "follow" });
      if (!res.ok) return [];
      return parseRobots((await res.text()).slice(0, 500_000));
    } catch {
      return [];
    }
  };
  return async (url: string) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (isNoScrapeHost(parsed.hostname)) return false;
    let rules = byHost.get(parsed.host);
    if (!rules) {
      rules = load(parsed.origin);
      byHost.set(parsed.host, rules);
    }
    return robotsAllows(await rules, `${parsed.pathname}${parsed.search}`);
  };
}
