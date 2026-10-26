import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { picturesIn, readyToUpload } from "../../lib/pictures";
import { Icon } from "../ui/Icon";
import { BRAND } from "../../lib/brand";
import { spaceLabel } from "../../lib/spaces";

export type SpaceItem = FunctionReturnType<typeof api.spaces.list>[number];
export type Palette = FunctionReturnType<typeof api.spaces.suggestPalette>[number];
type Color = { name: string; hex: string };
/** Where something can live: the event's own Space (no session) or a session's. */
export type SpaceRef = { sessionId?: Id<"sessions">; name: string };

const SOURCE: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", pinterest: "Pinterest", youtube: "YouTube" };

const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};
const sourceLabel = (i: SpaceItem) => (i.source && SOURCE[i.source]) || i.preview?.siteName || hostOf(i.url);
const say = (e: unknown) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't work. Try again.");

/** Pictures sit in columns, read left to right; narrow places get fewer. */
function useColumns(max: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(2);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (w: number) => setN(Math.min(max, w < 520 ? 2 : w < 820 ? 3 : 4));
    fit(el.clientWidth);
    const ro = new ResizeObserver(([e]) => fit(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return [ref, n] as const;
}

/**
 * One Space: the pictures and links a host keeps for the event as a whole, or for
 * one part of it, in the order they choose. Each sits like a print with a small label
 * beneath. Drag to reorder; open one to see it large, caption it or move it.
 */
export function SpaceView({
  eventId,
  sessionId,
  ceremony,
  items,
  canEdit,
  spaces,
  catchPaste = false,
  maxColumns = 4,
  palette,
}: {
  eventId: Id<"events">;
  sessionId?: Id<"sessions">;
  /** The ceremony's name, for a ceremony's Space. */
  ceremony?: string;
  items: SpaceItem[];
  canEdit: boolean;
  /** Every Space an item can move to: the event's and each session's. */
  spaces: SpaceRef[];
  /** Paste anywhere on the page to add: on for a page that shows a single Space. */
  catchPaste?: boolean;
  maxColumns?: number;
  /** The palette kept so far, and what keeping a suggested one does. */
  palette?: { kept?: { value: string; colors?: Color[] }; keep: (p: Palette) => Promise<unknown> };
}) {
  const uploadUrl = useMutation(api.spaces.generateUploadUrl);
  const addPictures = useMutation(api.spaces.addPictures);
  const addLink = useMutation(api.spaces.addLink);
  const reorder = useMutation(api.spaces.reorder).withOptimisticUpdate((store, args) => {
    const all = store.getQuery(api.spaces.list, { eventId: args.eventId });
    if (!all) return;
    const at = new Map(args.ids.map((id, i) => [id, i]));
    store.setQuery(
      api.spaces.list,
      { eventId: args.eventId },
      all.map((i) => (at.has(i._id) ? { ...i, order: at.get(i._id)! } : i)),
    );
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SpaceItem | null>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [columnsRef, columns] = useColumns(maxColumns);
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const label = spaceLabel(ceremony);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function upload(files: File[]) {
    if (!files.length || !canEdit) return;
    setError(null);
    setBusy(files.length === 1 ? "Adding your picture…" : `Adding ${files.length} pictures…`);
    try {
      const ids: Id<"_storage">[] = [];
      for (const file of files.slice(0, 20)) {
        const blob = await readyToUpload(file);
        const res = await fetch(await uploadUrl({ eventId }), { method: "POST", headers: { "Content-Type": blob.type || file.type }, body: blob });
        if (!res.ok) throw new Error("upload");
        ids.push(((await res.json()) as { storageId: Id<"_storage"> }).storageId);
      }
      await addPictures({ eventId, sessionId, storageIds: ids });
    } catch (e) {
      setError(e instanceof Error && e.message === "upload" ? "A picture didn't upload. Try again." : say(e));
    } finally {
      setBusy(null);
    }
  }

  async function addFromText(text: string): Promise<boolean> {
    if (!text.trim() || !canEdit) return false;
    setError(null);
    try {
      await addLink({ eventId, sessionId, text });
      return true;
    } catch (e) {
      setError(say(e));
      return false;
    }
  }

  // Paste a link or a picture anywhere on the page (but not into a text box).
  useEffect(() => {
    if (!catchPaste || !canEdit) return;
    function onPaste(e: ClipboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable=true]")) return;
      const files = picturesIn(e.clipboardData?.files);
      if (files.length) {
        e.preventDefault();
        void upload(files);
        return;
      }
      const text = e.clipboardData?.getData("text") ?? "";
      if (/https?:\/\//i.test(text)) {
        e.preventDefault();
        void addFromText(text);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = sorted.map((i) => i._id);
    const next = arrayMove(ids, ids.indexOf(active.id as Id<"spaceItems">), ids.indexOf(over.id as Id<"spaceItems">));
    void reorder({ eventId, sessionId, ids: next });
  }

  const pick = () => fileInput.current?.click();
  const hasPictures = sorted.some((i) => i.imageUrl);
  const cols = Array.from({ length: columns }, (_, c) => sorted.filter((_, i) => i % columns === c));

  return (
    <div
      ref={columnsRef}
      onDragOver={(e) => {
        if (canEdit && [...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const files = picturesIn(e.dataTransfer.files);
        if (files.length) {
          e.preventDefault();
          void upload(files);
        }
      }}
      className="relative min-w-0"
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void upload(picturesIn(e.target.files));
          e.target.value = "";
        }}
      />

      {sorted.length === 0 ? (
        <EmptySpace ceremony={ceremony} canEdit={canEdit} busy={busy !== null} onPick={pick} onLink={addFromText} inputId={`space-link-${sessionId ?? "whole"}`} />
      ) : (
        <>
          {canEdit && <AddBar busy={busy !== null} onPick={pick} onLink={addFromText} inputId={`space-link-${sessionId ?? "whole"}`} />}
          {(busy || error) && <Note busy={busy} error={error} />}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            {/* Tiles stay put while one is carried; the one it would land on is marked. */}
            <SortableContext items={sorted.map((i) => i._id)} strategy={() => null}>
              <ul className="mt-6 flex items-start gap-4 sm:gap-6" aria-label={`Kept in ${label}`}>
                {cols.map((col, c) => (
                  <li key={c} className="min-w-0 flex-1">
                    <ul className="grid gap-6 sm:gap-8">
                      {col.map((item) => (
                        <Tile key={item._id} item={item} canEdit={canEdit} onOpen={() => setOpen(item)} />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {canEdit && sorted.length > 1 && (
            <p className="mt-6 text-xs text-quiet">Drag to change the order, or press and hold on a phone. Drop pictures anywhere here to add them.</p>
          )}
        </>
      )}
      {sorted.length === 0 && (busy || error) && <Note busy={busy} error={error} />}

      {palette && (hasPictures || palette.kept) && (
        <PaletteMoment eventId={eventId} sessionId={sessionId} ceremony={ceremony} canEdit={canEdit && hasPictures} target={palette} />
      )}

      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[18px] border border-dashed border-accent/60 bg-paper/85">
          <p className="display text-xl text-accent">Let go to add them to {label}</p>
        </div>
      )}

      {open && <Lightbox item={items.find((i) => i._id === open._id) ?? open} label={label} canEdit={canEdit} spaces={spaces} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Note({ busy, error }: { busy: string | null; error: string | null }) {
  return (
    <p role={error ? "alert" : "status"} className={`mt-3 text-sm ${error ? "text-bad" : "text-muted"}`}>
      {error ?? busy}
    </p>
  );
}

/** Paste a link, or choose pictures: the two ways in. */
function LinkField({ onLink, inputId, autoFocus = false }: { onLink: (text: string) => Promise<boolean>; inputId: string; autoFocus?: boolean }) {
  const [link, setLink] = useState("");
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-line bg-field py-1 pl-4 pr-1 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]"
      onSubmit={(e) => {
        e.preventDefault();
        void onLink(link).then((ok) => ok && setLink(""));
      }}
    >
      <Icon name="link" size={16} className="shrink-0 text-quiet" />
      <label className="sr-only" htmlFor={inputId}>Paste a link</label>
      <input
        id={inputId}
        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-ink placeholder:text-quiet focus:outline-none"
        placeholder="Paste a link from Instagram, Pinterest, TikTok or any page"
        value={link}
        autoFocus={autoFocus}
        onChange={(e) => setLink(e.target.value)}
        inputMode="url"
      />
      <button type="submit" className="btn-sm h-8 shrink-0 rounded-full px-4 text-xs font-medium text-accent transition hover:bg-accent-soft disabled:opacity-40" disabled={!link.trim()}>
        Add
      </button>
    </form>
  );
}

function AddBar({ busy, onPick, onLink, inputId }: { busy: boolean; onPick: () => void; onLink: (text: string) => Promise<boolean>; inputId: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <LinkField onLink={onLink} inputId={inputId} />
      <button type="button" className="btn-ghost btn-sm h-10 shrink-0" onClick={onPick} disabled={busy}>
        <Icon name="image" size={15} /> Add pictures
      </button>
    </div>
  );
}

/** What a Space is for, and the two ways to start one. */
function EmptySpace({
  ceremony,
  canEdit,
  busy,
  onPick,
  onLink,
  inputId,
}: {
  ceremony?: string;
  canEdit: boolean;
  busy: boolean;
  onPick: () => void;
  onLink: (text: string) => Promise<boolean>;
  inputId: string;
}) {
  if (!canEdit) return <p className="py-6 text-sm text-muted">Nothing has been kept in this Space yet.</p>;
  return (
    <div className="grid items-center gap-8 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] md:gap-12">
      <div className="min-w-0">
        <h3 className="display text-[1.55rem] leading-tight">
          {ceremony ? <>How should the {ceremony} <em>feel</em>?</> : <>Start with how it should <em>feel</em></>}
        </h3>
        <p className="mt-2 max-w-[34rem] text-sm leading-relaxed text-muted">
          A Space gathers the look of {ceremony ? `the ${ceremony}` : "the whole event"}: photos from your phone, posts you saved on Instagram or
          Pinterest, the page of a venue you keep going back to. Once a few pictures are here, it can suggest a palette from them.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="button" className="btn-primary btn-sm h-10 shrink-0 px-5" onClick={onPick} disabled={busy}>
            <Icon name="image" size={15} /> Add pictures
          </button>
          <LinkField onLink={onLink} inputId={inputId} />
        </div>
        <p className="mt-3 text-xs text-quiet">On your phone, share a post to {BRAND.name} and choose this Space. You can also drop pictures here.</p>
      </div>
      <div aria-hidden="true" className="hidden items-end justify-center gap-3 md:flex">
        <span className="h-36 w-20 -rotate-2 rounded-[8px] border border-dashed border-rule bg-field/60" />
        <span className="h-44 w-24 rotate-1 rounded-[8px] border border-dashed border-rule bg-field/60" />
        <span className="h-28 w-20 rotate-3 rounded-[8px] border border-dashed border-rule bg-field/60" />
      </div>
    </div>
  );
}

/** One kept thing, set like a print on the wall with its label beneath. */
function Tile({ item, canEdit, onOpen }: { item: SpaceItem; canEdit: boolean; onOpen: () => void }) {
  const drag = useSortable({ id: item._id, disabled: !canEdit });
  const refresh = useMutation(api.spaces.refreshPreview);
  const [broken, setBroken] = useState(false);
  const pending = item.kind === "link" && item.previewStatus === "pending";
  const showImage = item.imageUrl && !broken;
  const linkTitle = item.kind === "link" ? item.preview?.title || (item.source && SOURCE[item.source] ? `${SOURCE[item.source]} post` : hostOf(item.url)) : undefined;
  const words = item.caption || linkTitle;
  const meta = item.kind === "link" ? [sourceLabel(item), item.preview?.author].filter(Boolean).join(" · ") : undefined;
  const marked = drag.isOver && !drag.isDragging;
  return (
    <li
      ref={drag.setNodeRef}
      style={{ transform: CSS.Translate.toString(drag.transform), transition: drag.transition }}
      className={`min-w-0 ${drag.isDragging ? "relative z-20 opacity-80" : ""}`}
    >
      <figure>
        <button
          type="button"
          {...drag.attributes}
          {...drag.listeners}
          onClick={onOpen}
          aria-label={`${item.kind === "link" ? `Link from ${sourceLabel(item)}` : "Picture"}${words ? `: ${words}` : ""}. Open`}
          className={`group block w-full touch-manipulation rounded-[6px] bg-field p-1.5 text-left shadow-[0_16px_32px_-22px_rgb(var(--shadow-rgb)/0.5)] ring-1 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-22px_rgb(var(--shadow-rgb)/0.55)] sm:p-2 ${
            marked ? "ring-2 ring-accent" : "ring-line"
          }`}
        >
          {showImage ? (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => {
                setBroken(true);
                // A link's preview picture can expire; ask for it again, once.
                if (item.kind === "link" && canEdit && item.previewStatus === "ready") void refresh({ itemId: item._id }).catch(() => {});
              }}
              className="block max-h-[30rem] min-h-24 w-full rounded-[3px] bg-cream object-cover"
            />
          ) : (
            <span className="grid aspect-[4/5] w-full place-items-center rounded-[3px] bg-accent-soft/50 p-4 text-center">
              <span>
                <Icon name={item.kind === "link" ? "link" : "image"} size={22} className="mx-auto text-accent" />
                <span className="display mt-2 block text-base leading-snug text-ink">{pending ? "Finding its picture…" : linkTitle || sourceLabel(item) || "A picture"}</span>
              </span>
            </span>
          )}
        </button>
        {(words || meta) && (
          <figcaption className="mt-2.5 border-l border-rule pl-2.5">
            {words && <span className="display line-clamp-3 block text-base leading-snug text-ink">{words}</span>}
            {meta && <span className="mt-0.5 block truncate text-[0.8rem] uppercase tracking-[0.1em] text-quiet">{meta}</span>}
          </figcaption>
        )}
      </figure>
    </li>
  );
}

function Lightbox({ item, label, canEdit, spaces, onClose }: { item: SpaceItem; label: string; canEdit: boolean; spaces: SpaceRef[]; onClose: () => void }) {
  const update = useMutation(api.spaces.update);
  const remove = useMutation(api.spaces.remove);
  const [caption, setCaption] = useState(item.caption ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = () => {
    if ((item.caption ?? "") !== caption.trim()) void update({ itemId: item._id, caption }).catch((e) => setError(say(e)));
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-[3px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.kind === "link" ? `A link kept in ${label}` : `A picture in ${label}`}
        className="relative grid max-h-[92svh] w-full max-w-[46rem] overflow-y-auto rounded-[22px] bg-paper p-4 shadow-[0_40px_80px_-30px_rgb(var(--shadow-rgb)/0.45)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-paper/90 text-ink shadow-sm hover:text-accent">
          <Icon name="close" size={16} />
        </button>
        <div className="rounded-[8px] bg-field p-2 ring-1 ring-line">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.caption ?? ""} referrerPolicy="no-referrer" className="max-h-[60svh] w-full rounded-[4px] bg-cream object-contain" />
          ) : (
            <div className="grid h-48 place-items-center rounded-[4px] bg-accent-soft/60">
              <Icon name={item.kind === "link" ? "link" : "image"} size={34} className="text-accent" />
            </div>
          )}
        </div>
        {item.kind === "link" && (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-[0.1em] text-quiet">{sourceLabel(item)}{item.preview?.author ? ` · ${item.preview.author}` : ""}</p>
            {item.preview?.title && <p className="display mt-1 text-xl leading-snug">{item.preview.title}</p>}
            {item.preview?.description && <p className="mt-1 line-clamp-3 text-sm text-muted">{item.preview.description}</p>}
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-quiet btn-sm mt-3">
                Open on {sourceLabel(item)} <Icon name="external" size={14} />
              </a>
            )}
          </div>
        )}
        {canEdit ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1 text-sm">
              <span className="label">Caption</span>
              <input className="input py-2 text-sm" value={caption} maxLength={300} placeholder="What you love about it" onChange={(e) => setCaption(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />
            </label>
            {spaces.length > 1 && (
              <label className="grid gap-1 text-sm">
                <span className="label">Kept in</span>
                <select
                  className="input py-2 text-sm"
                  value={item.sessionId ?? ""}
                  onChange={(e) => void update({ itemId: item._id, moveTo: (e.target.value || null) as Id<"sessions"> | null }).catch((err) => setError(say(err)))}
                >
                  {spaces.map((b) => (
                    <option key={b.sessionId ?? "whole"} value={b.sessionId ?? ""}>{b.sessionId ? `${b.name}'s Space` : "The event's Space"}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ) : (
          item.caption && <p className="display mt-5 text-lg">{item.caption}</p>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
        {canEdit &&
          (confirming ? (
            <div role="group" aria-label="Confirm" className="mt-5 flex flex-wrap items-center gap-2 rounded-[12px] bg-accent-soft/60 px-3 py-2.5">
              <span className="mr-auto text-sm">{item.kind === "link" ? "Take this link out of the Space?" : "Delete this picture? It can't be brought back."}</span>
              <button
                type="button"
                className="btn-sm rounded-full bg-accent px-4 text-sm font-medium text-paper hover:bg-accent-deep"
                onClick={() => void remove({ itemId: item._id }).then(onClose, (e) => { setError(say(e)); setConfirming(false); })}
              >
                {item.kind === "link" ? "Take it out" : "Delete"}
              </button>
              <button type="button" className="btn-quiet btn-sm" onClick={() => setConfirming(false)}>Keep it</button>
            </div>
          ) : (
            <button type="button" className="mt-5 justify-self-start text-sm text-bad underline underline-offset-2 hover:opacity-80" onClick={() => setConfirming(true)}>
              {item.kind === "link" ? "Take it out of this Space" : "Delete this picture"}
            </button>
          ))}
      </div>
    </div>
  );
}

/** A palette as paint chips: each colour a tall swatch with its name and value beneath. */
function Swatches({ colors, size = "lg" }: { colors: Color[]; size?: "lg" | "sm" }) {
  return (
    <ul className="flex min-w-0 gap-1.5 sm:gap-2" aria-label={colors.map((c) => c.name).join(", ")}>
      {colors.map((c) => (
        <li key={c.hex + c.name} className="min-w-0 flex-1">
          <span className={`block w-full rounded-[6px] ring-1 ring-black/5 ${size === "lg" ? "h-16 sm:h-24" : "h-8"}`} style={{ background: c.hex }} />
          {size === "lg" && (
            <>
              <span className="display mt-1.5 block truncate text-[0.95rem] leading-tight text-ink">{c.name}</span>
              <span className="block truncate text-[0.8rem] uppercase tracking-[0.08em] text-quiet">{c.hex}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Read the Space's pictures for a palette; the one kept becomes the session's (or the event's). */
export function PaletteMoment({
  eventId,
  sessionId,
  ceremony,
  canEdit,
  target,
}: {
  eventId: Id<"events">;
  sessionId?: Id<"sessions">;
  ceremony?: string;
  canEdit: boolean;
  target: { kept?: { value: string; colors?: Color[] }; keep: (p: Palette) => Promise<unknown> };
}) {
  const suggest = useAction(api.spaces.suggestPalette);
  const [palettes, setPalettes] = useState<Palette[] | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "saving">("idle");
  const [keptNow, setKeptNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const whose = ceremony ? `the ${ceremony}` : "the event";

  async function read() {
    setError(null);
    setKeptNow(null);
    setState("reading");
    try {
      setPalettes(await suggest({ eventId, sessionId }));
    } catch (e) {
      setError(say(e));
    } finally {
      setState("idle");
    }
  }

  return (
    <section className="mt-10 border-t border-line pt-7" aria-label={`Colours for ${whose}`} data-tour="space-palette">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 className="display text-[1.55rem] leading-tight">The colours in this <em>Space</em></h3>
          <p className="mt-1 text-sm text-muted">
            {target.kept ? `Kept for ${whose}: ${target.kept.value}.` : `Nothing kept for ${whose} yet. The pictures here can suggest a palette.`}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn-ghost btn-sm h-10 shrink-0" onClick={() => void read()} disabled={state === "reading"}>
            {state === "reading" ? "Looking at the pictures…" : palettes ? "Suggest again" : "Suggest a palette from this Space"}
          </button>
        )}
      </div>
      {target.kept?.colors && target.kept.colors.length > 0 && !palettes && (
        <div className="mt-4 max-w-[26rem]">
          <Swatches colors={target.kept.colors} size="sm" />
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      {palettes && palettes.length > 0 && (
        <ol className="mt-6 grid gap-6">
          {palettes.map((p, i) => (
            <li key={i} className="rise rounded-[14px] bg-field px-4 py-4 ring-1 ring-line sm:px-5" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="display text-lg leading-snug">{p.description}</p>
                {keptNow === i ? (
                  <span role="status" className="chip-ok shrink-0 self-start">
                    <Icon name="check" size={13} /> Kept for {whose}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-sm shrink-0 self-start"
                    disabled={state === "saving"}
                    onClick={() => {
                      setState("saving");
                      void target.keep(p).then(
                        () => { setKeptNow(i); setState("idle"); },
                        (e) => { setError(say(e)); setState("idle"); },
                      );
                    }}
                  >
                    Keep this palette
                  </button>
                )}
              </div>
              <Swatches colors={p.colors} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
