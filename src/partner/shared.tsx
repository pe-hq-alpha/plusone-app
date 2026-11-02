import { ConvexError } from "convex/values";
import { basisLabel, type Basis } from "../../convex/lib/comparable";
import { describeOffer, sheetFor } from "../../convex/lib/standardSheet";
import { money } from "../lib/format";

/**
 * A server refusal in the words it was written in. On production Convex hides an error's
 * message ("Server Error") and sends a ConvexError's words as its data, so the data comes
 * first; anything unexpected gets the fallback rather than Convex's wrapping.
 */
export const errorText = (e: unknown, fallback: string) => {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  const said = e instanceof Error ? e.message.replace(/^.*ConvexError: /, "").split("\n")[0] : "";
  return said && !/Server Error|\[CONVEX /.test(said) ? said : fallback;
};

/** "Sat 12 Dec 2026" from "2026-12-12". */
export function dayText(iso: string, currency = "INR"): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  // An American customer's date reads month first ("Sat, Feb 6, 2027").
  return d.toLocaleDateString(currency === "USD" ? "en-US" : "en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** "per plate", "per piece", "all in": the unit as it reads after a price. */
export function unitWord(unit: Basis, category: string, currency?: string): string {
  return unit === "total" ? "all in" : basisLabel(unit, category, currency).toLowerCase();
}

/** The symbol typed beside a price field: "$" for dollars, "₹" for rupees, else the code. */
export function moneySign(currency: string): string {
  return currency === "INR" ? "₹" : currency === "USD" ? "$" : currency;
}

/**
 * The currency a business prices in, from its city: the sample businesses in Austin price in
 * dollars, everyone else (Chennai first) in rupees.
 */
export function currencyOfCity(city: string | undefined): string {
  return /\baustin\b/i.test(city ?? "") ? "USD" : "INR";
}

type PricedOffering = { price: number; currency: string; unit: Basis; category: string; priceUnit?: string; quantities?: Record<string, number> };

/**
 * A published price as customers read it: in the trade's own terms with what it includes
 * ("₹45,000 for the event · 8 hours"), or the price and its unit for a kind of service
 * with no sheet. One saved in another unit than its sheet's reads as it was saved.
 */
export function priceText(o: PricedOffering): string {
  const sheet = sheetFor(o.category, o.currency);
  if (sheet && o.unit === sheet.unit) return describeOffer(sheet, o.priceUnit, o.price, o.quantities ?? {}, o.currency);
  return `${money(o.price, o.currency)} ${unitWord(o.unit, o.category, o.currency)}`;
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
