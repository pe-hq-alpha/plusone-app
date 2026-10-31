import { lazy, Suspense, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { basisLabel, type Basis } from "../../convex/lib/comparable";
import { describeOffer, packageCharges, priceUnitOf, quantitiesFor, quantityText, quantityValue, sheetFor, timesFor, type PackageCharge, type Sheet } from "../../convex/lib/standardSheet";
import { VENDOR_CATEGORIES } from "../../convex/lib/vendorNeeds";
import { Icon } from "../components/ui/Icon";
import { EmptyState } from "../components/ui/EmptyState";
import { Backdrop } from "../components/ui/Backdrop";
import { money } from "../lib/format";
import { useAuthActions } from "../lib/session";
import { useDemoEventId } from "../components/LeaveDemo";
import { CustomerCompare } from "../pages/DecisionsPage";
import { partnerHref } from "../lib/hosts";
import { BadgeRow, dayText, errorText, priceText, unitWord } from "./shared";
import { readyToUpload } from "../lib/pictures";
import { placeFor, type Place } from "../../convex/lib/places";
import "../styles/partner.css";

const VendorMap = lazy(() => import("../components/VendorMap"));

/**
 * PlusOne Partner, for vendors: join or claim your listing, answer customers' briefs on
 * the same sheet every vendor fills in, and keep your prices itemised. Families compare
 * offers line by line, so an offer here is complete or it isn't sent.
 */
export function PartnerPage() {
  const me = useQuery(api.users.me);
  const mine = useQuery(api.marketplace.partner.mine);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const leave = () => void signOut().then(() => navigate(partnerHref("/")));
  if (mine === undefined || me === undefined) return <main id="main" className="page px-5 py-10 text-muted">Loading…</main>;
  if (me?.isGuest && !mine.profile) return <TryAsGuest onAccount={leave} />;
  return (
    <main id="main" className="page isolate px-5 py-10 md:px-8">
      <Backdrop quiet />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[clamp(2.1rem,3.6vw,3.2rem)] leading-[1.08] text-balance">PlusOne <em>Partner</em></h1>
        {me?.isGuest ? (
          <Link to={partnerHref("/demo")} className="btn-quiet btn-sm bg-cream">Start the demo again</Link>
        ) : (
          <button type="button" className="btn-quiet btn-sm bg-cream" onClick={leave}>Sign out</button>
        )}
      </div>
      {me?.isGuest && (
        <p className="card-quiet mt-4 px-5 py-3 text-sm">
          <span className="chip-pending mr-2">Sample</span>
          You're a sample caterer. A customer planning a 60th birthday has asked for catering: answer it on the sheet below, then see your
          offer the way they see it, beside the quotes they already have.
        </p>
      )}
      {mine.profile ? (
        <>
          {!me?.isGuest && <Businesses businesses={mine.businesses} current={mine.profile._id} />}
          {mine.profile.status === "verified" && <WaitingChanges />}
          <Dashboard key={mine.profile._id} profile={mine.profile} offerings={mine.offerings} badges={mine.badges} tier={mine.tier} level={mine.level} />
        </>
      ) : (
        <Join claims={mine.claims} />
      )}
    </main>
  );
}

const STATUS_WORD: Record<string, string> = { pending: "being checked", verified: "verified", rejected: "not listed", suspended: "paused" };

/**
 * The businesses one account runs: switch between them, or add another (a caterer who
 * also does decor, a studio under a second name). Each one is checked on its own.
 */
function Businesses({ businesses, current }: { businesses: { _id: Id<"vendorProfiles">; name: string; status: string }[]; current: Id<"vendorProfiles"> }) {
  const switchTo = useMutation(api.marketplace.partner.switchBusiness);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = businesses.length >= 5;
  return (
    <>
      <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="Your businesses">
        {businesses.length > 1 &&
          businesses.map((b) => (
            <button
              key={b._id}
              type="button"
              aria-pressed={b._id === current}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${b._id === current ? "bg-accent text-paper" : "bg-cream text-muted ring-1 ring-line hover:text-accent"}`}
              onClick={() => {
                setAdding(false);
                setError(null);
                if (b._id !== current) void switchTo({ profileId: b._id }).catch((err) => setError(errorText(err, "That didn't switch. Try again.")));
              }}
            >
              {b.name}
              <span className={`ml-1.5 text-xs ${b._id === current ? "opacity-80" : "text-quiet"}`}>{STATUS_WORD[b.status] ?? b.status}</span>
            </button>
          ))}
        {!full && (
          <button type="button" className="btn-quiet btn-sm" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <Icon name={adding ? "close" : "plus"} size={14} />
            {adding ? "Close" : "Add another business"}
          </button>
        )}
      </nav>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {adding && <ProfileForm onSaved={() => setAdding(false)} />}
    </>
  );
}

/**
 * A verified listing's edits wait for the PlusOne team: what is waiting, before and after,
 * so the vendor knows why customers still see the old price or details.
 */
function WaitingChanges() {
  const waiting = useQuery(api.marketplace.changes.mine);
  if (!waiting?.length) return null;
  const what = (kind: string) => (kind === "details" ? "New details" : kind === "offering_remove" ? "Remove a package" : "A package");
  return (
    <section className="card-quiet mt-4 px-5 py-4" aria-labelledby="waiting-h">
      <h2 id="waiting-h" className="text-sm font-medium">
        Waiting for our team ({waiting.length})
      </h2>
      <p className="mt-0.5 text-xs text-muted">Customers see these once they&apos;re approved, usually within a day.</p>
      <ul className="mt-2 grid gap-2 text-sm">
        {waiting.map((c) => (
          <li key={c._id} className="min-w-0">
            <span className="font-medium">{what(c.kind)}</span>
            {c.after && <span className="block whitespace-pre-line break-words text-muted">{c.after}</span>}
            {c.kind === "offering_remove" && c.before && <span className="block break-words text-muted">{c.before}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The demo, from the vendor's side: try it as a sample caterer, or make an account for a real business. */
function TryAsGuest({ onAccount }: { onAccount: () => void }) {
  const start = useMutation(api.demo.startVendor);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main id="main" className="grid min-h-screen place-items-center px-5">
      <div className="card max-w-md px-7 py-8 text-center">
        <h1 className="display text-[1.7rem] leading-tight">See the <em>vendor's</em> side</h1>
        <p className="mt-2 text-muted">
          Families, teams and event managers send what they need; vendors answer on the same sheet, so every offer can be compared line by
          line. Try it as a sample caterer answering a customer's request, or make an account for your own business.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void start({})
                .catch((err) => setError(errorText(err, "That didn't start. Try again.")))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Starting…" : "Try it as a sample caterer"}
          </button>
          <button type="button" className="btn-quiet" onClick={onAccount}>Create an account</button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- joining

type Claim ={ _id: Id<"vendorClaims">; profileName: string; status: "pending" | "approved" | "rejected" };

function Join({ claims }: { claims: Claim[] }) {
  const [website, setWebsite] = useState("");
  const [checked, setChecked] = useState<string | null>(null);
  const found = useQuery(api.marketplace.partner.findByWebsite, checked ? { website: checked } : "skip");
  const claim = useMutation(api.marketplace.partner.claim);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const waiting = claims.filter((c) => c.status === "pending");

  return (
    <>
      <p className="mt-1 max-w-[42rem] text-sm leading-relaxed text-muted">
        Families and event managers planning in your city send what they need: the occasion, the date, how many guests. You answer on the same
        sheet as every other vendor, so they see what your price includes and what's extra, line by line. No bidding wars,
        no hidden charges.
      </p>

      {waiting.map((c) => (
        <p key={c._id} className="card-quiet mt-5 px-5 py-4 text-sm">
          <span className="chip-pending mr-2">Waiting</span>
          We're checking that <strong>{c.profileName}</strong> is yours. We'll email you once it's done, usually within a day.
        </p>
      ))}

      <section className="card mt-6 p-6 md:p-7" aria-labelledby="find-h">
        <h2 id="find-h" className="display text-xl">Is your business already on PlusOne?</h2>
        <p className="mt-1 text-sm text-muted">We list vendors from their own public pages. Enter your website and claim yours if it's there.</p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setChecked(website.trim() || null);
          }}
        >
          <input className="input max-w-[22rem]" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbusiness.in" aria-label="Your website" />
          <button type="submit" className="btn-quiet btn-sm bg-cream" disabled={!website.trim()}>Look it up</button>
        </form>
        {checked && found === null && <p className="mt-3 text-sm text-muted">Not listed yet. Set up your business below.</p>}
        {found && (
          <div className="card-quiet mt-4 p-4">
            <p className="font-medium">{found.name}</p>
            <p className="text-sm text-muted">{found.categories.join(", ")} · {found.city}</p>
            {found.claimed ? (
              <p className="mt-2 text-sm text-muted">Someone already runs this listing. If it's yours, write to us and we'll sort it out.</p>
            ) : (
              <form
                className="mt-3 grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  void claim({ profileId: found._id, note: note || undefined }).catch((err) => setError(errorText(err, "That didn't go through. Try again.")));
                }}
              >
                <label className="label" htmlFor="claim-note">Anything that shows it's yours (optional)</label>
                <input id="claim-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Our GST number, or the phone number on our site" />
                <button type="submit" className="btn-primary btn-sm justify-self-start">This is my business</button>
                <p className="text-xs text-quiet">Signed in with an email at your own website? It's confirmed at once. Otherwise a person checks.</p>
              </form>
            )}
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      </section>

      <ProfileForm />
    </>
  );
}

type ProfileFields = {
  name: string;
  categories: string[];
  city: string;
  website?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  serviceArea?: string[];
  place?: Place;
  languages?: string[];
  about?: string;
};

type TidyResult = { key: string; before: string; after: string; changed: boolean; contact: ("phone" | "email" | "link")[] };

function contactLine(kind: "phone" | "email" | "link"): string {
  if (kind === "phone") return "This has a phone number in it. Customers see your number from your contact details, so it's best left out here.";
  if (kind === "email") return "This has an email address in it. Customers reach you from your contact details, so it's best left out here.";
  return "This has a link in it. Customers find your pages from your contact details, so it's best left out here.";
}

/** What was written and the tidied wording, one under the other, so the vendor chooses. */
function TidyPanel({ results, onUse, onKeep }: { results: TidyResult[]; onUse: () => void; onKeep: () => void }) {
  const shown = results.filter((r) => r.changed || r.contact.length > 0);
  return (
    <div className="card-quiet min-w-0 p-4 md:col-span-2" aria-live="polite">
      <h3 className="label">How customers will see it</h3>
      <ul className="mt-2 grid min-w-0 gap-3">
        {shown.map((r) => (
          <li key={r.key} className="min-w-0 text-sm">
            <p className="font-medium break-words">{r.key}</p>
            {r.changed && (
              <>
                <p className="mt-1 text-xs text-quiet">You wrote</p>
                <p className="break-words text-muted">{r.before}</p>
                <p className="mt-1 text-xs text-quiet">Customers will see</p>
                <p className="break-words">{r.after}</p>
              </>
            )}
            {r.contact.map((c) => (
              <p key={c} className="mt-1 break-words text-muted">{contactLine(c)}</p>
            ))}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={onUse}>Use the tidied text</button>
        <button type="button" className="btn-quiet btn-sm" onClick={onKeep}>Keep mine as written</button>
      </div>
    </div>
  );
}

/** Your details: a new business, or changes to yours. */
function ProfileForm({ initial, onSaved }: { initial?: ProfileFields; onSaved?: () => void }) {
  const register = useMutation(api.marketplace.partner.register);
  const update = useMutation(api.marketplace.partner.update);
  const tidyAction = useAction(api.marketplace.tidy.tidy);
  const [f, setF] = useState<ProfileFields>(initial ?? { name: "", categories: [], city: "Chennai" });
  const [languages, setLanguages] = useState((initial?.languages ?? []).join(", "));
  const [areas, setAreas] = useState((initial?.serviceArea ?? []).join(", "));
  const [state, setState] = useState<"idle" | "saving" | "listed">("idle");
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<TidyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ProfileFields>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setPreview(null);
  };
  const toggle = (c: string) => set({ categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] });

  const saveWith = (about: string | undefined) => {
    setState("saving");
    setError(null);
    const list = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);
    const args = {
      name: f.name,
      categories: f.categories,
      city: f.city,
      website: f.website,
      email: f.email,
      phone: f.phone,
      whatsapp: f.whatsapp,
      place: f.place,
      about,
      serviceArea: list(areas),
      languages: list(languages),
    };
    const done = initial
      ? update(args).then(() => {
          setState("idle");
          onSaved?.();
        })
      : register(args).then((r) => {
          setState(r.kind === "already_listed" ? "listed" : "idle");
          if (r.kind === "created") onSaved?.();
        });
    done.catch((err) => {
      setError(errorText(err, "That didn't save. Try again."));
      setState("idle");
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (checking || state === "saving") return;
    const about = (f.about ?? "").trim();
    if (!about) {
      saveWith(f.about);
      return;
    }
    setChecking(true);
    setError(null);
    void tidyAction({ fields: [{ key: "About", text: f.about ?? "" }] })
      .then((results) => {
        const clean = results.every((r) => !r.changed && r.contact.length === 0);
        if (clean) {
          saveWith(f.about);
        } else {
          setPreview(results);
        }
      })
      .catch(() => saveWith(f.about))
      .finally(() => setChecking(false));
  };

  return (
    <section className="card mt-5 p-6 md:p-7" aria-labelledby="details-h">
      <h2 id="details-h" className="display text-xl">{initial ? "Your details" : "Set up your business"}</h2>
      {!initial && <p className="mt-1 text-sm text-muted">Customers see you once we've checked you're real, usually within a day.</p>}
      <form className="mt-5 grid gap-6" onSubmit={submit}>
        <FormGroup title="Your business">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="p-name">Business name</label>
              <input id="p-name" className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="p-city">City</label>
              <input id="p-city" className="input" value={f.city} onChange={(e) => set({ city: e.target.value })} required />
            </div>
          </div>
          <fieldset>
            <legend className="label">What you offer (up to 5)</legend>
            <div className="flex flex-wrap gap-2">
              {VENDOR_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={f.categories.includes(c)}
                  onClick={() => toggle(c)}
                  className={f.categories.includes(c) ? "chip-pending" : "chip-quiet hover:text-accent"}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="p-about">About you</label>
            <textarea id="p-about" className="input min-h-24" value={f.about ?? ""} onChange={(e) => set({ about: e.target.value })} placeholder="What you're known for, since when, the areas you cover" />
          </div>
        </FormGroup>

        <FormGroup title="Where you work from" note="Customers see how far you are from their venue.">
          <PlacePicker
            city={f.city}
            place={f.place}
            area={areas}
            onArea={(a) => {
              setAreas(a);
              setPreview(null);
            }}
            onPlace={(place) => set({ place })}
          />
        </FormGroup>

        <FormGroup title="How customers reach you">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="p-phone">Phone</label>
              <input id="p-phone" className="input" value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="+91 98400 12345" />
            </div>
            <div>
              <label className="label" htmlFor="p-wa">WhatsApp</label>
              <input id="p-wa" className="input" value={f.whatsapp ?? ""} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="Same as phone, or another" />
            </div>
            <div>
              <label className="label" htmlFor="p-email">Email for enquiries</label>
              <input id="p-email" type="email" className="input" value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="p-web">Website or Instagram</label>
              <input id="p-web" className="input" value={f.website ?? ""} onChange={(e) => set({ website: e.target.value })} placeholder="yourbusiness.in" />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="p-lang">Languages you speak with customers</label>
              <input id="p-lang" className="input" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="Tamil, English" />
            </div>
          </div>
        </FormGroup>

        {preview && (
          <TidyPanel
            results={preview}
            onUse={() => {
              const next = preview.find((r) => r.key === "About")?.after ?? f.about;
              setPreview(null);
              saveWith(next);
            }}
            onKeep={() => {
              setPreview(null);
              saveWith(f.about);
            }}
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={checking || state === "saving" || !f.name.trim() || !f.categories.length}>
            {checking ? "Checking your wording…" : state === "saving" ? "Saving…" : initial ? "Save changes" : "Join PlusOne Partner"}
          </button>
          {initial && <span className="text-xs text-quiet">A new name or website is checked again before customers see it.</span>}
        </div>
        {state === "listed" && (
          <p className="text-sm">We already list a business with that website. Look it up above and claim it, so you're not listed twice.</p>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      </form>
    </section>
  );
}

/** One part of the setup form, under a small heading and a rule. */
function FormGroup({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <legend className="contents">
        <span className="display block text-lg">{title}</span>
      </legend>
      {note && <p className="-mt-3 text-xs text-muted">{note}</p>}
      {children}
    </fieldset>
  );
}

/**
 * Where a vendor works from: paste the link from their Google Maps listing, type the
 * shop's name or area, or tap the map. The pin is what customers measure distance from.
 */
function PlacePicker({
  city,
  place,
  area,
  onArea,
  onPlace,
}: {
  city: string;
  place?: Place;
  area: string;
  onArea: (area: string) => void;
  onPlace: (place: Place | undefined) => void;
}) {
  const find = useAction(api.places.find);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const centre = place ?? placeFor(area, city) ?? placeFor(city, city);

  async function look() {
    const said = text.trim();
    if (!said) return;
    setBusy(true);
    setNote(null);
    try {
      const found = await find({ text: said, city });
      if (!found || found.precision === "city") {
        setNote("Couldn't find that. Try your area's name, or tap the map where you are.");
      } else {
        onPlace(found);
        // A typed area name is also the area customers read; a link's place name isn't.
        if (!/^https?:\/\//i.test(said) && !area.trim() && found.precision === "area") onArea(found.label);
        setText("");
      }
    } catch (e) {
      const data = (e as { data?: unknown }).data;
      setNote(typeof data === "string" ? data : "That didn't work. Tap the map where you are instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          aria-label="Your Google Maps link, or your shop's name or area"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void look();
            }
          }}
          placeholder="Paste your Google Maps link, or type your area"
        />
        <button type="button" className="btn-primary shrink-0" disabled={busy || !text.trim()} onClick={() => void look()}>
          {busy ? "Finding…" : "Find me"}
        </button>
      </div>
      <p className="text-[11px] text-quiet">
        On Google Maps, open your business, press <strong className="font-medium text-muted">Share</strong> and copy the link. Or tap the map where you are.
      </p>
      {note && <p role="alert" className="text-xs text-bad">{note}</p>}
      <Suspense fallback={<div className="vendor-map grid place-items-center text-sm text-muted">Loading the map…</div>}>
        <VendorMap
          label="Map: tap where you work from"
          centre={centre}
          radiusKm={null}
          pins={[]}
          onPick={(at) => {
            onPlace({ ...at, label: place?.label && place.label !== "Your pin" ? place.label : "Your pin", precision: "address" });
            setNote(null);
          }}
        />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={place ? "text-ink" : "text-muted"}>
          {place ? <>Pinned: <strong className="font-medium">{place.label}</strong></> : "No pin yet. Customers see your area's middle until you add one."}
        </span>
        {place && (
          <button type="button" className="btn-quiet btn-sm" onClick={() => onPlace(undefined)}>
            Remove the pin
          </button>
        )}
      </div>
      <div>
        <label className="label" htmlFor="p-area">Area customers see</label>
        <input id="p-area" className="input" value={area} onChange={(e) => onArea(e.target.value)} placeholder="Mylapore" />
        <p className="mt-1 text-[11px] text-muted">Customers see this area and the distance from your pin; your street address isn&rsquo;t shown.</p>
      </div>
    </div>
  );
}

/** Taking a business off PlusOne, asked twice on the page: its listing, prices, photos and offers go. */
function RemoveBusiness({ profile }: { profile: Profile }) {
  const remove = useMutation(api.marketplace.partner.removeBusiness);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card-quiet mt-4 px-5 py-4" aria-labelledby="remove-h">
      <h2 id="remove-h" className="text-sm font-medium">Remove this business</h2>
      {!asking ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">Takes {profile.name} off PlusOne. Your other businesses stay as they are.</p>
          <button type="button" className="btn-quiet btn-sm text-bad" onClick={() => setAsking(true)}>
            Remove this business
          </button>
        </div>
      ) : (
        <div className="mt-1">
          <p className="text-sm">
            Customers will no longer see {profile.name}. Its prices, photos and the offers it sent are deleted, and this can&rsquo;t be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary btn-sm bg-bad"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void remove({ profileId: profile._id }).catch((err) => {
                  setError(errorText(err, "That didn't work. Try again."));
                  setBusy(false);
                });
              }}
            >
              {busy ? "Removing…" : `Yes, remove ${profile.name}`}
            </button>
            <button type="button" className="btn-quiet btn-sm" onClick={() => setAsking(false)} disabled={busy}>
              Keep it
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- your business

type Profile = Doc<"vendorProfiles">;
type Offering = Doc<"vendorOfferings">;

type Tab = "requests" | "packages" | "photos" | "details";
const TABS: [Tab, string][] = [
  ["requests", "Requests"],
  ["packages", "Packages"],
  ["photos", "Photos"],
  ["details", "Your details"],
];

/**
 * The vendor's workspace: their business at the top, then one tab at a time (requests,
 * packages, photos, details), so nothing means scrolling past everything else. The tab
 * stays in the address, so a reload or a shared link opens where they were.
 */
function Dashboard({
  profile,
  offerings,
  badges,
  tier,
  level,
}: {
  profile: Profile;
  offerings: Offering[];
  badges: string[];
  tier?: string;
  level?: string;
}) {
  // In the vendors' demo, the customer's request is the point, so it opens on Requests.
  const demo = useQuery(api.users.me)?.isGuest === true;
  const briefs = useQuery(api.marketplace.briefs.open);
  const fromHash = (): Tab | null => {
    const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return TABS.some(([t]) => t === h) ? (h as Tab) : null;
  };
  const [tab, setTabState] = useState<Tab>(() => fromHash() ?? (demo || offerings.length > 0 ? "requests" : "packages"));
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      window.history.replaceState(null, "", `#${t}`);
    } catch {
      // An address that can't change still shows the tab.
    }
  };
  const open = briefs?.filter((b) => !b.answered).length ?? 0;
  const counts: Partial<Record<Tab, number>> = { requests: open, packages: offerings.length };

  return (
    <>
      <section className="card mt-5 p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-2xl">{profile.name}</h2>
            <p className="text-sm text-muted">{profile.categories.join(", ")} · {profile.city}</p>
            <BadgeRow badges={badges} tier={tier} level={level} className="mt-3" />
          </div>
          {tab !== "details" && (
            <button type="button" className="btn-quiet btn-sm bg-cream" onClick={() => setTab("details")}>
              <Icon name="pen" size={14} />
              Edit details
            </button>
          )}
        </div>
        <StatusLine profile={profile} />
      </section>

      <div className="ptabs" role="tablist" aria-label="Your business">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            id={`tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            className="ptab"
            onClick={() => setTab(t)}
          >
            {label}
            {counts[t] ? <span className="ptab__count">{counts[t]}</span> : null}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "requests" && (
          <>
            <Briefs verified={profile.status === "verified"} />
            <SentOffers />
          </>
        )}
        {tab === "packages" && <Prices profile={profile} offerings={offerings} />}
        {tab === "photos" && <Photos />}
        {tab === "details" && (
          <>
            <ProfileForm initial={{ ...profile, languages: profile.languages ?? [] }} onSaved={() => setTab("requests")} />
            {!demo && <RemoveBusiness profile={profile} />}
          </>
        )}
      </div>
    </>
  );
}

function StatusLine({ profile }: { profile: Profile }) {
  if (profile.status === "verified") return <p className="mt-4 text-sm text-muted">Verified: customers in {profile.city} see you and your prices.</p>;
  if (profile.status === "pending")
    return (
      <p className="mt-4 text-sm">
        <span className="chip-pending mr-2">Being checked</span>
        {profile.statusReason ?? "We're checking your business. Meanwhile, add your prices so customers see them the moment you're verified."}
      </p>
    );
  return (
    <p className="mt-4 text-sm">
      <span className="chip-warn mr-2">{profile.status === "suspended" ? "Paused" : "Not approved"}</span>
      {profile.statusReason ?? "Customers can't see this listing. Write to us if you think that's wrong."}
    </p>
  );
}

// ---------------------------------------------------------------- photos of your work

type MinePhoto = {
  _id: Id<"vendorPhotos">;
  url: string | null;
  status: "checking" | "checked" | "failed";
  tags: { key: string; label: string }[];
  flags: { key: string; text: string }[];
  review: "approved" | "removed" | null;
};

/** Photos of the vendor's past work, checked before customers see them. */
function Photos() {
  const photos = useQuery(api.marketplace.photos.mine);
  const generateUploadUrl = useMutation(api.marketplace.photos.generateUploadUrl);
  const add = useMutation(api.marketplace.photos.add);
  const remove = useMutation(api.marketplace.photos.remove);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    // Copied before the input is cleared: `files` is live, and clearing the input empties it.
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      for (const file of files) {
        // Phone photos are often over the 5 MB the server takes; 2,048 px is plenty to judge the work.
        const photo = await readyToUpload(file, 2048);
        const url = await generateUploadUrl({});
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": photo.type || file.type }, body: photo });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        await add({ storageId });
      }
    })()
      .catch((err) => setError(errorText(err, "Those photos didn't go through. Try again.")))
      .finally(() => setBusy(false));
  };

  const takeOff = (photoId: Id<"vendorPhotos">) => {
    setError(null);
    void remove({ photoId }).catch((err) => setError(errorText(err, "That photo didn't come off. Try again.")));
  };

  return (
    <section className="card mt-5 p-6 md:p-7" aria-labelledby="photos-h">
      <h2 id="photos-h" className="display text-xl">Photos of your work</h2>
      <p className="mt-1 text-sm text-muted">Add up to 12 photos of events you&apos;ve done. We check each one before customers see it.</p>
      <div className="mt-3">
        <label className="btn-quiet btn-sm cursor-pointer bg-cream">
          {busy ? "Adding…" : "Add photos"}
          <input type="file" className="hidden" multiple accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={busy} />
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {photos === undefined ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : photos.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No photos yet. Show the work you&apos;re proudest of.</p>
      ) : (
        <ul className="mt-4 grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3">
          {photos.map((p) => (
            <PhotoItem key={p._id} photo={p} onRemove={() => takeOff(p._id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PhotoItem({ photo, onRemove }: { photo: MinePhoto; onRemove: () => void }) {
  const others = photo.flags.filter((f) => f.key !== "faces");
  const faces = photo.flags.find((f) => f.key === "faces");
  return (
    <li className="min-w-0">
      {photo.url ? (
        <img src={photo.url} alt="" className="aspect-square w-full rounded object-cover" />
      ) : (
        <div className="aspect-square w-full rounded bg-cream" aria-hidden />
      )}
      {photo.status === "checking" && (
        <p className="mt-1 text-sm text-muted" role="status">Checking…</p>
      )}
      {photo.status === "failed" && (
        <p className="mt-1 text-sm text-muted">We couldn&apos;t check this photo. Try adding it again.</p>
      )}
      {photo.status === "checked" && photo.tags.length > 0 && (
        <p className="mt-2 flex min-w-0 flex-wrap gap-1">
          {photo.tags.map((t) => (
            <span key={t.key} className="chip-quiet">{t.label}</span>
          ))}
        </p>
      )}
      {others.length > 0 && (
        <p className="mt-1 text-sm break-words text-muted">{others.map((f) => f.text).join(" ")}</p>
      )}
      {faces && <p className="mt-1 text-xs break-words text-quiet">{faces.text}</p>}
      {photo.status === "checked" && others.length > 0 && photo.review === null && (
        <p className="mt-1 text-sm text-muted">Waiting for our team</p>
      )}
      {photo.review === "removed" && <p className="mt-1 text-sm text-muted">Removed by our team</p>}
      <button type="button" className="btn-quiet btn-sm mt-1" onClick={onRemove}>
        Remove
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- briefs and offers

function Briefs({ verified }: { verified: boolean }) {
  const briefs = useQuery(api.marketplace.briefs.open);
  const [answering, setAnswering] = useState<Id<"vendorBriefs"> | null>(null);
  // In the vendors' demo the customer is a sample event of the guest's own, so the guest
  // can see their offer as the customer does. A real vendor never sees a customer's Compare.
  const demoEventId = useDemoEventId();
  return (
    <section className="mt-6" aria-labelledby="briefs-h">
      <h2 id="briefs-h" className="display text-2xl">Customers <em>asking</em></h2>
      <p className="mt-1 text-sm text-muted">Each request is for your kind of service in your city. Answer once; change it any time while it's open.</p>
      <div className="mt-4 grid gap-4">
        {!verified ? (
          <EmptyState compact icon="check" title="Requests appear once you're verified" body="We check every vendor before customers hear from them." />
        ) : briefs === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : briefs.length === 0 ? (
          <EmptyState compact icon="mail" title="No open requests right now" body="When someone near you needs what you offer, it shows up here." />
        ) : (
          briefs.map((b) => (
            <article key={b._id} className="card min-w-0 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {b.category !== b.title && <p className="label mb-1">{b.category}</p>}
                  <h3 className="display text-xl">{b.title}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {b.occasion} · {dayText(b.date)} · {b.guests ? `${b.guests} guests · ` : ""}{b.area ? `${b.area}, ` : ""}{b.city}
                  </p>
                  {b.notes && <p className="mt-2 text-sm">{b.notes}</p>}
                </div>
                {b.answered && <span className="chip-ok">Offer sent</span>}
              </div>
              {answering === b._id ? (
                <OfferForm brief={b} onDone={() => setAnswering(null)} />
              ) : (
                <button type="button" className="btn-primary btn-sm mt-4" onClick={() => setAnswering(b._id)}>
                  {b.answered ? "Change your offer" : "Answer on the sheet"}
                </button>
              )}
              {demoEventId && b.answered && answering !== b._id && (
                <div className="mt-6">
                  <h4 className="label">How the customer sees your offer</h4>
                  <p className="mb-3 mt-1 text-sm text-muted">Their Compare: every quote and offer on the same lines, with what each leaves unsaid.</p>
                  <div className="min-w-0 overflow-x-auto">
                    <CustomerCompare eventId={demoEventId} category={b.category} city={b.city} />
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

type Brief = { _id: Id<"vendorBriefs">; category: string; guests?: number; unit: Basis };
type LineAnswer = { status: "priced" | "included" | "extra"; amount: string };
/** What a vendor has typed for each of the sheet's quantities, as typed. */
type Typed = Record<string, string>;

/** The quantities typed for a way of charging, as numbers: blank, unreadable and other ways' ones left out. */
function quantitiesTyped(sheet: Sheet, unitKey: string, typed: Typed): Record<string, number> {
  const shown = quantitiesFor(sheet, unitKey);
  return Object.fromEntries(
    Object.entries(typed)
      .filter(([key, value]) => value.trim() !== "" && Number.isFinite(Number(value)) && shown.some((q) => q.key === key))
      .map(([key, value]) => [key, Number(value)]),
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "Charge differently?": the other ways the trade charges, a short list so offers stay
 * comparable. Until it's opened the price's label says the main way, which is enough.
 */
function ChargeDifferently({ sheet, unitKey, onChange }: { sheet: Sheet; unitKey: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(unitKey !== sheet.units[0].key);
  if (sheet.units.length < 2) return null;
  if (!open) {
    return (
      <button type="button" className="mt-1.5 text-xs text-accent underline-offset-4 hover:underline" onClick={() => setOpen(true)}>
        Charge differently?
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label="How you charge" className="mt-2 flex flex-wrap gap-1.5">
      {sheet.units.map((u) => (
        <button
          key={u.key}
          type="button"
          role="radio"
          aria-checked={u.key === unitKey}
          onClick={() => onChange(u.key)}
          className={u.key === unitKey ? "chip-pending" : "chip-quiet hover:text-accent"}
        >
          {capital(u.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * "What's in this price": each quantity the trade states for the way chosen, with the
 * usual numbers to tap and room for any other. The plates or pieces aren't here; they're
 * "For how many". `counted`: an offer's total is the price times the quantities its way of
 * charging counts, so those must be given; a published rate needn't say them.
 */
function WhatsInThePrice({ sheet, unitKey, typed, onChange, counted, idPrefix, titled = false }: { sheet: Sheet; unitKey: string; typed: Typed; onChange: (key: string, value: string) => void; counted: boolean; idPrefix: string; titled?: boolean }) {
  const unit = priceUnitOf(sheet, unitKey);
  const shown = quantitiesFor(sheet, unitKey).filter((q) => !q.fromBrief);
  if (!shown.length) return null;
  return (
    <fieldset>
      <legend className={titled ? "sr-only" : "label"}>What's in this price</legend>
      <ul className="grid gap-2">
        {shown.map((q) => {
          const value = typed[q.key] ?? "";
          const sets = counted && unit.times.includes(q.key);
          return (
            <li key={q.key} className="card-quiet flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <label htmlFor={`${idPrefix}-${q.key}`} className="min-w-[9rem] flex-1 text-sm font-medium">
                {q.label}
                {sets && <span className="block text-xs font-normal text-muted">The price is {unit.label}, so this sets the total</span>}
              </label>
              <div role="group" aria-label={`${q.label}: usual choices`} className="flex flex-wrap gap-1.5">
                {q.presets.map((n) => {
                  const picked = value.trim() !== "" && Number(value) === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={picked}
                      onClick={() => onChange(q.key, picked ? "" : String(n))}
                      className={picked ? "chip-pending" : "chip-quiet hover:text-accent"}
                    >
                      {quantityValue({}, n)}
                    </button>
                  );
                })}
              </div>
              <span className="flex items-center gap-1.5">
                <input
                  id={`${idPrefix}-${q.key}`}
                  className="input w-24"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => onChange(q.key, e.target.value)}
                  required={sets}
                />
                {q.unit && <span className="text-sm text-muted">{q.unit}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/** The line customers will read, as the vendor types. */
function CustomersRead({ sheet, unitKey, price, quantities }: { sheet: Sheet; unitKey: string; price: string; quantities: Record<string, number> }) {
  if (!(Number(price) > 0)) return null;
  return (
    <p className="text-sm text-muted" aria-live="polite">
      Customers read: <span className="text-ink">{describeOffer(sheet, unitKey, Number(price), quantities, "INR")}</span>
    </p>
  );
}

/** The standard sheet for the brief's category: the main price in the trade's own terms, what it includes, then every charge, each answered. */
function OfferForm({ brief, onDone }: { brief: Brief; onDone: () => void }) {
  const submit = useMutation(api.marketplace.offers.submit);
  const sheet = sheetFor(brief.category);
  const [price, setPrice] = useState("");
  const [unitKey, setUnitKey] = useState(sheet?.units[0].key ?? "");
  const [typed, setTyped] = useState<Typed>({});
  const [quantity, setQuantity] = useState(String(brief.guests ?? ""));
  const [covers, setCovers] = useState("");
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, LineAnswer>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const unit = sheet ? priceUnitOf(sheet, unitKey) : null;
  // A price per plate or piece is for "how many", from the brief's guests, as before.
  const perUnit = unit ? unit.times.includes("count") : brief.unit !== "total";
  const quantities = sheet ? quantitiesTyped(sheet, unitKey, typed) : {};
  const counted = { ...quantities, ...(perUnit && Number(quantity) > 0 ? { count: Number(quantity) } : {}) };
  const qty = unit ? (timesFor(unit, counted) ?? 0) : perUnit ? Number(quantity) || 0 : 1;
  const priced = Object.values(answers).filter((a) => a.status === "priced").reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const total = (Number(price) || 0) * qty + priced;
  const answeredAll = !sheet || sheet.lines.every((l) => answers[l.key]);
  const multiplied = unit ? unit.times.length > 0 : perUnit;

  const send = (e: FormEvent) => {
    e.preventDefault();
    const noAmount = sheet?.lines.find((l) => answers[l.key]?.status === "priced" && !answers[l.key].amount.trim());
    if (noAmount) {
      setError(`Say what ${noAmount.label.toLowerCase()} costs, or mark it At cost.`);
      return;
    }
    setSending(true);
    setError(null);
    const lines = (sheet?.lines ?? []).map((l) => {
      const a = answers[l.key];
      const amount = a && a.status !== "included" && a.amount.trim() ? Number(a.amount) : undefined;
      return { key: l.key, status: a?.status ?? ("unstated" as const), ...(amount !== undefined ? { amount } : {}) };
    });
    void submit({
      briefId: brief._id,
      price: Number(price),
      ...(perUnit ? { quantity: Number(quantity) || 0 } : {}),
      ...(sheet ? { priceUnit: unitKey, quantities } : {}),
      covers: covers || undefined,
      notes: notes || undefined,
      lines,
    })
      .then(onDone)
      .catch((err) => setError(errorText(err, "That offer didn't send. Try again.")))
      .finally(() => setSending(false));
  };

  return (
    <form className="mt-5 grid gap-5 border-t border-line pt-5" onSubmit={send}>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="o-price">
            {unit ? unit.priceLabel : perUnit ? `Price ${unitWord(brief.unit, brief.category)}` : "Price, all in"}
          </label>
          <input id="o-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₹" required />
          {sheet && <ChargeDifferently sheet={sheet} unitKey={unitKey} onChange={setUnitKey} />}
        </div>
        {perUnit && (
          <div>
            <label className="label" htmlFor="o-qty">For how many</label>
            <input id="o-qty" className="input" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </div>
        )}
        <div className={perUnit ? "" : "md:col-span-2"}>
          <label className="label" htmlFor="o-covers">What that price covers</label>
          <input id="o-covers" className="input" value={covers} onChange={(e) => setCovers(e.target.value)} placeholder={sheet?.covers ?? "What's in the main price"} />
        </div>
      </div>

      {sheet && (
        <div className="grid gap-2.5">
          <WhatsInThePrice
            sheet={sheet}
            unitKey={unitKey}
            typed={typed}
            onChange={(key, value) => setTyped((prev) => ({ ...prev, [key]: value }))}
            counted
            idPrefix="o-q"
          />
          <CustomersRead sheet={sheet} unitKey={unitKey} price={price} quantities={counted} />
        </div>
      )}

      {sheet && (
        <fieldset>
          <legend className="label">Every other charge, the same for every vendor</legend>
          <p className="mb-1 text-xs text-muted">
            <strong className="font-medium text-ink">In the price</strong>: the main price covers it.{" "}
            <strong className="font-medium text-ink">Added</strong>: a fixed amount, added to the total.{" "}
            <strong className="font-medium text-ink">At cost</strong>: charged on top, outside the total.
          </p>
          <div>
            {sheet.lines.map((line) => {
              const a = answers[line.key];
              return (
                <div key={line.key} className="charge">
                  <span className="charge__name">{line.label}</span>
                  <div className="charge__how">
                    <Seg
                      label={line.label}
                      value={a?.status}
                      choices={line.key === "gst" ? OFFER_CHOICES.map(([k, t]) => [k, k === "extra" ? "On top" : t]) : OFFER_CHOICES}
                      onChange={(status) =>
                        setAnswers((prev) => ({ ...prev, [line.key]: { status: status as LineAnswer["status"], amount: prev[line.key]?.amount ?? "" } }))
                      }
                    />
                    {a && a.status !== "included" && (
                      <span className="charge__amount">
                        <input
                          className="input"
                          inputMode="numeric"
                          aria-label={`${line.label}, amount in ₹`}
                          value={a.amount}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [line.key]: { ...a, amount: e.target.value.replace(/[^\d.]/g, "") } }))}
                          placeholder={a.status === "priced" ? "₹" : "₹ if known"}
                        />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      <div>
        <label className="label" htmlFor="o-notes">Anything else the customer should know</label>
        <textarea id="o-notes" className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn-primary" disabled={sending || !price || !answeredAll}>
          {sending ? "Sending…" : "Send offer"}
        </button>
        <button type="button" className="btn-quiet btn-sm" onClick={onDone}>Cancel</button>
        <p className="text-sm text-muted">
          The customer sees <strong className="text-ink">{money(total, "INR")}</strong>
          {multiplied && qty ? ` (${money(Number(price) || 0, "INR")} × ${qty}${priced ? ` + ${money(priced, "INR")}` : ""})` : ""}
          {sheet && !answeredAll ? " · answer every line to send" : ""}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </form>
  );
}

function SentOffers() {
  const offers = useQuery(api.marketplace.offers.mine);
  const withdraw = useMutation(api.marketplace.offers.withdraw);
  if (!offers?.length) return null;
  return (
    <section className="mt-8" aria-labelledby="sent-h">
      <h2 id="sent-h" className="display text-2xl">Your <em>offers</em></h2>
      <ul className="card mt-4 divide-y divide-line">
        {offers.map((o) => (
          <li key={o._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium">{o.briefTitle}</p>
              <p className="text-sm text-muted">{o.occasion} · {dayText(o.date)} · {money(o.total, o.currency)}</p>
            </div>
            <div className="flex items-center gap-2">
              {o.status === "withdrawn" ? (
                <span className="chip-quiet">Withdrawn</span>
              ) : o.briefOpen ? (
                <>
                  <span className="chip-pending">With the customer</span>
                  <button type="button" className="btn-quiet btn-sm" onClick={() => void withdraw({ offerId: o._id })}>Withdraw</button>
                </>
              ) : (
                <span className="chip-quiet">Closed</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- prices

type PackageDraft = FunctionReturnType<typeof api.marketplace.priceList.read>["packages"][number];

/**
 * "Bring your price list": paste the list you already hand out, or add a photo of it, and
 * each package comes back drafted on your trade's sheet. Nothing saves until you check a
 * draft in the form below and press Add.
 */
function PriceListImport({ category, sheet, onUse }: { category: string; sheet: Sheet; onUse: (d: PackageDraft) => void }) {
  const read = useAction(api.marketplace.priceList.read);
  const uploadUrl = useMutation(api.marketplace.photos.generateUploadUrl);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ packages: PackageDraft[]; fromPhoto: boolean } | null>(null);

  const run = (args: { text?: string; storageId?: Id<"_storage"> }) => {
    setBusy(true);
    setError(null);
    setResult(null);
    void read({ category, ...args })
      .then(setResult)
      .catch((err) => setError(errorText(err, "We couldn't read that list. Try again, or add your prices below.")))
      .finally(() => setBusy(false));
  };

  const photo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    void (async () => {
      const blob = await readyToUpload(file, 2400);
      const url = await uploadUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || file.type }, body: blob });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      run({ storageId });
    })().catch((err) => {
      setError(errorText(err, "That photo didn't go through. Try again."));
      setBusy(false);
    });
  };

  const unitLabel = (key: string) => sheet.units.find((u) => u.key === key)?.label ?? "";
  const quantityLine = (d: PackageDraft) =>
    sheet.quantities
      .filter((q) => d.quantities[q.key] !== undefined)
      .map((q) => quantityText(q, d.quantities[q.key]))
      .join(" · ");

  return (
    <div className="card mt-4 p-5 md:p-6">
      <h3 className="font-medium">Bring your price list</h3>
      <p className="mt-1 text-sm text-muted">
        Paste the price list you already send customers, or add a photo of it. We set out each package the way your trade is
        compared, for you to check and add.
      </p>
      <label className="sr-only" htmlFor="pl-text">Your price list</label>
      <textarea
        id="pl-text"
        className="input mt-3 min-h-[6rem]"
        placeholder={"South Indian lunch on banana leaf, 12 items, Rs.380 per plate. GST extra.\nBuffet with live dosa counter, Rs.450 per head."}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={6000}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={busy || !text.trim()} onClick={() => run({ text })}>
          {busy ? "Reading your list…" : "Read my price list"}
        </button>
        <label className={`btn-quiet btn-sm cursor-pointer bg-cream ${busy ? "pointer-events-none opacity-60" : ""}`}>
          Add a photo of it
          <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={photo} disabled={busy} />
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {result && result.packages.length === 0 && (
        <p className="mt-3 text-sm text-muted">We couldn't find a priced package in that. Add your prices in the form below.</p>
      )}
      {result && result.packages.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-muted">
            {result.packages.length === 1 ? "One package" : `${result.packages.length} packages`} from your list.
            {result.fromPhoto ? " Check each price against your photo before you add it." : ""}
          </p>
          <ul className="mt-2 divide-y divide-line">
            {result.packages.map((d, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-sm text-muted">
                    {money(d.price, "INR")} {unitLabel(d.priceUnit)}
                    {d.taxIncluded === true ? " · GST included" : d.taxIncluded === false ? " · GST extra" : ""}
                  </p>
                  {quantityLine(d) && <p className="text-sm text-muted">{quantityLine(d)}</p>}
                  {d.includes.length > 0 && <p className="mt-0.5 text-sm">Includes {d.includes.join(", ")}</p>}
                </div>
                <button type="button" className="btn-quiet btn-sm" onClick={() => onUse(d)}>
                  Use this
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type ChargeAnswer = { status: PackageCharge["status"]; amount: string };
type OwnCharge = ChargeAnswer & { id: number; label: string };

/** Charges vendors often take that a trade's sheet doesn't name; a tap adds one to fill in. */
const OTHER_CHARGES = ["Cleaning", "Generator", "Extra hour", "Parking", "Advance booking fee"];

const CHARGE_CHOICES: [PackageCharge["status"], string][] = [
  ["included", "In the price"],
  ["priced", "Added"],
  ["extra", "At cost"],
  ["none", "Not provided"],
];
/** The request sheet's answers, in the same words as a package's. */
const OFFER_CHOICES: [PackageCharge["status"], string][] = [
  ["included", "In the price"],
  ["priced", "Added"],
  ["extra", "At cost"],
];
const GST_CHOICES: [PackageCharge["status"], string][] = [
  ["included", "In the price"],
  ["extra", "On top"],
  ["none", "Not charged"],
];

/** One answer per charge, as a small row of choices. */
function Seg({ label, value, choices, onChange }: { label: string; value?: PackageCharge["status"]; choices: [PackageCharge["status"], string][]; onChange: (s: PackageCharge["status"]) => void }) {
  return (
    <div className={`seg${choices.length === 4 ? " seg--4" : ""}`} role="group" aria-label={label}>
      {choices.map(([s, text]) => (
        <button key={s} type="button" className="seg__opt" aria-pressed={value === s} onClick={() => onChange(s)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** A saved package, or one drafted from a price list, as the editor starts from. */
type PackageStart = {
  _id?: Id<"vendorOfferings">;
  category: string;
  title: string;
  priceUnit?: string;
  quantities?: Record<string, number>;
  price: number;
  includes: string[];
  taxIncluded?: boolean | null;
  charges?: PackageCharge[];
};

/**
 * Your packages: each one in the trade's own terms, with what's in the price and every
 * charge on top said, so a customer is never surprised. A package is added and edited where
 * it sits; nothing jumps to another part of the page.
 */
function Prices({ profile, offerings }: { profile: Profile; offerings: Offering[] }) {
  const [editing, setEditing] = useState<"new" | Id<"vendorOfferings"> | null>(offerings.length === 0 ? "new" : null);
  const [start, setStart] = useState<PackageStart | null>(null);
  const [importing, setImporting] = useState(false);
  const [sent, setSent] = useState(false);
  const firstSheet = sheetFor(profile.categories[0] ?? "");
  // Newest first, so a package just added sits where its form was.
  const list = [...offerings].sort((a, b) => b._creationTime - a._creationTime);
  const done = (waiting: boolean) => {
    setEditing(null);
    setStart(null);
    setSent(waiting);
  };

  return (
    <section className="mt-6" aria-labelledby="prices-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[40rem]">
          <h2 id="prices-h" className="display text-2xl">Your <em>packages</em></h2>
          <p className="mt-1 text-sm text-muted">
            What you offer, what&rsquo;s in the price and every charge on top, said once. Customers compare packages line by line,
            so a charge left unsaid reads as a question.
          </p>
        </div>
        {editing !== "new" && (
          <div className="flex flex-wrap gap-2">
            {firstSheet && (
              <button type="button" className="btn-quiet btn-sm bg-cream" aria-expanded={importing} onClick={() => setImporting(!importing)}>
                {importing ? "Close" : "Bring your price list"}
              </button>
            )}
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => {
                setStart(null);
                setEditing("new");
                setImporting(false);
              }}
            >
              <Icon name="plus" size={14} />
              Add a package
            </button>
          </div>
        )}
      </div>

      {importing && firstSheet && (
        <PriceListImport
          category={profile.categories[0]}
          sheet={firstSheet}
          onUse={(d) => {
            setStart({
              category: profile.categories[0],
              title: d.title,
              priceUnit: d.priceUnit,
              quantities: d.quantities,
              price: d.price,
              includes: d.includes,
              taxIncluded: d.taxIncluded,
            });
            setEditing("new");
            setImporting(false);
          }}
        />
      )}
      {sent && (
        <p role="status" className="card-quiet mt-4 px-5 py-3 text-sm">
          Sent to our team to check. Customers see it once it&apos;s approved, usually within a day.
        </p>
      )}

      {editing === "new" && (
        <div className="mt-4">
          <PackageEditor key={start ? `draft-${start.title}` : "new"} profile={profile} start={start} onDone={done} onCancel={offerings.length ? () => done(false) : undefined} />
        </div>
      )}

      {list.length > 0 && (
        <ul className="card mt-4 overflow-hidden p-0">
          {list.map((o) =>
            editing === o._id ? (
              <li key={o._id} className="p-3">
                <PackageEditor profile={profile} start={o} onDone={done} onCancel={() => done(false)} />
              </li>
            ) : (
              <PackageRow
                key={o._id}
                offering={o}
                showCategory={profile.categories.length > 1}
                onEdit={() => {
                  setEditing(o._id);
                  setImporting(false);
                }}
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** A saved package as the vendor reads it back: the price, what's in it, what's on top and what isn't said yet. */
function PackageRow({ offering: o, showCategory, onEdit }: { offering: Offering; showCategory: boolean; onEdit: () => void }) {
  const remove = useMutation(api.marketplace.partner.removeOffering);
  const [asking, setAsking] = useState(false);
  const read = readPackage(o);
  return (
    <li className="pkg">
      <div className="pkg__head">
        <p className="pkg__title">{o.title}</p>
        <p className="pkg__price">{priceText(o)}</p>
      </div>
      {showCategory && <p className="mt-0.5 text-xs text-quiet">{o.category}</p>}
      <dl className="pkg__facts">
        {read.inPrice.length > 0 && (
          <>
            <dt>In the price</dt>
            <dd>{read.inPrice.join(", ")}</dd>
          </>
        )}
        <dt>On top</dt>
        <dd>{read.onTop.length ? read.onTop.join(", ") : "Nothing"}</dd>
        {read.notProvided.length > 0 && (
          <>
            <dt>Not provided</dt>
            <dd>{read.notProvided.join(", ")}</dd>
          </>
        )}
        {read.notSaid.length > 0 && (
          <>
            <dt className="is-unsaid">Not said yet</dt>
            <dd className="is-unsaid">{read.notSaid.join(", ")}</dd>
          </>
        )}
      </dl>
      <div className="pkg__actions">
        {asking ? (
          <>
            <button type="button" className="btn-quiet btn-sm text-bad" onClick={() => void remove({ offeringId: o._id }).finally(() => setAsking(false))}>
              Yes, remove it
            </button>
            <button type="button" className="btn-quiet btn-sm" onClick={() => setAsking(false)}>
              Keep it
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-quiet btn-sm bg-cream" onClick={onEdit}>
              <Icon name="pen" size={14} />
              {read.notSaid.length ? "Edit, and say the rest" : "Edit"}
            </button>
            <button type="button" className="btn-quiet btn-sm" onClick={() => setAsking(true)}>
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** A package's facts in four groups, from its includes, GST and charges. */
function readPackage(o: { category: string; currency?: string; includes: string[]; taxIncluded?: boolean | null; charges?: PackageCharge[] }) {
  const sheet = sheetFor(o.category);
  // GST said the older way (a yes or no) reads as its line.
  const charges = o.charges?.some((c) => c.key === "gst") || o.taxIncluded == null ? o.charges : [{ key: "gst", status: o.taxIncluded ? "included" : "extra" } as PackageCharge, ...(o.charges ?? [])];
  const read = packageCharges(sheet, charges, o.currency ?? "INR", o.includes);
  const gstAsked = sheet?.lines.some((l) => l.key === "gst");
  if (!gstAsked && !charges?.some((c) => c.key === "gst")) read.notSaid.unshift("GST");
  return { ...read, inPrice: [...o.includes, ...read.inPrice] };
}

/**
 * Adding or changing a package, in one place: the package and its price, what's in it,
 * and every charge on top, with what customers will read kept beside it.
 */
function PackageEditor({ profile, start, onDone, onCancel }: { profile: Profile; start: PackageStart | null; onDone: (waiting: boolean) => void; onCancel?: () => void }) {
  const save = useMutation(api.marketplace.partner.saveOffering);
  const tidyAction = useAction(api.marketplace.tidy.tidy);
  const [category, setCategory] = useState(start?.category ?? profile.categories[0] ?? "");
  const sheet = sheetFor(category);
  const [title, setTitle] = useState(start?.title ?? "");
  const [unit, setUnit] = useState<Basis>(sheet?.unit ?? "total");
  const [unitKey, setUnitKey] = useState(start?.priceUnit ?? sheet?.units[0].key ?? "");
  const [typed, setTyped] = useState<Typed>(Object.fromEntries(Object.entries(start?.quantities ?? {}).map(([k, n]) => [k, String(n)])));
  const [price, setPrice] = useState(start ? String(start.price) : "");
  const [includes, setIncludes] = useState((start?.includes ?? []).join("\n"));
  const fromStart = () => {
    const out: Record<string, ChargeAnswer> = {};
    for (const c of start?.charges ?? []) if (c.key) out[c.key] = { status: c.status, amount: c.amount !== undefined ? String(c.amount) : "" };
    if (!out.gst && start?.taxIncluded != null) out.gst = { status: start.taxIncluded ? "included" : "extra", amount: "" };
    return out;
  };
  const [answers, setAnswers] = useState<Record<string, ChargeAnswer>>(fromStart);
  const [own, setOwn] = useState<OwnCharge[]>(() =>
    (start?.charges ?? []).filter((c) => !c.key && c.label).map((c, i) => ({ id: i, label: c.label!, status: c.status, amount: c.amount !== undefined ? String(c.amount) : "" })),
  );
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<TidyResult[] | null>(null);
  const quantities = sheet ? quantitiesTyped(sheet, unitKey, typed) : {};
  const lines = [{ key: "gst", label: "GST" }, ...(sheet?.lines.filter((l) => l.key !== "gst") ?? [])];

  const charges = (): PackageCharge[] => [
    ...lines.flatMap((l) => {
      const a = answers[l.key];
      if (!a) return [];
      return [{ key: l.key, status: a.status, ...(a.status === "priced" && a.amount.trim() ? { amount: Number(a.amount) } : {}) }];
    }),
    ...own
      .filter((c) => c.label.trim())
      .map((c) => ({ label: c.label.trim(), status: c.status, ...(c.status === "priced" && c.amount.trim() ? { amount: Number(c.amount) } : {}) })),
  ];
  const draft = { category, currency: "INR", includes: includes.split("\n").map((s) => s.trim()).filter(Boolean), charges: charges() };
  const read = readPackage(draft);
  const answeredAll = lines.every((l) => answers[l.key]);
  // An added charge with no amount yet isn't said; the preview says so rather than calling it done.
  const noAmount = [
    ...lines.filter((l) => answers[l.key]?.status === "priced" && !answers[l.key].amount.trim()).map((l) => l.label),
    ...own.filter((c) => c.status === "priced" && c.label.trim() && !c.amount.trim()).map((c) => c.label.trim()),
  ];

  const saveWith = (nextTitle: string, nextIncludes: string[]) => {
    setError(null);
    setSaving(true);
    void save({
      ...(start?._id ? { offeringId: start._id } : {}),
      category,
      title: nextTitle,
      unit: sheet?.unit ?? unit,
      ...(sheet ? { priceUnit: unitKey, quantities } : {}),
      price: Number(price),
      includes: nextIncludes,
      charges: charges(),
    })
      .then((saved) => onDone(saved === null))
      .catch((err) => setError(errorText(err, "That package didn't save. Try again.")))
      .finally(() => setSaving(false));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (checking || saving) return;
    const priced = charges().find((c) => c.status === "priced" && c.amount === undefined);
    if (priced) {
      setError(`Say what ${priced.label ?? lines.find((l) => l.key === priced.key)?.label ?? "the added charge"} costs, or mark it At cost.`);
      return;
    }
    const lines_ = draft.includes;
    const fields = [{ key: "Name", text: title }, ...lines_.map((line, i) => ({ key: `Includes ${i + 1}`, text: line }))];
    setChecking(true);
    setError(null);
    void tidyAction({ fields })
      .then((results) => {
        if (results.every((r) => !r.changed && r.contact.length === 0)) saveWith(title, lines_);
        else setPreview(results);
      })
      .catch(() => saveWith(title, lines_))
      .finally(() => setChecking(false));
  };

  const setAnswer = (key: string, patch: Partial<ChargeAnswer>) =>
    setAnswers((prev) => ({ ...prev, [key]: { status: prev[key]?.status ?? "included", amount: prev[key]?.amount ?? "", ...patch } }));
  const perLabel = sheet ? priceUnitOf(sheet, unitKey).label : unitWord(unit, category);
  const others = OTHER_CHARGES.filter((s) => !own.some((c) => c.label.toLowerCase() === s.toLowerCase()) && !lines.some((l) => l.label.toLowerCase() === s.toLowerCase()));

  return (
    <form className="pked" onSubmit={submit} aria-label={start?._id ? `Change ${start.title}` : "A new package"}>
      <div>
        <section className="pked__part" aria-labelledby="pk-what">
          <h3 id="pk-what" className="pked__h">{start?._id ? "Change this package" : "A new package"}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {profile.categories.length > 1 && (
              <div>
                <label className="label" htmlFor="pr-cat">Service</label>
                <select
                  id="pr-cat"
                  className="input"
                  value={category}
                  onChange={(e) => {
                    const next = sheetFor(e.target.value);
                    setCategory(e.target.value);
                    setUnit(next?.unit ?? "total");
                    setUnitKey(next?.units[0].key ?? "");
                    setTyped({});
                    setAnswers((prev): Record<string, ChargeAnswer> => (prev.gst ? { gst: prev.gst } : {}));
                  }}
                >
                  {profile.categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div className={profile.categories.length > 1 ? "" : "md:col-span-2"}>
              <label className="label" htmlFor="pr-title">Name</label>
              <input
                id="pr-title"
                className="input"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setPreview(null);
                }}
                placeholder={sheet?.need === "catering" ? "South Indian lunch, banana leaf" : "What customers would call it"}
                required
              />
            </div>
            {sheet && sheet.units.length > 1 && (
              <div className="md:col-span-2">
                <p className="label">How you charge</p>
                <Seg
                  label="How you charge"
                  value={unitKey as PackageCharge["status"]}
                  choices={sheet.units.map((u) => [u.key as PackageCharge["status"], capital(u.label)])}
                  onChange={(k) => setUnitKey(k)}
                />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="label" htmlFor="pr-price">{sheet ? priceUnitOf(sheet, unitKey).priceLabel : "Price"}</label>
              <div className="pked__price">
                <input id="pr-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="₹" required />
                {sheet ? (
                  <span className="pked__per">{perLabel}</span>
                ) : (
                  <select className="input w-44" value={unit} onChange={(e) => setUnit(e.target.value as Basis)} aria-label="Priced">
                    {(["per_person", "per_piece", "per_day", "total"] as const).map((u) => (
                      <option key={u} value={u}>{basisLabel(u, category)}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="pked__part" aria-labelledby="pk-in">
          <h3 id="pk-in" className="pked__h">What&rsquo;s in the price</h3>
          {sheet && (
            <div className="mt-3">
              <WhatsInThePrice sheet={sheet} unitKey={unitKey} typed={typed} onChange={(key, value) => setTyped((prev) => ({ ...prev, [key]: value }))} counted={false} idPrefix="pr-q" titled />
            </div>
          )}
          <div className="mt-3">
            <label className="label" htmlFor="pr-inc">Anything else included, one per line</label>
            <textarea
              id="pr-inc"
              className="input min-h-20"
              value={includes}
              onChange={(e) => {
                setIncludes(e.target.value);
                setPreview(null);
              }}
              placeholder={sheet?.covers ?? ""}
            />
          </div>
        </section>

        <section className="pked__part" aria-labelledby="pk-top">
          <h3 id="pk-top" className="pked__h">Every other charge</h3>
          <p className="pked__lede">
            These are the charges customers are most often surprised by. Say for each whether it&rsquo;s in your price, added at a
            fixed amount, charged at cost, or not something you provide.
          </p>
          <div className="mt-3">
            {lines.map((l) => {
              const a = answers[l.key];
              const gst = l.key === "gst";
              return (
                <div key={l.key} className="charge">
                  <span className="charge__name">{l.label}</span>
                  <div className="charge__how">
                    <Seg label={l.label} value={a?.status} choices={gst ? GST_CHOICES : CHARGE_CHOICES} onChange={(status) => setAnswer(l.key, { status })} />
                    {a?.status === "priced" && (
                      <span className="charge__amount">
                        <input
                          className="input"
                          inputMode="numeric"
                          aria-label={`${l.label}, amount in ₹`}
                          value={a.amount}
                          onChange={(e) => setAnswer(l.key, { amount: e.target.value.replace(/[^\d.]/g, "") })}
                          placeholder="₹"
                          autoFocus
                        />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {own.map((c) => (
              <div key={c.id} className="charge">
                <span className="charge__own">
                  <input
                    className="input"
                    aria-label="The charge's name"
                    value={c.label}
                    onChange={(e) => setOwn((prev) => prev.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))}
                    placeholder="Name the charge"
                  />
                </span>
                <div className="charge__how">
                  <Seg
                    label={c.label || "This charge"}
                    value={c.status}
                    choices={CHARGE_CHOICES.filter(([s]) => s !== "none")}
                    onChange={(status) => setOwn((prev) => prev.map((x) => (x.id === c.id ? { ...x, status } : x)))}
                  />
                  {c.status === "priced" && (
                    <span className="charge__amount">
                      <input
                        className="input"
                        inputMode="numeric"
                        aria-label={`${c.label || "This charge"}, amount in ₹`}
                        value={c.amount}
                        onChange={(e) => setOwn((prev) => prev.map((x) => (x.id === c.id ? { ...x, amount: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                        placeholder="₹"
                      />
                    </span>
                  )}
                  <button type="button" className="btn-quiet btn-sm" aria-label={`Remove ${c.label || "this charge"}`} onClick={() => setOwn((prev) => prev.filter((x) => x.id !== c.id))}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-quiet btn-sm bg-cream" onClick={() => setOwn((prev) => [...prev, { id: Date.now(), label: "", status: "priced", amount: "" }])}>
              <Icon name="plus" size={14} />
              Add a charge
            </button>
            {others.slice(0, 4).map((s) => (
              <button key={s} type="button" className="chip-quiet hover:text-accent" onClick={() => setOwn((prev) => [...prev, { id: Date.now(), label: s, status: "priced", amount: "" }])}>
                + {s}
              </button>
            ))}
          </div>
        </section>

        {preview && (
          <div className="mt-6">
            <TidyPanel
              results={preview}
              onUse={() => {
                const nextTitle = preview.find((r) => r.key === "Name")?.after ?? title;
                const nextLines = preview.filter((r) => r.key.startsWith("Includes")).map((r) => r.after);
                setPreview(null);
                saveWith(nextTitle, nextLines.length ? nextLines : draft.includes);
              }}
              onKeep={() => {
                setPreview(null);
                saveWith(title, draft.includes);
              }}
            />
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={checking || saving || !title.trim() || !(Number(price) > 0)}>
            {checking ? "Checking your wording…" : saving ? "Saving…" : start?._id ? "Save changes" : "Save package"}
          </button>
          {onCancel && (
            <button type="button" className="btn-quiet" onClick={onCancel}>
              Cancel
            </button>
          )}
          {error && <p role="alert" className="w-full text-sm text-bad">{error}</p>}
        </div>
      </div>

      <aside className="pked__aside" aria-label="What customers read">
        <p className="label">What customers read</p>
        <div className="pkread mt-2" aria-live="polite">
          <p className="pkread__title">{title.trim() || "Your package"}</p>
          <p className="pkread__price">
            {Number(price) > 0 ? (sheet ? describeOffer(sheet, unitKey, Number(price), quantities, "INR") : `${money(Number(price), "INR")} ${unitWord(unit, category)}`) : "Add a price"}
          </p>
          {read.inPrice.length > 0 && (
            <div className="pkread__group">
              <h4>In the price</h4>
              <ul>{read.inPrice.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          {read.onTop.length > 0 && (
            <div className="pkread__group">
              <h4>On top</h4>
              <ul>{read.onTop.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          {read.notProvided.length > 0 && (
            <div className="pkread__group">
              <h4>Not provided</h4>
              <ul>{read.notProvided.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          {noAmount.length > 0 ? (
            <p className="pkread__todo">Amount missing: {noAmount.join(", ")}. Add it, or mark it At cost.</p>
          ) : answeredAll ? (
            <p className="pkread__done">Every charge said. Nothing will surprise a customer.</p>
          ) : (
            <p className="pkread__todo">
              Not said yet: {lines.filter((l) => !answers[l.key]).map((l) => l.label).join(", ")}. Customers see these as questions.
            </p>
          )}
        </div>
      </aside>
    </form>
  );
}
