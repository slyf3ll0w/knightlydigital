/**
 * Drive-time engine for the Route Manager. Two layers:
 *
 *  - driveTimeMatrix(): minutes between every pair of stops. Real road times
 *    from the Mapbox Matrix API when MAPBOX_TOKEN is set (≤25 coordinates per
 *    call — a hard Mapbox limit that comfortably fits a tech's day); falls
 *    back to a haversine estimate (straight line × road factor / average
 *    speed) when the token is missing, the call fails, or the day is bigger
 *    than the API allows. Callers can't tell which one they got — both are
 *    "minutes[from][to]" — so the optimizer works with or without the key.
 *
 *  - solveStopOrder(): open-path TSP (start fixed, no return leg) via
 *    nearest-neighbor construction + 2-opt improvement. Days are ≤25 stops,
 *    so exhaustive 2-opt with full-path recost (drive times are asymmetric)
 *    is instant and within a few percent of optimal.
 */

import { matrixBudgetOk } from "@/lib/mapbox-budget";
import { recordMatrixCall } from "@/lib/usage";

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

export type RoutePoint = { lat: number; lng: number };

/** Great-circle distance in km. */
export function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Straight-line km → estimated drive minutes. Roads aren't straight (×1.3)
 * and service-area driving averages ~45 km/h with stops and lights. Identical
 * coordinates (same property twice) cost zero.
 */
export function estimateDriveMinutes(km: number): number {
  if (km <= 0.02) return 0;
  return Math.max(2, (km * 1.3 * 60) / 45);
}

function haversineMatrix(points: RoutePoint[]): number[][] {
  return points.map((from) =>
    points.map((to) => estimateDriveMinutes(haversineKm(from, to)))
  );
}

// Same day, same pins → same matrix. Route pages re-fetch on every visit and
// every optimize preview re-asks for the identical point set, so a short
// in-process cache keeps casual browsing from eating the monthly element
// budget. Keyed on rounded coordinates (≈1 m at 5 decimals).
const matrixCache = new Map<string, { at: number; matrix: number[][] }>();
const MATRIX_CACHE_MS = 10 * 60_000;
const MATRIX_CACHE_MAX = 200;

function matrixCacheKey(points: RoutePoint[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
}

/**
 * Pairwise drive-time matrix in minutes. Never throws — worst case is the
 * haversine estimate.
 */
export async function driveTimeMatrix(
  points: RoutePoint[],
  /** Tenant to meter the (platform-billed) matrix call against. */
  companyId?: string | null
): Promise<number[][]> {
  if (points.length < 2) return points.map(() => points.map(() => 0));
  if (!MAPBOX_TOKEN || points.length > 25) return haversineMatrix(points);

  const key = matrixCacheKey(points);
  const hit = matrixCache.get(key);
  if (hit && Date.now() - hit.at < MATRIX_CACHE_MS) return hit.matrix;

  // Free-tier kill switch (lib/mapbox-budget.ts) — over the monthly element
  // cap the optimizer silently runs on the haversine estimate instead.
  if (!(await matrixBudgetOk(points.length * points.length))) return haversineMatrix(points);

  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}` +
      `?annotations=duration&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    recordMatrixCall(companyId, points.length * points.length);
    if (!res.ok) {
      console.error("[routing] mapbox matrix failed:", res.status, await res.text());
      return haversineMatrix(points);
    }
    const data = (await res.json()) as { durations?: (number | null)[][] };
    const durations = data.durations;
    if (!durations || durations.length !== points.length) return haversineMatrix(points);
    // null cells = unroutable pair (island, bad snap) — patch with the estimate
    const matrix = durations.map((row, i) =>
      row.map((sec, j) =>
        sec == null ? estimateDriveMinutes(haversineKm(points[i], points[j])) : sec / 60
      )
    );
    if (matrixCache.size >= MATRIX_CACHE_MAX) {
      matrixCache.delete(matrixCache.keys().next().value!);
    }
    matrixCache.set(key, { at: Date.now(), matrix });
    return matrix;
  } catch (err) {
    console.error("[routing] mapbox matrix threw:", err);
    return haversineMatrix(points);
  }
}

/** Total minutes along an ordered open path. */
export function routeMinutes(matrix: number[][], order: number[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += matrix[order[i - 1]][order[i]];
  return total;
}

/**
 * Best visiting order over `matrix`, starting at index `startIndex` (fixed —
 * the shop, or wherever the day begins) and ending wherever the route ends.
 * Returns the full order including the start index.
 */
export function solveStopOrder(matrix: number[][], startIndex = 0): number[] {
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
  let bestCost = routeMinutes(matrix, order);
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        const cost = routeMinutes(matrix, candidate);
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
