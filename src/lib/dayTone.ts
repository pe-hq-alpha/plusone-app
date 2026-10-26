/**
 * Each day gets a quiet tint, derived from its order rather than read from the
 * database, so existing events created with the old saturated colours are
 * corrected on sight. The tint washes the card's header strip only, never the
 * whole card and never as a coloured side border.
 */
const TONES = [
  { strip: "bg-sun", rule: "var(--color-rule)", name: "marigold" },
  { strip: "bg-sage", rule: "var(--color-rule)", name: "sage" },
  { strip: "bg-sand", rule: "var(--color-rule)", name: "sand" },
  { strip: "bg-sky", rule: "var(--color-rule)", name: "sky" },
] as const;

export function dayTone(order: number) {
  return TONES[((order % TONES.length) + TONES.length) % TONES.length];
}
