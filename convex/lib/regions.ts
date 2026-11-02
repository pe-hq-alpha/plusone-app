/**
 * Which sample wedding a visitor sees, from where they are. A region is a country code,
 * optionally with its state as Cloudflare reports it ("IN", "IN-DL", "US"). Visitors in
 * North India get the Delhi wedding, the rest of India the Chennai one, and everyone
 * else Austin. Shared by the app (examples, onboarding) and the demo seed.
 */

export type Sample = "chennai" | "delhi" | "austin";

/** States and territories of North India, by their ISO 3166-2 codes (old and new where they changed). */
const NORTH = new Set(["DL", "HR", "PB", "CH", "HP", "JK", "LA", "UP", "UT", "UK", "RJ", "BR", "JH", "MP", "CT", "CG"]);

export function sampleFor(region: string | undefined): Sample {
  const [country, state] = (region ?? "").toUpperCase().split("-");
  if (country !== "IN") return "austin";
  return state && NORTH.has(state) ? "delhi" : "chennai";
}

/** A region that picks a given sample, for links such as /demo?sample=delhi. */
export const REGION_OF: Record<Sample, string> = { chennai: "IN-TN", delhi: "IN-DL", austin: "US" };

/**
 * Which sample birthday a visitor opens: Amma's 60th in Chennai for anyone in India, Dad's
 * 60th in Austin for everyone else. Without a region (an older page, a test) it stays Chennai.
 */
export function birthdayFor(region: string | undefined): "birthday" | "birthday-us" {
  if (!region?.trim()) return "birthday";
  return region.trim().toUpperCase().split("-")[0] === "IN" ? "birthday" : "birthday-us";
}
