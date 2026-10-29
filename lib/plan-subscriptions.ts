import {
  type BillingCadence,
  type BillingProduct,
  type PlanId,
  isBillingProduct,
  productPlans,
} from "@/lib/plans";

/**
 * The pure half of plan billing (lib/plan-billing.ts does the I/O): what a
 * Square subscription means for a company's entitlement, and what a
 * company's rows add up to. No Prisma, no fetch — `npx tsx scripts/test-plan-billing.ts`.
 *
 * Square's subscription statuses: PENDING (starts on a future date), ACTIVE,
 * PAUSED, CANCELED (the cancel took effect), DEACTIVATED (Square or the
 * seller shut it off — repeated failed charges end here). A cancel asked for
 * mid-cycle is scheduled for the end of the billing period: the status stays
 * ACTIVE with `canceled_date` in the future, and flips to CANCELED when the
 * date passes. `charged_through_date` is the day the company is paid up to.
 */

export type SquareSubscriptionLike = {
  id: string;
  status?: string;
  plan_variation_id?: string;
  customer_id?: string;
  card_id?: string;
  start_date?: string; // YYYY-MM-DD
  canceled_date?: string; // YYYY-MM-DD
  charged_through_date?: string; // YYYY-MM-DD
  /** Newer API versions name it this way. */
  paid_until_date?: string;
};

/** Days past `charged_through_date` a company keeps its plan while Square retries the card. */
export const PAYMENT_GRACE_DAYS = 7;

export type SubscriptionState = {
  status: string;
  entitled: boolean;
  startedAt: Date | null;
  chargedThrough: Date | null;
  canceledAt: Date | null;
  /** The card has not gone through and the grace period is running (or over). */
  pastDue: boolean;
};

/** "2026-10-28" → a Date at UTC midnight; anything else → null. */
export function parseSquareDate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function utcDay(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

/**
 * Does this subscription put the company on its plan right now?
 *  - ACTIVE: yes, unless Square has not been able to charge it — paid-through
 *    more than PAYMENT_GRACE_DAYS behind today — in which case the plan
 *    closes until a payment lands (pastDue).
 *  - CANCELED / DEACTIVATED / PAUSED: only while paid-through is still ahead
 *    of today (an immediate cancel of a prepaid term keeps what was paid for).
 *  - PENDING: not yet.
 */
export function reduceSubscription(sub: SquareSubscriptionLike, now: Date = new Date()): SubscriptionState {
  const status = (sub.status ?? "PENDING").toUpperCase();
  const chargedThrough = parseSquareDate(sub.charged_through_date ?? sub.paid_until_date);
  const canceledAt = parseSquareDate(sub.canceled_date);
  const startedAt = parseSquareDate(sub.start_date);
  const today = utcDay(now);
  const paidAhead = chargedThrough !== null && utcDay(chargedThrough) >= today;
  const pastDue =
    status === "ACTIVE" && chargedThrough !== null && today - utcDay(chargedThrough) > PAYMENT_GRACE_DAYS;
  let entitled = false;
  if (status === "ACTIVE") entitled = !pastDue;
  else if (status === "CANCELED" || status === "DEACTIVATED" || status === "PAUSED") entitled = paidAhead;
  return { status, entitled, startedAt, chargedThrough, canceledAt, pastDue };
}

export type EntitlementRow = { product: string; entitled: boolean };

/** What a company's rows add up to: the plan ids it pays for, and how many extra people. */
export function sumEntitlements(rows: readonly EntitlementRow[]): { paidPlans: PlanId[]; paidSeats: number } {
  const plans = new Set<PlanId>();
  let seats = 0;
  for (const r of rows) {
    if (!r.entitled || !isBillingProduct(r.product)) continue;
    if (r.product === "SEAT") seats += 1;
    else for (const p of productPlans(r.product)) plans.add(p);
  }
  const order: PlanId[] = ["DISPATCH", "SHOP", "JOBSITE"];
  return { paidPlans: order.filter((p) => plans.has(p)), paidSeats: seats };
}

// ── Plan variations (the Square catalog ids, from env) ──

export type VariationKey = `${BillingProduct}_${BillingCadence}`;

/** SQUARE_PLAN_<PRODUCT>_<CADENCE>, e.g. SQUARE_PLAN_SHOP_MONTHLY. */
export function variationEnvName(product: BillingProduct, cadence: BillingCadence): string {
  return `SQUARE_PLAN_${product}_${cadence}`;
}

export function variationIdFor(
  product: BillingProduct,
  cadence: BillingCadence,
  env: Record<string, string | undefined> = process.env
): string | null {
  const v = (env[variationEnvName(product, cadence)] ?? "").trim();
  return v || null;
}

/** The product + cadence a Square plan variation id sells, or null when it's not one of ours. */
export function productForVariation(
  variationId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): { product: BillingProduct; cadence: BillingCadence } | null {
  if (!variationId) return null;
  const products: BillingProduct[] = ["DISPATCH", "SHOP", "JOBSITE", "FULL_SHOP", "SEAT"];
  const cadences: BillingCadence[] = ["MONTHLY", "ANNUAL"];
  for (const product of products) {
    for (const cadence of cadences) {
      if (variationIdFor(product, cadence, env) === variationId) return { product, cadence };
    }
  }
  return null;
}

/**
 * Which existing paid rows a new product replaces. Buying Max swaps the Pro
 * (or Voice) subscription over to Max and ends any other plan it covers;
 * buying the same product on a new cadence swaps the term. Returns the row
 * to SWAP (Square prorates a swap) and the rows to CANCEL.
 */
export function planChange(
  rows: readonly { id: string; product: string; cadence: string; entitled: boolean }[],
  want: { product: BillingProduct; cadence: BillingCadence }
): { swap: string | null; cancel: string[]; already: boolean } {
  const live = rows.filter((r) => r.entitled && isBillingProduct(r.product) && r.product !== "SEAT");
  const same = live.find((r) => r.product === want.product);
  if (same && same.cadence === want.cadence) return { swap: null, cancel: [], already: true };
  if (same) return { swap: same.id, cancel: [], already: false };
  if (want.product === "FULL_SHOP") {
    const covered = live.filter((r) => productPlans(want.product).includes(r.product as PlanId));
    const [first, ...rest] = covered.sort((a, b) => (a.product === "SHOP" ? -1 : b.product === "SHOP" ? 1 : 0));
    return { swap: first?.id ?? null, cancel: rest.map((r) => r.id), already: false };
  }
  // Buying Voice or Pro while on Max: nothing to do, Max already covers it.
  if (live.some((r) => r.product === "FULL_SHOP")) return { swap: null, cancel: [], already: true };
  return { swap: null, cancel: [], already: false };
}

// ── Plan variations from the catalog itself (2026-10-29) ──
//
// David makes the plans in the Square Dashboard of WorkBench's own account
// (Subscriptions → Plans), so the ids are not known ahead of time and a
// discounted or trial variation can appear at any moment. Instead of the
// SQUARE_PLAN_* env (still honoured when set), lib/plan-catalog.ts reads the
// catalog and this matcher decides what each variation sells from its NAMES
// (plan name first, then the variation's) and its billing phase. Any
// variation under a plan called "Voice" is a Voice subscription whatever
// it costs — the price only decides which variation the in-app checkout
// offers (the one at list price, else the dearest).

export interface CatalogVariation {
  id: string;
  product: BillingProduct;
  cadence: BillingCadence;
  /** Recurring price of the last phase, null when Square prices it relatively (discount phases). */
  priceCents: number | null;
  planName: string;
  name: string;
}

/** A plan / variation name → the product it sells, by the words in it. Null = not one of ours. */
export function productForPlanName(name: string | null | undefined): BillingProduct | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  if (/\b(seat|seats|extra person|additional person|team member|per person|user)\b/.test(n)) return "SEAT";
  if (/\b(max|full shop|everything|bundle)\b/.test(n)) return "FULL_SHOP";
  if (/\b(voice|dispatch|phone|business line)\b/.test(n)) return "DISPATCH";
  if (/\b(pro|shop|office)\b/.test(n)) return "SHOP";
  if (/\b(gallery|jobsite|job site|photos)\b/.test(n)) return "JOBSITE";
  return null;
}

