import { useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CURRENCIES, VIBES } from "../components/onboarding/shared";
import { PageHeader } from "../components/ui/PageHeader";
import { CountrySelect } from "../components/ui/CountrySelect";
import { BRAND } from "../lib/brand";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type Formality = "relaxed" | "smart" | "formal";

export function SettingsPage() {
  const { event, role } = useOutletContext<EventData>();
  const update = useMutation(api.events.update);
  const canEdit = role !== "viewer";

  const [form, setForm] = useState({
    name: event.name,
    host: event.host,
    coHost: event.coHost,
    startDate: event.startDate,
    endDate: event.endDate,
    city: event.city,
    area: event.area ?? "",
    country: event.country ?? "",
    currency: event.currency,
    totalBudget: event.totalBudget,
    stylePalette: event.stylePalette ?? "",
    styleFormality: (event.styleFormality ?? "smart") as Formality,
    inspirationUrl: event.inspirationUrl ?? "",
    inspirationNotes: event.inspirationNotes ?? "",
    sendMode: (event.sendMode ?? "auto") as "auto" | "review",
  });
  const [vibes, setVibes] = useState<string[]>(event.styleVibes ?? []);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm((f) => ({ ...f, [k]: v })); setState("idle"); };

  async function save() {
    setState("saving");
    setError(null);
    try {
      await update({
        eventId: event._id as Id<"events">,
        patch: {
          name: form.name.trim(),
          host: form.host.trim(),
          coHost: form.coHost.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          city: form.city.trim(),
          area: form.area.trim(),
          country: form.country.trim(),
          currency: form.currency,
          totalBudget: Number(form.totalBudget),
          stylePalette: form.stylePalette.trim(),
          styleFormality: form.styleFormality,
          styleVibes: vibes,
          inspirationUrl: form.inspirationUrl.trim(),
          inspirationNotes: form.inspirationNotes.trim(),
          sendMode: form.sendMode,
        },
      });
      setState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
      setState("idle");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[46rem]">
      <PageHeader title="Event settings" meta="Everything you told us at the start, and anything you've changed your mind about since." />

      <section className="card p-6 md:p-7">
        <h2 className="display text-xl">The event</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name" id="s-name"><input id="s-name" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} disabled={!canEdit} /></Field>
          <Field label="City" id="s-city"><input id="s-city" className="input" value={form.city} onChange={(e) => set("city", e.target.value)} disabled={!canEdit} /></Field>
          <Field label="Host" id="s-pa"><input id="s-pa" className="input" value={form.host} onChange={(e) => set("host", e.target.value)} disabled={!canEdit} /></Field>
          <Field label="Co-host" id="s-pb"><input id="s-pb" className="input" value={form.coHost} onChange={(e) => set("coHost", e.target.value)} disabled={!canEdit} /></Field>
          <Field label="First day" id="s-sd"><input id="s-sd" type="date" className="input" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={!canEdit} /></Field>
          <Field label="Last day" id="s-ed"><input id="s-ed" type="date" className="input" min={form.startDate} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={!canEdit} /></Field>
          <Field label="Neighbourhood" id="s-area" hint="Narrows vendor searches to one part of the city.">
            <input id="s-area" className="input" value={form.area} onChange={(e) => set("area", e.target.value)} disabled={!canEdit} placeholder="Indiranagar" />
          </Field>
          <Field label="Country" id="s-country"><CountrySelect id="s-country" value={form.country} onChange={(c) => set("country", c)} disabled={!canEdit} /></Field>
        </div>
      </section>

      <section className="card mt-5 p-6 md:p-7">
        <h2 className="display text-xl">The budget</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="Total budget" id="s-budget" hint="Changing this re-spreads the split across your functions.">
            <input id="s-budget" type="number" min={0} step={500} className="input" value={form.totalBudget} onChange={(e) => set("totalBudget", Number(e.target.value))} disabled={!canEdit} />
          </Field>
          <Field label="Currency" id="s-cur">
            <select id="s-cur" className="input" value={form.currency} onChange={(e) => set("currency", e.target.value)} disabled={!canEdit}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="card mt-5 p-6 md:p-7">
        <h2 className="display text-xl">The feel</h2>
        <p className="mt-1 text-sm text-muted">This shapes how vendors are searched for and how {BRAND.name} writes to them.</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {VIBES.map((vibe) => {
            const on = vibes.includes(vibe);
            return (
              <li key={vibe}>
                <button
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={on}
                  onClick={() => { setVibes((vs) => (on ? vs.filter((v) => v !== vibe) : [...vs, vibe])); setState("idle"); }}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition ${on ? "bg-accent text-paper" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"}`}
                >
                  {vibe}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 grid gap-4">
          <Field label="Colours" id="s-palette"><input id="s-palette" className="input" value={form.stylePalette} onChange={(e) => set("stylePalette", e.target.value)} disabled={!canEdit} placeholder="Sage and cream, with brass" /></Field>
          <div>
            <p className="label">How formal?</p>
            <div className="flex flex-wrap gap-2">
              {(["relaxed", "smart", "formal"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={form.styleFormality === f}
                  onClick={() => set("styleFormality", f)}
                  className={`rounded-full px-4 py-2 text-sm capitalize transition ${form.styleFormality === f ? "bg-accent text-paper" : "bg-cream text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <Field label="Inspiration link" id="s-insp" hint="A Pinterest board, a blog post or a venue page.">
            <input id="s-insp" type="url" className="input" value={form.inspirationUrl} onChange={(e) => set("inspirationUrl", e.target.value)} disabled={!canEdit} placeholder="https://…" />
          </Field>
          <Field label="In your words" id="s-notes" hint="Anything a vendor should know about the look and feel.">
            <textarea id="s-notes" rows={3} className="input resize-y" value={form.inspirationNotes} onChange={(e) => set("inspirationNotes", e.target.value)} disabled={!canEdit} placeholder="Long tables under the olive trees, lots of candles, nothing too matchy" />
          </Field>
        </div>
      </section>

      <section className="card mt-5 p-6 md:p-7">
        <h2 className="display text-xl">The emails</h2>
        <p className="mt-1 text-sm text-muted">
          Once you have confirmed a shortlist, who presses send.
        </p>
        <div className="mt-4 grid gap-3">
          {([
            {
              value: "auto" as const,
              title: `${BRAND.name} sends them`,
              body: "You confirm the shortlist once, having seen who is being written to and one letter in full. Everything after that — sending, chasing anyone who goes quiet, reading the replies into quotes — happens without you.",
            },
            {
              value: "review" as const,
              title: "Let me read each email first",
              body: "Every letter is shown before anything is sent, and you can change any of it.",
            },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={!canEdit}
              aria-pressed={form.sendMode === opt.value}
              onClick={() => set("sendMode", opt.value)}
              className={`rounded-[14px] border px-5 py-4 text-left transition ${
                form.sendMode === opt.value ? "border-accent bg-accent-soft/50" : "border-line bg-cream hover:bg-accent-soft/30"
              }`}
            >
              <span className="block font-medium">{opt.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">{opt.body}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="mt-5 text-sm text-muted">
        Your own name, sign-in and privacy live on <Link to="/account" className="text-accent underline underline-offset-2">your account page</Link>.
      </p>

      {error && <p role="alert" className="mt-4 text-sm text-bad">{error}</p>}

      {canEdit && (
        <div className="mt-6 flex items-center gap-4">
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save changes"}
          </button>
          <span aria-live="polite" className="text-sm text-muted">{state === "saved" ? "Saved." : ""}</span>
        </div>
      )}

      <WeeklyUpdate eventId={event._id as Id<"events">} />
      {role === "owner" && <YourData eventId={event._id as Id<"events">} name={event.name} />}
      {role === "owner" && <DeleteEvent eventId={event._id} name={event.name} />}
    </div>
  );
}

/** Each person's own weekly update email: on or off, and this week's preview. */
function WeeklyUpdate({ eventId }: { eventId: Id<"events"> }) {
  const [now] = useState(() => Date.now());
  const data = useQuery(api.digest.preview, { eventId, now });
  const set = useMutation(api.digest.setDigest);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <section className="card mt-5 p-6 md:p-7" aria-labelledby="digest-h" data-tour="weekly-update">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[34rem]">
          <h2 id="digest-h" className="display text-xl">Weekly update</h2>
          <p className="mt-1 text-sm text-muted">A short email each Friday: what's coming up, what changed and anything waiting on you. Quiet weeks send nothing. It's just for you; everyone planning chooses their own.</p>
        </div>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={data.on} onChange={(e) => void set({ eventId, on: e.target.checked })} />
          Send it to me
        </label>
      </div>
      <button type="button" className="btn-quiet btn-sm mt-4" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide this week's" : "Preview this week's"}
      </button>
      {open &&
        (data.email ? (
          <div className="mt-3 overflow-hidden rounded-[14px] ring-1 ring-line">
            <p className="bg-cream px-4 py-2 text-xs text-muted">Subject: {data.email.subject}</p>
            <iframe title="This week's update" srcDoc={data.email.html} sandbox="" className="h-[32rem] w-full bg-paper" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Nothing to say this week, so nothing would be sent.</p>
        ))}
    </section>
  );
}

/** Everything in the event as one file, to keep or to take elsewhere. Owner only. */
function YourData({ eventId, name }: { eventId: Id<"events">; name: string }) {
  const convex = useConvex();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  async function download() {
    setState("busy");
    try {
      const data = await convex.query(api.exports.event, { eventId });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}-data.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setState("idle");
    } catch {
      setState("error");
    }
  }
  return (
    <section className="card mt-5 flex flex-wrap items-center justify-between gap-4 p-6 md:p-7" aria-labelledby="data-h">
      <div className="max-w-[34rem]">
        <h2 id="data-h" className="display text-xl">Your data</h2>
        <p className="mt-1 text-sm text-muted">Everything in this event in one file: the days, vendors, every email, quotes, the budget, the people invited, to-dos and Spaces.</p>
        {state === "error" && <p role="alert" className="mt-2 text-sm text-bad">That didn't download. Try again.</p>}
      </div>
      <button type="button" className="btn-quiet" onClick={() => void download()} disabled={state === "busy"}>
        {state === "busy" ? "Getting it ready…" : "Download our data"}
      </button>
    </section>
  );
}

/** Owner only. The name has to be typed, because this cannot be undone. */
function DeleteEvent({ eventId, name }: { eventId: Id<"events">; name: string }) {
  const navigate = useNavigate();
  const remove = useMutation(api.events.remove);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  return (
    <section className="card mt-10 p-6 md:p-7" aria-labelledby="delete-h">
      <h2 id="delete-h" className="display text-xl">Delete this event</h2>
      <p className="mt-1 max-w-[40rem] text-sm leading-relaxed text-muted">
        This removes the event for everyone on it: its days, vendors, emails, quotes, guests and uploaded files. Vendors
        you have already written to are not told. It cannot be undone.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!matches) return;
          setBusy(true);
          setError(null);
          // Leave first. The event stops being ours the instant the delete lands, and a
          // page still showing it would fail on every query it has open.
          const deleting = remove({ eventId, confirmName: typed });
          navigate("/", { replace: true });
          void deleting.catch((err: unknown) => console.error("The event could not be deleted", err));
        }}
      >
        <div className="min-w-[16rem] flex-1">
          <label className="mb-1.5 block text-sm text-muted" htmlFor="delete-name">Type <span className="font-medium text-ink">{name}</span> to confirm</label>
          <input id="delete-name" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <button type="submit" className="btn bg-bad text-paper hover:opacity-90" disabled={!matches || busy}>
          {busy ? "Deleting…" : "Delete event"}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
    </section>
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
