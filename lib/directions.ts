import { directionsBudgetOk } from "@/lib/mapbox-budget";
import { recordDirectionsCall } from "@/lib/usage";
import type { RoutePoint } from "@/lib/geo-estimate";

/**
 * Mapbox Directions for a tech's route — ONE request buys both the road
 * geometry the map draws and the drive time + distance of every leg between
 * consecutive stops. That is what makes it the cheap path for the routes
 * page and the calendar's drive-gap labels: a Directions request is billed
 * as one request (100k free a month), where a Matrix call over the same day
 * is N² elements. Metered per tenant and platform-wide
 * (lib/mapbox-budget.ts) and cached in-process for ten minutes, so browsing
 * back and forth over a day doesn't re-buy the same line.
 *
 * Mapbox caps a request at 25 coordinates; a longer chain is driven in
 * overlapping windows of 25 and stitched, so a 40-stop day still gets road
 * legs and a continuous line.
 *
 * Returns null when there's no token, the budget is spent, or the API
 * fails — callers fall back to straight-line estimates, as before.
 */

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
export const DIRECTIONS_MAX_COORDS = 25;

export type RouteLeg = { minutes: number; km: number };

export type RouteDirections = {
  /** [lat, lng] pairs along the road, Leaflet order. */
  coords: [number, number][];
  minutes: number;
  km: number;
  /** legs[i] = from points[i] to points[i+1]. */
  legs: RouteLeg[];
};

/** Back-compat alias for the map page. */
export type RouteGeometry = RouteDirections;

const cache = new Map<string, { at: number; directions: RouteDirections }>();
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 100;

export function directionsEnabled(): boolean {
  return Boolean(MAPBOX_TOKEN);
}

function pointsKey(points: RoutePoint[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
}

/**
 * Split a chain into windows of at most `size` points that share one point
 * at each seam, so the legs of the windows concatenate to the legs of the
 * whole chain. Pure (unit-tested).
 */
export function chainWindows<T>(points: T[], size = DIRECTIONS_MAX_COORDS): T[][] {
  if (points.length <= size) return [points];
  const out: T[][] = [];
  let start = 0;
  while (start < points.length - 1) {
    const end = Math.min(points.length, start + size);
    out.push(points.slice(start, end));
    if (end === points.length) break;
    start = end - 1;
  }
  return out;
}

async function fetchWindow(points: RoutePoint[], companyId?: string | null): Promise<RouteDirections | null> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  recordDirectionsCall(companyId);
  if (!res.ok) {
    console.error("[directions] mapbox failed:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as {
    routes?: {
      duration: number;
      distance: number;
      geometry: { coordinates: [number, number][] };
      legs?: { duration: number; distance: number }[];
    }[];
  };
  const route = data.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return null;
  const legs = (route.legs ?? []).map((l) => ({ minutes: l.duration / 60, km: l.distance / 1000 }));
  if (legs.length !== points.length - 1) return null; // a leg per hop, or the answer is unusable
  return {
    coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    minutes: route.duration / 60,
    km: route.distance / 1000,
    legs,
  };
}

/**
 * Road geometry + per-leg figures for an ordered chain of points. Never
 * throws; null means "draw dashed lines and estimate".
 */
export async function routeDirections(points: RoutePoint[], companyId?: string | null): Promise<RouteDirections | null> {
  if (!MAPBOX_TOKEN || points.length < 2) return null;
  const key = pointsKey(points);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.directions;
  const windows = chainWindows(points);
  if (!(await directionsBudgetOk(companyId))) return null;

  try {
    const parts: RouteDirections[] = [];
    for (const w of windows) {
      const part = await fetchWindow(w, companyId);
      if (!part) return null;
      parts.push(part);
    }
    const directions: RouteDirections =
      parts.length === 1
        ? parts[0]
        : {
            coords: parts.flatMap((p, i) => (i === 0 ? p.coords : p.coords.slice(1))),
            minutes: parts.reduce((s, p) => s + p.minutes, 0),
            km: parts.reduce((s, p) => s + p.km, 0),
            legs: parts.flatMap((p) => p.legs),
          };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), directions });
    return directions;
  } catch (err) {
    console.error("[directions] mapbox threw:", err);
    return null;
  }
}

/** The map page's view: just the line. */
export async function routeGeometry(points: RoutePoint[], companyId?: string | null): Promise<RouteGeometry | null> {
  return routeDirections(points, companyId);
}
