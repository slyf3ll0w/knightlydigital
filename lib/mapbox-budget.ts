/**
 * Platform-wide Mapbox spend guard — the hard stop that keeps the Route
 * Manager inside Mapbox's free tier, no matter how many tenants use it.
 *
 * Mapbox's free allowances (as of 2026): 100k geocoding requests and 100k
 * matrix elements per month. The caps here default to 90% of that so a race
 * at the boundary can't tip into billing; override with the
 * MAPBOX_GEOCODE_MONTHLY_CAP / MAPBOX_MATRIX_MONTHLY_CAP env vars (0
 * disables that API entirely).
 *
 * Usage is what we actually sent to Mapbox this calendar month (UTC), summed
 * from CompanyUsageDaily — cache hits never reach the API and never count.
 * The sum is cached in-process for a minute: worst case the gate overshoots
 * by one minute of traffic, which is why the caps sit 10% under the tier.
 * Over the cap, callers degrade exactly like a missing token: geocodes
 * return null (uncached, so they retry next month) and the drive-time
 * matrix falls back to the haversine estimate.
 */

import { prisma } from "@/lib/db";

function cap(envVar: string | undefined, fallback: number): number {
  const n = Number(envVar);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const GEOCODE_MONTHLY_CAP = cap(process.env.MAPBOX_GEOCODE_MONTHLY_CAP, 90_000);
export const MATRIX_MONTHLY_CAP = cap(process.env.MAPBOX_MATRIX_MONTHLY_CAP, 90_000);

type MonthUsage = { geocodeCalls: number; matrixElements: number };

let cache: { month: string; at: number; usage: MonthUsage } | null = null;
const CACHE_MS = 60_000;

async function monthUsage(): Promise<MonthUsage> {
  const month = new Date().toISOString().slice(0, 7); // "2026-08", matches usageDay()
  if (cache && cache.month === month && Date.now() - cache.at < CACHE_MS) return cache.usage;
  const agg = await prisma.companyUsageDaily.aggregate({
    where: { day: { startsWith: month } },
    _sum: { geocodeCalls: true, matrixElements: true },
  });
  const usage = {
    geocodeCalls: agg._sum.geocodeCalls ?? 0,
    matrixElements: agg._sum.matrixElements ?? 0,
  };
  cache = { month, at: Date.now(), usage };
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

/** May we send a matrix request of `elements` cells this month? */
export async function matrixBudgetOk(elements: number): Promise<boolean> {
  if (MATRIX_MONTHLY_CAP <= 0) return false;
  try {
    return (await monthUsage()).matrixElements + elements <= MATRIX_MONTHLY_CAP;
  } catch (err) {
    console.error("[mapbox-budget] usage check failed:", err);
    return false;
  }
}

/** Month-to-date numbers for display/debugging (superadmin console, logs). */
export async function mapboxMonthUsage(): Promise<
  MonthUsage & { geocodeCap: number; matrixCap: number }
> {
  const usage = await monthUsage();
  return { ...usage, geocodeCap: GEOCODE_MONTHLY_CAP, matrixCap: MATRIX_MONTHLY_CAP };
}
