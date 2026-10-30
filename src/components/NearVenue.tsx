import { lazy, Suspense, useMemo, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { distanceKm, kmText, placeFor, type Place } from "../../convex/lib/places";
import type { MapPin } from "./VendorMap";

const VendorMap = lazy(() => import("./VendorMap"));

/** The circle's sizes, in kilometres: a neighbourhood, a short drive, across town, the whole city. */
export const RADII = [2, 5, 10, 20] as const;

/** A vendor that may be on the map: verified ones on PlusOne, and ones found on the open web. */
export type Nearby = { id: string; name: string; kind: "verified" | "web"; place: Place | null; note?: string };

/** The venue's point: the pin the family dropped, or the middle of the area they named. */
export function venueSpot(event: { venuePlace?: Place; area?: string; city: string }): Place | null {
  return event.venuePlace ?? placeFor(event.area, event.city);
}

/** How far a vendor is from the venue, or null when either point is only a city's middle. */
export function awayKm(centre: Place | null, place: Place | null): number | null {
  if (!centre || !place || centre.precision === "city" || place.precision === "city") return null;
  return distanceKm(centre, place);
}

/**
 * "Near your venue" on a need: the venue pinned, a circle around it, and every vendor
 * whose area is known placed on the map, numbered as in the list beside it. The family
 * can type the venue's name or tap the map to move the pin, change the circle, and
 * choose to see only the vendors inside it (the lists below follow that choice).
 */
export function NearVenue({
  event,
  vendors,
  radiusKm,
  setRadiusKm,
  insideOnly,
  setInsideOnly,
  canEdit,
}: {
  event: { _id: Id<"events">; venuePlace?: Place; area?: string; city: string };
  vendors: Nearby[];
  radiusKm: number;
  setRadiusKm: (km: number) => void;
  insideOnly: boolean;
  setInsideOnly: (on: boolean) => void;
  canEdit: boolean;
}) {
  const centre = venueSpot(event);
  const setVenue = useMutation(api.places.setVenue);
  const find = useAction(api.places.find);
  const [placing, setPlacing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const known = centre !== null && centre.precision !== "city";

  const rows = useMemo(() => {
    const placed = vendors
      .map((v) => ({ ...v, km: awayKm(centre, v.place) }))
      .filter((v) => v.place && v.place.precision !== "city")
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    return placed.map((v, i) => ({ ...v, n: i + 1, inside: v.km !== null && v.km <= radiusKm }));
  }, [vendors, centre, radiusKm]);
  const unplaced = vendors.length - rows.length;
  const inside = rows.filter((r) => r.inside).length;

  const pins: MapPin[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        lat: r.place!.lat,
        lng: r.place!.lng,
        n: r.n,
        name: r.name,
        note: [r.kind === "verified" ? "Verified on PlusOne" : "Found on the web", r.place!.label, r.km !== null ? kmText(r.km) : ""].filter(Boolean).join(" · "),
        inside: !known || r.inside,
        selected: r.id === selected,
      })),
    [rows, known, selected],
  );
  const mapCentre = useMemo(() => (centre ? { lat: centre.lat, lng: centre.lng, label: centre.label } : null), [centre?.lat, centre?.lng, centre?.label]); // eslint-disable-line react-hooks/exhaustive-deps

  async function look() {
    if (!text.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const found = await find({ text, city: event.city });
      if (!found || found.precision === "city") setNote("Couldn't find that. Try the area's name, or tap the map where the venue is.");
      else {
        await setVenue({ eventId: event._id, place: found });
        setText("");
        setPlacing(false);
      }
    } catch (e) {
      const data = (e as { data?: unknown }).data;
      setNote(typeof data === "string" ? data : "That didn't work. Tap the map where the venue is instead.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-xs transition ${on ? "bg-accent text-paper" : "bg-cream text-muted ring-1 ring-line hover:text-accent"}`;

  return (
    <section className="card p-5" aria-labelledby="near-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="near-h" className="text-lg">Near your venue</h3>
          <p className="mt-0.5 text-xs text-muted">
            {known
              ? `${centre.label}${event.venuePlace ? "" : " (the area's middle)"} · ${inside} of ${rows.length} on the map within ${radiusKm} km`
              : "Say where the venue is to see who's near it."}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn-quiet btn-sm shrink-0" aria-expanded={placing} onClick={() => setPlacing((p) => !p)}>
            {placing ? "Done" : known ? "Move the venue" : "Set the venue"}
          </button>
        )}
      </div>

      {placing && (
        <div className="mt-3">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void look();
            }}
          >
            <input className="input" aria-label="Venue's name or address" value={text} onChange={(e) => setText(e.target.value)} placeholder="The hall's name, or its area (Mylapore)" />
            <button className="btn-primary shrink-0" disabled={busy || !text.trim()}>{busy ? "Finding…" : "Find it"}</button>
          </form>
          <p className="mt-1.5 text-[11px] text-quiet">Or tap the map where the venue is. A name that isn&rsquo;t a Chennai area is looked up on OpenStreetMap.</p>
          {note && <p role="alert" className="mt-1.5 text-xs text-bad">{note}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="How far from the venue">
        {RADII.map((km) => (
          <button key={km} type="button" aria-pressed={radiusKm === km} className={chip(radiusKm === km)} onClick={() => setRadiusKm(km)} disabled={!known}>
            {km} km
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
        <button type="button" aria-pressed={insideOnly} className={chip(insideOnly)} onClick={() => setInsideOnly(!insideOnly)} disabled={!known}>
          Only inside the circle
        </button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Suspense fallback={<div className="vendor-map grid place-items-center text-sm text-muted">Loading the map…</div>}>
          <VendorMap
            label={`Map of vendors near ${centre?.label ?? event.city}`}
            centre={mapCentre}
            radiusKm={known ? radiusKm : null}
            pins={pins}
            onSelect={setSelected}
            onPick={
              placing && canEdit
                ? (at) => {
                    void setVenue({ eventId: event._id, place: { ...at, label: "Your venue", precision: "address" } });
                    setPlacing(false);
                  }
                : undefined
            }
          />
        </Suspense>
        <ol className="max-h-[22rem] space-y-1 overflow-y-auto text-sm" aria-label="Vendors by distance from the venue">
          {rows.length === 0 && <li className="text-xs text-muted">No vendor here has said which area they work from yet.</li>}
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r.id)}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-accent-soft ${r.id === selected ? "bg-accent-soft" : ""} ${known && !r.inside ? "opacity-55" : ""}`}
              >
                <span className={`map-pin shrink-0 ${known && !r.inside ? "map-pin--out" : ""}`} aria-hidden="true">{r.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{r.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {r.kind === "verified" ? "Verified" : "Web"} · {r.place!.label}
                    {r.km !== null && <> · {kmText(r.km)}</>}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {unplaced > 0 && <li className="px-2 pt-1 text-[11px] text-quiet">{unplaced} more with no area on their listing or site, so not on the map.</li>}
        </ol>
      </div>
    </section>
  );
}
