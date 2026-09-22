import type * as Leaflet from "leaflet";

/**
 * One basemap for every Leaflet map in Workbench — the Routes page, the
 * team map and the estimate tools' draw-to-measure tracer — so they can
 * never drift apart again (docs/plans/route-manager-facelift-2026-09-19.md,
 * Phase 1).
 *
 * With NEXT_PUBLIC_MAPBOX_TOKEN set (a PUBLIC pk. token, URL-restricted to
 * our domains and scoped to styles:tiles + styles:read only) the tiles are
 * Mapbox Static Tiles: 512 px retina rasters of a quiet style for streets
 * and satellite imagery for tracing. Retina is what fixes the soft phone
 * tiles, and the imagery stays sharp at z20–22 where the old Esri fallback
 * (native z19, 256 px) turned to mush the moment you zoomed in to trace.
 *
 * Without a token every map falls back to exactly what shipped before —
 * OpenStreetMap streets and Esri World Imagery — so local dev and a revoked
 * token never break a page. The style ids are env too, so a Workbench style
 * from Mapbox Studio can land without a deploy.
 *
 * Client-side tile fetches can't pass through lib/mapbox-budget.ts (that
 * guard meters server calls); the protection is the token's URL restriction
 * plus a usage alert in the Mapbox dashboard.
 */

export type BasemapKind = "streets" | "satellite";

// Referenced as full literals so Next inlines them into the client bundle.
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const STREETS_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox/light-v11";
const SATELLITE_STYLE = process.env.NEXT_PUBLIC_MAPBOX_SATELLITE_STYLE || "mapbox/satellite-streets-v12";

/** Where a map opens when it has nothing better — remembered per browser, shared by every map. */
export const LAST_VIEW_KEY = "wb.map.lastView";

/** Continental US — the cold-start view of last resort. */
export const US_VIEW: { center: [number, number]; zoom: number } = { center: [39.5, -98.35], zoom: 4 };

/** True when the Mapbox basemap is configured (a public pk. token). */
export function basemapEnabled(): boolean {
  return /^pk\.[A-Za-z0-9._-]{20,}$/.test(TOKEN);
}

const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> <a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noopener">Improve this map</a>';

function mapboxUrl(style: string): string {
  const id = style.replace(/^mapbox:\/\/styles\//, "").replace(/^\/+|\/+$/g, "");
  return `https://api.mapbox.com/styles/v1/${id}/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(TOKEN)}`;
}

/** The tile layer for a kind of basemap — not yet on a map. */
export function basemapLayer(L: typeof Leaflet, kind: BasemapKind = "streets"): Leaflet.TileLayer {
  if (basemapEnabled()) {
    const satellite = kind === "satellite";
    return L.tileLayer(mapboxUrl(satellite ? SATELLITE_STYLE : STREETS_STYLE), {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: satellite ? 22 : 20,
      updateWhenIdle: true,
      className: "wb-tile",
      attribution: satellite ? `${MAPBOX_ATTRIBUTION} &copy; Maxar` : MAPBOX_ATTRIBUTION,
    });
  }
  // Fallback — exactly the layers every map used before the basemap swap.
  if (kind === "satellite") {
    return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 21,
      maxNativeZoom: 19,
      updateWhenIdle: true,
      className: "wb-tile",
      attribution: "Imagery &copy; Esri",
    });
  }
  return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    maxNativeZoom: 19,
    updateWhenIdle: true,
    className: "wb-tile",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  });
}

/** Put the basemap on a map (and trim Leaflet's attribution prefix so the strip stays one line). */
export function addBasemap(L: typeof Leaflet, map: Leaflet.Map, kind: BasemapKind = "streets"): Leaflet.TileLayer {
  const layer = basemapLayer(L, kind).addTo(map);
  map.attributionControl?.setPrefix(false);
  return layer;
}

/** Both layers for a streets ↔ satellite toggle (the tracer). Neither is on the map yet. */
export function createLayers(L: typeof Leaflet): { streets: Leaflet.TileLayer; satellite: Leaflet.TileLayer } {
  return { streets: basemapLayer(L, "streets"), satellite: basemapLayer(L, "satellite") };
}

export type SavedView = { c: [number, number]; z: number };

/** The last place any Workbench map was looking (this browser), if we know it. */
export function lastView(): SavedView | null {
  try {
    const raw = localStorage.getItem(LAST_VIEW_KEY);
    const v = raw ? (JSON.parse(raw) as SavedView) : null;
    if (v && Array.isArray(v.c) && v.c.length === 2 && Number.isFinite(v.c[0]) && Number.isFinite(v.c[1])) return v;
  } catch {
    /* private mode, blocked storage */
  }
  return null;
}

/** Remember where a map is looking, for the next map that has nothing better to show. */
export function rememberView(map: Leaflet.Map): void {
  try {
    const c = map.getCenter();
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify({ c: [c.lat, c.lng], z: map.getZoom() } satisfies SavedView));
  } catch {
    /* ignore */
  }
}

/**
 * The view to open on BEFORE the first tile request, best first: a fixed
 * point the caller knows (the business's address), the last place a map
 * was looking, or the continental US as the final fallback. No more
 * US-at-zoom-4 flash before the data lands.
 */
export function initialView(opts: { home?: { lat: number; lng: number } | null; homeZoom?: number; maxZoom?: number } = {}): { center: [number, number]; zoom: number } {
  if (opts.home && Number.isFinite(opts.home.lat) && Number.isFinite(opts.home.lng)) {
    return { center: [opts.home.lat, opts.home.lng], zoom: opts.homeZoom ?? 11 };
  }
  const last = lastView();
  if (last) return { center: last.c, zoom: Math.min(opts.maxZoom ?? 19, Number.isFinite(last.z) ? last.z : 12) };
  return US_VIEW;
}

/** Does this person prefer less motion? Every map animation checks before it moves. */
export function reducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
