import { reportError } from "@/lib/report-error";
/**
 * Drive-time engine for the Route Manager. Three layers:
 *
 *  - driveChainLegs(): minutes AND kilometers between CONSECUTIVE points of
 *    an ordered chain (the shop → stop 1 → stop 2 …). This is what every
 *    display surface needs — the routes page, the calendar's drive-gap
 *    labels — and it is cheap: one Mapbox Directions request per tech per
 *    day, most of it answered from the leg cache without any request.
 *
 *  - driveMatrix(): minutes AND kilometers between EVERY pair of points —
 *    what Optimize and Find-a-Time need. Real road figures from the Mapbox
 *    Matrix API (≤25 coordinates per call — a hard Mapbox limit), billed per
 *    cell (N²), so it is only asked for when someone is actually solving a
 *    route, and only for the pairs the cache doesn't already hold.
 *    driveTimeMatrix() is the minutes-only view older callers use.
 *
 *    Both fall back to a haversine estimate (straight line × road factor /
 *    average speed) when the token is missing, a monthly cap is spent, the
 *    call fails, or the day is bigger than the API allows. `measured` says
 *    which one you got, so display copy can hedge ("~12 min") only when it
 *    should.
 *
 *  - The leg cache (DriveLegCache): every road leg Mapbox ever answered,
 *    keyed on the rounded coordinate pair, platform-wide, for
 *    LEG_CACHE_DAYS. Recurring customers, the shop↔customer legs and every
 *    re-run of the same day come out of Postgres, not Mapbox. This is what
 *    keeps a paying tenant's Mapbox bill at pennies.
 *
 *  - solveStopOrder(): TSP over the matrix — open path by default (start
 *    fixed, end anywhere), or a round trip that comes back to the start.
 *    Nearest-neighbor construction + 2-opt + Or-opt improvement. Days are
 *    ≤25 stops, so exhaustive local search with full-path recost (drive
 *    times are asymmetric) is instant and within a couple of percent of
 *    optimal.
 */

import { prisma } from "@/lib/db";
import { matrixBudgetOk } from "@/lib/mapbox-budget";
import { recordMatrixCall } from "@/lib/usage";
import { routeDirections, type RouteLeg } from "@/lib/directions";

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

export type ChainLegs = {
  /** legs[i] = from points[i] to points[i+1]. */
  legs: RouteLeg[];
  /** true = every leg is a road figure; false = at least one is estimated. */
  measured: boolean;
};

const ROAD_FACTOR = 1.3;
/** Mapbox Matrix hard limit on coordinates per request. */
export const MATRIX_MAX_COORDS = 25;
export const LEG_CACHE_DAYS = 45;

function estimateLeg(a: RoutePoint, b: RoutePoint): RouteLeg {
  const km = haversineKm(a, b);
  return { minutes: estimateDriveMinutes(km), km: km * ROAD_FACTOR };
}

function haversineDriveMatrix(points: RoutePoint[]): DriveMatrix {
  return {
    minutes: points.map((from) => points.map((to) => estimateDriveMinutes(haversineKm(from, to)))),
    km: points.map((from) => points.map((to) => haversineKm(from, to) * ROAD_FACTOR)),
    measured: false,
  };
}

// ── Leg cache ────────────────────────────────────────────────────────────────

