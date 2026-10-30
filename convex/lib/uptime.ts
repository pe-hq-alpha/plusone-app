import { BRAND } from "./brand";

/** What one look at an address found: its status code, or why it couldn't be reached. */
export type Probe = { url: string; status: number | null; body?: string; error?: string };
export type Problem = { url: string; problem: string };

/** The addresses a judge opens, plus the backend's own health check. */
export function uptimeUrls(convexSite: string): string[] {
  return [
    `https://${BRAND.domain}`,
    `https://app.${BRAND.domain}/demo`,
    `https://partner.${BRAND.domain}/demo`,
    `${convexSite.replace(/\/$/, "")}/health`,
  ];
}

/** Each address must answer 200, and the health check must say model calls go to Meta. */
export function problemsIn(probes: Probe[]): Problem[] {
  const out: Problem[] = [];
  for (const p of probes) {
    if (p.status === null) out.push({ url: p.url, problem: p.error ? `unreachable: ${p.error}` : "unreachable" });
    else if (p.status !== 200) out.push({ url: p.url, problem: `answered ${p.status}` });
    else if (p.url.endsWith("/health") && !(p.body ?? "").includes('"models":"meta"')) out.push({ url: p.url, problem: "model calls are not going to Meta" });
  }
  return out;
}

/** Whether a check is news: the site has just gone down, or has just come back. */
export function changeOf(previousOk: boolean | null, ok: boolean): "down" | "back" | null {
  if (previousOk === null) return ok ? null : "down";
  if (previousOk && !ok) return "down";
  if (!previousOk && ok) return "back";
  return null;
}
