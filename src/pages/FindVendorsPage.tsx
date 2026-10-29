import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { priceUnitOf, sheetFor } from "../../convex/lib/standardSheet";
import { BRAND } from "../lib/brand";
import { money } from "../lib/format";
import { useAuthActions } from "../lib/session";
import { Backdrop } from "../components/ui/Backdrop";
import { PublicHero, PublicNav } from "../components/public/PublicNav";

/**
 * Find vendors: the vendor directory, open to anyone, with no plan bought. Vendors listed
 * on PlusOne by trade and city, each with their packages on the standard sheet, and vendors
 * on the open web. No sign-in for either. Nothing is sent to anyone from here: to get
 * quotes, a family starts a plan.
 */

type Card = NonNullable<ReturnType<typeof useDirectory>>["vendors"][number];

function useDirectory(category: string, city: string) {
  return useQuery(api.marketplace.directory.search, { category, city });
}

const per = (category: string, priceUnit?: string) => {
  const sheet = sheetFor(category);
  return sheet ? priceUnitOf(sheet, priceUnit).label : "";
};

export function FindVendorsPage() {
  const trades = useQuery(api.marketplace.directory.trades, {}) ?? [];
  const [category, setCategory] = useState("Catering");
  const [city, setCity] = useState("Chennai");
  const found = useDirectory(category, city);

  return (
    <div className="relative isolate min-h-screen">
      <Backdrop />
      <PublicNav />
      <main id="main" className="mx-auto max-w-4xl px-4 pb-16">
        <PublicHero
          eyebrow="Find vendors"
          title={<>Vendors, <em>priced in the open</em></>}
          lede={`Caterers, decorators, photographers, halls and more, each with their packages on the same lines. Free to use, with no plan to buy.`}
        />

        <div className="mt-8 rounded-[16px] border border-line bg-cream px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">What you need</p>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              in
              <input
                aria-label="City"
                className="w-[7.5rem] border-b border-line bg-transparent px-1 py-0.5 text-ink focus:border-accent focus:outline-none"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
          </div>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Kind of vendor">
            {trades.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={category === t}
                onClick={() => setCategory(t)}
                className={`shrink-0 whitespace-nowrap ${category === t ? "chip-pending" : "chip-quiet hover:text-accent"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-8" aria-live="polite">
          <h2 className="text-xl">On {BRAND.name}</h2>
          {found === undefined ? (
            <p className="mt-3 text-sm text-muted">Looking…</p>
          ) : found.vendors.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No {category.toLowerCase()} vendors listed in {city} yet. Search the open web below.</p>
          ) : (
            <>
              {found.samplesOnly && (
                <p className="mt-2 text-sm text-muted">
                  These are sample vendors, made up to show how listings look. Real vendors join as {city} opens.
                </p>
              )}
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {found.vendors.map((v) => (
                  <li key={v._id}><ListingCard card={v} category={category} /></li>
                ))}
              </ul>

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

function ListingCard({ card, category }: { card: Card; category: string }) {
  const start = card.startingPrice;
  return (
    <Link to={`/vendors/${card._id}`} className="block rounded-[14px] border border-line bg-cream px-4 py-3.5 hover:border-accent">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{card.name}</p>
          <p className="text-[12px] text-muted">{card.city}</p>
        </div>
        {card.sample && <span className="chip-quiet shrink-0">Sample</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {card.badges.includes("verified") && <span className="chip-ok">Verified</span>}
        {card.badges.includes("transparent_pricing") && <span className="chip-ok">Transparent pricing</span>}
        {card.tier && <span className="chip-quiet">{card.tier}</span>}
        <span className="chip-quiet">{card.level}</span>
      </div>
      {start && (
        <p className="mt-2 text-sm text-ink">
          From {money(start.price, start.currency)} <span className="text-muted">{per(category, start.priceUnit)}</span>
        </p>
      )}
      <p className="mt-1 text-[11px] text-quiet">
        {card.completedEvents} {card.completedEvents === 1 ? "event" : "events"} through {BRAND.name}
      </p>
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
  const listing = useQuery(api.marketplace.directory.vendor, profileId ? { profileId: profileId as Id<"vendorProfiles"> } : "skip");
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
                        {money(p.price, p.currency)} <span className="text-sm text-muted">{per(p.category, p.priceUnit)}</span>
                      </p>
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      {p.category}
                      {p.taxIncluded === true ? " · GST included" : p.taxIncluded === false ? " · GST extra" : " · GST not stated"}
                    </p>
                    {p.includes.length > 0 && <p className="mt-1.5 text-sm text-muted">Includes {p.includes.join(", ")}</p>}
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
