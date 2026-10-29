import { money } from "../lib/format";

export type RangeBand = { count: number; p25: number; p50: number; p75: number; p90: number; currency: string };
export type RangePoint = { id: string; name: string; price: number };

/**
 * The city's prices for one need as a bar: Value, Standard, Premium and Luxury, the typical
 * price marked, and each quote placed on it. It shows where a price sits so the family can
 * choose with the whole range in view; it never calls a price fair or unfair.
 */
export function PriceRange({ band, points, unitWord, city }: { band: RangeBand; points: RangePoint[]; unitWord: string; city: string }) {
  const prices = points.map((p) => p.price);
  // The bar runs a little past the band's ends, and far enough to hold every quote on it.
  const lo = Math.max(0, Math.min(band.p25 - (band.p50 - band.p25), ...prices));
  const hi = Math.max(band.p90 + (band.p90 - band.p75), ...prices);
  const span = hi - lo || 1;
  const at = (price: number) => ((price - lo) / span) * 100;
  const per = unitWord === "all in" ? "" : ` per ${unitWord}`;
  const segments = [
    { name: "Value", from: lo, to: band.p25, shade: "bg-accent/10" },
    { name: "Standard", from: band.p25, to: band.p75, shade: "bg-accent/25" },
    { name: "Premium", from: band.p75, to: band.p90, shade: "bg-accent/45" },
    { name: "Luxury", from: band.p90, to: hi, shade: "bg-accent/70" },
  ];
  // Names alternate above and below the bar, so two quotes close in price don't overlap.
  const placed = [...points].sort((a, b) => a.price - b.price);

  return (
    <figure className="px-6 py-4" aria-label={`${city} prices${per}: typical ${money(band.p50, band.currency)}, middle half ${money(band.p25, band.currency)} to ${money(band.p75, band.currency)}, from ${band.count} listed prices`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Where these quotes sit among {city} prices{per}
        </span>
        <span className="text-quiet">{band.count} listed prices</span>
      </figcaption>

      <div className="relative mt-9 mb-9">
        {placed.map((p, i) => {
          const up = i % 2 === 0;
          return (
            <div
              key={p.id}
              className={`absolute flex -translate-x-1/2 flex-col items-center ${up ? "bottom-full mb-1" : "top-full mt-1 flex-col-reverse"}`}
              style={{ left: `${at(p.price)}%` }}
            >
              <span className="max-w-[9rem] truncate whitespace-nowrap text-[11px] font-medium text-ink">
                {p.name} · {money(p.price, band.currency)}
              </span>
              <span className="h-2 w-px bg-ink/50" aria-hidden="true" />
            </div>
          );
        })}

        <div className="flex h-7 overflow-hidden rounded-full border border-line">
          {segments.map((s) => (
            <div key={s.name} className={`relative grid place-items-center ${s.shade}`} style={{ width: `${((s.to - s.from) / span) * 100}%` }}>
              <span className="truncate px-1 text-[11px] font-medium uppercase tracking-wide text-muted">{s.name}</span>
            </div>
          ))}
        </div>

        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent" style={{ left: `${at(band.p50)}%` }} aria-hidden="true" />
        {placed.map((p) => (
          <span
            key={p.id}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink"
            style={{ left: `${at(p.price)}%` }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="relative h-4 text-[11px] text-muted" aria-hidden="true">
        {[band.p25, band.p75, band.p90].map((v) => (
          <span key={v} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${at(v)}%` }}>
            {money(v, band.currency)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        Typical price <span className="font-medium text-ink">{money(band.p50, band.currency)}</span>
        {per}, marked in gold. The family chooses; PlusOne shows where each price sits.
      </p>
    </figure>
  );
}
