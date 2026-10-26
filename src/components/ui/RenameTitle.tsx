import { useEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { Icon } from "./Icon";

/** Matches MAX_SLOT_TITLE in convex/slots.ts. */
const MAX_LENGTH = 60;

/**
 * A need's name with a pencil beside it, for calling a vendor what the family calls
 * them ("Officiant" becomes "Iyer"). Enter or leaving the field saves; Esc puts it back.
 */
export function RenameTitle({
  value,
  onSave,
  canEdit,
  as: Tag = "p",
  className = "",
}: {
  value: string;
  /** Throw to keep the field open with the message shown. */
  onSave: (next: string) => Promise<void> | void;
  canEdit: boolean;
  as?: "h2" | "p";
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Set once Enter or Esc has closed the field, so the blur that follows does nothing. */
  const settled = useRef(false);
  const saving = useRef(false);
  const refocus = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      pencil.current?.focus();
    }
  }, [editing]);

  function open() {
    setDraft(value);
    setError(null);
    settled.current = false;
    setEditing(true);
  }

  function close(viaKeyboard: boolean) {
    settled.current = true;
    refocus.current = viaKeyboard;
    setError(null);
    setEditing(false);
  }

  async function commit(viaKeyboard: boolean) {
    if (settled.current || saving.current) return;
    const next = draft.trim();
    if (next === value) return close(viaKeyboard);
    if (!next) {
      // Leaving an empty field puts the old name back; Enter asks for one.
      if (!viaKeyboard) return close(false);
      setError("Give it a name.");
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      await onSave(next);
      close(viaKeyboard);
    } catch (e) {
      setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't save. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <Tag className={`min-w-0 ${className}`}>{value}</Tag>
        {canEdit && (
          <button
            ref={pencil}
            type="button"
            onClick={open}
            aria-label={`Rename ${value}`}
            title="Rename"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-quiet transition hover:bg-accent-soft hover:text-accent"
          >
            <Icon name="pen" size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <input
        ref={input}
        aria-label={`New name for ${value}`}
        aria-invalid={error ? true : undefined}
        maxLength={MAX_LENGTH}
        value={draft}
        readOnly={busy}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close(true);
          }
        }}
        onBlur={() => void commit(false)}
        className={`w-full max-w-md rounded-[10px] border border-accent bg-field px-2 py-0.5 text-ink focus:outline-none focus:shadow-[0_0_0_3px_var(--color-accent-soft)] ${className}`}
      />
      {error && <p role="alert" className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
