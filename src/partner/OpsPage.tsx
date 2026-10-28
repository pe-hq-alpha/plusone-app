import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon } from "../components/ui/Icon";
import { EmptyState } from "../components/ui/EmptyState";
import { money } from "../lib/format";
import { onOpsHost } from "../lib/hosts";
import { useAuthActions } from "../lib/session";
import { errorText, unitWord } from "./shared";

/**
 * PlusOne Ops: the team checks every vendor before families hear from them. Each
 * decision is kept with the checks made and the evidence behind it. Software can gather
 * evidence; a person decides.
 */
export function OpsPage() {
  const role = useQuery(api.marketplace.ops.amStaff);
  if (role === undefined) return <main id="main" className="page px-5 py-10 text-muted">Loading…</main>;
  if (role === null) {
    return (
      <main id="main" className="page px-5 py-10 md:px-8">
        <EmptyState icon="settings" title="This page is for the PlusOne team" action={<HomeOrLeave />} />
      </main>
    );
  }
  return <Queue />;
}

/** On Ops' own address "/" is this page, so the way out is signing out; on one address, the app's home. */
function HomeOrLeave({ small = false }: { small?: boolean }) {
  const { signOut } = useAuthActions();
  const className = small ? "btn-quiet btn-sm gap-1.5 bg-cream" : "btn-quiet";
  if (onOpsHost()) {
    return (
      <button type="button" className={className} onClick={() => void signOut()}>
        Sign out
      </button>
    );
  }
  return (
    <Link to="/" className={className}>
      {small && <Icon name="arrow" size={15} className="rotate-180" />}
      Home
    </Link>
  );
}

