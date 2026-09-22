"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Check, Crosshair, Layers, Loader2, Minus, Plus, RotateCcw, Search, Undo2 } from "lucide-react";
import { createLayers, initialView, reducedMotion, rememberView } from "@/lib/basemap";
import "leaflet/dist/leaflet.css";

/**
 * Draw-to-measure for estimate tools' `map` questions: the customer (or the
 * tech standing in the yard) taps corners on a satellite map and the tool
 * gets a number — feet along a fence line, or square feet of a lawn / roof /
 * driveway.
 *
 * How it behaves (the part that has to feel right):
 *   - tap to drop a corner; on desktop a dashed line follows the cursor
 *   - every corner is a handle you can DRAG; the faint dot on each edge
 *     drags out a new corner between two
 *   - each edge shows its length in feet; the total sits under the map
 *   - an area CLOSES when you tap the first corner again (or "Close shape");
 *     until then the closing edge is dashed
 *   - Undo removes the last corner (and reopens a closed shape); Clear
 *     starts over
 *   - opens on the business's location when the page knows it, else where
 *     the map was last, else "My location" / address search
 * Tiles come from lib/basemap.ts — Mapbox retina rasters when
 * NEXT_PUBLIC_MAPBOX_TOKEN is set (the satellite imagery stays sharp at the
 * zoom you trace at; the old Esri fallback went grainy past z19), OSM +
 * Esri otherwise. Address search goes through /api/public/geocode (Mapbox,
 * env-gated). The controls are our own glass pills, same as the Routes page.
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
const mid = (a: LatLngTuple, b: LatLngTuple): LatLngTuple => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export default function MapMeasure({
  measure,
  points,
  onChange,
  accent = "#16a34a",
  dark = false,
  initialCenter = null,
}: {
  measure: "length" | "area";
  points: LatLngTuple[];
  onChange: (points: LatLngTuple[], value: number | null) => void;
  accent?: string;
  dark?: boolean;
  /** Where to open when there's no shape yet (the business's location, say). */
  initialCenter?: LatLngTuple | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const shapeRef = useRef<Leaflet.LayerGroup | null>(null);
  const handlesRef = useRef<Leaflet.LayerGroup | null>(null);
  const previewRef = useRef<Leaflet.Polyline | null>(null);
  const tilesRef = useRef<{ streets: Leaflet.TileLayer; sat: Leaflet.TileLayer } | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const closedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"search" | "locate" | null>(null);
  const [note, setNote] = useState("");
  const [closed, setClosed] = useState(false);
  closedRef.current = closed;

  const commit = (next: LatLngTuple[]) => onChangeRef.current(next, measureFeet(measureRef.current, next));

  // ── the map, once ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !boxRef.current || mapRef.current) return;
      LRef.current = L;
      // Framed before the first tile request: the shape, the business, the last place a map looked, the US
      const initial = pointsRef.current;
      const view = initialView({ home: initialCenter ? { lat: initialCenter[0], lng: initialCenter[1] } : null, homeZoom: 18, maxZoom: 19 });
      const map = L.map(boxRef.current, {
        center: view.center,
        zoom: view.zoom,
        doubleClickZoom: false,
        zoomControl: false,
        attributionControl: true,
        tap: true,
        zoomAnimation: !reducedMotion(),
        fadeAnimation: !reducedMotion(),
      } as Leaflet.MapOptions);
      const { streets, satellite: sat } = createLayers(L);
      tilesRef.current = { streets, sat };
      sat.addTo(map);
      map.attributionControl?.setPrefix(false);
      shapeRef.current = L.layerGroup().addTo(map);
      handlesRef.current = L.layerGroup().addTo(map);
      if (initial.length > 0) map.fitBounds(L.latLngBounds(initial), { padding: [40, 40], maxZoom: 19, animate: false });
      map.on("moveend", () => rememberView(map));

      // drop a corner
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        if (measureRef.current === "area" && closedRef.current) return;
        commit([...pointsRef.current, [e.latlng.lat, e.latlng.lng]]);
      });
      // desktop: a dashed line follows the cursor from the last corner
      map.on("mousemove", (e: Leaflet.LeafletMouseEvent) => {
        const pts = pointsRef.current;
        if (pts.length === 0 || (measureRef.current === "area" && closedRef.current)) {
          previewRef.current?.remove();
          previewRef.current = null;
          return;
        }
        const seg: LatLngTuple[] = [pts[pts.length - 1], [e.latlng.lat, e.latlng.lng]];
        if (!previewRef.current) previewRef.current = L.polyline(seg, { color: accent, weight: 2, dashArray: "4 6", opacity: 0.7, interactive: false }).addTo(map);
        else previewRef.current.setLatLngs(seg);
      });
      map.on("mouseout", () => {
        previewRef.current?.remove();
        previewRef.current = null;
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

  // a shape with fewer than 3 corners can't be closed
  useEffect(() => {
    if (points.length < 3 && closed) setClosed(false);
  }, [points.length, closed]);

  // ── redraw the shape + handles ──
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const shape = shapeRef.current;
    const handles = handlesRef.current;
    if (!L || !map || !shape || !handles || !ready) return;
    shape.clearLayers();
    handles.clearLayers();
    const isArea = measure === "area";
    const ring = isArea && (closed || points.length >= 3);

    // lines / fill
    let poly: Leaflet.Polyline | Leaflet.Polygon | null = null;
    if (points.length >= 2) {
      if (isArea && points.length >= 3) {
        poly = L.polygon(points, { color: accent, weight: closed ? 3 : 2, fillColor: accent, fillOpacity: closed ? 0.3 : 0.18, dashArray: closed ? undefined : "6 6" }).addTo(shape);
      } else {
        poly = L.polyline(points, { color: accent, weight: 3 }).addTo(shape);
      }
    }

    // edge lengths
    const edges: [LatLngTuple, LatLngTuple][] = [];
    for (let i = 1; i < points.length; i++) edges.push([points[i - 1], points[i]]);
    if (ring && closed && points.length >= 3) edges.push([points[points.length - 1], points[0]]);
    for (const [a, b] of edges) {
      const ft = Math.round(distM(a, b) * M_TO_FT);
      if (ft < 1) continue;
      L.tooltip({ permanent: true, direction: "center", className: "wb-map-label", interactive: false, opacity: 1 })
        .setLatLng(mid(a, b))
        .setContent(`${fmt(ft)} ft`)
        .addTo(shape);
    }

    // corner handles (draggable)
    const corner = (on: boolean) =>
      L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:999px;background:${on ? accent : "#fff"};border:3px solid ${on ? "#fff" : accent};box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
    points.forEach((p, i) => {
      const first = i === 0;
      const m = L.marker(p, { draggable: true, icon: corner(first && isArea && !closed && points.length >= 3), keyboard: false, autoPan: true, title: first && isArea && !closed && points.length >= 3 ? "Tap to close the shape" : "Drag to adjust" }).addTo(handles);
      m.on("drag", (e) => {
        const ll = (e.target as Leaflet.Marker).getLatLng();
        const next = pointsRef.current.map((x, k) => (k === i ? ([ll.lat, ll.lng] as LatLngTuple) : x));
        poly?.setLatLngs(next);
      });
      m.on("dragend", (e) => {
        const ll = (e.target as Leaflet.Marker).getLatLng();
        commit(pointsRef.current.map((x, k) => (k === i ? ([ll.lat, ll.lng] as LatLngTuple) : x)));
      });
      m.on("click", () => {
        if (first && isArea && !closed && points.length >= 3) setClosed(true);
      });
    });

    // midpoint handles: drag one out to add a corner between two
    const midIcon = L.divIcon({
      className: "",
      html: `<div style="width:12px;height:12px;border-radius:999px;background:#fff;opacity:.85;border:2px solid ${accent};box-shadow:0 1px 2px rgba(0,0,0,.35)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    const segCount = ring && closed ? points.length : points.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const insertAt = i + 1;
      const m = L.marker(mid(a, b), { draggable: true, icon: midIcon, keyboard: false, title: "Drag to add a corner" }).addTo(handles);
      let draft: LatLngTuple[] | null = null;
      m.on("dragstart", () => {
        draft = [...pointsRef.current];
        draft.splice(insertAt, 0, mid(a, b));
      });
      m.on("drag", (e) => {
        if (!draft) return;
        const ll = (e.target as Leaflet.Marker).getLatLng();
        draft[insertAt] = [ll.lat, ll.lng];
        poly?.setLatLngs(draft);
      });
      m.on("dragend", (e) => {
        if (!draft) return;
        const ll = (e.target as Leaflet.Marker).getLatLng();
        draft[insertAt] = [ll.lat, ll.lng];
        commit(draft);
        draft = null;
      });
    }
  }, [points, accent, measure, ready, closed]);

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

  function undo() {
    if (closed) {
      setClosed(false);
      return;
    }
    commit(points.slice(0, -1));
  }
  function clear() {
    setClosed(false);
    commit([]);
  }

  const value = measureFeet(measure, points);
  const readout = value !== null ? (measure === "length" ? `${fmt(value)} ft` : `${fmt(value)} sq ft`) : null;
  const canClose = measure === "area" && !closed && points.length >= 3;
  const hint =
    points.length === 0
      ? "Zoom in to the property, then tap the first corner."
      : measure === "length"
        ? points.length === 1
          ? "Tap the next corner along the line."
          : "Keep tapping corners. Drag a corner to adjust; the small dots add one."
        : closed
          ? "Closed. Drag a corner to adjust — the small dots add one."
          : points.length < 3
            ? "Tap the next corner."
            : "Tap the first corner (or Close shape) to finish. Keep tapping to add corners.";
  const shell = dark ? "border-white/15 bg-white/5 text-gray-200" : "border-gray-300 bg-white text-gray-800";
  const btn = `inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium disabled:opacity-50 ${dark ? "border-white/15 bg-[#101410] text-gray-200 hover:bg-white/10" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`;

  return (
    <div className={`wb-measure overflow-hidden rounded-lg border ${shell}`}>
      <style>{`.wb-map-label{background:rgba(17,24,39,.82);color:#fff;border:0;border-radius:6px;padding:1px 6px;font:600 11px/1.5 Inter,system-ui,sans-serif;box-shadow:none;white-space:nowrap}.wb-map-label::before{display:none}.wb-measure .leaflet-container{font-family:inherit;background:#eef0f3}.wb-measure .leaflet-control-attribution{font-size:9px;opacity:.8;background:rgba(255,255,255,.7);padding:1px 6px;border-radius:6px 0 0 0}`}</style>
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
      <div className="relative isolate">
        <div ref={boxRef} className="h-80 w-full sm:h-96" style={{ cursor: "crosshair" }} />
        <div className="absolute right-2 top-2 z-[1000] flex flex-col items-end gap-1.5">
          <div className="wb-map-glass flex flex-col overflow-hidden rounded-[10px]">
            <button type="button" onClick={() => mapRef.current?.zoomIn()} className="wb-map-ctl" style={{ width: 36, height: 36 }} aria-label="Zoom in" title="Zoom in">
              <Plus size={15} />
            </button>
            <span className="mx-1.5 h-px bg-gray-200" aria-hidden />
            <button type="button" onClick={() => mapRef.current?.zoomOut()} className="wb-map-ctl" style={{ width: 36, height: 36 }} aria-label="Zoom out" title="Zoom out">
              <Minus size={15} />
            </button>
          </div>
        </div>
        {readout && (
          <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg bg-gray-900/85 px-2.5 py-1.5 text-sm font-semibold tabular-nums text-white shadow">
            {readout}
            {measure === "area" && !closed && <span className="ml-1.5 text-[11px] font-medium text-white/70">so far</span>}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-2">
        <p className={`min-w-0 flex-1 text-xs ${note ? "" : "opacity-80"}`}>{note || hint}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {canClose && (
            <button type="button" onClick={() => setClosed(true)} className={btn} style={{ borderColor: accent, color: accent }}>
              <Check size={14} /> Close shape
            </button>
          )}
          <button type="button" onClick={undo} disabled={points.length === 0} className={btn} aria-label="Undo last corner">
            <Undo2 size={14} /> Undo
          </button>
          <button type="button" onClick={clear} disabled={points.length === 0} className={btn} aria-label="Clear">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
