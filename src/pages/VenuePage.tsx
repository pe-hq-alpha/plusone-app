import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useOutletContext } from "react-router-dom";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { readyToUpload } from "../lib/pictures";
import { drawVenue, LOOKS, type DrawParts } from "../lib/venueLooks";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type Part = "backdrop" | "stage";
const say = (e: unknown, fallback: string) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback);

/** The widest the photo is drawn at; the canvas is shown at the page's width. */
const DRAW_WIDTH = 1600;

/**
 * "See it on your venue": the hall's own photo with the stage and the wall behind it
 * found and cut out, dressed in a look, so a decorator's quote is judged against a
 * picture of the real space. A tap re-picks a part.
 */
export function VenuePage() {
  const { event, role } = useOutletContext<EventData>();
  const eventId = event._id as Id<"events">;
  const canEdit = role !== "viewer";
  const view = useQuery(api.venueView.get, { eventId });
  const generateUploadUrl = useMutation(api.venueView.generateUploadUrl);
  const setPhoto = useMutation(api.venueView.setPhoto);
  const useSample = useMutation(api.venueView.useSample);
  const tap = useMutation(api.venueView.tap);

  const [lookKey, setLookKey] = useState(LOOKS[0].key);
  const [after, setAfter] = useState(true);
  const [picking, setPicking] = useState<Part>("backdrop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhotoImage] = useState<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // The photo is loaded once per address; the drawing redraws over it on every change.
  useEffect(() => {
    if (!view?.url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPhotoImage(img);
    img.src = view.url;
  }, [view?.url]);

  const look = LOOKS.find((l) => l.key === lookKey) ?? LOOKS[0];
  const parts: DrawParts = {
    ...(view?.parts.backdrop ? { backdrop: view.parts.backdrop } : {}),
    ...(view?.parts.stage ? { stage: view.parts.stage } : {}),
  };
  const hasParts = Boolean(parts.backdrop || parts.stage);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !photo || !view) return;
    const scale = Math.min(1, DRAW_WIDTH / view.width);
    el.width = Math.round(view.width * scale);
    el.height = Math.round(view.height * scale);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    drawVenue(ctx, photo, { width: view.width, height: view.height, scale }, parts, look, after && hasParts, !after && hasParts);
    // parts is rebuilt from view on each render, so view stands in for it here.
  }, [photo, view, look, after, hasParts]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    void work()
      .catch((e) => setError(say(e, fallback)))
      .finally(() => setBusy(false));
  };

  const addPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    run(async () => {
      const blob = await readyToUpload(file, 2000);
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      const url = await generateUploadUrl({ eventId });
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || file.type }, body: blob });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await setPhoto({ eventId, storageId, ...size });
      setAfter(true);
    }, "That photo didn't go through. Try another, or try again.");
  };

  const onTap = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!view || !canEdit || view.status === "finding") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * view.width;
    const y = ((e.clientY - rect.top) / rect.height) * view.height;
    setAfter(false);
    run(() => tap({ eventId, part: picking, x, y }), "That tap didn't go through. Try again.");
  };

  const photoButton = (label: string) => (
    <label className={`btn-quiet btn-sm cursor-pointer bg-cream ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {label}
      <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={addPhoto} disabled={busy} />
    </label>
  );

  return (
    <div className="max-w-[56rem]">
      <h1 className="text-[2.2rem] leading-tight">
        See it on your <em>venue</em>
      </h1>
      <p className="mt-1 text-sm text-muted">
        Add a photo of the hall. We find the stage and the wall behind it, then show them dressed in the look you choose, so you can judge decorators&apos; quotes against your own space.
      </p>

      {view === undefined ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : view === null ? (
        <div className="card mt-6 p-6">
          <p className="text-sm text-muted">Take it from the back of the hall, with the whole stage in view.</p>
          {canEdit ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {photoButton("Add a photo of your hall")}
              <button type="button" className="btn-quiet btn-sm" disabled={busy} onClick={() => run(() => useSample({ eventId }), "That didn't start. Try again.")}>
                Try the sample hall
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">A planner can add the hall&apos;s photo.</p>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          <div className="relative min-w-0 overflow-hidden rounded-xl border border-line bg-cream">
            <canvas
              ref={canvas}
              onClick={onTap}
              className={`block h-auto w-full ${canEdit && view.status !== "finding" ? "cursor-crosshair" : ""}`}
              aria-label={after && hasParts ? `The hall dressed in ${look.name}` : "The hall photo"}
              role="img"
            />
            {view.status === "finding" && (
              <p role="status" className="absolute inset-x-0 bottom-0 bg-paper/85 px-4 py-2 text-sm text-ink">
                Finding the stage…
              </p>
            )}
          </div>

          {view.status === "none" && (
            <p className="text-sm text-muted">We couldn&apos;t find a stage in this photo. Choose Backdrop below and tap the wall where it should go.</p>
          )}
          {view.status === "failed" && <p className="text-sm text-muted">That didn&apos;t work this time. Tap the photo to pick the stage, or add the photo again.</p>}
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Look">
            {LOOKS.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={l.key === lookKey}
                className={l.key === lookKey ? "btn-primary btn-sm" : "btn-quiet btn-sm"}
                onClick={() => {
                  setLookKey(l.key);
                  setAfter(true);
                }}
              >
                {l.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button type="button" className="btn-quiet btn-sm" disabled={!hasParts} onClick={() => setAfter((a) => !a)}>
              {after ? "Show the hall as it is" : "Show the look"}
            </button>
            {canEdit && (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-muted">Tap the photo to pick the</span>
                {(["backdrop", "stage"] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={picking === p} className={picking === p ? "chip-pending" : "chip-quiet"} onClick={() => setPicking(p)}>
                    {p === "backdrop" ? "Backdrop" : "Stage"}
                  </button>
                ))}
              </span>
            )}
          </div>

          <p className="text-xs text-quiet">
            A sketch on your own hall, to compare decorators against. Their work will look different.
            {view.sample && " The sample hall is our own photo, not a real venue."}
          </p>

          <div className="flex flex-wrap gap-2">
            {canEdit && photoButton(view.sample ? "Use a photo of your hall" : "Use another photo")}
            <Link to={`/e/${eventId}/decisions`} className="btn-quiet btn-sm">
              Compare decorators&apos; quotes
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
