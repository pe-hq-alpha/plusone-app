import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * "Are you sure?" in PlusOne's own dialog instead of the browser's: one provider at the root,
 * and `await confirm({...})` wherever something is about to be removed or stopped.
 * Escape, Cancel or a click outside the card all answer no.
 */
export type ConfirmAsk = {
  /** The question, e.g. "Are you sure you want to remove this need?" */
  title: string;
  /** What happens next, in a sentence, e.g. "Its budget goes back to the rest of the plan." */
  body?: string;
  /** The button that does it, e.g. "Remove need". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Removing or stopping something: the confirm button is drawn as a warning. */
  danger?: boolean;
};

type Confirm = (ask: ConfirmAsk) => Promise<boolean>;

// Outside the provider (a test rendering one component), fall back to the browser's own question.
const ConfirmContext = createContext<Confirm>(async (ask) => window.confirm(ask.body ? `${ask.title}\n\n${ask.body}` : ask.title));

export function useConfirm(): Confirm {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<ConfirmAsk | null>(null);
  const resolver = useRef<((yes: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    // A second question while one is open answers the first with no.
    resolver.current?.(false);
    setAsk(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((yes: boolean) => {
    resolver.current?.(yes);
    resolver.current = null;
    setAsk(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {ask && <ConfirmCard ask={ask} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmCard({ ask, onAnswer }: { ask: ConfirmAsk; onAnswer: (yes: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const answered = useRef(false);
  const reply = (yes: boolean) => {
    if (answered.current) return;
    answered.current = true;
    onAnswer(yes);
  };

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby="confirm-h"
      aria-describedby={ask.body ? "confirm-body" : undefined}
      // Escape closes the dialog: that is a no.
      onCancel={(e) => {
        e.preventDefault();
        reply(false);
      }}
      // A click on the dimmed page around the card (the dialog element itself) is a no.
      onClick={(e) => {
        if (e.target === e.currentTarget) reply(false);
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[22px] border border-line bg-cream p-0 text-ink shadow-[0_40px_80px_-30px_rgb(var(--shadow-rgb)/0.45)] backdrop:bg-[var(--color-scrim)] backdrop:backdrop-blur-[3px]"
    >
      <div className="p-5 md:p-6">
        <h2 id="confirm-h" className="display text-xl leading-snug">{ask.title}</h2>
        {ask.body && (
          <p id="confirm-body" className="mt-2 text-sm leading-relaxed text-muted">
            {ask.body}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          {/* The safe answer has the focus, so Enter never removes anything by accident. */}
          <button type="button" className="btn-quiet btn-sm" autoFocus onClick={() => reply(false)}>
            {ask.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={
              ask.danger
                ? "btn btn-sm bg-bad-bg text-bad shadow-[inset_0_0_0_1px_var(--color-bad)] hover:bg-bad hover:text-paper"
                : "btn-primary btn-sm"
            }
            onClick={() => reply(true)}
          >
            {ask.confirmLabel ?? "Yes"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
