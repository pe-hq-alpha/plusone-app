import { basisLabel, type Basis } from "../../convex/lib/comparable";

/** A server refusal in the words it was written in, without Convex's wrapping. */
export const errorText = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message.replace(/^.*ConvexError: /, "").split("\n")[0] : fallback;

/** "Sat 12 Dec 2026" from "2026-12-12". */
export function dayText(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** "per plate", "per piece", "all in": the unit as it reads after a price. */
export function unitWord(unit: Basis, category: string): string {
  return unit === "total" ? "all in" : basisLabel(unit, category).toLowerCase();
}

const BADGE_TEXT: Record<string, string> = {
  verified: "Verified",
  plusone_added: "PlusOne Added",
  transparent_pricing: "Transparent pricing",
};

/** A vendor's badges, tier and level, as families see them on the vendor's card. */
export function BadgeRow({ badges, tier, level, className = "" }: { badges: string[]; tier?: string; level?: string; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {badges.map((b) => (
        <span key={b} className={b === "verified" || b === "transparent_pricing" ? "chip-ok" : "chip-quiet"}>
          {BADGE_TEXT[b] ?? b}
        </span>
      ))}
      {tier && <span className="chip-quiet">{tier}</span>}
      {level && <span className="chip-quiet">{level}</span>}
    </div>
  );
}
