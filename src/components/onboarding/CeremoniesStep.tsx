import { shortDate } from "../../lib/format";
import { Icon } from "../ui/Icon";
import { dayNeighbour, isOn, type FunctionRow } from "./shared";
import type { EventType } from "../../../convex/lib/validators";
import { partWord } from "../../../convex/lib/occasion";
import { PartWord } from "../../lib/words";

/**
 * The parts of the event: everything the kind of event offers, in the order it happens. The
 * usual ones are in already; the rest are a tick away and keep their meaning and their
 * place. Each can be renamed and moved, and they can add their own.
 */
export function CeremoniesStep({
  rows,
  start,
  onToggle,
  onPatch,
  onRemove,
  onMove,
  onDate,
  onAdd,
  eventType,
}: {
  rows: FunctionRow[];
  start: string;
  onToggle: (key: string, on: boolean) => void;
  onPatch: (key: string, patch: Partial<FunctionRow>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onDate: (key: string, date: string) => void;
  onAdd: () => void;
  /** What kind of event this is, so its parts are called ceremonies, sessions or functions. */
  eventType?: EventType;
}) {
  const inPlan = rows.filter(isOn).length;
  const kind = { eventType };
  const part = partWord(kind);
  return (
    <div>
      <p className="text-sm leading-relaxed text-muted">
        Laid out day by day. Switch off any you don't need, rename or move them, and add your own.
      </p>
      <ul className="mt-5 divide-y divide-line">
        {rows.map((r) => {
          const on = isOn(r);
          return (
            <li key={r.key} className={`grid grid-cols-[auto_1fr] gap-x-3 py-3.5 ${on ? "" : "opacity-80"}`}>
              <input
                type="checkbox"
                className="mt-2.5 h-4 w-4 accent-accent"
                checked={on}
                disabled={on && inPlan <= 1}
                onChange={(e) => onToggle(r.key, e.target.checked)}
                aria-label={on ? `Remove ${r.name || `this ${part}`} from your plan` : `Add ${r.name || `this ${part}`} to your plan`}
              />
              <div className="min-w-0">
                <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto]">
                  {on ? (
                    <input aria-label={`${PartWord(kind)} name`} className="input" value={r.name} onChange={(e) => onPatch(r.key, { name: e.target.value })} placeholder="Name it" />
                  ) : (
                    <p className="display text-lg leading-tight text-muted">
                      {r.name}
                      <span className="ml-2 font-sans text-xs text-quiet">Often held</span>
                    </p>
                  )}
                  {on && (
                    <span className="flex items-center gap-1.5">
                      <input
                        aria-label={`Date for ${r.name}`}
                        type="date"
                        className="input w-[10.5rem]"
                        value={r.date}
                        min={start}
                        onChange={(e) => onDate(r.key, e.target.value)}
                      />
                      {([-1, 1] as const).map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-accent-soft hover:text-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
                          disabled={!dayNeighbour(rows, r.key, dir)}
                          onClick={() => onMove(r.key, dir)}
                          aria-label={`Move ${r.name || `this ${part}`} ${dir < 0 ? "earlier" : "later"}`}
                          title={dir < 0 ? "Move earlier in the day" : "Move later in the day"}
                        >
                          <Icon name={dir < 0 ? "up" : "down"} size={16} />
                        </button>
                      ))}
                      {!r.ceremonyKey && (
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-accent-soft hover:text-accent"
                          onClick={() => onRemove(r.key)}
                          aria-label={`Remove ${r.name || `this ${part}`}`}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {r.significance && (
                  <p className="mt-1.5 max-w-[46rem] text-sm leading-relaxed text-quiet">
                    {r.significance}
                    {r.rites?.length ? (
                      <span className="block pt-0.5">Includes {r.rites.map((x) => x.name).join(", ")}.</span>
                    ) : null}
                  </p>
                )}
                {!on && r.date && <p className="mt-1 text-xs text-quiet">Usually {shortDate(r.date)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-quiet btn-sm mt-3" onClick={onAdd}>
        <Icon name="plus" size={15} /> Add a {part}
      </button>
      <p className="mt-4 text-sm text-muted">
        <strong className="text-ink">{inPlan}</strong> {partWord(kind, inPlan !== 1)} in your plan.
      </p>
    </div>
  );
}
