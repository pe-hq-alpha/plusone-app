import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { EmptyState } from "../../components/ui/EmptyState";
import { errorText } from "../shared";

type WaitingPhoto = FunctionReturnType<typeof api.marketplace.photos.toCheck>[number];

/** The chip's short word for each flag; the check's full finding sits in the chip's title. */
const FLAG_SHORT: Record<string, string> = {
  stock: "Stock",
  watermark: "Watermark",
  not_event: "Not event work",
  unsafe: "Unsafe",
  faces: "Faces",
};

/**
 * Photos of vendors' work the check flagged (stock, another studio's watermark, not event
 * work, unsafe) or couldn't check, from any listing, verified ones included. Customers see
 * a flagged photo only once a person approves it here. A decided photo leaves the grid.
 */
export function PhotosLane({ photos }: { photos: WaitingPhoto[] }) {
  const review = useMutation(api.marketplace.photos.review);
  const [error, setError] = useState<string | null>(null);

  const decide = (photoId: Id<"vendorPhotos">, decision: "approved" | "removed") => {
    setError(null);
    void review({ photoId, decision }).catch((e) => setError(errorText(e, "That decision didn't save.")));
  };

  if (photos.length === 0) {
    return <EmptyState icon="image" title="Nothing waiting" body="Flagged photos of vendors' work appear here." />;
  }

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Photos to check">
        {photos.map((p) => (
          <li key={p._id} className="card-quiet flex min-w-0 flex-col overflow-hidden">
            {p.url ? (
              <a href={p.url} target="_blank" rel="noreferrer" className="block min-w-0">
                <img src={p.url} alt={p.shows ?? `Work photo from ${p.profileName}`} className="aspect-square w-full object-cover" />
              </a>
            ) : (
              <div className="aspect-square w-full bg-cream" aria-hidden />
            )}
            <div className="grid min-w-0 flex-1 content-start gap-1.5 p-4">
              <p className="truncate text-sm font-medium" title={p.profileName}>
                {p.profileName}
                {p.sample && <span className="chip-quiet ml-2">Sample vendor</span>}
              </p>
              {p.provider && (
                <p className="text-xs text-quiet">Checked by Muse {p.provider === "glimmer" ? "Glimmer" : "Spark"}</p>
              )}
              {p.status === "failed" && <p className="text-sm text-muted">Couldn&apos;t be checked</p>}
              {p.flags.length > 0 && (
                <p className="flex min-w-0 flex-wrap gap-1">
                  {p.flags.map((f) => (
                    <span key={f.key} title={f.text} className={f.key === "faces" ? "chip-quiet" : "chip-warn"}>
                      {FLAG_SHORT[f.key] ?? f.key}
                    </span>
                  ))}
                </p>
              )}
              {p.shows && (
                <p className="truncate text-sm text-muted" title={p.shows}>
                  {p.shows}
                </p>
              )}
              {p.doubt && <p className="break-words text-sm text-muted">Not sure: {p.doubt}</p>}
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" onClick={() => decide(p._id, "approved")}>
                  Approve
                </button>
                <button type="button" className="btn-quiet btn-sm" onClick={() => decide(p._id, "removed")}>
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