function pointKey(p: RoutePoint): string {
  return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

/** Cache key for the leg a → b (4 decimals ≈ 11 m; direction matters). Pure. */
export function legKey(a: RoutePoint, b: RoutePoint): string {
  return `${pointKey(a)}>${pointKey(b)}`;
}

/** Same pin twice (a two-visit property) — no leg to buy. */
export function samePoint(a: RoutePoint, b: RoutePoint): boolean {
  return pointKey(a) === pointKey(b);
}

async function loadCachedLegs(keys: string[]): Promise<Map<string, RouteLeg>> {
  const out = new Map<string, RouteLeg>();
  if (!keys.length) return out;
  try {
    const rows = await prisma.driveLegCache.findMany({
      where: { key: { in: keys }, updatedAt: { gt: new Date(Date.now() - LEG_CACHE_DAYS * 86400_000) } },
      select: { key: true, minutes: true, km: true },
    });
    for (const r of rows) out.set(r.key, { minutes: r.minutes, km: r.km });
  } catch (err) {
    reportError("[routing] leg cache read failed:", err);
  }
  return out;
}

/** Fire-and-forget: a Mapbox answer is written once and reused for LEG_CACHE_DAYS. */
function storeLegs(rows: { key: string; minutes: number; km: number }[]): void {
  if (!rows.length) return;
  const keys = rows.map((r) => r.key);
  void (async () => {
    try {
      await prisma.driveLegCache.deleteMany({ where: { key: { in: keys } } });
      await prisma.driveLegCache.createMany({ data: rows, skipDuplicates: true });
    } catch (err) {
      reportError("[routing] leg cache write failed:", err);
    }
  })();
}

/** Daily cron: rows past their useful life. */
export async function pruneLegCache(now: Date = new Date()): Promise<number> {
  const r = await prisma.driveLegCache.deleteMany({
    where: { updatedAt: { lt: new Date(now.getTime() - LEG_CACHE_DAYS * 86400_000) } },
  });
  return r.count;
}

// ── Consecutive legs (display) ───────────────────────────────────────────────

/**
 * Drive legs along an ordered chain. Cache first; whatever is missing comes
 * from ONE Directions request for the whole chain (which also refreshes the
 * cache for every leg on it); anything still unknown is estimated. Never
 * throws.
 */
export async function driveChainLegs(points: RoutePoint[], companyId?: string | null): Promise<ChainLegs> {
  const n = points.length;
  if (n < 2) return { legs: [], measured: Boolean(MAPBOX_TOKEN) };
  const legs: (RouteLeg | null)[] = new Array(n - 1).fill(null);
  const wanted: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (samePoint(points[i], points[i + 1])) legs[i] = { minutes: 0, km: 0 };
    else wanted.push(legKey(points[i], points[i + 1]));
  }
  if (MAPBOX_TOKEN && wanted.length) {
    const cached = await loadCachedLegs(wanted);
    for (let i = 0; i < n - 1; i++) {
      if (legs[i]) continue;
      const hit = cached.get(legKey(points[i], points[i + 1]));
      if (hit) legs[i] = hit;
    }
    if (legs.some((l) => l == null)) {
      const road = await routeDirections(points, companyId);
      if (road) {
        const rows: { key: string; minutes: number; km: number }[] = [];
        for (let i = 0; i < n - 1; i++) {
          legs[i] = road.legs[i];
          if (!samePoint(points[i], points[i + 1])) {
            rows.push({ key: legKey(points[i], points[i + 1]), minutes: road.legs[i].minutes, km: road.legs[i].km });
          }
        }
        storeLegs(rows);
      }
    }
  }
  let measured = Boolean(MAPBOX_TOKEN);
  const out = legs.map((l, i) => {
    if (l) return l;
    measured = false;
    return estimateLeg(points[i], points[i + 1]);
  });
  return { legs: out, measured };
}

// ── Pairwise matrix (solving) ────────────────────────────────────────────────

// Same pins → same matrix. Every optimize preview re-asks for the identical
// point set, so a short in-process cache keeps a session of previews from
// re-reading Postgres. Keyed on rounded coordinates (≈1 m at 5 decimals).
const matrixCache = new Map<string, { at: number; matrix: DriveMatrix }>();
const MATRIX_CACHE_MS = 10 * 60_000;
const MATRIX_CACHE_MAX = 200;

