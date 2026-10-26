import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { EventType } from "../../convex/lib/validators";
import { EVENT_TYPES, anOccasion, occasionNoun, partWord, peopleWord } from "../../convex/lib/occasion";
import { PeopleWord } from "../lib/words";
import { sessionsFor, slotsFor } from "../../convex/lib/templates";
import { VENDOR_NEEDS, VENDOR_NEED_KEYS, type VendorNeedKey } from "../../convex/lib/vocab";
import type { PlannedCeremony } from "../../convex/lib/ceremonyPlan";
import {
  CURRENCIES,
  GUEST_ESTIMATES,
  VIBES,
  extraNeeds,
  isOn,
  needsForRows,
  rebalance,
  moveToDate,
  moveWithinDay,
  redate,
  regroup,
  reweigh,
  rowsForCeremonies,
  type FunctionRow,
  type NeedRow,
} from "../components/onboarding/shared";
import { CeremoniesStep } from "../components/onboarding/CeremoniesStep";
import { HELP_WITH } from "../../convex/lib/helpWith";
import { DEFAULT_EVENT_BUDGET, currencyForCountry } from "../lib/currency";
import { ThemeFooter } from "../components/ui/ThemeFooter";
import { addDaysIso, money, shortDate } from "../lib/format";
import { LEAD_TITLE, niceStep, splitByWeights } from "../../convex/lib/templates";
import { Icon } from "../components/ui/Icon";
import { RenameTitle } from "../components/ui/RenameTitle";
import { CountrySelect } from "../components/ui/CountrySelect";
import type { Id } from "../../convex/_generated/dataModel";
import { record } from "../lib/analytics/client";
import { EVENTS } from "../lib/analytics/events";
import { BRAND } from "../lib/brand";
import { countryName, useRegion } from "../lib/region";
import { examplesFor } from "../lib/regionExamples";
import "../styles/onboarding.css";

/** Named, so the host can see where they are and how much is left. */
const STEPS = ["Names and dates", "Kind of event", "Parts of the day", "People", "Budget", "Vendors", "Look and feel"];
const KIND_STEP = 1;
const CEREMONIES_STEP = 2;
const GUESTS_STEP = 3;
const BUDGET_STEP = 4;
const NEEDS_STEP = 5;
const FEEL_STEP = 6;

/** A kind of event's starting parts and vendors, in the shape the ceremony steps work with. */
function typeOffer(type: EventType): PlannedCeremony[] {
  const keyFor = (category: string): VendorNeedKey | undefined => VENDOR_NEED_KEYS.find((k) => VENDOR_NEEDS[k].category === category);
  const sessions = sessionsFor(type);
  const slots = slotsFor(type);
  return sessions.map((s, i) => ({
    key: `${type}-${i}`,
    name: s.name,
    significance: s.description ?? "",
    rites: [],
    vendorNeeds: slots
      .filter((slot) => !slot.sessionNames || slot.sessionNames.includes(s.name))
      .map((slot) => keyFor(slot.category))
      .filter((k): k is VendorNeedKey => Boolean(k)),
    isDefault: true,
    offset: 0,
    timeOfDay: (i === 0 && sessions.length > 1 ? 0 : 1) as 0 | 1,
  }));
}

const MAX_PICTURES = 6;
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

type Picture = { id: Id<"_storage">; preview: string; name: string };

/** An even split in round numbers, the leftover on the biggest day. */
function splitEqually(rows: FunctionRow[], total: number): FunctionRow[] {
  const shares = splitByWeights(total, rows.map(() => 1));
  return rows.map((r, i) => ({ ...r, budget: shares[i] }));
}

/** A percentage of the total, rounded the way a person would round it. */
function amountForPercent(pct: number, total: number): number {
  const step = niceStep(total);
  return Math.round((total * Math.min(100, Math.max(0, pct))) / 100 / step) * step;
}

const BLANK_FORM = {
  host: "",
  coHost: "",
  startDate: "",
  endDate: "",
  city: "",
  area: "",
  country: "",
  eventType: "party" as EventType,
  currency: "USD",
  /** Set once they pick a currency themselves, so a country change no longer overrides it. */
  currencyChosen: false,
  totalBudget: DEFAULT_EVENT_BUDGET.USD,
  guestEstimate: 150,
  helpWith: [] as string[],
  helpNotes: "",
  inspirationUrl: "",
  inspirationNotes: "",
  stylePalette: "",
  styleFormality: "smart" as "relaxed" | "smart" | "formal",
};

/** What a saved draft holds; pictures and the step are stored beside it. */
type DraftState = {
  form: typeof BLANK_FORM;
  vibes: string[];
  rows: FunctionRow[];
  needs: NeedRow[];
  removed: NeedRow[];
  undecided: boolean;
  builtFor?: string;
};