function Queue() {
  const queue = useQuery(api.marketplace.ops.queue);
  const [open, setOpen] = useState<Id<"vendorProfiles"> | null>(null);
  return (
    <main id="main" className="page px-5 py-10 md:px-8">
      <HomeOrLeave small />
      <h1 className="mt-4 text-[clamp(2.1rem,3.6vw,3.2rem)] leading-[1.08] text-balance">PlusOne <em>Ops</em></h1>
      <p className="mt-1 text-sm text-muted">Vendors waiting to be checked, and claims on listings we added.</p>

      {queue === undefined ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-6">
            <section aria-labelledby="verify-h">
              <h2 id="verify-h" className="label">To verify ({queue.profiles.length})</h2>
              {queue.profiles.length === 0 ? (
                <p className="text-sm text-muted">Nothing waiting.</p>
              ) : (
                <ul className="card divide-y divide-line">
                  {queue.profiles.map((p) => (
                    <li key={p._id}>
                      <button
                        type="button"
                        onClick={() => setOpen(p._id)}
                        aria-current={open === p._id}
                        className={`w-full px-4 py-3 text-left transition hover:bg-accent-soft ${open === p._id ? "bg-accent-soft" : ""}`}
                      >
                        <span className="block font-medium">{p.name}</span>
                        <span className="block text-sm text-muted">{p.categories.join(", ")} · {p.city}</span>
                        {p.statusReason && <span className="mt-1 block text-xs text-warn">{p.statusReason}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Claims claims={queue.claims} />
          </div>
          {open ? <Review profileId={open} onDone={() => setOpen(null)} /> : <EmptyState compact icon="check" title="Choose a vendor to check" />}
        </div>
      )}
    </main>
  );
}

type QueueClaim = {
  _id: Id<"vendorClaims">;
  profileName: string;
  website?: string;
  claimantEmail?: string;
  note?: string;
};

function Claims({ claims }: { claims: QueueClaim[] }) {
  const decide = useMutation(api.marketplace.ops.decideClaim);
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-labelledby="claims-h">
      <h2 id="claims-h" className="label">Claims ({claims.length})</h2>
      {claims.length === 0 ? (
        <p className="text-sm text-muted">Nothing waiting.</p>
      ) : (
        <ul className="grid gap-3">
          {claims.map((c) => (
            <li key={c._id} className="card-quiet p-4 text-sm">
              <p className="font-medium">{c.profileName}</p>
              <p className="text-muted">
                {c.claimantEmail ?? "No email"} wants it{c.website ? <> · <a className="underline" href={c.website} target="_blank" rel="noreferrer">{c.website.replace(/^https:\/\//, "")}</a></> : null}
              </p>
              {c.note && <p className="mt-1">"{c.note}"</p>}
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn-primary btn-sm" onClick={() => void decide({ claimId: c._id, approve: true }).catch((e) => setError(errorText(e, "That didn't save.")))}>
                  It's theirs
                </button>
                <button type="button" className="btn-quiet btn-sm" onClick={() => void decide({ claimId: c._id, approve: false }).catch((e) => setError(errorText(e, "That didn't save.")))}>
                  Turn down
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}

/** The checks a reviewer runs on every vendor, so decisions are made the same way. */
const CHECKS = [
  "Website or social page is theirs",
  "Phone answers as this business",
  "Address or service area is real",
  "Prices look like what they publish",
  "No serious complaints found",
];

function Review({ profileId, onDone }: { profileId: Id<"vendorProfiles">; onDone: () => void }) {
  const detail = useQuery(api.marketplace.ops.profile, { profileId });
  const review = useMutation(api.marketplace.ops.review);
  const [passed, setPassed] = useState<Record<string, boolean>>({});
  const [evidence, setEvidence] = useState<{ label: string; url: string }[]>([{ label: "", url: "" }]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (detail === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (detail === null) return <EmptyState compact title="That listing is gone" />;
  const { profile, offerings, reviews, ownerEmail } = detail;

  const decide = (outcome: "verified" | "rejected" | "suspended") => {
    setSaving(true);
    setError(null);
    void review({
      profileId,
      outcome,
      checks: CHECKS.map((label) => ({ label, passed: passed[label] === true })),
      evidence: evidence.filter((e) => e.url.trim()).map((e) => ({ label: e.label.trim() || "Link", url: e.url.trim() })),
      notes: notes || undefined,
    })
      .then(onDone)
      .catch((e) => setError(errorText(e, "That decision didn't save. Try again.")))
      .finally(() => setSaving(false));
  };

  return (
    <section className="card p-6 md:p-7" aria-labelledby="review-h">
      <p className="label mb-1">{profile.source === "plusone_added" ? "Claimed listing" : "New sign-up"}</p>
      <h2 id="review-h" className="display text-2xl">{profile.name}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted">Offers</dt>
        <dd>{profile.categories.join(", ")}</dd>
        <dt className="text-muted">City</dt>
        <dd>{profile.city}{profile.serviceArea?.length ? ` (${profile.serviceArea.join(", ")})` : ""}</dd>
        {profile.website && (
          <>
            <dt className="text-muted">Website</dt>
            <dd><a className="underline" href={profile.website} target="_blank" rel="noreferrer">{profile.website}</a></dd>
          </>
        )}
        {(profile.phone || profile.whatsapp) && (
          <>
            <dt className="text-muted">Phone</dt>
            <dd>
              {profile.phone && <a className="underline" href={`tel:${profile.phone}`}>{profile.phone}</a>}
              {profile.whatsapp && <> · <a className="underline" href={`https://wa.me/${profile.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></>}
            </dd>
          </>
        )}
        <dt className="text-muted">Account</dt>
        <dd>{ownerEmail ?? "Not claimed"}</dd>
        {profile.about && (
          <>
            <dt className="text-muted">About</dt>
            <dd>{profile.about}</dd>
          </>
        )}
      </dl>

      {offerings.length > 0 && (
        <>
          <h3 className="label mt-5">Their prices</h3>
          <ul className="grid gap-1 text-sm">
            {offerings.map((o) => (
              <li key={o._id}>
                {o.title}: {money(o.price, o.currency)} {unitWord(o.unit, o.category)}
                {o.includes.length ? <span className="text-muted"> · includes {o.includes.join(", ")}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <fieldset className="mt-6">
        <legend className="label">Checks</legend>
        <ul className="grid gap-2">
          {CHECKS.map((label) => (
            <li key={label}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={passed[label] === true} onChange={(e) => setPassed((p) => ({ ...p, [label]: e.target.checked }))} />
                {label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="label">Evidence</legend>
        <div className="grid gap-2">
          {evidence.map((e, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr]">
              <input className="input" placeholder="What it shows" aria-label="What the link shows" value={e.label} onChange={(ev) => setEvidence((all) => all.map((x, j) => (j === i ? { ...x, label: ev.target.value } : x)))} />
              <input className="input" placeholder="https://" aria-label="Link" value={e.url} onChange={(ev) => setEvidence((all) => all.map((x, j) => (j === i ? { ...x, url: ev.target.value } : x)))} />
            </div>
          ))}
          <button type="button" className="btn-quiet btn-sm justify-self-start" onClick={() => setEvidence((all) => [...all, { label: "", url: "" }])}>
            <Icon name="plus" size={14} />
            Another link
          </button>
        </div>
      </fieldset>

      <div className="mt-5">
        <label className="label" htmlFor="r-notes">Notes (the vendor sees these if turned down or paused)</label>
        <textarea id="r-notes" className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={saving} onClick={() => decide("verified")}>Verify</button>
        <button type="button" className="btn-quiet" disabled={saving} onClick={() => decide("rejected")}>Turn down</button>
        <button type="button" className="btn-quiet" disabled={saving} onClick={() => decide("suspended")}>Pause</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}

      {reviews.length > 0 && (
        <>
          <h3 className="label mt-7">Earlier decisions</h3>
          <ul className="grid gap-2 text-sm">
            {reviews.map((r) => (
              <li key={r._id} className="card-quiet px-4 py-3">
                <span className="font-medium capitalize">{r.outcome}</span>
                <span className="text-muted"> · {new Date(r.at).toLocaleDateString("en-IN")} · {r.checks.filter((c) => c.passed).length} of {r.checks.length} checks</span>
                {r.evidence.map((e) => (
                  <a key={e.url} className="ml-2 underline" href={e.url} target="_blank" rel="noreferrer">{e.label}</a>
                ))}
                {r.notes && <p className="mt-1 text-muted">{r.notes}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
