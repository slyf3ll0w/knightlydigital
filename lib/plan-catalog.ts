import * as api from "@/lib/square-billing-api";
import { planBillingConfigured, planBillingToken } from "@/lib/plan-billing-env";
import { reportError } from "@/lib/report-error";
import { productPriceCents, type BillingCadence, type BillingProduct } from "@/lib/plans";
import { mapCatalogVariations, pickVariation, productForVariation, variationIdFor, type CatalogVariation } from "@/lib/plan-subscriptions";

/**
 * The plans as they exist in WorkBench's own Square account (2026-10-29).
 *
 * David makes and prices the plans in the Square Dashboard (Subscriptions →
 * Plans), so WorkBench reads the catalog instead of carrying the variation
 * ids in env: `mapCatalogVariations` (lib/plan-subscriptions.ts) names each
 * variation's product from the plan / variation name and its cadence from
 * the billing phase. A `SQUARE_PLAN_<PRODUCT>_<CADENCE>` env id still wins
 * when set. The catalog is cached for ten minutes per instance; an id the
 * cache doesn't know (a variation made a minute ago) forces one re-read.
 */

const TTL_MS = 10 * 60_000;
const MISS_RELOAD_MS = 60_000;

let cache: { at: number; token: string; variations: CatalogVariation[] } | null = null;

export async function catalogVariations(force = false): Promise<CatalogVariation[]> {
  if (!planBillingConfigured()) return [];
  const token = planBillingToken();
  if (!force && cache && cache.token === token && Date.now() - cache.at < TTL_MS) return cache.variations;
  try {
    const plans = await api.listSquareSubscriptionPlans(token);
    cache = { at: Date.now(), token, variations: mapCatalogVariations(plans) };
  } catch (err) {
    if (cache && cache.token === token) return cache.variations; // stale beats nothing
    throw err;
  }
  return cache.variations;
}

/** Forget the cached catalog (tests, the superadmin "re-read" action). */
export function resetCatalogCache(): void {
  cache = null;
}

/** The variation id the in-app checkout sells for product × cadence, from a catalog read already in hand (sync). */
export function variationFrom(variations: readonly CatalogVariation[], product: BillingProduct, cadence: BillingCadence): string | null {
  return variationIdFor(product, cadence) ?? pickVariation(variations, product, cadence, productPriceCents(product, cadence))?.id ?? null;
}

/** Same, reading the catalog (null when Square can't be reached and nothing is cached). */
export async function variationFor(product: BillingProduct, cadence: BillingCadence): Promise<string | null> {
  const fromEnv = variationIdFor(product, cadence);
  if (fromEnv) return fromEnv;
  const variations = await catalogVariations().catch((err) => {
    reportError("[plan-catalog] catalog read failed", err);
    return [] as CatalogVariation[];
  });
  return variationFrom(variations, product, cadence);
}

/** What a Square plan variation id sells — env first, then the catalog (re-read once on a miss). */
export async function resolveVariation(
  variationId: string | null | undefined
): Promise<{ product: BillingProduct; cadence: BillingCadence } | null> {
  if (!variationId) return null;
  const fromEnv = productForVariation(variationId);
  if (fromEnv) return fromEnv;
  let variations = await catalogVariations().catch(() => [] as CatalogVariation[]);
  let hit = variations.find((v) => v.id === variationId);
  if (!hit && cache && Date.now() - cache.at > MISS_RELOAD_MS) {
    variations = await catalogVariations(true).catch(() => variations);
    hit = variations.find((v) => v.id === variationId);
  }
  return hit ? { product: hit.product, cadence: hit.cadence } : null;
}
