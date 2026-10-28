import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { basisLabel, type Basis } from "../../convex/lib/comparable";
import { sheetFor } from "../../convex/lib/standardSheet";
import { VENDOR_CATEGORIES } from "../../convex/lib/vendorNeeds";
import { Icon } from "../components/ui/Icon";
import { EmptyState } from "../components/ui/EmptyState";
import { money } from "../lib/format";
import { useAuthActions } from "../lib/session";
import { useDemoEventId } from "../components/LeaveDemo";
import { CustomerCompare } from "../pages/DecisionsPage";
import { partnerHref } from "../lib/hosts";
import { BadgeRow, dayText, errorText, unitWord } from "./shared";

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
    <main id="main" className="page px-5 py-10 md:px-8">
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
        <Dashboard profile={mine.profile} offerings={mine.offerings} badges={mine.badges} tier={mine.tier} level={mine.level} />
      ) : (
        <Join claims={mine.claims} />
      )}
    </main>
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
  languages?: string[];
  about?: string;
};

/** Your details: a new business, or changes to yours. */
function ProfileForm({ initial, onSaved }: { initial?: ProfileFields; onSaved?: () => void }) {
  const register = useMutation(api.marketplace.partner.register);
  const update = useMutation(api.marketplace.partner.update);
  const [f, setF] = useState<ProfileFields>(initial ?? { name: "", categories: [], city: "Chennai" });
  const [languages, setLanguages] = useState((initial?.languages ?? []).join(", "));
  const [state, setState] = useState<"idle" | "saving" | "listed">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ProfileFields>) => setF((prev) => ({ ...prev, ...patch }));
  const toggle = (c: string) => set({ categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setState("saving");
    setError(null);
    const args = { ...f, languages: languages.split(",").map((s) => s.trim()).filter(Boolean) };
    const done = initial
      ? update(args).then(() => {
          setState("idle");
          onSaved?.();
        })
      : register(args).then((r) => setState(r.kind === "already_listed" ? "listed" : "idle"));
    done.catch((err) => {
      setError(errorText(err, "That didn't save. Try again."));
      setState("idle");
    });
  };

  return (
    <section className="card mt-5 p-6 md:p-7" aria-labelledby="details-h">
      <h2 id="details-h" className="display text-xl">{initial ? "Your details" : "Set up your business"}</h2>
      {!initial && <p className="mt-1 text-sm text-muted">Customers see you once we've checked you're real, usually within a day.</p>}
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="p-name">Business name</label>
          <input id="p-name" className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="p-city">City</label>
          <input id="p-city" className="input" value={f.city} onChange={(e) => set({ city: e.target.value })} required />
        </div>
        <fieldset className="md:col-span-2">
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
          <label className="label" htmlFor="p-web">Website</label>
          <input id="p-web" className="input" value={f.website ?? ""} onChange={(e) => set({ website: e.target.value })} placeholder="yourbusiness.in" />
        </div>
        <div>
          <label className="label" htmlFor="p-email">Email for enquiries</label>
          <input id="p-email" type="email" className="input" value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="p-phone">Phone</label>
          <input id="p-phone" className="input" value={f.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="+91 98400 12345" />
        </div>
        <div>
          <label className="label" htmlFor="p-wa">WhatsApp</label>
          <input id="p-wa" className="input" value={f.whatsapp ?? ""} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="Same as phone, or another" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="p-lang">Languages you speak with customers</label>
          <input id="p-lang" className="input" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="Tamil, English" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="p-about">About you</label>
          <textarea id="p-about" className="input min-h-24" value={f.about ?? ""} onChange={(e) => set({ about: e.target.value })} placeholder="What you're known for, since when, the areas you cover" />
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button type="submit" className="btn-primary" disabled={state === "saving" || !f.name.trim() || !f.categories.length}>
            {state === "saving" ? "Saving…" : initial ? "Save changes" : "Join PlusOne Partner"}
          </button>
          {initial && <span className="text-xs text-quiet">A new name or website is checked again before customers see it.</span>}
        </div>
        {state === "listed" && (
          <p className="text-sm md:col-span-2">We already list a business with that website. Look it up above and claim it, so you're not listed twice.</p>
        )}
        {error && <p role="alert" className="text-sm text-bad md:col-span-2">{error}</p>}
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- your business

type Profile = Doc<"vendorProfiles">;
type Offering = Doc<"vendorOfferings">;

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
  const [editing, setEditing] = useState(false);
  return (
    <>
      <section className="card mt-5 p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-2xl">{profile.name}</h2>
            <p className="text-sm text-muted">{profile.categories.join(", ")} · {profile.city}</p>
            <BadgeRow badges={badges} tier={tier} level={level} className="mt-3" />
          </div>
          <button type="button" className="btn-quiet btn-sm bg-cream" onClick={() => setEditing(!editing)}>
            <Icon name="pen" size={14} />
            {editing ? "Close" : "Edit details"}
          </button>
        </div>
        <StatusLine profile={profile} />
      </section>

      {editing && (
        <ProfileForm
          initial={{ ...profile, languages: profile.languages ?? [] }}
          onSaved={() => setEditing(false)}
        />
      )}
      <Briefs verified={profile.status === "verified"} />
      <SentOffers />
      <Prices profile={profile} offerings={offerings} />
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

// ---------------------------------------------------------------- briefs and offers

function Briefs({ verified }: { verified: boolean }) {
  const briefs = useQuery(api.marketplace.briefs.open);
  const [answering, setAnswering] = useState<Id<"vendorBriefs"> | null>(null);
  // In the vendors' demo the customer is a sample event of the guest's own, so the guest
  // can see their offer as the customer does. A real vendor never sees a customer's Compare.
  const demoEventId = useDemoEventId();
  return (
    <section className="mt-8" aria-labelledby="briefs-h">
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
            <article key={b._id} className="card p-5 md:p-6">
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
                  <CustomerCompare eventId={demoEventId} category={b.category} city={b.city} />
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

/** The standard sheet for the brief's category: the main price, then every charge, each answered. */
function OfferForm({ brief, onDone }: { brief: Brief; onDone: () => void }) {
  const submit = useMutation(api.marketplace.offers.submit);
  const sheet = sheetFor(brief.category);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(String(brief.guests ?? ""));
  const [covers, setCovers] = useState("");
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, LineAnswer>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const perUnit = brief.unit !== "total";
  const qty = perUnit ? Number(quantity) || 0 : 1;
  const priced = Object.values(answers).filter((a) => a.status === "priced").reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const total = (Number(price) || 0) * qty + priced;
  const answeredAll = !sheet || sheet.lines.every((l) => answers[l.key]);

  const send = (e: FormEvent) => {
    e.preventDefault();
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
      ...(perUnit ? { quantity: qty } : {}),
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
          <label className="label" htmlFor="o-price">{perUnit ? `Price ${unitWord(brief.unit, brief.category)}` : "Price, all in"}</label>
          <input id="o-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₹" required />
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
        <fieldset>
          <legend className="label">Every other charge, the same for every vendor</legend>
          <p className="mb-2.5 text-xs text-muted">
            <strong className="font-medium text-ink">In the price</strong>: the main price covers it.{" "}
            <strong className="font-medium text-ink">Added, in ₹</strong>: its own amount, added to the total.{" "}
            <strong className="font-medium text-ink">Extra</strong>: billed on top, outside the total.
          </p>
          <ul className="grid gap-2">
            {sheet.lines.map((line) => {
              const a = answers[line.key];
              const choose = (status: LineAnswer["status"]) => setAnswers((prev) => ({ ...prev, [line.key]: { status, amount: prev[line.key]?.amount ?? "" } }));
              return (
                <li key={line.key} className="card-quiet flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className="min-w-[9rem] flex-1 text-sm font-medium">{line.label}</span>
                  <div role="radiogroup" aria-label={line.label} className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["included", "In the price"],
                        ["priced", "Added, in ₹"],
                        ["extra", "Extra"],
                      ] as const
                    ).map(([status, text]) => (
                      <button
                        key={status}
                        type="button"
                        role="radio"
                        aria-checked={a?.status === status}
                        onClick={() => choose(status)}
                        className={a?.status === status ? "chip-pending" : "chip-quiet hover:text-accent"}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  {a && a.status !== "included" && (
                    <input
                      className="input w-32"
                      inputMode="numeric"
                      aria-label={`${line.label} amount in rupees`}
                      value={a.amount}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [line.key]: { ...a, amount: e.target.value } }))}
                      placeholder={a.status === "priced" ? "₹ amount" : "₹ if known"}
                    />
                  )}
                </li>
              );
            })}
          </ul>
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
          {perUnit && qty ? ` (${money(Number(price) || 0, "INR")} × ${qty}${priced ? ` + ${money(priced, "INR")}` : ""})` : ""}
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

function Prices({ profile, offerings }: { profile: Profile; offerings: Offering[] }) {
  const save = useMutation(api.marketplace.partner.saveOffering);
  const remove = useMutation(api.marketplace.partner.removeOffering);
  const [category, setCategory] = useState(profile.categories[0] ?? "");
  const sheet = sheetFor(category);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState<Basis>(sheet?.unit ?? "total");
  const [price, setPrice] = useState("");
  const [includes, setIncludes] = useState("");
  const [gst, setGst] = useState<"" | "in" | "extra">("");
  const [error, setError] = useState<string | null>(null);

  const add = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    void save({
      category,
      title,
      unit,
      price: Number(price),
      includes: includes.split("\n").map((s) => s.trim()).filter(Boolean),
      ...(gst ? { taxIncluded: gst === "in" } : {}),
    })
      .then(() => {
        setTitle("");
        setPrice("");
        setIncludes("");
        setGst("");
      })
      .catch((err) => setError(errorText(err, "That price didn't save. Try again.")));
  };

  return (
    <section className="mt-8" aria-labelledby="prices-h">
      <h2 id="prices-h" className="display text-2xl">Your <em>prices</em></h2>
      <p className="mt-1 max-w-[42rem] text-sm text-muted">
        Published prices, each with what it includes. Every price itemised earns the Transparent pricing badge, and your
        prices count towards your city's range (never with your name on them).
      </p>
      {offerings.length > 0 && (
        <ul className="card mt-4 divide-y divide-line">
          {offerings.map((o) => (
            <li key={o._id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium">{o.title}</p>
                <p className="text-sm text-muted">
                  {money(o.price, o.currency)} {unitWord(o.unit, o.category)} · {o.category}
                  {o.taxIncluded === true ? " · GST included" : o.taxIncluded === false ? " · GST extra" : ""}
                </p>
                {o.includes.length > 0 && <p className="mt-1 text-sm">Includes {o.includes.join(", ")}</p>}
              </div>
              <button type="button" className="btn-quiet btn-sm" onClick={() => void remove({ offeringId: o._id })}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form className="card mt-4 grid gap-4 p-5 md:grid-cols-2 md:p-6" onSubmit={add}>
        <div>
          <label className="label" htmlFor="pr-cat">Service</label>
          <select
            id="pr-cat"
            className="input"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setUnit(sheetFor(e.target.value)?.unit ?? "total");
            }}
          >
            {profile.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pr-title">Name</label>
          <input id="pr-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="South Indian lunch, banana leaf" required />
        </div>
        <div>
          <label className="label" htmlFor="pr-price">Price</label>
          <div className="flex gap-2">
            <input id="pr-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₹" required />
            <select className="input w-40" value={unit} onChange={(e) => setUnit(e.target.value as Basis)} aria-label="Priced">
              {(["per_person", "per_piece", "per_day", "total"] as const).map((u) => (
                <option key={u} value={u}>{basisLabel(u, category)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pr-gst">GST</label>
          <select id="pr-gst" className="input" value={gst} onChange={(e) => setGst(e.target.value as typeof gst)}>
            <option value="">Not said</option>
            <option value="in">Included in the price</option>
            <option value="extra">Extra, on top</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="pr-inc">What it includes, one per line</label>
          <textarea id="pr-inc" className="input min-h-20" value={includes} onChange={(e) => setIncludes(e.target.value)} placeholder={sheet?.covers ?? ""} />
        </div>
        <div className="md:col-span-2">
          <button type="submit" className="btn-primary btn-sm" disabled={!title.trim() || !price}>
            <Icon name="plus" size={14} />
            Add price
          </button>
          {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
        </div>
      </form>
    </section>
  );
}
