import { matrixBudgetOk } from "@/lib/mapbox-budget";
import { recordMatrixCall } from "@/lib/usage";
import type { RoutePoint } from "@/lib/geo-estimate";

/**
 * Road geometry for a tech's route — the actual driven path, so the map
 * draws streets instead of straight lines between pins. Mapbox Directions
 * (driving, full-resolution GeoJSON), ≤25 coordinates per request. Metered
 * against the same monthly Mapbox budget as the matrix (one element per
 * coordinate) and cached in-process for ten minutes, so browsing back and
 * forth over a day doesn't re-buy the same line.
 *
 * Returns null when there's no token, the budget is spent, or the API
 * fails — the map falls back to dashed straight lines, as before.
 */

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

export type RouteGeometry = {
  /** [lat, lng] pairs along the road, Leaflet order. */
  coords: [number, number][];
  minutes: number;
  km: number;
};

const cache = new Map<string, { at: number; geometry: RouteGeometry }>();
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 100;

export function directionsEnabled(): boolean {
  return Boolean(MAPBOX_TOKEN);
}

export async function routeGeometry(
  points: RoutePoint[],
  companyId?: string | null
): Promise<RouteGeometry | null> {
  if (!MAPBOX_TOKEN || points.length < 2 || points.length > 25) return null;
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.geometry;
  if (!(await matrixBudgetOk(points.length))) return null;

  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
      `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    recordMatrixCall(companyId, points.length);
    if (!res.ok) {
      console.error("[directions] mapbox failed:", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as {
      routes?: { duration: number; distance: number; geometry: { coordinates: [number, number][] } }[];
    };
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;
    const geometry: RouteGeometry = {
      coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      minutes: route.duration / 60,
      km: route.distance / 1000,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), geometry });
    return geometry;
  } catch (err) {
    console.error("[directions] mapbox threw:", err);
    return null;
  }
}
