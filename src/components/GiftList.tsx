import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { money } from "../lib/format";
import { Icon } from "./ui/Icon";

type Gifts = NonNullable<NonNullable<FunctionReturnType<typeof api.site.bySlug>>["gifts"]>;

const shopName = (link: string) => {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "the shop";
  }
};

/**
 * The host's gift list as a guest sees it, on the website or on their own RSVP link.
 * With `onChoose`, a guest can say they'll bring a gift (or let it go again); without it,
 * the list only shows what's still free.
 */
export function GiftList({
  gifts,
  onChoose,
  busy,
}: {
  gifts: Gifts;
  onChoose?: (giftId: Id<"gifts">, choose: boolean) => void;
  busy?: Id<"gifts"> | null;
}) {
  return (
    <section>
      <h2 className="display text-2xl">Gifts</h2>
      {gifts.noGifts ? (
        <p className="mt-3 leading-relaxed text-muted">Your presence is the only gift we'd ask for. Please, no gifts.</p>
      ) : (
        <>
          {gifts.cashNote && <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{gifts.cashNote}</p>}
          {gifts.items.length > 0 && (
            <>
              <p className="mt-3 text-sm text-muted">
                {onChoose
                  ? "If you'd like to bring something from our list, choose it here so nobody brings the same thing."
                  : "If you'd like to bring something from our list, choose it from the personal RSVP link we sent you, so nobody brings the same thing."}
              </p>
              <ul className="mt-5 grid gap-3">
                {gifts.items.map((g) => (
                  <li key={g._id} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[16px] bg-cream px-5 py-4 ring-1 ${g.mine ? "ring-accent" : "ring-line"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="display text-lg">{g.title}</span>
                        {g.price !== undefined && <span className="text-xs text-quiet">about {money(g.price, gifts.currency)}</span>}
                      </p>
                      {g.note && <p className="mt-0.5 text-sm text-muted">{g.note}</p>}
                      {g.link && (
                        <a href={g.link} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-accent underline">
                          See it at {shopName(g.link)} <Icon name="external" size={12} />
                        </a>
                      )}
                    </div>
                    {g.mine ? (
                      <div className="flex items-center gap-2">
                        <span className="chip-ok">You're bringing this</span>
                        {onChoose && (
                          <button type="button" className="text-xs text-quiet underline hover:text-accent disabled:opacity-50" disabled={busy === g._id} onClick={() => onChoose(g._id, false)}>
                            Undo
                          </button>
                        )}
                      </div>
                    ) : g.taken ? (
                      <span className="chip-quiet">Someone's bringing this</span>
                    ) : onChoose ? (
                      <button type="button" className="btn-ghost btn-sm" disabled={busy === g._id} onClick={() => onChoose(g._id, true)}>
                        I'll bring this
                      </button>
                    ) : (
                      <span className="chip-pending">Still free</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