export function OnboardingPage() {
  const navigate = useNavigate();
  const create = useMutation(api.events.create);
  const uploadUrl = useMutation(api.events.generateInspirationUploadUrl);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(BLANK_FORM);
  const [vibes, setVibes] = useState<string[]>([]);
  const [rows, setRows] = useState<FunctionRow[]>([]);
  const [needs, setNeeds] = useState<NeedRow[]>([]);
  /** Removed services wait under "Anything else?" so a slip is one click to undo. */
  const [removed, setRemoved] = useState<NeedRow[]>([]);
  const [undecided, setUndecided] = useState(false);
  /** Which kind of event the parts were last built from, so changing it rebuilds. */
  const [builtFor, setBuiltFor] = useState("");
  const [splitMode, setSplitMode] = useState<"equal" | "percent" | "amount">("percent");
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [uploading, setUploading] = useState(0);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const draft = useQuery(api.drafts.mine);
  const saveDraft = useMutation(api.drafts.save);
  const discardDraft = useMutation(api.drafts.discard);
  /** False until any saved draft has been poured back into the form. */
  const [restored, setRestored] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saved">("idle");
  /** Set once the event is being created, so a late autosave can't bring the draft back. */
  const finished = useRef(false);
  const set = <K extends keyof typeof form>(k: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: value }));

  // Pick up where they left off, on whatever device they left from.
  useEffect(() => {
    if (restored || draft === undefined) return;
    if (draft) {
      try {
        const parsed = JSON.parse(draft.state) as Partial<DraftState>;
        // Drafts from before the venue became an ordinary need carry it on the form.
        const { venueStatus, venueName, ...savedForm } = (parsed.form ?? {}) as Partial<typeof BLANK_FORM> & {
          venueStatus?: string;
          venueName?: string;
        };
        setForm({ ...BLANK_FORM, ...savedForm });
        setVibes(parsed.vibes ?? []);
        setRows(parsed.rows ?? []);
        setNeeds(
          (parsed.needs ?? []).map((n) =>
            venueStatus === "yes" && /venue/i.test(n.category) && n.state !== "none"
              ? { ...n, state: "booked" as const, vendorName: n.vendorName || venueName?.trim() || undefined }
              : n,
          ),
        );
        setRemoved(parsed.removed ?? []);
        setUndecided(Boolean(parsed.undecided));
        setBuiltFor(parsed.builtFor ?? "");
        setPictures(draft.pictures.map((p, i) => ({ id: p.id, preview: p.url, name: `Inspiration picture ${i + 1}` })));
        setStep(Math.min(draft.step, STEPS.length - 1));
        setResumed(true);
      } catch {
        // An unreadable draft just means starting fresh.
      }
    }
    setRestored(true);
  }, [draft, restored]);

  const chooseCountry = (c: string) => {
    set("country", c);
    // Their money, from where they are, until they choose otherwise.
    if (!form.currencyChosen) {
      const currency = currencyForCountry(c);
      const untouched = form.totalBudget === DEFAULT_EVENT_BUDGET[form.currency];
      const total = untouched ? DEFAULT_EVENT_BUDGET[currency] ?? form.totalBudget : form.totalBudget;
      setForm((f) => ({ ...f, country: c, currency, totalBudget: total }));
      if (untouched && rows.length) setRows((rs) => reweigh(rs, total));
    }
  };

  // A fresh start begins in the country they're in, and so in their money; any draft wins.
  const region = useRegion();
  const prefilled = useRef(false);
  useEffect(() => {
    if (!restored || prefilled.current || !region) return;
    prefilled.current = true;
    const name = countryName(region);
    if (name && !form.country) chooseCountry(name);
  }, [restored, region]);
  const examples = examplesFor(region);

  // Save as they go: a moment after each change, once there is anything worth keeping.
  useEffect(() => {
    if (!restored || finished.current) return;
    if (!form.host.trim() && !form.coHost.trim() && !form.startDate && !form.city.trim()) return;
    const state: DraftState = { form, vibes, rows, needs, removed, undecided, builtFor };
    const payload = {
      name: [form.host.trim(), form.coHost.trim()].filter(Boolean).join(" & "),
      step,
      state: JSON.stringify(state),
      pictures: pictures.map((p) => p.id),
    };
    let pending = true;
    const flush = () => {
      if (!pending || finished.current) return;
      pending = false;
      void saveDraft(payload)
        .then(() => setSaved("saved"))
        .catch(() => setSaved("idle"));
    };
    const timer = setTimeout(flush, 800);
    // Closing the tab mid-pause shouldn't lose the last thing they typed.
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [restored, form, vibes, rows, needs, removed, undecided, builtFor, pictures, step, saveDraft]);

  async function startOver() {
    finished.current = true;
    await discardDraft();
    setForm(BLANK_FORM);
    setVibes([]);
    setRows([]);
    setNeeds([]);
    setRemoved([]);
    setUndecided(false);
    setBuiltFor("");
    setPictures([]);
    setStep(0);
    setResumed(false);
    setSaved("idle");
    finished.current = false;
  }

  const name = useMemo(() => {
    const a = form.host.trim();
    const b = form.coHost.trim();
    const hosts = a && b ? `${a} & ${b}` : a || b;
    // A wedding is known by the hosts' names; anything else says what it is.
    if (form.eventType === "wedding") return hosts || "Our wedding";
    const noun = occasionNoun({ eventType: form.eventType });
    return hosts ? `${hosts}'s ${noun}` : `Our ${noun}`;
  }, [form.host, form.coHost, form.eventType]);

  async function addPictures(files: FileList | null) {
    if (!files?.length) return;
    setPictureError(null);
    const room = MAX_PICTURES - pictures.length;
    const chosen = [...files].filter((f) => f.type.startsWith("image/"));
    if (chosen.length < files.length) setPictureError("Only pictures can be added here.");
    if (chosen.some((f) => f.size > MAX_PICTURE_BYTES)) setPictureError("Pictures need to be under 10 MB each.");
    const ok = chosen.filter((f) => f.size <= MAX_PICTURE_BYTES).slice(0, room);
    if (chosen.length > room) setPictureError(`Up to ${MAX_PICTURES} pictures.`);
    setUploading((n) => n + ok.length);
    await Promise.all(
      ok.map(async (file) => {
        try {
          const res = await fetch(await uploadUrl(), { method: "POST", headers: { "Content-Type": file.type }, body: file });
          if (!res.ok) throw new Error(String(res.status));
          const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
          setPictures((ps) => [...ps, { id: storageId, preview: URL.createObjectURL(file), name: file.name }]);
        } catch {
          setPictureError(`${file.name} didn't upload. Try it again.`);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  }

  const start = form.startDate;
  const end = form.endDate || form.startDate;
  const allocated = rows.reduce((sum, r) => sum + (Number(r.budget) || 0), 0);
  const left = form.totalBudget - allocated;
  const guestPeak = rows.reduce((max, r) => Math.max(max, Number(r.guestCount) || 0), 0);

  // The parts on offer, from the kind of event they chose.
  const isWedding = form.eventType === "wedding";
  const kind = { eventType: form.eventType };
  const part = partWord(kind);
  const people = peopleWord(kind);
  const offer = useMemo(() => typeOffer(form.eventType), [form.eventType]);
  const signature = JSON.stringify({ type: form.eventType, n: offer.length });
  const firstTitles = { officiant: LEAD_TITLE };

  /** Choosing the kind of event fills in every later step, so the defaults path is a few clicks. */
  function buildPlan() {
    const built = rowsForCeremonies(offer, start, end, form.totalBudget, form.guestEstimate);
    setRows(built);
    setNeeds(needsForRows(built, needs, firstTitles));
    setRemoved([]);
    setBuiltFor(signature);
  }

  /** The ceremonies in the plan changed: the needs follow, keeping what they said about each. */
  function changeRows(next: FunctionRow[]) {
    setRows(next);
    setNeeds((prev) => {
      // Matched by key too, so a need they renamed and then removed stays removed.
      const gone = new Set(removed.flatMap((r) => [r.key, r.title.toLowerCase()]));
      const extras = prev.filter((n) => n.key.startsWith("extra-"));
      return [...needsForRows(next, prev, firstTitles).filter((n) => !gone.has(n.key) && !gone.has(n.title.toLowerCase())), ...extras];
    });
  }

  function patchNeed(key: string, patch: Partial<NeedRow>) {
    setNeeds((ns) => ns.map((n) => (n.key === key ? { ...n, ...patch } : n)));
  }

  /** "We're still deciding" pencils in a date a year out rather than blocking them. */
  function pencilInADate(on: boolean) {
    setUndecided(on);
    if (!on) return;
    const iso = addDaysIso(new Date().toISOString().slice(0, 10), 365);
    set("startDate", iso);
    if (rows.length) setRows((rs) => redate(rs, iso, form.endDate || iso));
  }

  const wanted = needs.filter((n) => n.state !== "none");
  const bookedCount = needs.filter((n) => n.state === "booked").length;
  const committedAlready = needs
    .filter((n) => n.state === "booked")
    .reduce((sum, n) => sum + (Number(n.committed) || 0), 0);

  function patchRow(key: string, patch: Partial<FunctionRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const onRows = rows.filter(isOn);
  const canContinue =
    step === 0
      ? Boolean(form.host.trim() && form.startDate && form.city.trim())
      : step === KIND_STEP
        ? offer.length > 0
        : step === CEREMONIES_STEP
          ? onRows.length > 0 && onRows.every((r) => r.name.trim() && r.date)
          : step === BUDGET_STEP
            ? form.totalBudget > 0
            : step === NEEDS_STEP
              ? wanted.length > 0
              : true;

  async function submit() {
    finished.current = true;
    setBusy(true);
    setError(null);
    try {
      const eventId = await create({
        name,
        host: form.host.trim(),
        coHost: form.coHost.trim(),
        startDate: start,
        endDate: end,
        city: form.city.trim(),
        area: form.area.trim() || undefined,
        country: form.country.trim() || undefined,
        currency: form.currency,
        totalBudget: Number(form.totalBudget),
        eventType: form.eventType,
        guestEstimate: form.guestEstimate || undefined,
        helpWith: form.helpWith.length ? form.helpWith : undefined,
        helpNotes: form.helpNotes.trim() || undefined,
        inspirationUrl: form.inspirationUrl.trim() || undefined,
        inspirationNotes: form.inspirationNotes.trim() || undefined,
        inspirationImages: pictures.length ? pictures.map((p) => p.id) : undefined,
        styleVibes: vibes.length ? vibes : undefined,
        stylePalette: form.stylePalette.trim() || undefined,
        styleFormality: form.styleFormality,
        sessions: onRows.map((r) => ({
          name: r.name.trim(),
          date: r.date,
          guestCount: Number(r.guestCount) || 0,
          budget: Number(r.budget) || 0,
          key: r.ceremonyKey,
          significance: r.significance,
          rites: r.rites?.length ? r.rites : undefined,
          kind: r.kind,
        })),
        needs: wanted.length
          ? wanted.map((n) => ({
              category: n.category,
              title: n.title.trim(),
              pct: n.pct,
              sessionNames: n.sessionNames,
              booked: n.state === "booked",
              committed: n.state === "booked" ? Number(n.committed) || undefined : undefined,
              vendorName: n.state === "booked" ? n.vendorName?.trim() || undefined : undefined,
            }))
          : undefined,
      });
      navigate(`/e/${eventId}?welcome=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try once more.");
      finished.current = false;
      setBusy(false);
    }
  }

  // Wait for any saved draft, so nothing typed now gets overwritten by it.
  if (!restored) {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-muted">Loading…</div>;
  }

  const stepState = (i: number) => (i < step ? "done" : i === step ? "now" : "next");
  const STATE_WORD = { done: "Done", now: "Now", next: "Next" } as const;

  return (
    <main id="main" className="mx-auto w-full max-w-[76rem] px-5 py-8 lg:py-10">
      <Link to="/" className="btn-quiet btn-sm gap-1.5 bg-cream">
        <Icon name="arrow" size={15} className="rotate-180" />
        My events
      </Link>
      <h1 className="mt-4 text-[2.2rem] leading-tight">
        Set up <em>{name}</em>
      </h1>

      <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        {/* The steps as a route: where they have been, where they are, what is left. */}
        <nav className="ob-rail hidden lg:block" aria-label="Setup steps">
          <ol className="lg:sticky lg:top-6">
            {STEPS.map((label, i) => {
              const state = stepState(i);
              return (
                <li key={label} className={`ob-step ob-step--${state}`}>
                  <button
                    type="button"
                    className="ob-step__btn"
                    disabled={i > step && rows.length === 0}
                    onClick={() => setStep(i)}
                    aria-current={i === step ? "step" : undefined}
                  >
                    <span className="ob-node" aria-hidden="true">
                      {state === "done" ? <Icon name="check" size={14} /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="ob-step__label">{label}</span>
                      <span className="ob-step__state">
                        {STATE_WORD[state]}
                        {i === FEEL_STEP && " · optional"}
                        <span className="sr-only">, step {i + 1} of {STEPS.length}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0">
          {/* On a phone the route folds into one line. */}
          <div className="lg:hidden">
            <p className="text-sm text-muted" aria-live="polite">
              <span className="tabular-nums">Step {step + 1} of {STEPS.length}</span>
              <span className="mx-1.5 text-quiet" aria-hidden="true">·</span>
              <span className="font-medium text-ink">{STEPS[step]}</span>
              {step === FEEL_STEP && <span className="ml-1 text-xs text-quiet">(optional)</span>}
            </p>
            <div className="ob-progress mt-2.5" aria-hidden="true">
              <span className="ob-progress__fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
          </div>

          {resumed && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-accent-soft/70 px-4 py-3 text-sm lg:mt-0">
              <p>
                <span className="display text-base">Your draft is here.</span>{" "}
                <span className="text-muted">Everything you entered was kept.</span>
              </p>
              <button type="button" className="text-muted underline underline-offset-2 hover:text-accent" onClick={() => void startOver()}>
                Start over
              </button>
            </div>
          )}
          <p className={`text-sm text-quiet ${resumed ? "mt-3" : "mt-4 lg:mt-0"}`}>
            {saved === "saved" ? (
              <span className="mr-3 inline-flex items-center gap-1 text-muted">
                <Icon name="check" size={14} className="text-accent" /> Saved. Come back any time to finish.
              </span>
            ) : null}
            You can change all of this later, from the plan itself.
            {step >= CEREMONIES_STEP && rows.length > 0 && builtFor === signature && step !== FEEL_STEP && (
              <button type="button" className="ml-3 text-accent underline underline-offset-2" onClick={() => setStep(FEEL_STEP)}>
                Use the defaults
              </button>
            )}
          </p>

      <div className="card mt-5 p-6 md:p-7">
        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name" id="pa"><input id="pa" className="input" value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="Anita" /></Field>
            <Field label="Hosting with" id="pb" hint="Optional."><input id="pb" className="input" value={form.coHost} onChange={(e) => set("coHost", e.target.value)} placeholder="Sam" /></Field>
            <Field label="First day" id="sd">
              <input id="sd" type="date" className="input" value={form.startDate} onChange={(e) => { set("startDate", e.target.value); if (rows.length) setRows((rs) => redate(rs, e.target.value, form.endDate || e.target.value)); }} />
            </Field>
            <Field label="Last day" id="ed" hint="Leave blank for a single day.">
              <input id="ed" type="date" className="input" min={form.startDate} value={form.endDate} onChange={(e) => { set("endDate", e.target.value); if (rows.length) setRows((rs) => redate(rs, form.startDate, e.target.value || form.startDate)); }} />
            </Field>
            <label className="flex items-start gap-2.5 text-sm text-muted sm:col-span-2">
              <input type="checkbox" className="mt-1" checked={undecided} onChange={(e) => pencilInADate(e.target.checked)} />
              <span>
                No date fixed yet.
                {undecided && form.startDate && (
                  <span className="block text-xs text-quiet">
                    Pencilled in for {shortDate(form.startDate)} so {BRAND.name} can get going. Change it whenever you like.
                  </span>
                )}
              </span>
            </label>
            <Field label="City" id="city"><input id="city" className="input" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder={examples.city} /></Field>
            <Field label="Neighbourhood" id="area" hint={`Optional. Narrows vendor searches, e.g. ${examples.areaHint}.`}>
              <input id="area" className="input" value={form.area} onChange={(e) => set("area", e.target.value)} placeholder={examples.area} />
            </Field>
            <Field label="Country" id="country">
              <CountrySelect
                id="country"
                value={form.country}
                onChange={chooseCountry}
              />
            </Field>
          </div>
        )}

        {step === KIND_STEP && (
          <div className="grid gap-6">
            <fieldset>
              <legend className="label">Kind of event</legend>
              <p className="-mt-1 text-xs text-quiet">It sets the parts of the day and the vendors {BRAND.name} starts you with.</p>
              {(["family", "work", "other"] as const).map((g) => (
                <div key={g} className="mt-3">
                  <p className="text-xs text-quiet">{g === "family" ? "Family functions" : g === "work" ? "Work and community" : "Something else"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {EVENT_TYPES.filter((t) => t.group === g).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={form.eventType === t.id}
                        title={t.blurb}
                        onClick={() => set("eventType", t.id)}
                        className={`rounded-full px-4 py-2 text-sm transition ${form.eventType === t.id ? "bg-accent text-on-accent" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-accent"}`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          </div>
        )}

        {step === CEREMONIES_STEP && (
          <CeremoniesStep
            eventType={form.eventType}
            rows={rows}
            start={start}
            onToggle={(key, on) => changeRows(reweigh(rows.map((r) => (r.key === key ? { ...r, on } : r)), form.totalBudget))}
            onPatch={(key, patch) => (patch.name !== undefined ? changeRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r))) : patchRow(key, patch))}
            onRemove={(key) => changeRows(reweigh(rows.filter((r) => r.key !== key), form.totalBudget))}
            onMove={(key, dir) => changeRows(moveWithinDay(rows, key, dir))}
            onDate={(key, date) => setRows((rs) => moveToDate(rs, key, date))}
            onAdd={() =>
              changeRows(
                reweigh(
                  [...rows, { key: `own-${Date.now()}`, name: "", date: end || start, guestCount: form.guestEstimate, budget: 0, on: true }],
                  form.totalBudget,
                ),
              )
            }
          />
        )}

        {step === GUESTS_STEP && (
          <div>
            <p className="label">{PeopleWord(kind)} at the biggest gathering</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={`${PeopleWord(kind)} at the biggest gathering`}>
              {GUEST_ESTIMATES.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  aria-pressed={form.guestEstimate === g.value}
                  onClick={() => {
                    set("guestEstimate", g.value);
                    setRows((rs) => reweigh(regroup(rs, g.value), form.totalBudget));
                  }}
                  className={`rounded-full px-4 py-2 text-sm transition ${form.guestEstimate === g.value ? "bg-accent text-paper" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-muted">{`Not every ${part} needs everyone. Adjust any of them below.`}</p>
            <ul className="mt-3 grid gap-2">
              {onRows.map((r) => (
                <li key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-2.5 last:border-0">
                  <span>
                    <span className="display text-lg">{r.name}</span>
                    <span className="ml-2 text-xs text-quiet">{shortDate(r.date)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <input
                      aria-label={`${PeopleWord(kind)} at ${r.name}`}
                      type="number"
                      min={0}
                      step={10}
                      className="input w-28 text-right"
                      value={r.guestCount}
                      onChange={(e) => patchRow(r.key, { guestCount: Number(e.target.value) })}
                    />
                    <span className="text-xs text-quiet">{people}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">The biggest is <strong className="text-ink">{guestPeak} {people}</strong>. Venues and caterers are quoted against that.</p>
          </div>
        )}

        {step === BUDGET_STEP && (
          <div>
            <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
              <Field label="Total budget" id="budget">
                <input
                  id="budget"
                  type="number"
                  min={0}
                  step={500}
                  className="input"
                  value={form.totalBudget}
                  onChange={(e) => {
                    const total = Number(e.target.value);
                    set("totalBudget", total);
                    setRows((rs) => (rs.length ? rebalance(rs, total) : rs));
                  }}
                />
              </Field>
              <Field label="Currency" id="cur">
                <select id="cur" className="input" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value, currencyChosen: true }))}>
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="label mb-0">Split across your functions</p>
              <div className="flex rounded-full bg-cream p-1 shadow-[inset_0_0_0_1px_var(--color-line)]" role="group" aria-label="How to split the budget">
                {([
                  { id: "equal" as const, label: "Equally" },
                  { id: "percent" as const, label: "By %" },
                  { id: "amount" as const, label: "By amount" },
                ]).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={splitMode === m.id}
                    onClick={() => {
                      setSplitMode(m.id);
                      if (m.id === "equal") setRows((rs) => splitEqually(rs, form.totalBudget));
                      if (m.id === "percent" && splitMode === "equal") setRows((rs) => reweigh(rs, form.totalBudget));
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-xs transition ${splitMode === m.id ? "bg-accent text-paper" : "text-muted hover:text-accent"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="mt-2 grid gap-1">
              {onRows.map((r) => {
                const pct = form.totalBudget > 0 ? Math.round((r.budget / form.totalBudget) * 100) : 0;
                return (
                  <li key={r.key} className="grid items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-0 sm:grid-cols-[minmax(0,11rem)_1fr]">
                    <span className="min-w-0">
                      <span className="display block truncate text-lg leading-tight">{r.name}</span>
                      <span className="text-xs text-quiet">{r.guestCount} {people}</span>
                    </span>
                    {splitMode === "percent" ? (
                      <span className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={pct}
                          aria-label={`Share of the budget for ${r.name}`}
                          onChange={(e) => patchRow(r.key, { budget: amountForPercent(Number(e.target.value), form.totalBudget) })}
                          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-accent"
                        />
                        <span className="flex w-16 items-center rounded-[10px] border border-line bg-field px-2 py-1 text-sm">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={pct}
                            aria-label={`Percent for ${r.name}`}
                            onChange={(e) => patchRow(r.key, { budget: amountForPercent(Number(e.target.value), form.totalBudget) })}
                            className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none"
                          />
                          <span className="text-quiet">%</span>
                        </span>
                        <span className="w-24 text-right text-sm tabular-nums text-muted">{money(r.budget, form.currency)}</span>
                      </span>
                    ) : splitMode === "amount" ? (
                      <span className="flex items-center justify-end gap-3">
                        <span className="text-xs tabular-nums text-quiet">{pct}%</span>
                        <input
                          aria-label={`Budget for ${r.name}`}
                          type="number"
                          min={0}
                          step={niceStep(form.totalBudget)}
                          className="input w-36 text-right tabular-nums"
                          value={r.budget}
                          onChange={(e) => patchRow(r.key, { budget: Number(e.target.value) })}
                        />
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-3">
                        <span className="text-xs tabular-nums text-quiet">{pct}%</span>
                        <span className="w-36 text-right text-[0.95rem] tabular-nums">{money(r.budget, form.currency)}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className={`text-sm ${Math.abs(left) < 1 ? "text-muted" : "text-warn"}`}>
                {Math.abs(left) < 1
                  ? "Your split adds up exactly."
                  : left > 0
                    ? `${money(left, form.currency)} (${Math.round((left / form.totalBudget) * 100)}%) left to allocate.`
                    : `${money(-left, form.currency)} over your total.`}
              </p>
              {Math.abs(left) >= 1 && (
                <button type="button" className="btn-quiet btn-sm" onClick={() => setRows((rs) => rebalance(rs, form.totalBudget))}>
                  Fit it to my total
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-quiet">However you leave it, {BRAND.name} scales the split to your total, so you can't get stuck here.</p>
          </div>
        )}

        {step === NEEDS_STEP && (
          <div>
            <p className="text-sm leading-relaxed text-muted">
              Here is everyone {isWedding ? "a wedding like yours" : `${anOccasion(kind)} like this`} usually needs, one of each across the whole event, the venue included. Mark each one Looking, Booked or Not having one. Anything you've booked, {BRAND.name} leaves alone:
              it won't go searching or emailing, and what you've spent counts against your budget straight away.
            </p>

            <ul className="mt-5 divide-y divide-line">
              {needs.map((n) => (
                <li key={n.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <RenameTitle
                      value={n.title}
                      canEdit
                      className={`text-[0.98rem] ${n.state === "none" ? "text-quiet line-through" : ""}`}
                      onSave={(title) => patchNeed(n.key, { title, renamed: true })}
                    />
                    {(() => {
                      // A renamed need still says what kind of vendor it is: "Iyer", then "Officiant".
                      const kind = n.title.trim().toLowerCase() !== n.category.toLowerCase() ? n.category : "";
                      const days = n.sessionNames?.length ? (n.sessionNames.length >= onRows.length ? `Every ${part}` : n.sessionNames.join(" · ")) : "";
                      const line = [kind, days].filter(Boolean).join(" · ");
                      return line ? <p className="mt-0.5 text-xs text-quiet">{line}</p> : null;
                    })()}
                    {n.state === "booked" && (
                      <label className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-quiet">
                        Booked with
                        <input
                          className="input w-56 max-w-full py-1 text-xs"
                          aria-label={`Who you booked for ${n.title}`}
                          placeholder={/venue/i.test(n.category) ? "Venue name, optional" : "Name, optional"}
                          maxLength={120}
                          value={n.vendorName ?? ""}
                          onChange={(e) => patchNeed(n.key, { vendorName: e.target.value })}
                        />
                      </label>
                    )}
                    {n.state === "booked" && (
                      <label className="mt-1.5 flex items-center gap-2 text-xs text-quiet">
                        Already spent
                        <input
                          type="number"
                          min={0}
                          step={100}
                          className="input w-32 py-1 text-right text-xs"
                          aria-label={`What you have already spent on ${n.title}`}
                          placeholder="optional"
                          value={n.committed}
                          onChange={(e) => patchNeed(n.key, { committed: e.target.value === "" ? "" : Number(e.target.value) })}
                        />
                        {form.currency}
                      </label>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 justify-self-start sm:justify-self-end" role="group" aria-label={n.title}>
                    {([
                      { value: "looking" as const, label: "Looking" },
                      { value: "booked" as const, label: "Booked" },
                      { value: "none" as const, label: "Not having one" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={n.state === opt.value}
                        onClick={() => patchNeed(n.key, { state: opt.value })}
                        className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                          n.state === opt.value
                            ? "bg-accent text-paper"
                            : "bg-cream text-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft hover:text-accent"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setNeeds((ns) => ns.filter((x) => x.key !== n.key));
                        setRemoved((rs) => [...rs, n]);
                      }}
                      aria-label={`Remove ${n.title}`}
                      title="Remove from the list"
                      className="ml-1 grid h-8 w-8 place-items-center rounded-full text-quiet transition hover:bg-accent-soft hover:text-accent"
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {(removed.length > 0 || extraNeeds(needs).length > 0) && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="label">Anything else?</p>
                <ul className="flex flex-wrap gap-2">
                  {removed.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        title="Put it back on the list"
                        onClick={() => {
                          setRemoved((rs) => rs.filter((x) => x.key !== r.key));
                          setNeeds((ns) => [...ns, { ...r, state: "looking" }]);
                        }}
                        className="rounded-full bg-cream px-3.5 py-1.5 text-sm text-muted shadow-[inset_0_0_0_1px_var(--color-line)] transition hover:bg-accent-soft hover:text-accent"
                      >
                        + {r.title}
                      </button>
                    </li>
                  ))}
                  {extraNeeds([...needs, ...removed]).map((c) => (
                    <li key={c.title}>
                      <button
                        type="button"
                        onClick={() =>
                          setNeeds((ns) => [
                            ...ns,
                            { key: `extra-${c.title}-${Date.now()}`, category: c.category, title: c.title, sessionNames: onRows.map((r) => r.name), state: "looking", committed: "" },
                          ])
                        }
                        className="rounded-full bg-cream px-3.5 py-1.5 text-sm text-muted shadow-[inset_0_0_0_1px_var(--color-line)] transition hover:bg-accent-soft hover:text-accent"
                      >
                        + {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-5 text-sm text-muted">
              {wanted.length === 0 ? (
                <span className="text-warn">Pick at least one, or there is nothing for {BRAND.name} to go and find.</span>
              ) : (
                <>
                  {BRAND.name} will go looking for{" "}
                  <strong className="text-ink">{wanted.length - bookedCount}</strong>{" "}
                  {wanted.length - bookedCount === 1 ? "vendor" : "vendors"}
                  {bookedCount > 0 && <> and leave the {bookedCount} you've booked alone</>}
                  {committedAlready > 0 && <>, counting {money(committedAlready, form.currency)} as already spent</>}.
                </>
              )}
            </p>
          </div>
        )}

        {step === FEEL_STEP && (
          <div className="grid gap-6">
            <p className="text-sm leading-relaxed text-muted">
              Optional. It shapes the vendors {BRAND.name} looks for and the tone it writes in. Skip straight to{" "}
              <strong className="font-medium text-ink">Build the plan</strong> if you like; it can all be added in Settings.
            </p>
            <div>
              <p className="label">Help with</p>
              <p className="-mt-1 mb-2.5 text-xs text-quiet">Pick any. {BRAND.name} starts with these.</p>
              <ul className="flex flex-wrap gap-2">
                {HELP_WITH.map((t) => {
                  const on = form.helpWith.includes(t.key);
                  return (
                    <li key={t.key}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => set("helpWith", on ? form.helpWith.filter((x) => x !== t.key) : [...form.helpWith, t.key])}
                        className={`rounded-full px-3.5 py-1.5 text-sm transition ${on ? "bg-accent text-paper" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"}`}
                      >
                        {t.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <textarea
                aria-label="A note for PlusOne"
                rows={2}
                className="input mt-2.5 resize-y"
                value={form.helpNotes}
                onChange={(e) => set("helpNotes", e.target.value)}
                placeholder="A note for us, e.g. my parents are in Madurai and want to see every quote"
              />
            </div>
            <div>
              <p className="label">Mood</p>
              <p className="-mt-1 mb-2.5 text-xs text-quiet">Pick any. They shape the vendors {BRAND.name} looks for.</p>
              <ul className="flex flex-wrap gap-2">
                {VIBES.map((vibe) => {
                  const on = vibes.includes(vibe);
                  return (
                    <li key={vibe}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setVibes((vs) => (on ? vs.filter((v) => v !== vibe) : [...vs, vibe]))}
                        className={`rounded-full px-3.5 py-1.5 text-sm transition ${on ? "bg-accent text-paper" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"}`}
                      >
                        {vibe}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <Field label="Colours" id="palette" hint="However you'd describe them.">
              <input id="palette" className="input" value={form.stylePalette} onChange={(e) => set("stylePalette", e.target.value)} placeholder="Sage and cream, with brass" />
            </Field>

            <div>
              <p className="label">Formality</p>
              <div className="flex flex-wrap gap-2">
                {(["relaxed", "smart", "formal"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={form.styleFormality === f}
                    onClick={() => set("styleFormality", f)}
                    className={`rounded-full px-4 py-2 text-sm capitalize transition ${form.styleFormality === f ? "bg-accent text-paper" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-quiet">This sets the tone of the emails {BRAND.name} writes to vendors.</p>
            </div>

            <fieldset className="grid gap-4 rounded-[14px] border border-line p-4 md:p-5">
              <legend className="label px-1">Inspiration</legend>
              <p className="-mt-1 text-xs text-quiet">Share it however is easiest: in words, as a link, as pictures, or all three.</p>
              <Field label="Described" id="insp-notes">
                <textarea
                  id="insp-notes"
                  rows={3}
                  className="input resize-y"
                  value={form.inspirationNotes}
                  onChange={(e) => set("inspirationNotes", e.target.value)}
                  placeholder="Long tables under the trees, lots of lamps, nothing too matchy"
                />
              </Field>
              <Field label="A link" id="insp" hint="A Pinterest board, a blog post or a venue page.">
                <input id="insp" type="url" className="input" value={form.inspirationUrl} onChange={(e) => set("inspirationUrl", e.target.value)} placeholder="https://…" />
              </Field>
              <div>
                <p className="label">Pictures</p>
                <ul className="flex flex-wrap gap-2.5">
                  {pictures.map((p) => (
                    <li key={p.id} className="relative">
                      <img src={p.preview} alt={p.name} className="h-20 w-20 rounded-[10px] border border-line object-cover" />
                      <button
                        type="button"
                        onClick={() => setPictures((ps) => ps.filter((x) => x.id !== p.id))}
                        aria-label={`Remove ${p.name}`}
                        className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-paper text-muted shadow-[inset_0_0_0_1px_var(--color-line)] hover:text-accent"
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </li>
                  ))}
                  {Array.from({ length: uploading }, (_, i) => (
                    <li key={`up-${i}`} className="grid h-20 w-20 place-items-center rounded-[10px] border border-dashed border-line text-xs text-quiet">
                      Adding…
                    </li>
                  ))}
                  {pictures.length + uploading < MAX_PICTURES && (
                    <li>
                      <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-[10px] border border-dashed border-line bg-cream text-center text-xs text-muted transition hover:border-accent hover:bg-accent-soft hover:text-accent focus-within:border-accent">
                        <span className="grid place-items-center gap-1">
                          <Icon name="plus" size={18} />
                          Add
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            void addPictures(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </li>
                  )}
                </ul>
                <p className="mt-1.5 text-xs text-quiet">Up to {MAX_PICTURES}: screenshots, photos, anything you've saved.</p>
                {pictureError && <p role="alert" className="mt-1 text-xs text-bad">{pictureError}</p>}
              </div>
            </fieldset>

            <div className="rounded-[14px] bg-accent-soft/60 p-4 text-sm">
              <p className="display text-base">What happens next</p>
              <ul className="mt-2 grid gap-1 text-muted">
                <li>Your {onRows.length} {partWord(kind, onRows.length !== 1)} appear on their days, each with what it means and a few first things to do.</li>
                <li>An event inbox is created, so every vendor reply comes back to the plan.</li>
                <li>
                  {wanted.length - bookedCount} vendor {wanted.length - bookedCount === 1 ? "need is" : "needs are"} ready to
                  research{bookedCount > 0 ? `, and the ${bookedCount} you've booked are marked as done` : ""}.
                </li>
              </ul>
            </div>
          </div>
        )}

        {error && <p role="alert" className="mt-5 text-sm text-bad">{error}</p>}

        <div className="mt-7 flex items-center justify-between gap-3">
          <button type="button" className="btn-quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!canContinue}
              onClick={() => {
                if (step === 0 && !resumed) record(EVENTS.setupStarted);
                if (step === KIND_STEP && builtFor !== signature) buildPlan();
                setStep((s) => s + 1);
              }}
            >
              Continue <Icon name="arrow" size={17} />
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => void submit()} disabled={busy || uploading > 0 || onRows.length === 0}>
              {busy ? "Building the plan…" : "Build the plan"}
            </button>
          )}
            </div>
          </div>
        </div>
      </div>
      <ThemeFooter className="mt-10" />
    </main>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-quiet">{hint}</p>}
    </div>
  );
}
