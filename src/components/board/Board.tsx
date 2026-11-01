import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { ExternalLink, Image as ImageIcon, Link2, Maximize, Minus, Palette, Plus, StickyNote, Store, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DEFAULT_WIDTH,
  autoPlace,
  boundsOf,
  fit,
  toBoard,
  zoneAt,
  zoomAt,
  zonesFor,
  type Camera,
  type Point,
  type Rect,
  type Zone,
} from "../../lib/board";
import { picturesIn, readyToUpload } from "../../lib/pictures";
import { money } from "../../lib/format";
import { PaletteMoment } from "../spaces/SpaceView";
import { keptPalette } from "../../lib/spaces";

type EventData = NonNullable<FunctionReturnType<typeof api.events.get>>;
type Item = FunctionReturnType<typeof api.spaces.list>[number];
type Session = EventData["sessions"][number];

const say = (e: unknown) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : "That didn't work. Try again.");
const STROKE = 1.5;

/** What a pointer is doing between pressing and letting go. */
type Gesture =
  | { kind: "pan"; start: Point; cam: Camera; moved: boolean }
  | { kind: "items"; start: Point; ids: string[]; from: Map<string, Rect>; moved: boolean }
  | { kind: "resize"; start: Point; id: string; from: Rect }
  | { kind: "zone"; start: Point; sessionId: string; from: Rect; items: Map<string, Rect>; moved: boolean }
  | { kind: "zoneSize"; start: Point; sessionId: string; from: Rect }
  | { kind: "pinch"; d0: number; cam: Camera; mid: Point };

/**
 * The event's board: one open canvas where its pictures, links, notes, colours and
 * vendors sit, with a zone for each part of the event. Anything dropped in a zone
 * belongs to that part; anything outside them is for the whole event.
 */
