/** A colour written as #RRGGBB, the only form a palette keeps. */
export function isHexColour(x: unknown): x is string {
  return typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x);
}
