import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { usePrivacy } from "../lib/privacy";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type Role = "owner" | "planner" | "viewer";

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message.replace(/^.*ConvexError: /, "").split("\n")[0] : fallback;

/** "in 6 days", "tomorrow", "today": when a link stops working. */
function expiresIn(at: number): string {
  const days = Math.floor((at - Date.now()) / 86_400_000);
  if (days >= 2) return `in ${days} days`;
  return days === 1 ? "tomorrow" : "today";
}

export function MembersPage() {
  const privacy = usePrivacy();
  const { event, role } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const me = useQuery(api.users.me);
  const members = useQuery(api.members.list, { eventId })?.map((m) => ({
    _id: m.member._id,
    userId: m.member.userId,
    role: m.member.role,
    relationship: m.member.relationship,
    name: m.user?.name,
    email: m.user?.email,
  }));
  const canInvite = role === "owner" || role === "planner";
  const open = useQuery(api.invites.listOpen, canInvite ? { eventId } : "skip");
  const createInvite = useMutation(api.invites.create);
  const revoke = useMutation(api.invites.revoke);
  const setRole = useMutation(api.members.setRole);
  const remove = useMutation(api.members.remove);
  const setRelationship = useMutation(api.members.setRelationship);
  const [inviteRole, setInviteRole] = useState<Role>("planner");
  const [email, setEmail] = useState("");
  const [who, setWho] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: Id<"members">; text: string } | null>(null);

  async function invite() {
    setError(null);
    try {
      const { token } = await createInvite({ eventId, role: inviteRole, email: email.trim() || undefined, relationship: who.trim() || undefined });
      setLink(`${window.location.origin}/join/${token}`);
      setCopied(false);
      setEmail("");
      setWho("");
    } catch (e) {
      setError(errorText(e, "That invite didn't go through. Try again."));
    }
  }

  function saveRelationship() {
    if (!editing) return;
    const { id, text } = editing;
    setEditing(null);
    setRelationship({ memberId: id, relationship: text }).catch((e) => setError(errorText(e, "That didn't save.")));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl">People</h1>
        <p className="text-sm text-muted">Some plan, some just watch, and everyone sees changes the moment they happen.</p>
      </header>

      {canInvite && (
        <section className="card p-5" data-tour="invite">
          <h2 className="text-lg">Invite someone</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className="input" type="email" placeholder="Email (optional, we'll send the link)" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Invitee email" />
            <input className="input" placeholder="Who they are, e.g. Priya's mother" value={who} maxLength={60} onChange={(e) => setWho(e.target.value)} aria-label="Who they are" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} aria-label="Role">
              <option value="planner">Planner: can edit and send</option>
              <option value="viewer">Viewer: read only</option>
            </select>
            <button className="btn-primary" onClick={() => void invite()}>Create link</button>
          </div>
          <p className="mt-2 text-xs text-quiet">
            A link works once, for 7 days.{email.trim() ? " It only works for someone signed in with that email address." : ""}
          </p>
          {role === "owner" && (
            <p className="mt-1 text-xs text-quiet">
              Someone who shouldn't need an account?{" "}
              <Link to={`/e/${event._id}/print`} className="underline hover:text-accent">Share a read-only summary instead</Link>.
            </p>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
          {link && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-sand p-3 text-sm">
              <code className="min-w-0 flex-1 truncate">{link}</code>
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(link).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          {open && open.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-medium">Waiting to be used</h3>
              <ul className="mt-1 divide-y divide-line">
                {open.map((i) => (
                  <li key={i._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p>{i.relationship ?? (i.email ? privacy.email(i.email) : "Anyone with the link")}</p>
                      <p className="text-xs text-muted">
                        {[i.relationship && i.email && privacy.email(i.email), i.role, `expires ${expiresIn(i.expiresAt)}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {i.canCancel && (
                      <button className="text-xs text-bad hover:underline" onClick={() => void revoke({ inviteId: i._id })}>
                        Cancel
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-lg">Who's here</h2>
        {members === undefined ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {members.map((m) => {
              const canDescribe = role === "owner" || m.userId === me?._id;
              return (
                <li key={m._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{m.name ?? privacy.email(m.email) ?? "Member"}</p>
                    {editing?.id === m._id ? (
                      <input
                        autoFocus
                        className="input mt-1 py-1 text-xs"
                        value={editing.text}
                        maxLength={60}
                        placeholder="e.g. Arjun's sister"
                        aria-label="Who they are"
                        onChange={(e) => setEditing({ id: m._id, text: e.target.value })}
                        onBlur={saveRelationship}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRelationship();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                    ) : (
                      <p className="text-xs text-muted">
                        {[m.relationship, m.name && m.email && privacy.email(m.email)].filter(Boolean).join(" · ")}
                        {canDescribe && (
                          <button
                            className={`${m.relationship || (m.name && m.email) ? "ml-1 " : ""}text-accent hover:underline`}
                            onClick={() => setEditing({ id: m._id, text: m.relationship ?? "" })}
                          >
                            {m.relationship ? "Edit" : "Add who they are"}
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {role === "owner" && m.role !== "owner" ? (
                      <>
                        <select className="input w-auto py-1 text-xs" value={m.role} onChange={(e) => void setRole({ memberId: m._id, role: e.target.value as Role })} aria-label={`Role for ${m.name ?? "member"}`}>
                          <option value="planner">planner</option>
                          <option value="viewer">viewer</option>
                        </select>
                        <button className="text-xs text-bad hover:underline" onClick={() => void remove({ memberId: m._id })}>Remove</button>
                      </>
                    ) : (
                      <span className="chip bg-sand text-muted">{m.role}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
