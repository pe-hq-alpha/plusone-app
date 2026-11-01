import { tierFor } from "../../convex/lib/marketplace";
import { money } from "../lib/format";

export type RangeBand = { count: number; p25: number; p50: number; p75: number; p90: number; currency: string };
export type RangePoint = { id: string; name: string; price: number };

/** Two pins nearer than this share of the bar go in separate rows, so their numbers stay readable. */
const CROWDED = 0.06;

/**
 * The city's prices for one need as a bar: Value, Standard, Premium and Luxury, the typical
 * price marked, and each quote pinned on it by number, named in the list beneath. Where the
 * city has no range yet (no vendor there has listed prices for this kind of need), the bar
 * runs across the host's own quotes instead, cheapest to dearest, and switches to the city's
 * range by itself once there is one. It shows where a price sits so the family can choose
 * with the whole range in view; it never calls a price fair or unfair.
 */
export function PriceRange({ band, points, unitWord, city, currency }: { band: RangeBand | null; points: RangePoint[]; unitWord: string; city: string; currency: string }) {
  if (!band) return <QuoteSpread points={points} unitWord={unitWord} currency={currency} />;
  return <CityRange band={band} points={points} unitWord={unitWord} city={city} />;
}

/** Pins cheapest first, numbered; a pin too close to one already in a row moves up a row. */
function placePins(points: RangePoint[], at: (price: number) => number) {
  const rowEnds: number[] = [];
  const pins = [...points]
    .sort((a, b) => a.price - b.price)
    .map((p, i) => {
      const x = at(p.price);
      let row = rowEnds.findIndex((end) => x - end >= CROWDED * 100);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = x;
      return { ...p, n: i + 1, x, row };
    });
  return { pins, rows: Math.max(1, rowEnds.length) };
}

function Pin({ x, n, row }: { x: number; n: number; row: number }) {
  return (
    <div className="absolute bottom-full flex -translate-x-1/2 flex-col items-center" style={{ left: `${x}%` }} aria-hidden="true">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px] font-semibold text-paper">{n}</span>
      <span className="w-px bg-ink/40" style={{ height: `${6 + row * 26}px` }} />
    </div>
  );
}

/** No city range yet: the host's own quotes on one bar, cheapest to dearest, the middle one marked. */
function QuoteSpread({ points, unitWord, currency }: { points: RangePoint[]; unitWord: string; currency: string }) {
  const prices = points.map((p) => p.price).sort((a, b) => a - b);
  const low = prices[0];
  const high = prices[prices.length - 1];
  // A little room past each end, so the cheapest and the dearest pins aren't on the bar's edge.
  const pad = (high - low) * 0.08 || low * 0.1 || 1;
  const lo = Math.max(0, low - pad);
  const hi = high + pad;
  const span = hi - lo || 1;
  const at = (price: number) => ((price - lo) / span) * 100;
  const mid = prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
  const per = unitWord === "all in" ? "" : ` per ${unitWord}`;
  const { pins, rows } = placePins(points, at);

  return (
    <figure className="px-6 py-4" aria-label={`Your ${points.length} quotes${per}, from ${money(low, currency)} to ${money(high, currency)}`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span>Where your quotes sit, cheapest to dearest{per}</span>
        <span className="text-quiet">Across your {points.length} quotes</span>
      </figcaption>

      <div className="relative" style={{ marginTop: `${8 + rows * 26}px` }}>
        {pins.map((p) => <Pin key={p.id} x={p.x} n={p.n} row={p.row} />)}
        <div className="h-7 rounded-full border border-line bg-gradient-to-r from-accent/10 via-accent/30 to-accent/60" />
        <div className="absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-highlight" style={{ left: `${at(mid)}%` }} aria-hidden="true" />
      </div>

      <div className="relative mt-1 h-4 text-[11px] text-muted" aria-hidden="true">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${at(low)}%` }}>{money(low, currency)}</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${at(high)}%` }}>{money(high, currency)}</span>
      </div>

      <ol className="mt-3 grid gap-x-10 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {pins.map((p) => (
          <li key={p.id} className="flex items-baseline gap-2">
            <span className="grid h-4 w-4 shrink-0 translate-y-0.5 place-items-center rounded-full bg-ink text-[11px] font-semibold text-paper">{p.n}</span>
            <span className="min-w-0 truncate text-ink">{p.name}</span>
            <span className="whitespace-nowrap text-muted">
              {money(p.price, currency)}
              {p.price === low ? " · lowest" : p.price === high ? " · highest" : low > 0 ? ` · ${Math.round(((p.price - low) / low) * 100)}% over the lowest` : ""}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">
        The middle of your quotes, <span className="font-medium text-ink">{money(mid, currency)}</span>
        {per}, is marked in gold. The city&rsquo;s Value-to-Luxury range shows here once vendors there list their prices.
      </p>
    </figure>
  );
}

/** The city's range for this need, with each quote pinned on it. */
function CityRange({ band, points, unitWord, city }: { band: RangeBand; points: RangePoint[]; unitWord: string; city: string }) {
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

  const placed = placePins(points, at);
  const pins = placed.pins.map((p) => ({ ...p, tier: tierFor(p.price, band) }));
  const rows = placed.rows;

  return (
    <figure className="px-6 py-4" aria-label={`${city} prices${per}: typical ${money(band.p50, band.currency)}, middle half ${money(band.p25, band.currency)} to ${money(band.p75, band.currency)}, from ${band.count} listed prices`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span>Where these quotes sit among {city} prices{per}</span>
        <span className="text-quiet">{band.count} listed prices</span>
      </figcaption>

      <div className="relative" style={{ marginTop: `${8 + rows * 26}px` }}>
        {pins.map((p) => <Pin key={p.id} x={p.x} n={p.n} row={p.row} />)}

        <div className="flex h-7 overflow-hidden rounded-full border border-line">
          {segments.map((s) => {
            const width = ((s.to - s.from) / span) * 100;
            // A name too long for its share of the bar is left to the tiers in the list below on a phone, never cut into the next one.
            return (
              // Standard's name sits at its left so the typical-price mark (inside it) never runs through it;
              // the two darker parts take light lettering so they read in both themes.
              <div key={s.name} className={`flex min-w-0 items-center ${s.name === "Standard" ? "justify-start pl-3" : "justify-center"} ${s.shade}`} style={{ width: `${width}%` }}>
                <span className={`overflow-hidden whitespace-nowrap px-1 text-[11px] font-medium uppercase tracking-wide ${s.name === "Premium" || s.name === "Luxury" ? "text-paper" : "text-muted"} ${width < 18 ? "max-sm:hidden" : ""}`}>{s.name}</span>
              </div>
            );
          })}
        </div>
        <div className="absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-highlight" style={{ left: `${at(band.p50)}%` }} aria-hidden="true" />
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
