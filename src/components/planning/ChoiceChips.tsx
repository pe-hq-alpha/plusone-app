import { useEffect, useState } from "react";

export type Choice = { id: string; label: string; detail?: string; on?: boolean; suggested?: boolean };
export type Choose = { slot: string; multi: boolean; options: Choice[] };

/**
 * The choices under PlusOne's latest question: a wedding's tradition (one), the events of the
 * day and what's often missed (any number, with room for their own), or the timings agreed.
 * Ticking costs nothing; the host can always answer in their own words instead.
 */
export function ChoiceChips({ choose, busy, onPick }: { choose: Choose; busy: boolean; onPick: (ids: string[], other: string) => void }) {
  const initial = () => new Set(choose.options.filter((o) => o.on).map((o) => o.id));
  const [picked, setPicked] = useState<Set<string>>(initial);
  const [other, setOther] = useState("");
  const [typing, setTyping] = useState(false);
  const key = `${choose.slot}:${choose.options.map((o) => o.id).join(",")}`;
  // A new question starts from its own ticks.
  useEffect(() => {
    setPicked(initial());
    setOther("");
    setTyping(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ownWords = choose.slot === "events" || choose.slot === "missed";
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (id === "none") return next.has("none") ? new Set() : new Set(["none"]);
      next.delete("none");
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!choose.multi) {
    return (
      <div className="pc-choose" role="group" aria-label="Choose one">
        <div className="pc-choose__chips">
          {choose.options.map((o) =>
            o.id === "other" ? (
              <button key={o.id} type="button" className="pc-chip" aria-pressed={typing} disabled={busy} onClick={() => setTyping(true)}>
                {o.label}
              </button>
            ) : (
              <button key={o.id} type="button" className={`pc-chip${o.id === "ok" ? " pc-chip--go" : ""}`} disabled={busy} onClick={() => onPick([o.id], "")} title={o.detail}>
                {o.label}
              </button>
            ),
          )}
        </div>
        {typing && (
          <form
            className="pc-choose__own"
            onSubmit={(e) => {
              e.preventDefault();
              if (other.trim()) onPick(["other"], other);
            }}
          >
            <input className="input" autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="In your own words" aria-label="In your own words" maxLength={200} />
            <button type="submit" className="btn-primary btn-sm" disabled={busy || !other.trim()}>
              Done
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="pc-choose" role="group" aria-label="Tick any that apply">
      <ul className="pc-choose__list">
        {choose.options.map((o) => (
          <li key={o.id}>
            <button type="button" className="pc-tick" aria-pressed={picked.has(o.id)} disabled={busy} onClick={() => toggle(o.id)}>
              <span className="pc-tick__box" aria-hidden="true" />
              <span className="min-w-0">
                <span className="pc-tick__label">
                  {o.label}
                  {o.suggested && <span className="pc-tick__tag">suggested</span>}
                </span>
                {o.detail && <span className="pc-tick__detail">{o.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {ownWords && (
        <input
          className="input mt-3"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder={choose.slot === "events" ? "Add your own, separated by commas" : "Anything else, separated by commas"}
          aria-label="Add your own"
          maxLength={200}
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary btn-sm" disabled={busy || (!picked.size && !other.trim())} onClick={() => onPick([...picked], other)}>
          {picked.size || other.trim() ? "Done" : "Tick at least one"}
        </button>
        <span className="text-xs text-quiet">Or answer in your own words below.</span>
      </div>
    </div>
  );
}