export function Board({
  event,
  sessions,
  items,
  canEdit,
  focus,
}: {
  event: EventData["event"];
  sessions: Session[];
  items: Item[];
  canEdit: boolean;
  /** Open on this part's zone instead of the whole board. */
  focus?: string;
}) {
  const eventId = event._id as Id<"events">;
  const viewRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cam = useRef<Camera>({ x: 0, y: 0, z: 1 });
  const [zoomShown, setZoomShown] = useState(100);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Live positions while something is being dragged, before the move is saved. */
  const [moving, setMoving] = useState<Map<string, Rect>>(new Map());
  const [zoneMoving, setZoneMoving] = useState<Map<string, Rect>>(new Map());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ at: Point; text: string } | null>(null);
  const [panel, setPanel] = useState<null | "link" | "colour" | "vendor" | "palette">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const spaceDown = useRef(false);

  const place = useMutation(api.spaces.place);
  const placeZone = useMutation(api.spaces.placeZone);
  const addNote = useMutation(api.spaces.addNote);
  const editNote = useMutation(api.spaces.editNote);
  const addSwatches = useMutation(api.spaces.addSwatches);
  const pinVendor = useMutation(api.spaces.pinVendor);
  const addLink = useMutation(api.spaces.addLink);
  const addPictures = useMutation(api.spaces.addPictures);
  const uploadUrl = useMutation(api.spaces.generateUploadUrl);
  const remove = useMutation(api.spaces.remove);
  const updateEvent = useMutation(api.events.update);
  const keepPalette = useMutation(api.spaces.keepPalette);

  const zones: Zone[] = useMemo(
    () => zonesFor(sessions.map((s) => ({ _id: s._id, name: s.name, zone: s.zone }))).map((z) => ({ ...z, rect: zoneMoving.get(z.sessionId) ?? z.rect })),
    [sessions, zoneMoving],
  );
  const layout = useMemo(() => autoPlace(items, zones), [items, zones]);
  const rectOf = useCallback((id: string) => moving.get(id) ?? layout.get(id), [moving, layout]);

  // Anything still unplaced gets its spot saved once, so everyone planning sees the same board.
  const saved = useRef(new Set<string>());
  useEffect(() => {
    if (!canEdit) return;
    const unplaced = items.filter((i) => (i.x === undefined || i.y === undefined) && !saved.current.has(i._id));
    if (unplaced.length === 0) return;
    for (const i of unplaced) saved.current.add(i._id);
    void place({
      eventId,
      moves: unplaced.slice(0, 150).map((i) => {
        const r = layout.get(i._id)!;
        return { itemId: i._id as Id<"spaceItems">, x: r.x, y: r.y };
      }),
    }).catch(() => {});
  }, [items, layout, canEdit, eventId, place]);

  // ---------------------------------------------------------------- the view

  const applyCamera = useCallback((next: Camera) => {
    cam.current = next;
    const world = worldRef.current;
    const view = viewRef.current;
    // A plain 2D transform, so text and pictures are drawn sharp again at each zoom.
    if (world) world.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.z})`;
    if (view) {
      const step = 24 * next.z;
      view.style.backgroundSize = `${step}px ${step}px`;
      view.style.backgroundPosition = `${next.x}px ${next.y}px`;
    }
    setZoomShown(Math.round(next.z * 100));
  }, []);

  const viewport = () => {
    const r = viewRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 1200, h: r?.height ?? 800, left: r?.left ?? 0, top: r?.top ?? 0 };
  };
  const local = (e: { clientX: number; clientY: number }): Point => {
    const v = viewport();
    return { x: e.clientX - v.left, y: e.clientY - v.top };
  };
  const centre = (): Point => {
    const v = viewport();
    return toBoard(cam.current, { x: v.w / 2, y: v.h / 2 });
  };

  const fitAll = useCallback(
    (only?: string) => {
      const v = viewport();
      const rects = only
        ? [zones.find((z) => z.sessionId === only)?.rect].filter((r): r is Rect => Boolean(r))
        : [...zones.map((z) => z.rect), ...layout.values()];
      const box = boundsOf(rects) ?? { x: 0, y: 0, w: 800, h: 600 };
      applyCamera(fit(box, v));
    },
    [zones, layout, applyCamera],
  );

  // The board fills the window below it, whatever sits above it on the page.
  useLayoutEffect(() => {
    const size = () => {
      const view = viewRef.current;
      if (!view) return;
      const top = view.getBoundingClientRect().top + window.scrollY;
      const dock = window.matchMedia("(max-width: 767px)").matches ? 76 : 0;
      view.style.height = `${Math.max(420, window.innerHeight - top - 20 - dock)}px`;
    };
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  // Open once on the whole board, or on the part asked for.
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current) return;
    opened.current = true;
    fitAll(focus);
  }, [fitAll, focus]);

  // Wheel and trackpad: two fingers pan, a pinch (or Ctrl with the wheel) zooms at the pointer.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-board-ui]")) return;
      e.preventDefault();
      const c = cam.current;
      // A mouse wheel sends big steps and a trackpad pinch small ones; either way, no more than ~1.6x a tick.
      if (e.ctrlKey || e.metaKey) applyCamera(zoomAt(c, Math.exp(-Math.max(-48, Math.min(48, e.deltaY)) * 0.01), local(e)));
      else applyCamera({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY });
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => view.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyCamera]);

  const zoomBy = (f: number) => {
    const v = viewport();
    applyCamera(zoomAt(cam.current, f, { x: v.w / 2, y: v.h / 2 }));
  };

  // ---------------------------------------------------------------- pointers

  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-board-ui], textarea, input, a, button")) return;
    pointers.current.set(e.pointerId, local(e));
    viewRef.current?.setPointerCapture(e.pointerId);

    // Two fingers: pinch to zoom, whatever was under them.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setMoving(new Map());
      gesture.current = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), cam: cam.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    const p = local(e);
    const itemEl = target.closest<HTMLElement>("[data-item]");
    const resizeEl = target.closest<HTMLElement>("[data-resize]");
    const zoneTitle = target.closest<HTMLElement>("[data-zone-title]");
    const zoneSize = target.closest<HTMLElement>("[data-zone-size]");

    if (canEdit && !spaceDown.current && e.button === 0) {
      if (resizeEl) {
        const id = resizeEl.dataset.resize!;
        gesture.current = { kind: "resize", start: p, id, from: rectOf(id)! };
        return;
      }
      if (itemEl) {
        const id = itemEl.dataset.item!;
        let ids = [...selected];
        if (e.shiftKey) {
          ids = selected.has(id) ? ids.filter((x) => x !== id) : [...ids, id];
          setSelected(new Set(ids));
        } else if (!selected.has(id)) {
          ids = [id];
          setSelected(new Set(ids));
        }
        gesture.current = { kind: "items", start: p, ids, from: new Map(ids.map((i) => [i, rectOf(i)!]).filter(([, r]) => r) as [string, Rect][]), moved: false };
        return;
      }
      if (zoneSize) {
        const sessionId = zoneSize.dataset.zoneSize!;
        gesture.current = { kind: "zoneSize", start: p, sessionId, from: zones.find((z) => z.sessionId === sessionId)!.rect };
        return;
      }
      if (zoneTitle) {
        const sessionId = zoneTitle.dataset.zoneTitle!;
        const inside = items.filter((i) => i.sessionId === sessionId);
        gesture.current = {
          kind: "zone",
          start: p,
          sessionId,
          from: zones.find((z) => z.sessionId === sessionId)!.rect,
          items: new Map(inside.map((i) => [i._id, rectOf(i._id)!]).filter(([, r]) => r) as [string, Rect][]),
          moved: false,
        };
        return;
      }
    }
    if (itemEl && !canEdit) setSelected(new Set([itemEl.dataset.item!]));
    gesture.current = { kind: "pan", start: p, cam: cam.current, moved: false };
    viewRef.current?.classList.add("is-panning");
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(g.cam, d / Math.max(1, g.d0), g.mid);
      applyCamera({ ...zoomed, x: zoomed.x + mid.x - g.mid.x, y: zoomed.y + mid.y - g.mid.y });
      return;
    }
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    if (g.kind === "pan") {
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      applyCamera({ ...g.cam, x: g.cam.x + dx, y: g.cam.y + dy });
      return;
    }
    const z = cam.current.z;
    const bx = dx / z;
    const by = dy / z;
    if (g.kind === "items") {
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      g.moved = true;
      setMoving(new Map([...g.from].map(([id, r]) => [id, { ...r, x: r.x + bx, y: r.y + by }])));
    } else if (g.kind === "resize") {
      setMoving(new Map([[g.id, { ...g.from, w: Math.max(96, Math.min(1200, g.from.w + bx)) }]]));
    } else if (g.kind === "zone") {
      if (!g.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      g.moved = true;
      setZoneMoving(new Map([[g.sessionId, { ...g.from, x: g.from.x + bx, y: g.from.y + by }]]));
      setMoving(new Map([...g.items].map(([id, r]) => [id, { ...r, x: r.x + bx, y: r.y + by }])));
    } else if (g.kind === "zoneSize") {
      setZoneMoving(new Map([[g.sessionId, { ...g.from, w: Math.max(320, g.from.w + bx), h: Math.max(240, g.from.h + by) }]]));
    }
  }

  async function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    viewRef.current?.classList.remove("is-panning");
    const g = gesture.current;
    if (g?.kind === "pinch") {
      // Lifting one finger of a pinch carries on as a pan with the other.
      const left = [...pointers.current.values()][0];
      gesture.current = left ? { kind: "pan", start: left, cam: cam.current, moved: true } : null;
      return;
    }
    gesture.current = null;
    if (!g) return;
    try {
      if (g.kind === "pan" && !g.moved) {
        setSelected(new Set());
        setPanel(null);
      } else if (g.kind === "items" && g.moved) {
        const moves = [...g.from.keys()].map((id) => {
          const r = moving.get(id)!;
          const sessionId = zoneAt({ x: r.x + r.w / 2, y: r.y + 40 }, zones);
          return { itemId: id as Id<"spaceItems">, x: r.x, y: r.y, sessionId: sessionId as Id<"sessions"> | null };
        });
        await place({ eventId, moves });
      } else if (g.kind === "resize") {
        const r = moving.get(g.id);
        if (r) await place({ eventId, moves: [{ itemId: g.id as Id<"spaceItems">, x: r.x, y: r.y, w: r.w }] });
      } else if (g.kind === "zone" && g.moved) {
        const r = zoneMoving.get(g.sessionId)!;
        await Promise.all([
          placeZone({ sessionId: g.sessionId as Id<"sessions">, ...r }),
          g.items.size ? place({ eventId, moves: [...g.items.keys()].map((id) => ({ itemId: id as Id<"spaceItems">, x: moving.get(id)!.x, y: moving.get(id)!.y })) }) : null,
        ]);
      } else if (g.kind === "zoneSize") {
        const r = zoneMoving.get(g.sessionId);
        if (r) await placeZone({ sessionId: g.sessionId as Id<"sessions">, ...r });
      }
    } catch (err) {
      setError(say(err));
    } finally {
      // Hold the dragged positions until the saved ones come back, so nothing snaps back for a frame.
      requestAnimationFrame(() => {
        setMoving(new Map());
        setZoneMoving(new Map());
      });
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (!canEdit) return;
    const target = e.target as HTMLElement;
    const note = target.closest<HTMLElement>("[data-item]");
    if (note) {
      const item = items.find((i) => i._id === note.dataset.item);
      if (item?.kind === "note") setEditing(item._id);
      return;
    }
    if (target.closest("[data-board-ui], [data-zone-title]")) return;
    setDraft({ at: toBoard(cam.current, local(e)), text: "" });
  }

  // ---------------------------------------------------------------- keys, paste, drop

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, [contenteditable]");
      if (e.code === "Space" && !typing) {
        spaceDown.current = e.type === "keydown";
        viewRef.current?.classList.toggle("is-grab", spaceDown.current);
      }
      if (e.type !== "keydown" || typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size && canEdit) void removeSelected();
      if (e.key === "Escape") {
        setSelected(new Set());
        setPanel(null);
      }
      if ((e.key === "=" || e.key === "+") && !e.metaKey) zoomBy(1.2);
      if (e.key === "-" && !e.metaKey) zoomBy(1 / 1.2);
      if (e.key === "0" && !e.metaKey) fitAll();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  });

  const partAt = (p: Point) => (zoneAt(p, zones) ?? undefined) as Id<"sessions"> | undefined;

  const upload = useCallback(
    async (files: File[], at: Point) => {
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
        await addPictures({ eventId, sessionId: partAt(at), storageIds: ids, at });
      } catch (e) {
        setError(e instanceof Error && e.message === "upload" ? "A picture didn't upload. Try again." : say(e));
      } finally {
        setBusy(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, eventId, zones],
  );

  const linkAt = async (text: string, at: Point) => {
    setError(null);
    try {
      await addLink({ eventId, sessionId: partAt(at), text, at });
      return true;
    } catch (e) {
      setError(say(e));
      return false;
    }
  };

  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      const files = picturesIn(e.clipboardData?.files);
      if (files.length) {
        e.preventDefault();
        void upload(files, centre());
        return;
      }
      const text = e.clipboardData?.getData("text") ?? "";
      if (/https?:\/\//i.test(text)) {
        e.preventDefault();
        void linkAt(text, centre());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const at = toBoard(cam.current, local(e));
    const files = picturesIn(e.dataTransfer.files);
    if (files.length) return void upload(files, at);
    const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text");
    if (text) void linkAt(text, at);
  }

  async function removeSelected() {
    const ids = [...selected];
    if (ids.length > 1 && !window.confirm(`Take these ${ids.length} things off the board?`)) return;
    setSelected(new Set());
    for (const id of ids) await remove({ itemId: id as Id<"spaceItems"> }).catch((e) => setError(say(e)));
  }

  async function saveDraft() {
    const d = draft;
    setDraft(null);
    if (!d || !d.text.trim()) return;
    try {
      await addNote({ eventId, sessionId: partAt(d.at), text: d.text, x: d.at.x, y: d.at.y });
    } catch (e) {
      setError(say(e));
    }
  }

  const fileInput = useRef<HTMLInputElement>(null);
  const focusedPart = useMemo(() => {
    const one = [...selected].map((id) => items.find((i) => i._id === id)).find(Boolean);
    return one?.sessionId ? sessions.find((s) => s._id === one.sessionId) : undefined;
  }, [selected, items, sessions]);

  // ---------------------------------------------------------------- drawing

  return (
    <div
      ref={viewRef}
      className="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => void onPointerUp(e)}
      onPointerCancel={(e) => void onPointerUp(e)}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      aria-label={`${event.name}: the board`}
    >
      <div ref={worldRef} className="board__world">
        {zones.map((z) => {
          const s = sessions.find((x) => x._id === z.sessionId);
          const colors = s ? keptPalette(s)?.colors : undefined;
          return (
            <section key={z.sessionId} className="board-zone" style={{ left: z.rect.x, top: z.rect.y, width: z.rect.w, height: z.rect.h }} aria-label={z.name}>
              <header className="board-zone__title" data-zone-title={canEdit ? z.sessionId : undefined}>
                <span className="display truncate">{z.name}</span>
                {colors && colors.length > 0 && (
                  <span className="board-zone__chips" aria-hidden="true">
                    {colors.slice(0, 6).map((c) => (
                      <span key={c.hex + c.name} style={{ background: c.hex }} />
                    ))}
                  </span>
                )}
              </header>
              {canEdit && <span className="board-zone__size" data-zone-size={z.sessionId} aria-hidden="true" />}
            </section>
          );
        })}

        {items.map((it) => {
          const r = rectOf(it._id);
          if (!r) return null;
          const isSel = selected.has(it._id);
          return (
            <div
              key={it._id}
              data-item={it._id}
              className={`board-item board-item--${it.kind} ${isSel ? "is-selected" : ""} ${moving.has(it._id) ? "is-moving" : ""}`}
              style={{ left: r.x, top: r.y, width: r.w }}
            >
              <ItemBody eventId={eventId} item={it} editing={editing === it._id} onDoneEditing={(text) => {
                setEditing(null);
                if (text !== undefined && text !== it.text) void editNote({ itemId: it._id as Id<"spaceItems">, text }).catch((e) => setError(say(e)));
              }} />
              {isSel && canEdit && <span className="board-item__size" data-resize={it._id} aria-hidden="true" />}
            </div>
          );
        })}

        {draft && (
          <div className="board-item board-item--note is-selected" style={{ left: draft.at.x, top: draft.at.y, width: DEFAULT_WIDTH.note }} data-board-ui>
            <textarea
              autoFocus
              className="board-note__edit"
              placeholder="A note for everyone planning"
              value={draft.text}
              maxLength={600}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              onBlur={() => void saveDraft()}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDraft(null);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveDraft();
              }}
            />
          </div>
        )}
      </div>

      {items.length === 0 && !draft && (
        <div className="board__hint" data-board-ui>
          {canEdit ? (
            <>
              <h2>Gather the look of your event</h2>
              <ol>
                <li>Drop or paste pictures of things you like: decor, outfits, cakes, the venue.</li>
                <li>Add a note, a link, a colour or a vendor from the toolbar below, or double-click anywhere to write.</li>
                <li>Each part of the event has its own area; anything outside them is for the whole event.</li>
              </ol>
            </>
          ) : (
            <p>Nothing here yet. Whoever is planning can add pictures, notes and colours.</p>
          )}
        </div>
      )}

      {(busy || error) && (
        <p className={`board__status ${error ? "is-error" : ""}`} role={error ? "alert" : "status"} data-board-ui>
          {error ?? busy}
          {error && (
            <button type="button" className="ml-3 underline underline-offset-2" onClick={() => setError(null)}>
              OK
            </button>
          )}
        </p>
      )}

      <div className="board-tools" data-board-ui role="toolbar" aria-label="Board tools">
        {canEdit && (
          <>
            <Tool label="Note" onClick={() => setDraft({ at: centre(), text: "" })}><StickyNote size={18} strokeWidth={STROKE} /></Tool>
            <Tool label="Picture" onClick={() => fileInput.current?.click()}><ImageIcon size={18} strokeWidth={STROKE} /></Tool>
            <Tool label="Link" active={panel === "link"} onClick={() => setPanel(panel === "link" ? null : "link")}><Link2 size={18} strokeWidth={STROKE} /></Tool>
            <Tool label="Colour" active={panel === "colour"} onClick={() => setPanel(panel === "colour" ? null : "colour")}><Palette size={18} strokeWidth={STROKE} /></Tool>
            <Tool label="Vendor" active={panel === "vendor"} onClick={() => setPanel(panel === "vendor" ? null : "vendor")}><Store size={18} strokeWidth={STROKE} /></Tool>
            <span className="board-tools__rule" aria-hidden="true" />
          </>
        )}
        <Tool label="Zoom out" onClick={() => zoomBy(1 / 1.25)}><Minus size={18} strokeWidth={STROKE} /></Tool>
        <button type="button" className="board-tools__zoom" onClick={() => applyCamera(zoomAt(cam.current, 1 / cam.current.z, { x: viewport().w / 2, y: viewport().h / 2 }))} title="Back to 100%">
          {zoomShown}%
        </button>
        <Tool label="Zoom in" onClick={() => zoomBy(1.25)}><Plus size={18} strokeWidth={STROKE} /></Tool>
        <Tool label="Show everything" onClick={() => fitAll()}><Maximize size={17} strokeWidth={STROKE} /></Tool>
        {canEdit && selected.size > 0 && (
          <>
            <span className="board-tools__rule" aria-hidden="true" />
            <Tool label={selected.size === 1 ? "Take it off the board" : `Take ${selected.size} off the board`} onClick={() => void removeSelected()}>
              <Trash2 size={18} strokeWidth={STROKE} />
            </Tool>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void upload(picturesIn(e.target.files), centre());
            e.target.value = "";
          }}
        />
      </div>

      {canEdit && (
        <button type="button" className="board-colours" data-board-ui data-tour="space-palette" onClick={() => setPanel(panel === "palette" ? null : "palette")}>
          <Palette size={16} strokeWidth={STROKE} aria-hidden="true" /> Colours from the pictures
        </button>
      )}

      {panel === "link" && (
        <Popover title="Add a link" onClose={() => setPanel(null)}>
          <LinkForm onLink={async (text) => (await linkAt(text, centre())) && (setPanel(null), true)} />
        </Popover>
      )}
      {panel === "colour" && (
        <Popover title="Add a colour" onClose={() => setPanel(null)}>
          <ColourForm
            onAdd={async (hex, name) => {
              const at = centre();
              try {
                await addSwatches({ eventId, sessionId: partAt(at), colors: [{ hex, name }], x: at.x, y: at.y });
                setPanel(null);
              } catch (e) {
                setError(say(e));
              }
            }}
          />
        </Popover>
      )}
      {panel === "vendor" && (
        <Popover title="Pin a vendor" onClose={() => setPanel(null)}>
          <VendorPicker
            eventId={eventId}
            onPick={async (vendorId) => {
              const at = centre();
              try {
                await pinVendor({ eventId, sessionId: partAt(at), vendorId, x: at.x, y: at.y });
                setPanel(null);
              } catch (e) {
                setError(say(e));
              }
            }}
          />
        </Popover>
      )}
      {panel === "palette" && (
        <aside className="board-side" data-board-ui aria-label="Colours">
          <button type="button" className="board-side__close" onClick={() => setPanel(null)} aria-label="Close">
            <Plus size={18} strokeWidth={STROKE} className="rotate-45" />
          </button>
          <PaletteMoment
            eventId={eventId}
            sessionId={focusedPart?._id as Id<"sessions"> | undefined}
            ceremony={focusedPart?.name}
            canEdit={canEdit}
            target={
              focusedPart
                ? {
                    kept: keptPalette(focusedPart),
                    keep: async (p) => {
                      await keepPalette({ sessionId: focusedPart._id as Id<"sessions">, description: p.description, colors: p.colors });
                      const z = zones.find((x) => x.sessionId === focusedPart._id)!.rect;
                      await addSwatches({ eventId, sessionId: focusedPart._id as Id<"sessions">, colors: p.colors, x: z.x + 24, y: z.y + z.h - 160 });
                    },
                  }
                : {
                    kept: event.stylePalette ? { value: event.stylePalette } : undefined,
                    keep: async (p) => {
                      await updateEvent({ eventId, patch: { stylePalette: p.description } });
                      const at = centre();
                      await addSwatches({ eventId, colors: p.colors, x: at.x, y: at.y });
                    },
                  }
            }
          />
          <p className="mt-4 text-xs text-quiet">
            {focusedPart ? `Reading the pictures in ${focusedPart.name}. Select something elsewhere to read another part.` : "Reading the pictures for the whole event. Select something in a part to read just that part."}
          </p>
        </aside>
      )}
    </div>
  );
}

function Tool({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className={`board-tools__btn ${active ? "is-active" : ""}`} onClick={onClick} title={label} aria-label={label} aria-pressed={active}>
      {children}
    </button>
  );
}

function Popover({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="board-pop" data-board-ui role="dialog" aria-label={title}>
      <p className="text-sm font-medium text-ink">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LinkForm({ onLink }: { onLink: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        if (await onLink(text)) setText("");
        setBusy(false);
      }}
    >
      <input autoFocus className="input" placeholder="https://" value={text} onChange={(e) => setText(e.target.value)} aria-label="Web address" />
      <button type="submit" className="btn-primary btn-sm shrink-0" disabled={busy || !text.trim()}>
        Add
      </button>
    </form>
  );
}

function ColourForm({ onAdd }: { onAdd: (hex: string, name: string) => Promise<void> }) {
  const [hex, setHex] = useState("#f2a10f");
  const [name, setName] = useState("");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void onAdd(hex, name);
      }}
    >
      <div className="flex items-center gap-3">
        <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="h-10 w-14 cursor-pointer rounded-[7px] border border-line bg-field" aria-label="Colour" />
        <input className="input" placeholder="Its name, like marigold" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Colour name" />
      </div>
      <button type="submit" className="btn-primary btn-sm justify-self-start">Put it on the board</button>
    </form>
  );
}

function VendorPicker({ eventId, onPick }: { eventId: Id<"events">; onPick: (id: Id<"vendors">) => Promise<void> }) {
  const vendors = useQuery(api.spaces.pinnable, { eventId });
  const [q, setQ] = useState("");
  if (vendors === undefined) return <p className="text-sm text-muted">Loading vendors…</p>;
  if (vendors.length === 0) return <p className="text-sm text-muted">No vendors yet. Find some under Vendors, then pin them here.</p>;
  const shown = vendors.filter((v) => `${v.name} ${v.need}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  return (
    <div>
      <input autoFocus className="input" placeholder="Search by name or need" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search vendors" />
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {shown.map((v) => (
          <li key={v._id}>
            <button type="button" className="flex w-full items-baseline justify-between gap-3 rounded-[10px] px-2 py-2 text-left text-sm hover:bg-accent-soft" onClick={() => void onPick(v._id)}>
              <span className="min-w-0 truncate text-ink">{v.name}</span>
              <span className="shrink-0 text-xs text-quiet">{v.booked ? "Booked" : v.shortlisted ? "Shortlisted" : v.need}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const UNIT_WORD: Record<string, string> = { per_person: "a head", per_plate: "a plate", per_piece: "a piece", per_day: "a day", per_hour: "an hour" };

function ItemBody({ eventId, item, editing, onDoneEditing }: { eventId: string; item: Item; editing: boolean; onDoneEditing: (text?: string) => void }) {
  const [text, setText] = useState(item.text ?? "");
  useEffect(() => setText(item.text ?? ""), [item.text]);

  if (item.kind === "image") {
    return (
      <figure>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.caption ?? ""} draggable={false} loading="lazy" referrerPolicy="no-referrer" /> : <span className="board-item__empty" />}
        {item.caption && <figcaption>{item.caption}</figcaption>}
      </figure>
    );
  }
  if (item.kind === "link") {
    const title = item.preview?.title ?? item.url;
    let site = "";
    try {
      site = item.url ? new URL(item.url).hostname.replace(/^www\./, "") : "";
    } catch {
      site = "";
    }
    return (
      <div>
        {item.imageUrl && <img src={item.imageUrl} alt="" draggable={false} loading="lazy" referrerPolicy="no-referrer" />}
        <div className="board-link__body">
          <p className="board-link__title">{item.previewStatus === "pending" ? "Reading the page…" : title}</p>
          <p className="board-link__site">
            {site}
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer noopener" aria-label="Open the link" className="board-link__open">
                <ExternalLink size={13} strokeWidth={STROKE} />
              </a>
            )}
          </p>
        </div>
      </div>
    );
  }
  if (item.kind === "note") {
    return editing ? (
      <textarea
        autoFocus
        className="board-note__edit"
        value={text}
        maxLength={600}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onDoneEditing(text)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDoneEditing(undefined);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onDoneEditing(text);
        }}
      />
    ) : (
      <p className="board-note__text">{item.text}</p>
    );
  }
  if (item.kind === "swatch") {
    return (
      <div>
        <span className="board-swatch__chip" style={{ background: item.hex }} />
        <p className="board-swatch__name">{item.colorName ?? item.hex}</p>
        {item.colorName && <p className="board-swatch__hex">{item.hex}</p>}
      </div>
    );
  }
  const v = item.vendor;
  if (!v) return <p className="board-note__text text-quiet">This vendor has been removed from the plan.</p>;
  return (
    <div>
      <p className="board-vendor__need">{v.category}</p>
      <p className="board-vendor__name display">{v.name}</p>
      {v.price ? (
        <p className="board-vendor__price">
          From {money(v.price, v.currency ?? "INR")}
          {v.priceUnit && UNIT_WORD[v.priceUnit] ? ` ${UNIT_WORD[v.priceUnit]}` : ""}
        </p>
      ) : null}
      {v.slotId && (
        <Link to={`/e/${eventId}/vendors/${v.slotId}`} className="board-vendor__open">
          Open
        </Link>
      )}
    </div>
  );
}

