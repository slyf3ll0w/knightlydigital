import * as api from "@/lib/square-billing-api";
import { planBillingCredentials } from "@/lib/plan-billing-env";
import { reportError } from "@/lib/report-error";
import { productName, productPriceCents, type BillingCadence, type BillingProduct } from "@/lib/plans";
import {
  mapCatalogVariations,
  pickVariation,
  productForPlanName,
  productForVariation,
  variationIdFor,
  type CatalogVariation,
} from "@/lib/plan-subscriptions";

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
  const creds = await planBillingCredentials();
  if (!creds) return [];
  const token = creds.token;
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

/** A price the console offered THIS company (Company.planOffers) for product × cadence, if any. */
export function offeredVariation(
  variations: readonly CatalogVariation[],
  product: BillingProduct,
  cadence: BillingCadence,
  offers: readonly string[] = []
): CatalogVariation | null {
  if (!offers.length) return null;
  return variations.find((v) => offers.includes(v.id) && v.product === product && v.cadence === cadence) ?? null;
}

/**
 * The variation id the in-app checkout sells for product × cadence, from a
 * catalog read already in hand (sync): the company's offered price first,
 * then the env override, then the list-price variation.
 */
export function variationFrom(
  variations: readonly CatalogVariation[],
  product: BillingProduct,
  cadence: BillingCadence,
  offers: readonly string[] = []
): string | null {
  return (
    offeredVariation(variations, product, cadence, offers)?.id ??
    variationIdFor(product, cadence) ??
    pickVariation(variations, product, cadence, productPriceCents(product, cadence))?.id ??
    null
  );
}

/** Same, reading the catalog (null when Square can't be reached and nothing is cached). */
export async function variationFor(product: BillingProduct, cadence: BillingCadence, offers: readonly string[] = []): Promise<string | null> {
  const fromEnv = variationIdFor(product, cadence);
  if (fromEnv && !offers.length) return fromEnv;
  const variations = await catalogVariations().catch((err) => {
    reportError("[plan-catalog] catalog read failed", err);
    return [] as CatalogVariation[];
  });
  return variationFrom(variations, product, cadence, offers);
}

/**
 * Console "Add a price": a new variation under the plan that sells
 * `product` (the plan is created, named after the product, when the catalog
 * has none). Any name and amount — a founder deal, a trial price — and it
 * is a plan variation like any other: offer it to a company or start a
 * subscription on it by invoice.
 */
export async function addCatalogPrice(input: {
  product: BillingProduct;
  cadence: BillingCadence;
  name: string;
  cents: number;
}): Promise<CatalogVariation> {
  const creds = await planBillingCredentials();
  if (!creds) throw new Error("Plan billing isn't set up.");
  const plans = await api.listSquareSubscriptionPlans(creds.token);
  let plan = plans.find((p) => !p.is_deleted && productForPlanName(p.subscription_plan_data?.name) === input.product);
  if (!plan) {
    const made = await api.upsertSquareCatalogObject(creds.token, `wb-plan:${input.product}:${Date.now()}`, {
      type: "SUBSCRIPTION_PLAN",
      id: `#plan-${input.product}`,
      subscription_plan_data: { name: productName(input.product), all_items: true },
    });
    plan = made.object;
  }
  const made = await api.upsertSquareCatalogObject(creds.token, `wb-var:${plan.id}:${input.cadence}:${input.cents}:${input.name}`, {
    type: "SUBSCRIPTION_PLAN_VARIATION",
    id: "#var",
    subscription_plan_variation_data: {
      name: input.name,
      subscription_plan_id: plan.id,
      phases: [
        {
          cadence: input.cadence === "ANNUAL" ? "ANNUAL" : "MONTHLY",
          ordinal: 0,
          pricing: { type: "STATIC", price_money: { amount: input.cents, currency: "USD" } },
        },
      ],
    },
  });
  resetCatalogCache();
  return {
    id: made.object.id,
    product: input.product,
    cadence: input.cadence,
    priceCents: input.cents,
    planName: plan.subscription_plan_data?.name ?? "",
    name: input.name,
  };
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
