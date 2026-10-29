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
