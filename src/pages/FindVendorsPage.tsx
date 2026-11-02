import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { packageCharges, priceUnitOf, sheetFor, taxLabel, type PackageCharge } from "../../convex/lib/standardSheet";
import { sampleFor } from "../../convex/lib/regions";
import { guessRegion } from "../lib/region";
import { distanceKm, kmText, placeFor, readSearch, type Asked } from "../../convex/lib/places";
import { RADII } from "../components/NearVenue";
import type { MapPin } from "../components/VendorMap";
import { BRAND } from "../lib/brand";
import { partnerHref } from "../lib/hosts";
import { money } from "../lib/format";
import { useAuthActions } from "../lib/session";
import { Backdrop } from "../components/ui/Backdrop";
import { PublicNav } from "../components/public/PublicNav";

/**
 * Find vendors: the vendor directory, open to anyone, with no plan bought. Vendors listed
 * on PlusOne by trade and city, each with their packages on the standard sheet, and vendors
 * on the open web. No sign-in for either. Nothing is sent to anyone from here: to get
 * quotes, a family starts a plan.
 */

const VendorMap = lazy(() => import("../components/VendorMap"));

type Card = NonNullable<ReturnType<typeof useDirectory>>["vendors"][number];

function useDirectory(category: string, city: string) {
  return useQuery(api.marketplace.directory.search, { category, city });
}

const per = (category: string, priceUnit?: string, currency?: string) => {
  const sheet = sheetFor(category, currency);
  return sheet ? priceUnitOf(sheet, priceUnit).label : "";
};

