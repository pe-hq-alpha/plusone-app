import { tierFor } from "../../convex/lib/marketplace";
import { money } from "../lib/format";

export type RangeBand = { count: number; p25: number; p50: number; p75: number; p90: number; currency: string };
export type RangePoint = { id: string; name: string; price: number };

/** Two pins nearer than this share of the bar go in separate rows, so their numbers stay readable. */
const CROWDED = 0.06;

/**
 * The city's prices for one need as a bar: Value, Standard, Premium and Luxury, the typical
 * price marked, and each quote pinned on it by number, named in the list beneath. It shows
 * where a price sits so the family can choose with the whole range in view; it never calls
 * a price fair or unfair.
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

  // Cheapest first, numbered; a pin too close to one already in a row moves up a row.
  const rowEnds: number[] = [];
  const pins = [...points]
    .sort((a, b) => a.price - b.price)
    .map((p, i) => {
      const x = at(p.price);
      let row = rowEnds.findIndex((end) => x - end >= CROWDED * 100);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = x;
      return { ...p, n: i + 1, x, row, tier: tierFor(p.price, band) };
    });
  const rows = Math.max(1, rowEnds.length);

  return (
    <figure className="px-6 py-4" aria-label={`${city} prices${per}: typical ${money(band.p50, band.currency)}, middle half ${money(band.p25, band.currency)} to ${money(band.p75, band.currency)}, from ${band.count} listed prices`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span>Where these quotes sit among {city} prices{per}</span>
        <span className="text-quiet">{band.count} listed prices</span>
      </figcaption>

      <div className="relative" style={{ marginTop: `${8 + rows * 26}px` }}>
        {pins.map((p) => (
          <div
            key={p.id}
            className="absolute bottom-full flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${p.x}%` }}
            aria-hidden="true"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] font-semibold text-paper">{p.n}</span>
            <span className="w-px bg-ink/40" style={{ height: `${6 + p.row * 26}px` }} />
          </div>
        ))}

        <div className="flex h-7 overflow-hidden rounded-full border border-line">
          {segments.map((s) => (
            <div key={s.name} className={`grid place-items-center ${s.shade}`} style={{ width: `${((s.to - s.from) / span) * 100}%` }}>
              <span className="truncate px-1 text-[11px] font-medium uppercase tracking-wide text-muted">{s.name}</span>
            </div>
          ))}
        </div>
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent" style={{ left: `${at(band.p50)}%` }} aria-hidden="true" />
      </div>

      <div className="relative mt-1 h-4 text-[11px] text-muted" aria-hidden="true">
        {[band.p25, band.p75, band.p90].map((v) => (
          <span key={v} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${at(v)}%` }}>
            {money(v, band.currency)}
          </span>
        ))}
      </div>

      <ol className="mt-3 grid gap-x-10 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {pins.map((p) => (
          <li key={p.id} className="flex items-baseline gap-2">
            <span className="grid h-4 w-4 shrink-0 translate-y-0.5 place-items-center rounded-full bg-ink text-[11px] font-semibold text-paper">{p.n}</span>
            <span className="min-w-0 truncate text-ink">{p.name}</span>
            <span className="whitespace-nowrap text-muted">
              {money(p.price, band.currency)}
              {p.tier && <> · {p.tier}</>}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">
        Typical price <span className="font-medium text-ink">{money(band.p50, band.currency)}</span>
        {per}, marked in gold. You choose; PlusOne shows where each price sits.
      </p>
    </figure>
  );
}
