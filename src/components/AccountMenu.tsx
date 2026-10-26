import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthActions } from "../lib/session";
import type { Role } from "../../convex/lib/validators";
import { Icon } from "./ui/Icon";
import { ThemeSwitch } from "./ui/ThemeSwitch";
import { UserChip } from "./ui/UserChip";

const ROLE_LINE: Record<Role, string> = {
  owner: "You're the owner of this event",
  planner: "You're a planner on this event",
  viewer: "You can view this event",
};

/**
 * The person's chip, top right of the plan, opening a small menu: what they are on this
 * event, their account, and signing out. A plain disclosure rather than an ARIA menu:
 * the items are an ordinary link and button, reached with Tab.
 */
export function AccountMenu({ role }: { role: Role }) {
  const { signOut } = useAuthActions();
  const { pathname } = useLocation();
  // Open only on the page it was opened on, so moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpenOn(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div
      ref={wrap}
      className="relative min-w-0"
      // Tabbing past the last item closes it too.
      onBlur={(e) => {
        if (open && e.relatedTarget && !wrap.current?.contains(e.relatedTarget as Node)) setOpenOn(null);
      }}
    >
      <UserChip
        className="max-w-[8.5rem] hover:shadow-[inset_0_0_0_1px_var(--color-accent)] sm:max-w-[13rem]"
        button={{
          ref: button,
          title: "Your account",
          "aria-expanded": open,
          "aria-controls": id,
          onClick: () => setOpenOn(open ? null : pathname),
        }}
      />
      <div
        id={id}
        hidden={!open}
        className="card absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2.5rem)] p-1.5"
      >
        <p className="px-3 pb-2.5 pt-2 text-xs text-quiet">{ROLE_LINE[role]}</p>
        <div className="border-t border-line pt-1.5">
          <Link
            to="/account"
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-ink transition hover:bg-accent-soft hover:text-accent"
          >
            <Icon name="settings" size={17} className="text-muted" />
            Account
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm text-ink transition hover:bg-accent-soft hover:text-accent"
          >
            <Icon name="signout" size={17} className="text-muted" />
            Sign out
          </button>
        </div>
        <div className="mt-1.5 border-t border-line px-2 pb-1 pt-2.5">
          <p className="mb-1.5 px-1 text-xs text-quiet">Appearance</p>
          <ThemeSwitch className="w-full" />
        </div>
      </div>
    </div>
  );
}