function matrixCacheKey(points: RoutePoint[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
}

/**
 * Pairwise drive matrix (minutes + km). Cached legs fill what they can; a
 * Matrix call is made only when some pair is unknown, the day fits the API
 * and the month's budget allows it. Never throws — worst case is the
 * haversine estimate for the pairs nobody has driven yet.
 */
export async function driveMatrix(
  points: RoutePoint[],
  /** Tenant to meter the (platform-billed) matrix call against. */
  companyId?: string | null
): Promise<DriveMatrix> {
  const n = points.length;
  if (n < 2) {
    const zero = points.map(() => points.map(() => 0));
    return { minutes: zero, km: zero.map((r) => [...r]), measured: Boolean(MAPBOX_TOKEN) };
  }
  if (!MAPBOX_TOKEN) return haversineDriveMatrix(points);

  const key = matrixCacheKey(points);
  const hit = matrixCache.get(key);
  if (hit && Date.now() - hit.at < MATRIX_CACHE_MS) return hit.matrix;

  // Start from the estimate and overwrite every pair we know
  const matrix = haversineDriveMatrix(points);
  const wanted = new Set<string>();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || samePoint(points[i], points[j])) {
        matrix.minutes[i][j] = 0;
        matrix.km[i][j] = 0;
      } else wanted.add(legKey(points[i], points[j]));
    }
  }
  const cached = await loadCachedLegs([...wanted]);
  let missing = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || samePoint(points[i], points[j])) continue;
      const leg = cached.get(legKey(points[i], points[j]));
      if (leg) {
        matrix.minutes[i][j] = leg.minutes;
        matrix.km[i][j] = leg.km;
      } else missing++;
    }
  }
  if (missing === 0) {
    matrix.measured = true;
    remember(key, matrix);
    return matrix;
  }
  // Too big for one call, or over a cap: cached pairs stay real, the rest are
  // estimates, and `measured: false` makes the copy say so.
  if (n > MATRIX_MAX_COORDS) return matrix;
  if (!(await matrixBudgetOk(n * n, companyId))) return matrix;

  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}` +
      `?annotations=duration,distance&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    recordMatrixCall(companyId, n * n);
    if (!res.ok) {
      reportError("[routing] mapbox matrix failed:", res.status, await res.text());
      return matrix;
    }
    const data = (await res.json()) as {
      durations?: (number | null)[][];
      distances?: (number | null)[][];
    };
    const durations = data.durations;
    if (!durations || durations.length !== n) return matrix;
    const rows: { key: string; minutes: number; km: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || samePoint(points[i], points[j])) continue;
        const sec = durations[i]?.[j];
        const m = data.distances?.[i]?.[j];
        // null cells = unroutable pair (island, bad snap) — keep the estimate
        if (sec == null) continue;
        matrix.minutes[i][j] = sec / 60;
        matrix.km[i][j] = m == null ? matrix.km[i][j] : m / 1000;
        rows.push({ key: legKey(points[i], points[j]), minutes: sec / 60, km: matrix.km[i][j] });
      }
    }
    storeLegs(rows);
    matrix.measured = true;
    remember(key, matrix);
    return matrix;
  } catch (err) {
    reportError("[routing] mapbox matrix threw:", err);
    return matrix;
  }
}

function remember(key: string, matrix: DriveMatrix) {
  if (matrixCache.size >= MATRIX_CACHE_MAX) {
    matrixCache.delete(matrixCache.keys().next().value!);
  }
  matrixCache.set(key, { at: Date.now(), matrix });
}

/** Minutes-only view of driveMatrix() for callers that only schedule. */
export async function driveTimeMatrix(points: RoutePoint[], companyId?: string | null): Promise<number[][]> {
  return (await driveMatrix(points, companyId)).minutes;
}

// ── Solver ───────────────────────────────────────────────────────────────────

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

  // Nearest-neighbor from the start is one greedy guess; forcing each other
  // stop to go second gives n-1 different guesses, each polished by the same
  // local search, and the cheapest wins. Deterministic (the preview re-solves
  // on every toggle and must not change its mind for no reason) and still
  // instant at n ≤ 25.
  let best: number[] | null = null;
  let bestCost = Infinity;
  for (let second = 0; second < n; second++) {
    if (second === startIndex) continue;
    const order = improveOrder(matrix, construct(matrix, startIndex, second), roundTrip);
    const cost = routeMinutes(matrix, order, roundTrip);
    if (cost < bestCost - 0.01) {
      best = order;
      bestCost = cost;
    }
  }
  return best ?? Array.from({ length: n }, (_, i) => i);
}

/** Nearest-neighbor path from the start, with the second stop forced. */
function construct(matrix: number[][], startIndex: number, second: number): number[] {
  const n = matrix.length;
  const visited = new Set<number>([startIndex, second]);
  const order = [startIndex, second];
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
  return order;
}

/**
 * Local search until nothing improves: 2-opt (reverse a middle segment) and
 * Or-opt (move one stop somewhere else). Full recost per candidate because
 * drive times are asymmetric; n ≤ 25 keeps this instant. Mutates and
 * returns `order`.
 */
function improveOrder(matrix: number[][], order: number[], roundTrip: boolean): number[] {
  const n = order.length;
  let bestCost = routeMinutes(matrix, order, roundTrip);
  let improved = true;
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
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < n; j++) {
        if (j === i) continue;
        const candidate = order.filter((_, k) => k !== i);
        candidate.splice(j, 0, order[i]);
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
