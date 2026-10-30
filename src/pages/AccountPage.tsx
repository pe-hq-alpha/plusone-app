import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useClerk } from "@clerk/react";
import { useAuthActions } from "../lib/session";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Icon } from "../components/ui/Icon";
import { MASKED_EMAIL, setHideEmails, useHideEmails, usePrivacy } from "../lib/privacy";
import { BRAND } from "../lib/brand";
import { ThemeSwitch } from "../components/ui/ThemeSwitch";

/** Everything about you rather than about one event: your name, how you sign in, privacy. */
export function AccountPage() {
  const me = useQuery(api.users.me);
  const setName = useMutation(api.users.setName);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { signOut } = useAuthActions();
  const clerk = useClerk();
  const privacy = usePrivacy();
  const hide = useHideEmails();
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  if (me === undefined) return <main id="main" className="page px-5 py-10 text-muted">Loading…</main>;
  const name = draft ?? me?.name ?? "";
  const isGuest = !me?.email && !me?.name;

  return (
    <main id="main" className="page px-5 py-10 md:px-8">
      <Link to="/" className="btn-quiet btn-sm gap-1.5 bg-cream">
        <Icon name="arrow" size={15} className="rotate-180" />
        My events
      </Link>
      <h1 className="mt-4 text-[2.2rem] leading-tight">Your <em>account</em></h1>
      <p className="mt-1 text-sm text-muted">Your details, not any one event's. Vendors never see any of this.</p>

      <section className="card mt-6 p-6 md:p-7" aria-labelledby="name-h">
        <h2 id="name-h" className="display text-xl">Your name</h2>
        <p className="mt-1 text-sm text-muted">
          Shown at the top of {BRAND.name} and beside everything you do, so the people you plan with see a name rather than
          an email address.
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setState("saving");
            void setName({ name })
              .then(() => setState("saved"))
              .catch(() => setState("idle"));
          }}
        >
          <input
            className="input max-w-[20rem]"
            value={name}
            onChange={(e) => {
              setDraft(e.target.value);
              setState("idle");
            }}
            placeholder="Anita"
            aria-label="Your name"
          />
          <button type="submit" className="btn-primary btn-sm" disabled={state === "saving" || !name.trim()}>
            {state === "saving" ? "Saving…" : "Save"}
          </button>
          <span aria-live="polite" className="self-center text-sm text-muted">{state === "saved" ? "Saved." : ""}</span>
        </form>
      </section>

      <section className="card mt-5 p-6 md:p-7" aria-labelledby="signin-h">
        <h2 id="signin-h" className="display text-xl">How you sign in</h2>
        {isGuest ? (
          <p className="mt-1 text-sm text-muted">
            You're in the demo, so there's nothing to sign in with. Plan your own event and you can
            create an account then.
          </p>
        ) : (
          <>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Email</span>
              <span className="font-mono text-[0.95rem]">{privacy.email(me?.email) ?? "—"}</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Change your password or email, or sign in with Google as well, from your sign-in settings.
            </p>
            <button type="button" onClick={() => clerk.openUserProfile()} className="btn-quiet btn-sm mt-3 mr-2 bg-cream">
              Sign-in settings
            </button>
          </>
        )}
        <button onClick={() => void signOut()} className="btn-quiet btn-sm mt-4 gap-1.5">
          <Icon name="signout" size={15} />
          Sign out
        </button>
      </section>

      {!isGuest && <WhatsAppUpdates />}

      <section className="card mt-5 p-6 md:p-7" aria-labelledby="privacy-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[36rem]">
            <h2 id="privacy-h" className="display text-xl">Hide email addresses</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Shows every email address as {MASKED_EMAIL}: yours, your guests', your vendors', and any inside emails and
              activity. Handy when you're sharing your screen or recording. It only changes what this browser shows.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hide}
            aria-labelledby="privacy-h"
            onClick={() => setHideEmails(!hide)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${hide ? "bg-accent" : "bg-line"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-paper shadow transition-all ${hide ? "left-6" : "left-1"}`} />
          </button>
        </div>
      </section>

      <section className="card mt-5 p-6 md:p-7" aria-labelledby="appearance-h">
        <h2 id="appearance-h" className="display text-xl">Appearance</h2>
        <p className="mt-1 text-sm text-muted">Light, dark, or whatever this device is set to. Kept in this browser.</p>
        <ThemeSwitch className="mt-4" />
      </section>

      <section className="card mt-5 p-6 md:p-7" aria-labelledby="delete-account-h">
        <h2 id="delete-account-h" className="display text-xl">Delete your account</h2>
        <p className="mt-1 max-w-[40rem] text-sm leading-relaxed text-muted">
          This deletes your account and every event you own on your own, with their vendors, emails, guests and files.
          Your chats with the assistant, your feedback and the log of your visits go too. Events you share with another
          owner, or were invited to, stay for the others and you are removed from them. It cannot be undone.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm.trim().toUpperCase() !== "DELETE") return;
            setDeleting(true);
            setDeleteError(null);
            void deleteAccount({ confirm })
              // The sign-in goes too, so nothing is left to sign in to; then a clean page.
              .then(() => clerk.user?.delete().catch(() => clerk.signOut()))
              .then(() => window.location.assign("/"))
              .catch((err: unknown) => {
                setDeleteError(err instanceof Error ? err.message : "That couldn't be deleted. Try again.");
                setDeleting(false);
              });
          }}
        >
          <div className="min-w-[12rem]">
            <label className="label" htmlFor="delete-account-confirm">Type DELETE to confirm</label>
            <input id="delete-account-confirm" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </div>
          <button type="submit" className="btn bg-bad text-paper hover:opacity-90" disabled={confirm.trim().toUpperCase() !== "DELETE" || deleting}>
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </form>
        {deleteError && <p role="alert" className="mt-3 text-sm text-bad">{deleteError}</p>}
      </section>
    </main>
  );
}

/**
 * Vendor updates on WhatsApp: asked for here, with the number and a plain promise of what
 * will be sent. Off by a press here or by replying STOP on WhatsApp.
 */
function WhatsAppUpdates() {
  const mine = useQuery(api.whatsapp.mine);
  const optIn = useMutation(api.whatsapp.optIn);
  const optOut = useMutation(api.whatsapp.optOut);
  const [number, setNumber] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (mine === undefined) return null;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setNumber("");
      setAgree(false);
    } catch (e) {
      const data = (e as { data?: unknown }).data;
      setError(typeof data === "string" ? data : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mt-5 p-6 md:p-7" aria-labelledby="whatsapp-h">
      <h2 id="whatsapp-h" className="display text-xl">Vendor updates on WhatsApp</h2>
      <p className="mt-1 max-w-[36rem] text-sm leading-relaxed text-muted">
        When a vendor sends a quote for one of your events, {BRAND.name} messages you on WhatsApp with a link to compare it. Only
        that: no marketing. Reply STOP on WhatsApp, or turn it off here, any time.
      </p>
      {mine.number ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="chip-ok">On for {mine.number}</span>
          <button type="button" className="btn-quiet btn-sm" disabled={busy} onClick={() => void run(() => optOut({}))}>
            Turn off
          </button>
        </div>
      ) : (
        <form
          className="mt-4 grid max-w-[36rem] gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (agree && number.trim()) void run(() => optIn({ number }));
          }}
        >
          <input className="input" inputMode="tel" aria-label="Your WhatsApp number" placeholder="+91 98400 12345" value={number} onChange={(e) => setNumber(e.target.value)} />
          <label className="flex items-start gap-2 text-sm text-muted">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            Send me vendor updates for my events on WhatsApp, from {BRAND.name}, through Meta&rsquo;s WhatsApp.
          </label>
          <button className="btn-primary w-fit" disabled={busy || !agree || !number.trim()}>
            {busy ? "Saving…" : "Turn on"}
          </button>
        </form>
      )}
      {!mine.available && <p className="mt-2 text-xs text-quiet">Updates start going out once {BRAND.name}&rsquo;s WhatsApp number is live.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-bad">{error}</p>}
    </section>
  );
}
