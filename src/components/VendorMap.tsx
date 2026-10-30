import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * A map of vendors around a centre: the venue (or the area searched) as a marigold pin,
 * a circle of the chosen radius around it, and each vendor as a numbered pin matching
 * the list beside it. Tiles are OpenStreetMap's own, darkened by a filter in the dark theme.
 * Clicking the map moves the centre when `onPick` is given (dropping the venue's pin).
 */

export type MapPin = { id: string; lat: number; lng: number; n: number; name: string; note?: string; inside: boolean; selected?: boolean };

type Props = {
  centre: { lat: number; lng: number; label: string } | null;
  radiusKm: number | null;
  pins: MapPin[];
  onPick?: (at: { lat: number; lng: number }) => void;
  onSelect?: (id: string) => void;
  className?: string;
  label: string;
};

const pinIcon = (p: MapPin) =>
  L.divIcon({
    className: "",
    html: `<span class="map-pin${p.inside ? "" : " map-pin--out"}${p.selected ? " map-pin--on" : ""}">${p.n}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const venueIcon = L.divIcon({ className: "", html: '<span class="map-venue" aria-hidden="true"></span>', iconSize: [24, 24], iconAnchor: [12, 12] });

/**
 * Vendors who name the same area share one point, the area's middle. Each one after the
 * first is set a little way round a ring (about 700 m), so every pin can be seen and
 * clicked, and none hides under the venue.
 */
export function spread<T extends { lat: number; lng: number }>(pins: T[], centre?: { lat: number; lng: number } | null): T[] {
  const taken = new Map<string, number>();
  if (centre) taken.set(`${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`, 1);
  return pins.map((p) => {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const k = taken.get(key) ?? 0;
    taken.set(key, k + 1);
    if (k === 0) return p;
    const angle = (k - 1) * 2.4; // the golden angle, so the ring fills evenly however many there are
    const r = 0.0065 * (1 + Math.floor((k - 1) / 6) * 0.6);
    return { ...p, lat: p.lat + r * Math.sin(angle), lng: p.lng + (r * Math.cos(angle)) / Math.cos((p.lat * Math.PI) / 180) };
  });
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export default function VendorMap({ centre, radiusKm, pins, onPick, onSelect, className = "", label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const select = useRef(onSelect);
  select.current = onSelect;
  const fitted = useRef("");

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: false, scrollWheelZoom: false }).setView([13.0827, 80.2707], 11);
    L.control.attribution({ prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pick.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    // The wheel zooms only once the map has been clicked, so scrolling the page never gets caught in it.
    m.on("focus", () => m.scrollWheelZoom.enable());
    m.on("blur", () => m.scrollWheelZoom.disable());
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      fitted.current = "";
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    if (centre) {
      L.marker([centre.lat, centre.lng], { icon: venueIcon, keyboard: false, zIndexOffset: 1000 })
        .bindTooltip(escape(centre.label), { direction: "top", offset: [0, -12], permanent: true, className: "map-venue-label" })
        .addTo(g);
      if (radiusKm) {
        const circle = L.circle([centre.lat, centre.lng], { radius: radiusKm * 1000, className: "map-circle", interactive: false }).addTo(g);
        bounds.push(...[circle.getBounds().getNorthWest(), circle.getBounds().getSouthEast()]);
      } else bounds.push([centre.lat, centre.lng]);
    }
    for (const p of spread(pins, centre)) {
      L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.name, riseOnHover: true })
        .bindTooltip(`<strong>${escape(p.name)}</strong>${p.note ? `<br>${escape(p.note)}` : ""}`, { direction: "top", offset: [0, -12] })
        .on("click", () => select.current?.(p.id))
        .addTo(g);
      if (!centre || !radiusKm) bounds.push([p.lat, p.lng]);
    }
    // Only a new centre, radius or set of vendors moves the view; picking one pin never does.
    const fit = `${centre?.lat},${centre?.lng},${radiusKm},${pins.map((p) => p.id).join(",")}`;
    if (fit === fitted.current) return;
    fitted.current = fit;
    // The box may have been laid out after the map was made; measure it again first.
    m.invalidateSize();
    if (bounds.length > 1) m.fitBounds(L.latLngBounds(bounds), { padding: [24, 24], maxZoom: 14 });
    else if (bounds.length === 1) m.setView(bounds[0], 13);
  }, [centre, radiusKm, pins]);

  return <div ref={box} role="region" aria-label={label} className={`vendor-map ${className}`} />;
}