/** Square's phase cadence → ours; anything but monthly / yearly is not a plan we sell. */
export function cadenceForSquare(cadence: string | null | undefined, name?: string | null): BillingCadence | null {
  const c = (cadence ?? "").toUpperCase();
  if (c === "MONTHLY" || c === "THIRTY_DAYS") return "MONTHLY";
  if (c === "ANNUAL") return "ANNUAL";
  if (c) return null;
  const n = (name ?? "").toLowerCase();
  if (/\b(annual|annually|yearly|year|\/yr)\b/.test(n)) return "ANNUAL";
  if (/\b(monthly|month|\/mo)\b/.test(n)) return "MONTHLY";
  return null;
}

/** The shape of a Square SUBSCRIPTION_PLAN catalog object this matcher needs (lib/square-billing-api.ts has the full one). */
export interface CatalogPlanLike {
  id: string;
  is_deleted?: boolean;
  subscription_plan_data?: {
    name?: string;
    subscription_plan_variations?: {
      id: string;
      is_deleted?: boolean;
      subscription_plan_variation_data?: {
        name?: string;
        phases?: { cadence?: string; ordinal?: number; pricing?: { type?: string; price_money?: { amount?: number } } }[];
      };
    }[];
  };
}

/** Every variation in the catalog that sells one of our products, in catalog order. */
export function mapCatalogVariations(plans: readonly CatalogPlanLike[]): CatalogVariation[] {
  const out: CatalogVariation[] = [];
  for (const plan of plans) {
    if (plan.is_deleted) continue;
    const planName = plan.subscription_plan_data?.name ?? "";
    for (const v of plan.subscription_plan_data?.subscription_plan_variations ?? []) {
      if (v.is_deleted) continue;
      const data = v.subscription_plan_variation_data;
      const name = data?.name ?? "";
      const product = productForPlanName(planName) ?? productForPlanName(name);
      if (!product) continue;
      const phases = [...(data?.phases ?? [])].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
      const last = phases.at(-1);
      const cadence = cadenceForSquare(last?.cadence, `${planName} ${name}`);
      if (!cadence) continue;
      const amount = last?.pricing?.type === "STATIC" ? last.pricing.price_money?.amount : undefined;
      out.push({ id: v.id, product, cadence, priceCents: typeof amount === "number" ? amount : null, planName, name });
    }
  }
  return out;
}

/** The variation the in-app checkout should sell for product × cadence: the one at list price, else the dearest. */
export function pickVariation(
  variations: readonly CatalogVariation[],
  product: BillingProduct,
  cadence: BillingCadence,
  listPriceCents: number
): CatalogVariation | null {
  const candidates = variations.filter((v) => v.product === product && v.cadence === cadence);
  if (!candidates.length) return null;
  return (
    candidates.find((v) => v.priceCents === listPriceCents) ??
    [...candidates].sort((a, b) => (b.priceCents ?? -1) - (a.priceCents ?? -1))[0]
  );
}
