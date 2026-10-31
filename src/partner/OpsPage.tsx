import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon } from "../components/ui/Icon";
import { EmptyState } from "../components/ui/EmptyState";
import { onOpsHost } from "../lib/hosts";
import { useAuthActions } from "../lib/session";
import { errorText, priceText } from "./shared";
import { ChangesLane } from "./ops/ChangesLane";
import { PhotosLane } from "./ops/PhotosLane";
import { waitText } from "./ops/time";

/**
 * PlusOne Ops: the team checks every vendor before customers hear from them. Each
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

const LANES = ["verify", "claims", "photos", "changes"] as const;
type Lane = (typeof LANES)[number];

const LANE_NAME: Record<Lane, string> = {
  verify: "To verify",
  claims: "Claims",
  photos: "Photos to check",
  changes: "Changes waiting",
};

function isLane(value: string | null): value is Lane {
  return value === "verify" || value === "claims" || value === "photos" || value === "changes";
}

type QueueProfile = FunctionReturnType<typeof api.marketplace.ops.queue>["profiles"][number];
type QueueClaim = FunctionReturnType<typeof api.marketplace.ops.queue>["claims"][number];

export type LaneCounts = Record<Lane, number>;

/** The four counts as tappable tiles: work waiting carries the marigold mark, zero is quiet. */
export function OpsTiles({ counts, lane, onPick }: { counts: LaneCounts; lane: Lane; onPick: (lane: Lane) => void }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="What is waiting">
      {LANES.map((l) => {
        const n = counts[l];
        const here = l === lane;
        return (
          <button
            key={l}
            type="button"
            onClick={() => onPick(l)}
            aria-current={here || undefined}
            className={`rounded-[18px] border px-4 py-3 text-left transition ${
              n > 0 ? "border-highlight bg-highlight-soft" : "border-line bg-cream"
            }${here ? " shadow-[inset_0_0_0_2px_var(--color-accent)]" : ""}`}
          >
            <span className={`display block text-3xl leading-none ${n > 0 ? "" : "text-muted"}`}>{n}</span>
            <span className={`mt-1 block text-xs ${n > 0 ? "text-muted" : "text-quiet"}`}>{LANE_NAME[l]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One lane at a time, with the counts as tiles above it; the lane lives in the URL so a reload stays put. */
function Queue() {
  const queue = useQuery(api.marketplace.ops.queue);
  const photos = useQuery(api.marketplace.photos.toCheck);
  const changes = useQuery(api.marketplace.changes.waiting);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<Id<"vendorProfiles"> | null>(null);
  const [openClaim, setOpenClaim] = useState<Id<"vendorClaims"> | null>(null);

  if (queue === undefined || photos === undefined || changes === undefined) {
    return (
      <main id="main" className="page px-5 py-10 md:px-8">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  const counts: LaneCounts = {
    verify: queue.profiles.length,
    claims: queue.claims.length,
    photos: photos.length,
    changes: changes.length,
  };
  // Without a lane in the URL, start where there is work, else with the vendors.
  const wanted = params.get("lane");
  const lane: Lane = isLane(wanted) ? wanted : (LANES.find((l) => counts[l] > 0) ?? "verify");
  const pick = (next: Lane) => {
    setOpen(null);
    setOpenClaim(null);
    setParams({ lane: next }, { preventScrollReset: true });
  };

  return (
    <main id="main" className="page px-5 py-10 md:px-8">
      <HomeOrLeave small />
      <h1 className="mt-4 text-[clamp(2.1rem,3.6vw,3.2rem)] leading-[1.08] text-balance">PlusOne <em>Ops</em></h1>
      <p className="mt-1 text-sm text-muted">Vendors waiting to be checked, claims on listings we added, flagged photos, and changes to verified listings.</p>

      <OpsTiles counts={counts} lane={lane} onPick={pick} />

      <div className="mt-6">
        {lane === "verify" && <VerifyLane profiles={queue.profiles} open={open} onOpen={setOpen} />}
        {lane === "claims" && <ClaimsLane claims={queue.claims} open={openClaim} onOpen={setOpenClaim} />}
        {lane === "photos" && <PhotosLane photos={photos} />}
        {lane === "changes" && <ChangesLane changes={changes} />}
      </div>
    </main>
  );
}

/** Back to the row of cards, from beside a review. */
function BackToList({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="btn-quiet btn-sm mb-4 gap-1.5 bg-cream" onClick={onBack}>
      <Icon name="arrow" size={15} className="rotate-180" />
      Back to the list
    </button>
  );
}

/** Vendors waiting to be checked: compact cards, and the chosen one beside them on a wide screen. */
function VerifyLane({
  profiles,
  open,
  onOpen,
}: {
  profiles: QueueProfile[];
  open: Id<"vendorProfiles"> | null;
  onOpen: (id: Id<"vendorProfiles"> | null) => void;
}) {
  if (profiles.length === 0) {
    return <EmptyState icon="check" title="Nothing waiting" body="New vendors appear here when they sign up." />;
  }
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <ul className={`grid min-w-0 content-start gap-3 ${open ? "hidden lg:grid" : ""}`} aria-label="Vendors to verify">
        {profiles.map((p) => (
          <li
            key={p._id}
            className={`card-quiet overflow-hidden ${open === p._id ? "shadow-[inset_0_0_0_2px_var(--color-accent)]" : ""}`}
          >
            <button
              type="button"
              onClick={() => onOpen(p._id)}
              aria-current={open === p._id || undefined}
              className={`w-full px-4 py-3 text-left transition hover:bg-accent-soft ${open === p._id ? "bg-accent-soft" : ""}`}
            >
              <span className="block font-medium">{p.name}</span>
              <span className="block text-sm text-muted">{p.categories.join(", ")} · {p.city}</span>
              <span className="mt-0.5 block text-xs text-quiet">{waitText(p.statusAt)}</span>
              {p.statusReason && <span className="mt-1 block text-xs text-warn">{p.statusReason}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className={`min-w-0 ${open ? "" : "hidden lg:block"}`}>
        {open ? (
          <>
            <BackToList onBack={() => onOpen(null)} />
            <Review profileId={open} onDone={() => onOpen(null)} />
          </>
        ) : (
          <EmptyState compact icon="check" title="Choose a vendor to check" />
        )}
      </div>
    </div>
  );
}

/** Claims on listings PlusOne added: who says it is theirs, and the decision beside each. */
function ClaimsLane({
  claims,
  open,
  onOpen,
}: {
  claims: QueueClaim[];
  open: Id<"vendorClaims"> | null;
  onOpen: (id: Id<"vendorClaims"> | null) => void;
}) {
  if (claims.length === 0) {
    return <EmptyState icon="people" title="Nothing waiting" body="Claims on listings we added appear here." />;
  }
  const current = claims.find((c) => c._id === open) ?? null;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <ul className={`grid min-w-0 content-start gap-3 ${current ? "hidden lg:grid" : ""}`} aria-label="Claims">
        {claims.map((c) => (
          <li
            key={c._id}
            className={`card-quiet overflow-hidden ${current?._id === c._id ? "shadow-[inset_0_0_0_2px_var(--color-accent)]" : ""}`}
          >
            <button
              type="button"
              onClick={() => onOpen(c._id)}
              aria-current={current?._id === c._id || undefined}
              className={`w-full px-4 py-3 text-left transition hover:bg-accent-soft ${current?._id === c._id ? "bg-accent-soft" : ""}`}
            >
              <span className="block font-medium">{c.profileName}</span>
              <span className="block break-words text-sm text-muted">
                {c.claimantEmail ?? "No email"} wants it
                {c.website ? <> · <a className="underline" href={c.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{c.website.replace(/^https:\/\//, "")}</a></> : null}
              </span>
              <span className="mt-0.5 block text-xs text-quiet">{waitText(c.createdAt)}</span>
              {c.note && <span className="mt-1 block text-xs text-muted">&ldquo;{c.note}&rdquo;</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className={`min-w-0 ${current ? "" : "hidden lg:block"}`}>
        {current ? (
          <>
            <BackToList onBack={() => onOpen(null)} />
            <ClaimReview claim={current} />
          </>
        ) : (
          <EmptyState compact icon="people" title="Choose a claim to check" />
        )}
      </div>
    </div>
  );
}

function ClaimReview({ claim }: { claim: QueueClaim }) {
  const decide = useMutation(api.marketplace.ops.decideClaim);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card min-w-0 p-6 md:p-7" aria-labelledby="claim-h">
      <p className="label mb-1">Claimed listing</p>
      <h2 id="claim-h" className="display text-2xl">{claim.profileName}</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted">Claimed by</dt>
        <dd className="break-words">{claim.claimantEmail ?? "No email"}</dd>
        {claim.website && (
          <>
            <dt className="text-muted">Website</dt>
            <dd className="min-w-0">
              <a className="break-words underline" href={claim.website} target="_blank" rel="noreferrer">
                {claim.website}
              </a>
            </dd>
          </>
        )}
        <dt className="text-muted">Waiting</dt>
        <dd>{waitText(claim.createdAt)}</dd>
        {claim.note && (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="break-words">&ldquo;{claim.note}&rdquo;</dd>
          </>
        )}
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void decide({ claimId: claim._id, approve: true }).catch((e) => setError(errorText(e, "That didn't save.")))}
        >
          It&apos;s theirs
        </button>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => void decide({ claimId: claim._id, approve: false }).catch((e) => setError(errorText(e, "That didn't save.")))}
        >
          Turn down
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
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
  const addEvidenceSources = (sources: { label: string; url: string }[]) => {
    setEvidence((all) => {
      const seen = new Set(all.map((e) => e.url.trim()).filter(Boolean));
      // Two findings often cite the same page; it goes in once.
      const fresh = sources.filter((s) => {
        const url = s.url.trim();
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      });
      if (fresh.length === 0) return all;
      // Keep the empty starter row out of the way once real links arrive.
      const kept = all.filter((e) => e.url.trim() || e.label.trim());
      return [...kept, ...fresh.map((s) => ({ label: s.label.slice(0, 200), url: s.url.trim().slice(0, 1000) }))];
    });
  };

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
    <section className="card min-w-0 p-6 md:p-7" aria-labelledby="review-h">
      <p className="label mb-1">{profile.source === "plusone_added" ? "Claimed listing" : "New sign-up"}</p>
      <h2 id="review-h" className="display text-2xl">{profile.name}</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted">Offers</dt>
        <dd>{profile.categories.join(", ")}</dd>
        <dt className="text-muted">City</dt>
        <dd>{profile.city}</dd>
        {profile.serviceArea?.length ? (
          <>
            <dt className="text-muted">Area</dt>
            <dd>{profile.serviceArea.join(", ")}</dd>
          </>
        ) : null}
        {profile.website && (
          <>
            <dt className="text-muted">Website</dt>
            <dd className="min-w-0"><a className="break-words underline" href={profile.website} target="_blank" rel="noreferrer">{profile.website}</a></dd>
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
        {profile.email && (
          <>
            <dt className="text-muted">Email</dt>
            <dd className="min-w-0"><a className="break-words underline" href={`mailto:${profile.email}`}>{profile.email}</a></dd>
          </>
        )}
        {/* The account they signed in with, which may be a personal address; the business's own is Email above. */}
        <dt className="text-muted">Signed in as</dt>
        <dd className="min-w-0 break-words">{ownerEmail ?? "Not claimed"}</dd>
        {profile.about && (
          <>
            <dt className="text-muted">About</dt>
            <dd className="break-words">{profile.about}</dd>
          </>
        )}
      </dl>

      {offerings.length > 0 && (
        <>
          <h3 className="label mt-8">Their prices</h3>
          <ul className="mt-2 grid gap-2 text-sm">
            {offerings.map((o) => (
              <li key={o._id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4">
                <span className="font-medium">{o.title}</span>
                <span className="min-w-0">
                  {priceText(o)}
                  {o.includes.length ? <span className="text-muted"> · includes {o.includes.join(", ")}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <VendorCheck profileId={profileId} onUseSources={addEvidenceSources} />

      <VendorPhotos profileId={profileId} />

      <fieldset className="mt-8">
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

      <fieldset className="mt-8">
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

      {reviews.length > 0 && (
        <details className="card-quiet mt-8 px-5 py-4">
          <summary className="cursor-pointer text-sm font-medium">Earlier decisions ({reviews.length})</summary>
          <ul className="mt-3 grid gap-2 text-sm">
            {reviews.map((r) => (
              <li key={r._id} className="min-w-0 border-t border-line pt-2 first:border-t-0 first:pt-0">
                <span className="font-medium capitalize">{r.outcome}</span>
                <span className="text-muted"> · {new Date(r.at).toLocaleDateString("en-IN")} · {r.checks.filter((c) => c.passed).length} of {r.checks.length} checks</span>
                {r.evidence.map((e) => (
                  <a key={e.url} className="ml-2 text-xs underline" href={e.url} target="_blank" rel="noreferrer">{e.label}</a>
                ))}
                {r.notes && <p className="mt-1 break-words text-muted">{r.notes}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="sticky bottom-0 -mx-6 mt-8 rounded-b-[18px] border-t border-line bg-cream px-6 py-4 md:-mx-7 md:px-7">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <label className="label" htmlFor="r-notes">Notes (the vendor sees these if turned down or paused)</label>
            <textarea id="r-notes" className="input min-h-10" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={saving} onClick={() => decide("verified")}>Verify</button>
            <button type="button" className="btn-quiet" disabled={saving} onClick={() => decide("rejected")}>Turn down</button>
            <button type="button" className="btn-quiet" disabled={saving} onClick={() => decide("suspended")}>Pause</button>
          </div>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      </div>
    </section>
  );
}

/** The vendor's work photos for the reviewer: what was found on each, and the decision on it. */
function VendorPhotos({ profileId }: { profileId: Id<"vendorProfiles"> }) {
  const photos = useQuery(api.marketplace.photos.forOps, { profileId });
  const review = useMutation(api.marketplace.photos.review);
  const [error, setError] = useState<string | null>(null);

  if (photos === undefined) return <p className="mt-8 text-sm text-muted">Loading…</p>;
  if (photos.length === 0) return null;

  const decide = (photoId: Id<"vendorPhotos">, decision: "approved" | "removed") => {
    setError(null);
    void review({ photoId, decision }).catch((e) => setError(errorText(e, "That decision didn't save.")));
  };

  return (
    <div className="card-quiet mt-8 p-5">
      <h3 className="label">Photos</h3>
      <ul className="mt-3 grid gap-4">
        {photos.map((p) => (
          <li key={p._id} className="grid min-w-0 gap-3 sm:grid-cols-[10rem_1fr]">
            {p.url ? (
              <img src={p.url} alt="" className="aspect-square w-full rounded object-cover" />
            ) : (
              <div className="aspect-square w-full rounded bg-cream" aria-hidden />
            )}
            <div className="min-w-0 text-sm">
              {p.status === "checking" && <p className="text-muted">Checking…</p>}
              {p.status === "failed" && <p className="text-muted">Couldn&apos;t be checked</p>}
              {p.provider === "glimmer" && <p className="text-xs text-quiet">Checked by Muse Glimmer</p>}
              {p.provider === "spark" && <p className="text-xs text-quiet">Checked by Muse Spark</p>}
              {p.shows && <p className="mt-1">{p.shows}</p>}
              {p.tags.length > 0 && (
                <p className="mt-1 flex min-w-0 flex-wrap gap-1">
                  {p.tags.map((t) => (
                    <span key={t.key} className="chip-quiet">{t.label}</span>
                  ))}
                </p>
              )}
              {p.flags.map((f) => (
                <p key={f.key} className="mt-1 break-words text-muted">{f.text}</p>
              ))}
              {p.doubt && <p className="mt-1 break-words text-muted">Not sure: {p.doubt}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.review === "approved" && <span className="chip-ok">Approved</span>}
                {p.review === "removed" && <span className="chip-warn">Removed</span>}
                <button type="button" className="btn-primary btn-sm" onClick={() => decide(p._id, "approved")}>
                  Approve
                </button>
                <button type="button" className="btn-quiet btn-sm" onClick={() => decide(p._id, "removed")}>
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}

/** The background check on a listing: what was found, with sources. A person still ticks the checklist. */
function VendorCheck({ profileId, onUseSources }: { profileId: Id<"vendorProfiles">; onUseSources: (sources: { label: string; url: string }[]) => void }) {
  const latest = useQuery(api.marketplace.checks.latest, { profileId });
  const start = useMutation(api.marketplace.checks.start);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const begin = () => {
    setStarting(true);
    setError(null);
    void start({ profileId })
      .catch((e) => setError(errorText(e, "That check didn't start. Try again.")))
      .finally(() => setStarting(false));
  };

  if (latest === undefined) return <p className="mt-8 text-sm text-muted">Loading…</p>;

  // A run is cut off after ten minutes; one still marked running by then won't finish.
  const stuck = latest?.status === "running" && Date.now() - latest.startedAt > 10 * 60_000;

  if (latest === null || latest.status === "failed" || stuck) {
    return (
      <div className="card-quiet mt-8 p-5">
        <h3 className="label">Check this listing</h3>
        <p className="mt-1 text-sm text-muted">Searches the web and reads their own pages, then lists what it found. It flags; you decide.</p>
        {(latest?.error || stuck) && (
          <p role="alert" className="mt-2 text-sm text-bad">{latest?.error ?? "That check didn't finish. Try again."}</p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad">{error}</p>
        )}
        <button type="button" className="btn-quiet btn-sm mt-3" disabled={starting} onClick={begin}>
          {latest === null ? "Check this vendor" : "Try again"}
        </button>
      </div>
    );
  }

  if (latest.status === "running") {
    return (
      <div className="card-quiet mt-8 p-5" role="status">
        <h3 className="label">Check this listing</h3>
        <p className="mt-1 text-sm text-muted">Checking… this takes a minute or two.</p>
      </div>
    );
  }

  const report = latest.report;
  if (!report) {
    return (
      <div className="card-quiet mt-8 p-5">
        <h3 className="label">Check this listing</h3>
        <p className="mt-1 text-sm text-muted">Searches the web and reads their own pages, then lists what it found. It flags; you decide.</p>
        <button type="button" className="btn-quiet btn-sm mt-3" disabled={starting} onClick={begin}>
          Check again
        </button>
      </div>
    );
  }

  const allSources = report.checks.flatMap((c) => c.sources.map((s) => ({ label: c.label, url: s.url })));
  const when = latest.finishedAt ?? latest.startedAt;

  return (
    <div className="card-quiet mt-8 p-5">
      <h3 className="label">What was found</h3>
      <p className="mt-2 text-sm">{report.summary}</p>
      <ul className="mt-3 grid gap-3">
        {report.checks.map((c) => (
          <li key={c.key} className="min-w-0 border-t border-line pt-3 text-sm first:border-t-0 first:pt-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.label}</span>
              <span className={c.finding === "supports" ? "chip-ok" : c.finding === "concern" ? "chip-warn" : "chip-quiet"}>
                {c.finding === "supports" ? "Backed" : c.finding === "concern" ? "Concern" : "Not found"}
              </span>
            </p>
            <p className="mt-1 break-words text-muted">{c.note}</p>
            {c.sources.length > 0 && (
              <ul className="mt-1 grid gap-1">
                {c.sources.map((s) => (
                  <li key={s.url} className="min-w-0">
                    <a className="break-words text-xs underline" href={s.url} target="_blank" rel="noreferrer">{s.title.trim() || s.url}</a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {allSources.length > 0 && (
        <button type="button" className="btn-quiet btn-sm mt-3" onClick={() => onUseSources(allSources)}>
          Use these sources as evidence
        </button>
      )}
      <p className="mt-2 text-xs text-muted">
        Checked {new Date(when).toLocaleDateString("en-IN")} · read {latest.pagesRead ?? 0} {(latest.pagesRead ?? 0) === 1 ? "page" : "pages"}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">{error}</p>
      )}
      <button type="button" className="btn-quiet btn-sm mt-2" disabled={starting} onClick={begin}>
        Check again
      </button>
    </div>
  );
}