export function FindVendorsPage() {
  const trades = useQuery(api.marketplace.directory.trades, {}) ?? [];
  const [category, setCategory] = useState("Catering");
  // Visitors in India start in Chennai, everyone else in Austin, where the sample vendors are.
  const [city, setCity] = useState(() => (sampleFor(guessRegion()) === "austin" ? "Austin" : "Chennai"));
  const [area, setArea] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [radiusKm, setRadiusKm] = useState(5);
  const [insideOnly, setInsideOnly] = useState(false);
  const found = useDirectory(category, city);

  // A search in plain words sets the trade, the city, the area and a price limit at once.
  const apply = (a: Asked) => {
    if (a.category) setCategory(a.category);
    if (a.city) setCity(a.city);
    setArea(a.area ?? null);
    setMaxPrice(a.maxPrice ?? null);
    if (a.area) {
      setView("map");
      setInsideOnly(true);
    }
  };

  const centre = area ? placeFor(area, city) : placeFor(undefined, city);
  const shown = useMemo(() => {
    const all = (found?.vendors ?? []).map((v) => {
      const km = area && centre && v.place && v.place.precision !== "city" ? distanceKm(centre, v.place) : null;
      return { card: v, km };
    });
    return all
      .filter(({ card }) => !maxPrice || !card.startingPrice || card.startingPrice.price <= maxPrice)
      .filter(({ km }) => !area || !insideOnly || (km !== null && km <= radiusKm))
      .sort((a, b) => (area ? (a.km ?? Infinity) - (b.km ?? Infinity) : 0));
  }, [found, area, centre?.lat, centre?.lng, maxPrice, insideOnly, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <PublicNav wide />
      <main id="main" className="w-full px-3 pb-16 sm:px-4">
        <div className="pt-6 sm:pt-8">
          <h1 className="pub-title !text-left !text-[clamp(1.8rem,3vw,2.5rem)]">Vendors, <em>with prices you can compare</em></h1>
          <p className="mt-2 max-w-3xl text-sm text-muted sm:text-base">Caterers, decorators, photographers, halls and more, each with their packages on the same lines. Free to use, with no plan to buy.</p>
        </div>

        <div className="mt-5 rounded-[16px] border border-line bg-cream px-4 py-4 sm:px-5">
          <PlainSearch onRead={apply} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted">What you need</p>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              in
              <input
                aria-label="City"
                className="w-[7.5rem] border-b border-line bg-transparent px-1 py-0.5 text-ink focus:border-accent focus:outline-none"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setArea(null);
                }}
              />
            </label>
          </div>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Kind of vendor">
            {trades.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={category === t}
                onClick={() => {
                  setCategory(t);
                  setMaxPrice(null);
                }}
                className={`shrink-0 whitespace-nowrap ${category === t ? "chip-pending" : "chip-quiet hover:text-accent"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-8" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl">
              On {BRAND.name}
              {(area || maxPrice) && (
                <span className="ml-2 align-middle text-sm font-normal text-muted">
                  {area ? `near ${area}` : ""}
                  {area && maxPrice ? " · " : ""}
                  {maxPrice ? `up to ${money(maxPrice, "INR")}` : ""}
                  <button type="button" className="ml-2 text-accent underline" onClick={() => apply({})}>Clear</button>
                </span>
              )}
            </h2>
            <div className="flex gap-1 rounded-full bg-cream p-1 ring-1 ring-line" role="group" aria-label="Show as">
              {([["list", "List"], ["map", "Map"]] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-xs ${view === v ? "bg-accent text-paper" : "text-muted hover:text-accent"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {view === "map" && (
            <DirectoryMap
              centre={centre}
              area={area}
              rows={shown}
              radiusKm={radiusKm}
              setRadiusKm={setRadiusKm}
              insideOnly={insideOnly}
              setInsideOnly={setInsideOnly}
            />
          )}
          {found === undefined ? (
            <p className="mt-3 text-sm text-muted">Looking…</p>
          ) : found.vendors.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No {category.toLowerCase()} vendors listed in {city} yet. Search the open web below.</p>
          ) : shown.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              None of the {found.vendors.length} listed {category.toLowerCase()} vendors {area && insideOnly ? `is within ${radiusKm} km of ${area}` : "fits that price"}.{" "}
              <button type="button" className="text-accent underline" onClick={() => (area && insideOnly ? setInsideOnly(false) : setMaxPrice(null))}>Show them all</button>
            </p>
          ) : (
            <>
              {found.samplesOnly ? (
                <p className="mt-2 text-sm text-muted">
                  These are sample vendors, made up to show how listings look. Real vendors join as {city} opens.
                </p>
              ) : (
                found.vendors.some((v) => v.sample) && (
                  <p className="mt-2 text-sm text-muted">
                    Vendors who list their prices come first. Those marked Sample are made up, to show how listings look until real vendors join.
                  </p>
                )
              )}
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {shown.filter(({ card }) => !card.foundOnWeb).map(({ card, km }) => (
                  <li key={card._id}><ListingCard card={card} category={category} km={km} /></li>
                ))}
              </ul>
              {/* Found on the web: kept apart from the vendors with prices, and said plainly. */}
              {shown.some(({ card }) => card.foundOnWeb) && (
                <div className="mt-8">
                  <h3 className="text-base font-medium">Also found on the web, not yet verified</h3>
                  <p className="mt-1 text-sm text-muted">Businesses from public listings. They haven&rsquo;t listed prices on {BRAND.name} yet, so there&rsquo;s nothing to compare until they do.</p>
                  <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {shown.filter(({ card }) => card.foundOnWeb).map(({ card, km }) => (
                      <li key={card._id}><ListingCard card={card} category={category} km={km} /></li>
                    ))}
                  </ul>
                </div>
              )}

            </>
          )}
        </section>

        <WebSearch category={category} city={city} />

        <aside className="mt-10 rounded-[14px] border border-line bg-cream px-5 py-4 text-sm leading-relaxed text-muted">
          Want quotes you can compare? <Link to="/new" className="text-accent underline">Start a plan</Link> and {BRAND.name} writes
          to the vendors you choose and puts every reply on the same lines. Are you a vendor?{" "}
          <Link to="/partner" className="text-accent underline">List your business</Link> and get found.
        </aside>
      </main>
    </div>
  );
}

/**
 * One box for the whole search, in a person's own words: "caterers in Chennai",
 * "photographers near Adyar under 20k". Everyday searches are read right here; one with no
 * trade word in it is read by the server (Muse Spark), as a guest if nobody has signed in.
 */
function PlainSearch({ onRead }: { onRead: (a: Asked) => void }) {
  const { isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const read = useAction(api.marketplace.directory.read);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const waiting = useRef(false);

  const tell = (a: Asked) => {
    onRead(a);
    const parts = [a.category, a.area ? `near ${a.area}` : a.city ? `in ${a.city}` : "", a.maxPrice ? `up to ${money(a.maxPrice, "INR")}` : ""].filter(Boolean);
    setSaid(a.category ? `Showing ${parts.join(" ")}` : "Couldn't tell which kind of vendor. Pick one below.");
  };

  const run = async () => {
    const local = readSearch(text);
    if (local.category || !text.trim()) return tell(local);
    if (!isAuthenticated) {
      waiting.current = true;
      setBusy(true);
      void signIn("anonymous").catch(() => {
        waiting.current = false;
        setBusy(false);
        tell(local);
      });
      return;
    }
    setBusy(true);
    try {
      tell(await read({ text }));
    } catch {
      tell(local);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && waiting.current) {
      waiting.current = false;
      void run();
    }
    // The guest session arriving is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          aria-label="Search vendors"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={sampleFor(guessRegion()) === "austin" ? "Caterers in Austin, photographers near Zilker under 1,500…" : "Caterers in Chennai, photographers near Adyar under 20k…"}
        />
        <button className="btn-primary shrink-0" disabled={busy || !text.trim()}>{busy ? "Reading…" : "Search"}</button>
      </div>
      {said && <p className="mt-1.5 text-xs text-muted" aria-live="polite">{said}</p>}
    </form>
  );
}

/** The listed vendors on a map, around the area searched (or the city), numbered as in the cards. */
function DirectoryMap({
  centre,
  area,
  rows,
  radiusKm,
  setRadiusKm,
  insideOnly,
  setInsideOnly,
}: {
  centre: ReturnType<typeof placeFor>;
  area: string | null;
  rows: { card: Card; km: number | null }[];
  radiusKm: number;
  setRadiusKm: (km: number) => void;
  insideOnly: boolean;
  setInsideOnly: (on: boolean) => void;
}) {
  const pins: MapPin[] = useMemo(
    () =>
      rows
        .filter(({ card }) => card.place && card.place.precision !== "city")
        .map(({ card, km }, i) => ({
          id: card._id,
          lat: card.place!.lat,
          lng: card.place!.lng,
          n: i + 1,
          name: card.name,
          note: [card.place!.label, card.startingPrice ? `from ${money(card.startingPrice.price, card.startingPrice.currency)}` : "", km !== null ? kmText(km) : ""].filter(Boolean).join(" · "),
          inside: !area || (km !== null && km <= radiusKm),
        })),
    [rows, area, radiusKm],
  );
  const mapCentre = useMemo(() => (centre ? { lat: centre.lat, lng: centre.lng, label: centre.label } : null), [centre?.lat, centre?.lng, centre?.label]); // eslint-disable-line react-hooks/exhaustive-deps
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-xs transition ${on ? "bg-accent text-paper" : "bg-cream text-muted ring-1 ring-line hover:text-accent"}`;
  return (
    <div className="mt-4">
      {area ? (
        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label={`How far from ${area}`}>
          {RADII.map((km) => (
            <button key={km} type="button" aria-pressed={radiusKm === km} className={chip(radiusKm === km)} onClick={() => setRadiusKm(km)}>
              {km} km
            </button>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
          <button type="button" aria-pressed={insideOnly} className={chip(insideOnly)} onClick={() => setInsideOnly(!insideOnly)}>
            Only inside the circle
          </button>
        </div>
      ) : (
        <p className="mb-2 text-xs text-muted">Search an area (&ldquo;caterers near Mylapore&rdquo;) to draw a circle around it.</p>
      )}
      <Suspense fallback={<div className="vendor-map grid place-items-center text-sm text-muted">Loading the map…</div>}>
        <VendorMap label={`Map of vendors${area ? ` near ${area}` : ""}`} centre={area ? mapCentre : null} radiusKm={area ? radiusKm : null} pins={pins} className="!h-[26rem]" />
      </Suspense>
    </div>
  );
}

function ListingCard({ card, category, km }: { card: Card; category: string; km: number | null }) {
  const start = card.startingPrice;
  return (
    <Link to={`/vendors/${card._id}`} className="block overflow-hidden rounded-[14px] border border-line bg-cream hover:border-accent">
      {/* A picture on every card: their own checked work; else the preview image their own site sets for sharing,
          shown from there; else a quiet panel for the trade until they add some. */}
      {card.photos[0] ? (
        <img src={card.photos[0].url} alt={card.photos[0].shows ?? `Work by ${card.name}`} className="aspect-[16/9] w-full object-cover" loading="lazy" />
      ) : (
        <CardCover cover={card.cover} name={card.name} category={category} />
      )}
      <div className="px-4 pb-3.5 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{card.name}</p>
          <p className="text-[12px] text-muted">
            {card.place && card.place.precision !== "city" ? `${card.place.label}, ${card.city}` : card.city}
            {km !== null && ` · ${kmText(km)} away`}
          </p>
        </div>
        {card.sample && <span className="chip-quiet shrink-0">Sample</span>}
      </div>
      {card.foundOnWeb && <p className="mt-1 text-[11px] text-quiet">Found through public web listings · not yet verified</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {card.badges.includes("verified") && <span className="chip-ok">Verified</span>}
        {card.badges.includes("transparent_pricing") && <span className="chip-ok">Transparent pricing</span>}
        {card.tier && <span className="chip-quiet">{card.tier}</span>}
        <span className="chip-quiet">{card.level}</span>
      </div>
      {start && (
        <p className="mt-2 text-sm text-ink">
          From {money(start.price, start.currency)} <span className="text-muted">{per(category, start.priceUnit, start.currency)}</span>
        </p>
      )}
      <p className="mt-1 text-[11px] text-quiet">
        {card.completedEvents} {card.completedEvents === 1 ? "event" : "events"} through {BRAND.name}
      </p>
      </div>
    </Link>
  );
}

function WebSearch({ category, city }: { category: string; city: string }) {
  const { isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const search = useAction(api.marketplace.directory.searchWeb);
  // A visitor who hasn't signed in searches as a guest: the guest session starts on the
  // first press, and the search runs once it's ready.
  const waiting = useRef(false);
  const [results, setResults] = useState<{ url: string; host: string; title?: string; description?: string }[] | null>(null);
  const [state, setState] = useState<"idle" | "searching" | "error">("idle");
  const [error, setError] = useState("");

  const run = async () => {
    setState("searching");
    setError("");
    if (!isAuthenticated) {
      waiting.current = true;
      void signIn("anonymous").catch(() => {
        waiting.current = false;
        setError("That search didn't work. Try again in a minute.");
        setState("error");
      });
      return;
    }
    try {
      setResults(await search({ category, city }));
      setState("idle");
    } catch (e) {
      const data = (e as { data?: unknown }).data;
      setError(typeof data === "string" ? data : "That search didn't work. Try again in a minute.");
      setState("error");
    }
  };

  useEffect(() => {
    if (isAuthenticated && waiting.current) {
      waiting.current = false;
      void run();
    }
    // run is recreated each render; the guest session arriving is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return (
    <section className="mt-10">
      <h2 className="text-xl">On the open web</h2>
      <p className="mt-1 text-sm text-muted">
        Vendors with their own websites who aren't on {BRAND.name} yet. Only their own sites are read, never listing or review sites.
      </p>
      <button type="button" className="btn-primary mt-4" disabled={state === "searching"} onClick={() => void run()}>
        {state === "searching" ? "Searching…" : `Search the web for ${category.toLowerCase()} in ${city}`}
      </button>
      {state === "error" && <p className="mt-3 text-sm text-bad">{error}</p>}
      {results && (
        results.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing found this time. Try another city or kind of vendor.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {results.map((r) => (
              <li key={r.url} className="rounded-[12px] border border-line bg-cream px-4 py-3">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:text-accent">
                  {r.title || r.host}
                </a>
                <p className="text-[12px] text-quiet">{r.host}</p>
                {r.description && <p className="mt-1 text-sm text-muted">{r.description}</p>}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

/** One listed vendor: their packages on the standard sheet, as customers read them. */
export function VendorListingPage() {
  const { profileId } = useParams();
  const listing = useQuery(api.marketplace.directory.vendor, profileId ? { profileId } : "skip");
  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <PublicNav />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-16">
        <p className="mt-6 text-sm"><Link to="/vendors" className="text-accent underline">All vendors</Link></p>
        {listing === undefined ? (
          <p className="mt-6 text-muted">Loading…</p>
        ) : listing === null ? (
          <p className="mt-6 text-muted">This vendor isn't listed on {BRAND.name}.</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl">{listing.card.name}</h1>
              {listing.card.sample && <span className="chip-quiet">Sample</span>}
            </div>
            <p className="mt-1 text-sm text-muted">{listing.card.categories.join(", ")} · {listing.card.city}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {listing.card.badges.includes("verified") && <span className="chip-ok">Verified by {BRAND.name}</span>}
              {listing.card.badges.includes("transparent_pricing") && <span className="chip-ok">Transparent pricing</span>}
              <span className="chip-quiet">
                {listing.card.level}: {listing.card.completedEvents} {listing.card.completedEvents === 1 ? "event" : "events"} through {BRAND.name}
              </span>
            </div>
            {listing.about && <p className="mt-4 leading-relaxed text-ink">{listing.about}</p>}
            {listing.card.foundOnWeb && <FoundOnWeb name={listing.card.name} website={listing.card.website} links={listing.card.links} cover={listing.card.cover} />}

            <h2 className="mt-8 text-xl">Packages</h2>
            {listing.packages.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No prices listed yet.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {listing.packages.map((p, i) => (
                  <li key={i} className="rounded-[14px] border border-line bg-cream px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-ink">{p.title}</p>
                      <p className="text-ink">
                        {money(p.price, p.currency)} <span className="text-sm text-muted">{per(p.category, p.priceUnit, p.currency)}</span>
                      </p>
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      {p.category}
                      {` · ${taxLabel(p.currency)} ${p.taxIncluded === true ? "included" : p.taxIncluded === false ? "extra" : "not stated"}`}
                    </p>
                    {p.includes.length > 0 && <p className="mt-1.5 text-sm text-muted">Includes {p.includes.join(", ")}</p>}
                    <PackageChargeLines category={p.category} currency={p.currency} charges={p.charges} includes={p.includes} />
                  </li>
                ))}
              </ul>
            )}

            {listing.card.photos.length > 0 && (
              <>
                <h2 className="mt-8 text-xl">Past work</h2>
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {listing.card.photos.map((ph, i) => (
                    <li key={i}>
                      <a href={ph.url} target="_blank" rel="noopener noreferrer">
                        <img src={ph.url} alt={ph.shows ?? `Work by ${listing.card.name}`} className="aspect-[4/3] w-full rounded-[10px] object-cover" loading="lazy" />
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <aside className="mt-10 rounded-[14px] border border-line bg-cream px-5 py-4 text-sm leading-relaxed text-muted">
              To get a quote from {listing.card.name}, <Link to="/new" className="text-accent underline">start a plan</Link>: {BRAND.name}{" "}
              sends them your request, and their answer lands on the same lines as every other quote. Their contact details are
              shared once you book through {BRAND.name}.
            </aside>
          </>
        )}
      </main>
    </div>
  );
}

/** A package's charges as the vendor stated them: in the price, on top, not provided, and what they haven't said. */
function PackageChargeLines({ category, currency, charges, includes }: { category: string; currency: string; charges?: PackageCharge[]; includes: string[] }) {
  const sheet = sheetFor(category, currency);
  const read = packageCharges(sheet, charges?.filter((c) => c.key !== "gst"), currency, includes);
  const notSaid = read.notSaid.filter((l) => l !== taxLabel(currency));
  const rows: [string, string[], string][] = [
    ["Also in the price", read.inPrice, "text-muted"],
    ["On top", read.onTop, "text-ink"],
    ["Not provided", read.notProvided, "text-muted"],
    ["Not said", notSaid, "text-warn"],
  ];
  if (!charges?.length && !notSaid.length) return null;
  return (
    <dl className="mt-1.5 grid gap-0.5 text-sm">
      {rows
        .filter(([, items]) => items.length)
        .map(([label, items, tone]) => (
          <div key={label} className="flex flex-wrap gap-x-1.5">
            <dt className="text-quiet">{label}:</dt>
            <dd className={tone}>{items.join(", ")}</dd>
          </div>
        ))}
    </dl>
  );
}

/**
 * A listing PlusOne added from public web listings: said plainly, with the business's own
 * pages linked (photos stay on its map listing, never copied), and a way to claim or remove it.
 */
function FoundOnWeb({ name, website, links, cover }: { name: string; website?: string; links?: { maps?: string; instagram?: string; facebook?: string }; cover?: { url: string; from: string } }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const out = [
    website && { href: website, text: "Their website" },
    links?.maps && { href: links.maps, text: "Photos and directions on Google Maps" },
    links?.instagram && { href: links.instagram, text: "Instagram" },
    links?.facebook && { href: links.facebook, text: "Facebook" },
  ].filter(Boolean) as { href: string; text: string }[];
  return (
    <div className="card-quiet mt-5 px-4 py-3 text-sm">
      {cover && !coverFailed && (
        <a href={cover.from} target="_blank" rel="noopener noreferrer nofollow" className="mb-3 block overflow-hidden rounded-[10px]">
          <img src={cover.url} alt={`${name}, from their website`} className="max-h-72 w-full object-cover" referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} />
        </a>
      )}
      <p className="text-muted">
        Found through public web listings. {BRAND.name} hasn&rsquo;t verified {name} yet, and the details here are what the business
        published about itself.
      </p>
      {out.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {out.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2">
              {l.text}
            </a>
          ))}
        </p>
      )}
      <p className="mt-2 text-xs text-quiet">
        Is this your business? <a href={partnerHref("/")} className="text-accent underline underline-offset-2">Claim it on {BRAND.name} Partner</a>, or{" "}
        <a href={`mailto:hello@plusoneevents.site?subject=${encodeURIComponent(`Remove the listing for ${name}`)}`} className="text-accent underline underline-offset-2">
          ask us to remove it
        </a>
        .
      </p>
    </div>
  );
}

/**
 * A card's picture when the vendor hasn't added photos: the preview image their own website
 * sets for sharing its link, loaded from their site (never copied), or a panel with the trade
 * over the line drawing. An image that won't load falls back to the panel.
 */
function CardCover({ cover, name, category }: { cover?: { url: string; from: string }; name: string; category: string }) {
  const [failed, setFailed] = useState(false);
  if (cover && !failed) {
    return (
      <span className="relative block">
        <img
          src={cover.url}
          alt={`${name}, from their website`}
          className="aspect-[16/9] w-full bg-paper object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
        <span className="absolute bottom-1.5 right-2 rounded-full bg-paper/80 px-2 py-0.5 text-[10px] text-muted">From their website</span>
      </span>
    );
  }
  return (
    <div className="vendor-cover grid aspect-[16/9] w-full place-items-center" aria-hidden="true">
      <span className="display text-xl text-accent">{category}</span>
    </div>
  );
}
