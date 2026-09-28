/**
 * Mapbox spend guards for the Route Manager — two layers:
 *
 *  - PLATFORM caps: the hard stop that keeps the whole platform's Mapbox bill
 *    predictable. Free allowances (as of 2026): 100k geocoding requests,
 *    100k matrix elements and 100k Directions requests a month. Defaults sit
 *    at 90% of each so a race at the boundary can't tip over; override with
 *    MAPBOX_GEOCODE_MONTHLY_CAP / MAPBOX_MATRIX_MONTHLY_CAP /
 *    MAPBOX_DIRECTIONS_MONTHLY_CAP (0 disables that API entirely). Raise them
 *    once paying tenants justify the overage ($2 per 1,000 matrix elements or
 *    Directions requests past the free tier — pennies per tenant per day
 *    with the leg cache in lib/routing.ts doing its job).
 *  - TENANT caps: one busy company must never spend everyone else's month.
 *    MAPBOX_TENANT_MATRIX_MONTHLY_CAP (default 25,000 elements) and
 *    MAPBOX_TENANT_DIRECTIONS_MONTHLY_CAP (default 3,000 requests) pause
 *    ROAD figures for that company alone; the rest of the platform is
 *    untouched.
 *
 * Usage is what we actually sent to Mapbox this calendar month (UTC), summed
 * from CompanyUsageDaily — cache hits never reach the API and never count.
 * Sums are cached in-process for a minute: worst case a gate overshoots by
 * one minute of traffic, which is why the caps sit under the tier. Over a
 * cap, callers degrade to the straight-line estimate and the route page says
 * so (`roadTimesState`) — never silently.
 */

import { prisma } from "@/lib/db";

function cap(envVar: string | undefined, fallback: number): number {
  const n = Number(envVar);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const GEOCODE_MONTHLY_CAP = cap(process.env.MAPBOX_GEOCODE_MONTHLY_CAP, 90_000);
export const MATRIX_MONTHLY_CAP = cap(process.env.MAPBOX_MATRIX_MONTHLY_CAP, 90_000);
export const DIRECTIONS_MONTHLY_CAP = cap(process.env.MAPBOX_DIRECTIONS_MONTHLY_CAP, 90_000);
export const TENANT_MATRIX_MONTHLY_CAP = cap(process.env.MAPBOX_TENANT_MATRIX_MONTHLY_CAP, 25_000);
export const TENANT_DIRECTIONS_MONTHLY_CAP = cap(process.env.MAPBOX_TENANT_DIRECTIONS_MONTHLY_CAP, 3_000);

export type MonthUsage = { geocodeCalls: number; matrixElements: number; directionsCalls: number };

const CACHE_MS = 60_000;
let platformCache: { month: string; at: number; usage: MonthUsage } | null = null;
const tenantCache = new Map<string, { month: string; at: number; usage: MonthUsage }>();

function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // "2026-08", matches usageDay()
}

async function sumUsage(companyId?: string): Promise<MonthUsage> {
  const agg = await prisma.companyUsageDaily.aggregate({
    where: { day: { startsWith: monthKey() }, ...(companyId ? { companyId } : {}) },
    _sum: { geocodeCalls: true, matrixElements: true, directionsCalls: true },
  });
  return {
    geocodeCalls: agg._sum.geocodeCalls ?? 0,
    matrixElements: agg._sum.matrixElements ?? 0,
    directionsCalls: agg._sum.directionsCalls ?? 0,
  };
}

async function monthUsage(): Promise<MonthUsage> {
  const month = monthKey();
  if (platformCache && platformCache.month === month && Date.now() - platformCache.at < CACHE_MS) return platformCache.usage;
  const usage = await sumUsage();
  platformCache = { month, at: Date.now(), usage };
  return usage;
}

async function tenantMonthUsage(companyId: string): Promise<MonthUsage> {
  const month = monthKey();
  const hit = tenantCache.get(companyId);
  if (hit && hit.month === month && Date.now() - hit.at < CACHE_MS) return hit.usage;
  const usage = await sumUsage(companyId);
  if (tenantCache.size > 500) tenantCache.clear();
  tenantCache.set(companyId, { month, at: Date.now(), usage });
  return usage;
}

/** May we send one more forward-geocode request this month? */
export async function geocodeBudgetOk(): Promise<boolean> {
  if (GEOCODE_MONTHLY_CAP <= 0) return false;
  try {
    return (await monthUsage()).geocodeCalls < GEOCODE_MONTHLY_CAP;
  } catch (err) {
    // If the meter itself is broken, spending money on faith is the wrong
    // default — treat unknown as over-cap.
    console.error("[mapbox-budget] usage check failed:", err);
    return false;
  }
}

/** May we send a matrix request of `elements` cells this month (platform + this tenant)? */
export async function matrixBudgetOk(elements: number, companyId?: string | null): Promise<boolean> {
  if (MATRIX_MONTHLY_CAP <= 0) return false;
  try {
    if ((await monthUsage()).matrixElements + elements > MATRIX_MONTHLY_CAP) return false;
    if (companyId && TENANT_MATRIX_MONTHLY_CAP > 0) {
      return (await tenantMonthUsage(companyId)).matrixElements + elements <= TENANT_MATRIX_MONTHLY_CAP;
    }
    return true;
  } catch (err) {
    console.error("[mapbox-budget] usage check failed:", err);
    return false;
  }
}

/** May we send one more Directions request this month (platform + this tenant)? */
export async function directionsBudgetOk(companyId?: string | null): Promise<boolean> {
  if (DIRECTIONS_MONTHLY_CAP <= 0) return false;
  try {
    if ((await monthUsage()).directionsCalls >= DIRECTIONS_MONTHLY_CAP) return false;
    if (companyId && TENANT_DIRECTIONS_MONTHLY_CAP > 0) {
      return (await tenantMonthUsage(companyId)).directionsCalls < TENANT_DIRECTIONS_MONTHLY_CAP;
    }
    return true;
  } catch (err) {
    console.error("[mapbox-budget] usage check failed:", err);
    return false;
  }
}

export type RoadTimesState = "ok" | "paused" | "off";

/**
 * What the route page should say about road figures for this tenant right
 * now: "off" = no token at all, "paused" = a monthly cap is spent (theirs
 * or the platform's), "ok" = real road times. Cached legs still serve while
 * paused — only NEW lookups stop.
 */
export async function roadTimesState(companyId: string, tokenPresent: boolean): Promise<RoadTimesState> {
  if (!tokenPresent) return "off";
  const [matrix, directions] = await Promise.all([matrixBudgetOk(1, companyId), directionsBudgetOk(companyId)]);
  return matrix && directions ? "ok" : "paused";
}

/** Month-to-date numbers for display/debugging (superadmin console, logs). */
export async function mapboxMonthUsage(): Promise<
  MonthUsage & { geocodeCap: number; matrixCap: number; directionsCap: number }
> {
  const usage = await monthUsage();
  return {
    ...usage,
    geocodeCap: GEOCODE_MONTHLY_CAP,
    matrixCap: MATRIX_MONTHLY_CAP,
    directionsCap: DIRECTIONS_MONTHLY_CAP,
  };
}
