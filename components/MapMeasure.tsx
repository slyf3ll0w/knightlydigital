"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Crosshair, Layers, Loader2, RotateCcw, Search, Undo2 } from "lucide-react";
import "leaflet/dist/leaflet.css";

/**
 * Draw-to-measure for estimate tools' `map` questions: the customer (or the
 * tech standing in the yard) taps corners on a satellite map and the tool
 * gets a number — feet along a fence line, or square feet of a lawn / roof /
 * driveway. Pure client: Leaflet + OSM streets + Esri imagery, no API key.
 * Address search goes through /api/public/geocode (Mapbox, env-gated); when
 * that's unavailable the search box says so and the map still pans.
 */

export type LatLngTuple = [number, number];

const R = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const M_TO_FT = 3.28084;
const M2_TO_FT2 = 10.7639;

function distM(a: LatLngTuple, b: LatLngTuple): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function pathLengthM(pts: LatLngTuple[]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += distM(pts[i - 1], pts[i]);
  return m;
}

/** Shoelace on an equirectangular projection centred on the shape — exact enough for a property. */
export function polygonAreaM2(pts: LatLngTuple[]): number {
  if (pts.length < 3) return 0;
  const lat0 = toRad(pts.reduce((s, p) => s + p[0], 0) / pts.length);
  const xy = pts.map((p) => [R * toRad(p[1]) * Math.cos(lat0), R * toRad(p[0])]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** The tool's number: whole feet for a line, whole square feet for an area; null until there's a shape. */
export function measureFeet(measure: "length" | "area", pts: LatLngTuple[]): number | null {
  if (measure === "length") return pts.length >= 2 ? Math.round(pathLengthM(pts) * M_TO_FT) : null;
  return pts.length >= 3 ? Math.round(polygonAreaM2(pts) * M2_TO_FT2) : null;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function MapMeasure({
  measure,
  points,
  onChange,
  accent = "#16a34a",
  dark = false,
}: {
  measure: "length" | "area";
  points: LatLngTuple[];
  onChange: (points: LatLngTuple[], value: number | null) => void;
  accent?: string;
  dark?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const tilesRef = useRef<{ streets: Leaflet.TileLayer; sat: Leaflet.TileLayer } | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"search" | "locate" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !boxRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(boxRef.current, { doubleClickZoom: false, zoomControl: true, attributionControl: true });
      const streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
      const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery © Esri" });
      tilesRef.current = { streets, sat };
      sat.addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      const initial = pointsRef.current;
      if (initial.length > 0) map.fitBounds(L.latLngBounds(initial), { padding: [28, 28], maxZoom: 19 });
      else map.setView([39.5, -98.35], 4);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const next: LatLngTuple[] = [...pointsRef.current, [e.latlng.lat, e.latlng.lng]];
        onChangeRef.current(next, measureFeet(measure, next));
      });
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // the map is created once; measure/points changes redraw below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // redraw the shape
  useEffect(() => {
    const L = LRef.current;
    const g = layerRef.current;
    if (!L || !g || !ready) return;
    g.clearLayers();
    if (points.length >= 2) {
      if (measure === "length" || points.length < 3) L.polyline(points, { color: accent, weight: 3, dashArray: measure === "area" ? "6 6" : undefined }).addTo(g);
      else L.polygon(points, { color: accent, weight: 2, fillColor: accent, fillOpacity: 0.28 }).addTo(g);
    }
    points.forEach((p) => L.circleMarker(p, { radius: 6, color: "#fff", weight: 2, fillColor: accent, fillOpacity: 1 }).addTo(g));
  }, [points, accent, measure, ready]);

  // streets ↔ satellite
  useEffect(() => {
    const map = mapRef.current;
    const t = tilesRef.current;
    if (!map || !t || !ready) return;
    if (satellite) {
      map.removeLayer(t.streets);
      t.sat.addTo(map);
    } else {
      map.removeLayer(t.sat);
      t.streets.addTo(map);
    }
  }, [satellite, ready]);

  async function search() {
    const query = q.trim();
    if (query.length < 4 || !mapRef.current) return;
    setBusy("search");
    setNote("");
    try {
      const res = await fetch(`/api/public/geocode?q=${encodeURIComponent(query)}`);
      const data = (await res.json().catch(() => null)) as { lat?: number; lng?: number; error?: string } | null;
      if (!res.ok || typeof data?.lat !== "number" || typeof data?.lng !== "number") {
        setNote(data?.error ?? "We couldn't find that address — pan the map to it instead.");
        return;
      }
      mapRef.current.setView([data.lat, data.lng], 19);
    } catch {
      setNote("Address search didn't answer — pan the map to the property.");
    } finally {
      setBusy(null);
    }
  }

  function locate() {
    if (!navigator.geolocation || !mapRef.current) {
      setNote("Location isn't available on this device.");
      return;
    }
    setBusy("locate");
    setNote("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 19);
        setBusy(null);
      },
      () => {
        setNote("We couldn't get your location — search the address instead.");
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  const value = measureFeet(measure, points);
  const hint = measure === "length" ? "Tap along the fence line, corner by corner." : "Tap each corner of the area.";
  const readout = value !== null ? (measure === "length" ? `${fmt(value)} ft` : `${fmt(value)} sq ft`) : null;
  const shell = dark ? "border-white/15 bg-white/5 text-gray-200" : "border-gray-300 bg-white text-gray-800";
  const btn = `inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium disabled:opacity-50 ${dark ? "border-white/15 bg-[#101410] text-gray-200 hover:bg-white/10" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`;

  return (
    <div className={`overflow-hidden rounded-lg border ${shell}`}>
      <div className="flex items-center gap-1.5 p-2">
        <div className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 ${dark ? "border-white/15" : "border-gray-300"}`}>
          <Search size={14} className="shrink-0 opacity-60" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="Find the address…"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-50"
          />
        </div>
        <button type="button" onClick={() => void search()} disabled={busy !== null || q.trim().length < 4} className={btn} aria-label="Search">
          {busy === "search" ? <Loader2 size={14} className="animate-spin" /> : "Go"}
        </button>
        <button type="button" onClick={locate} disabled={busy !== null} className={btn} aria-label="Use my location" title="Use my location">
          {busy === "locate" ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
        </button>
        <button type="button" onClick={() => setSatellite((s) => !s)} className={btn} aria-label={satellite ? "Show streets" : "Show satellite"} title={satellite ? "Streets" : "Satellite"}>
          <Layers size={14} />
        </button>
      </div>
      <div ref={boxRef} className="h-72 w-full sm:h-80" style={{ cursor: "crosshair" }} />
      <div className="flex items-center justify-between gap-2 p-2">
        <p className={`min-w-0 truncate text-sm ${readout ? "font-semibold" : "opacity-70"}`}>{note || readout || hint}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => { const next = points.slice(0, -1); onChange(next, measureFeet(measure, next)); }} disabled={points.length === 0} className={btn} aria-label="Undo last point">
            <Undo2 size={14} /> Undo
          </button>
          <button type="button" onClick={() => onChange([], null)} disabled={points.length === 0} className={btn} aria-label="Clear">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
