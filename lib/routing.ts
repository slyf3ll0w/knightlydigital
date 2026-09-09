/**
 * Drive-time engine for the Route Manager. Two layers:
 *
 *  - driveMatrix(): minutes AND kilometers between every pair of stops.
 *    Real road figures from the Mapbox Matrix API when MAPBOX_TOKEN is set
 *    (≤25 coordinates per call — a hard Mapbox limit that comfortably fits a
 *    tech's day); falls back to a haversine estimate (straight line × road
 *    factor / average speed) when the token is missing, the call fails, or
 *    the day is bigger than the API allows. `measured` says which one you
 *    got, so display copy can hedge ("~12 min") only when it should.
 *    driveTimeMatrix() is the minutes-only view older callers use.
 *
 *  - solveStopOrder(): TSP over the matrix — open path by default (start
 *    fixed, end anywhere), or a round trip that comes back to the start.
 *    Nearest-neighbor construction + 2-opt improvement. Days are ≤25 stops,
 *    so exhaustive 2-opt with full-path recost (drive times are asymmetric)
 *    is instant and within a few percent of optimal.
 */

import { matrixBudgetOk } from "@/lib/mapbox-budget";
import { recordMatrixCall } from "@/lib/usage";

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

export type { RoutePoint } from "@/lib/geo-estimate";
import { haversineKm, estimateDriveMinutes, type RoutePoint } from "@/lib/geo-estimate";
export { haversineKm, estimateDriveMinutes };

export type DriveMatrix = {
  minutes: number[][];
  km: number[][];
  /** true = Mapbox road figures; false = straight-line estimate. */
  measured: boolean;
};

const ROAD_FACTOR = 1.3;

function haversineDriveMatrix(points: RoutePoint[]): DriveMatrix {
  return {
    minutes: points.map((from) => points.map((to) => estimateDriveMinutes(haversineKm(from, to)))),
    km: points.map((from) => points.map((to) => haversineKm(from, to) * ROAD_FACTOR)),
    measured: false,
  };
}

// Same day, same pins → same matrix. Route pages re-fetch on every visit and
// every optimize preview re-asks for the identical point set, so a short
// in-process cache keeps casual browsing from eating the monthly element
// budget. Keyed on rounded coordinates (≈1 m at 5 decimals).
const matrixCache = new Map<string, { at: number; matrix: DriveMatrix }>();
const MATRIX_CACHE_MS = 10 * 60_000;
const MATRIX_CACHE_MAX = 200;

function matrixCacheKey(points: RoutePoint[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
}

/**
 * Pairwise drive matrix (minutes + km). Never throws — worst case is the
 * haversine estimate.
 */
export async function driveMatrix(
  points: RoutePoint[],
  /** Tenant to meter the (platform-billed) matrix call against. */
  companyId?: string | null
): Promise<DriveMatrix> {
  if (points.length < 2) {
    const zero = points.map(() => points.map(() => 0));
    return { minutes: zero, km: zero.map((r) => [...r]), measured: Boolean(MAPBOX_TOKEN) };
  }
  if (!MAPBOX_TOKEN || points.length > 25) return haversineDriveMatrix(points);

  const key = matrixCacheKey(points);
  const hit = matrixCache.get(key);
  if (hit && Date.now() - hit.at < MATRIX_CACHE_MS) return hit.matrix;

  // Free-tier kill switch (lib/mapbox-budget.ts) — over the monthly element
  // cap the optimizer silently runs on the haversine estimate instead.
  if (!(await matrixBudgetOk(points.length * points.length))) return haversineDriveMatrix(points);

  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}` +
      `?annotations=duration,distance&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    recordMatrixCall(companyId, points.length * points.length);
    if (!res.ok) {
      console.error("[routing] mapbox matrix failed:", res.status, await res.text());
      return haversineDriveMatrix(points);
    }
    const data = (await res.json()) as {
      durations?: (number | null)[][];
      distances?: (number | null)[][];
    };
    const durations = data.durations;
    if (!durations || durations.length !== points.length) return haversineDriveMatrix(points);
    // null cells = unroutable pair (island, bad snap) — patch with the estimate
    const minutes = durations.map((row, i) =>
      row.map((sec, j) => (sec == null ? estimateDriveMinutes(haversineKm(points[i], points[j])) : sec / 60))
    );
    const km = points.map((_, i) =>
      points.map((_, j) => {
        const m = data.distances?.[i]?.[j];
        return m == null ? haversineKm(points[i], points[j]) * ROAD_FACTOR : m / 1000;
      })
    );
    const matrix: DriveMatrix = { minutes, km, measured: true };
    if (matrixCache.size >= MATRIX_CACHE_MAX) {
      matrixCache.delete(matrixCache.keys().next().value!);
    }
    matrixCache.set(key, { at: Date.now(), matrix });
    return matrix;
  } catch (err) {
    console.error("[routing] mapbox matrix threw:", err);
    return haversineDriveMatrix(points);
  }
}

/** Minutes-only view of driveMatrix() for callers that only schedule. */
export async function driveTimeMatrix(points: RoutePoint[], companyId?: string | null): Promise<number[][]> {
  return (await driveMatrix(points, companyId)).minutes;
}

/** Total along an ordered path; `closeLoop` adds the leg back to the start. */
export function routeMinutes(matrix: number[][], order: number[], closeLoop = false): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += matrix[order[i - 1]][order[i]];
  if (closeLoop && order.length > 1) total += matrix[order[order.length - 1]][order[0]];
  return total;
}

/**
 * Best visiting order over `matrix`, starting at index `startIndex` (fixed —
 * the shop, or wherever the day begins). Open path ends wherever it ends;
 * `roundTrip` costs the drive back to the start too, so the last stop lands
 * near home. Returns the full order including the start index.
 */
export function solveStopOrder(matrix: number[][], startIndex = 0, roundTrip = false): number[] {
  const n = matrix.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);

  // Nearest-neighbor construction
  const visited = new Set<number>([startIndex]);
  const order = [startIndex];
  while (order.length < n) {
    const last = order[order.length - 1];
    let best = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && matrix[last][j] < bestCost) {
        best = j;
        bestCost = matrix[last][j];
      }
    }
    order.push(best);
    visited.add(best);
  }

  // 2-opt: reverse any middle segment that shortens the path. Full recost per
  // candidate because drive times are asymmetric; n ≤ 25 keeps this instant.
  let improved = true;
  let bestCost = routeMinutes(matrix, order, roundTrip);
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        const cost = routeMinutes(matrix, candidate, roundTrip);
        if (cost < bestCost - 0.01) {
          order.splice(0, n, ...candidate);
          bestCost = cost;
          improved = true;
        }
      }
    }
  }
  return order;
}

/** Round a drive gap up to the schedule's 5-minute feel. */
export function roundGapMinutes(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 5) * 5;
}

export function kmToMiles(km: number): number {
  return km * 0.621371;
}
