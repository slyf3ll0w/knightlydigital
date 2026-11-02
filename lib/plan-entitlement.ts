import { isBillingProduct, productPlans, type BillingCadence, type BillingProduct, type PlanId } from "@/lib/plans";

/**
 * The pure half of plan billing (lib/plan-billing.ts does the I/O).
 *
 * WorkBench bills its customers the way any WorkBench business bills a
 * client (2026-10-29, David: "use my own systems"): each customer company
 * is a CONTACT of the WorkBench company, each plan is a recurring SERIES on
 * that contact (Subscription + its invoices, autopay from the saved card),
 * and entitlement is read off those invoices. No Square objects, no
 * webhooks — what a series' invoices say is what the company has.
 *
 * Rule: a series is ON while the period its last PAID invoice bought is
 * still running — issuedAt + one interval — plus PAYMENT_GRACE_DAYS while
 * the series is ACTIVE (autopay retries +1d/+3d/+7d; the owner gets the
 * dunning email with a card-update link). Cancelled or paused series keep
 * what was paid for and nothing more. A $0 invoice counts as paid (free
 * trials, a comped price). `npx tsx scripts/test-plan-entitlement.ts`.
 */

// Covers autopay's whole retry ladder (+1, +3, +7 days = day 11, lib/autopay-rules.ts)
// so a soft decline that clears on the last retry never switches the plan off in between.
export const PAYMENT_GRACE_DAYS = 12;

export type SeriesInterval = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
export type SeriesStatus = "ACTIVE" | "PAUSED" | "CANCELLED";

export type PlanInvoiceLike = {
  status: string; // DRAFT | AWAITING_PAYMENT | PAID | PAST_DUE | ARCHIVED
  issuedAt: Date | null;
  total: number;
  autoChargeLastError?: string | null;
  autoChargeGaveUpAt?: Date | null;
};

export type PlanSeriesLike = {
  id: string;
  status: SeriesStatus;
  interval: SeriesInterval | null;
  quantity: number;
  unitPrice: number;
  /** What the price-book item sells (WorkItem.planProduct); null = not a plan series. */
  product: string | null;
  createdAt: Date;
  /** When the series bills next (a deferred downgrade starts here). */
  nextRunAt?: Date | null;
  invoices: readonly PlanInvoiceLike[];
};

export type PlanRowStatus = "ACTIVE" | "PAST_DUE" | "PENDING" | "PAUSED" | "CANCELLED";

export type PlanRow = {
  id: string;
  product: BillingProduct;
  cadence: BillingCadence;
  status: PlanRowStatus;
  entitled: boolean;
  /** End of the period the last paid invoice bought (null = never paid). */
  paidThrough: Date | null;
  /** The newest unpaid invoice's issue date (null = nothing owing). */
  unpaidSince: Date | null;
  /** Autopay has failed on the open invoice. */
  failing: boolean;
  /** What one period costs now (unitPrice × quantity), in cents. */
  priceCents: number;
  quantity: number;
  startedAt: Date;
  /** The series' next billing date (a PENDING row waiting to start shows it). */
  nextRunAt: Date | null;
};

export function addInterval(date: Date, interval: SeriesInterval | null): Date {
  const months = interval === "ANNUAL" ? 12 : interval === "SEMIANNUAL" ? 6 : interval === "QUARTERLY" ? 3 : 1;
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function cadenceForInterval(interval: SeriesInterval | null): BillingCadence {
  return interval === "ANNUAL" ? "ANNUAL" : "MONTHLY";
}

const invoicePaid = (inv: PlanInvoiceLike) => inv.status === "PAID" || (inv.total <= 0 && inv.status !== "DRAFT" && inv.status !== "ARCHIVED");
const invoiceOpen = (inv: PlanInvoiceLike) => inv.status === "AWAITING_PAYMENT" || inv.status === "PAST_DUE";

/** One series → what it grants right now. Null when the series sells nothing of ours. */
export function reduceSeries(s: PlanSeriesLike, now: Date = new Date()): PlanRow | null {
  if (!s.product || !isBillingProduct(s.product)) return null;
  const issued = s.invoices
    .filter((i) => i.issuedAt && i.status !== "DRAFT" && i.status !== "ARCHIVED")
    .sort((a, b) => b.issuedAt!.getTime() - a.issuedAt!.getTime());
  const lastPaid = issued.find(invoicePaid) ?? null;
  const open = issued.find((i) => invoiceOpen(i) && !invoicePaid(i)) ?? null;
  const paidThrough = lastPaid ? addInterval(lastPaid.issuedAt!, s.interval) : null;
  const graceMs = s.status === "ACTIVE" ? PAYMENT_GRACE_DAYS * 86_400_000 : 0;
  const entitled = paidThrough ? paidThrough.getTime() + graceMs > now.getTime() : false;
  const status: PlanRowStatus =
    s.status === "CANCELLED"
      ? "CANCELLED"
      : s.status === "PAUSED"
        ? "PAUSED"
        : !lastPaid
          ? "PENDING"
          : open
            ? "PAST_DUE"
            : "ACTIVE";
  const qty = Math.max(0, Math.round(s.quantity));
  return {
    id: s.id,
    product: s.product,
    cadence: cadenceForInterval(s.interval),
    status,
    entitled,
    paidThrough,
    unpaidSince: open?.issuedAt ?? null,
    failing: Boolean(open && (open.autoChargeLastError || open.autoChargeGaveUpAt)),
    priceCents: Math.round(s.unitPrice * 100) * (qty || 1),
    quantity: qty || 1,
    startedAt: s.createdAt,
    nextRunAt: s.nextRunAt ?? null,
  };
}

/** What a company's rows add up to: the plan ids it pays for, and how many extra people. */
export function sumEntitlements(rows: readonly Pick<PlanRow, "product" | "entitled" | "quantity">[]): { paidPlans: PlanId[]; paidSeats: number } {
  const plans = new Set<PlanId>();
  let seats = 0;
  for (const r of rows) {
    if (!r.entitled) continue;
    if (r.product === "SEAT") seats += r.quantity;
    else for (const p of productPlans(r.product)) plans.add(p);
  }
  const order: PlanId[] = ["DISPATCH", "SHOP", "JOBSITE"];
  return { paidPlans: order.filter((p) => plans.has(p)), paidSeats: seats };
}

/** A deferred downgrade bills this long before the bigger plan runs out, so the gates never flicker in between. */
export const DOWNGRADE_LEAD_MS = 2 * 60 * 60_000;

/**
 * Which live plan series a new product makes redundant. Buying Max ends the
 * Voice / Pro series it covers (they run to the end of what was paid);
 * buying the same product on a new term ends the old term's series. Buying
 * Voice or Pro while on Max is a DOWNGRADE: Max runs to the end of what was
 * paid and the smaller plan starts then (`startAt`, nothing charged today) —
 * in-app since 2026-11-02; it used to answer "already on it".
 */
export function planChange(
  rows: readonly Pick<PlanRow, "id" | "product" | "cadence" | "entitled" | "status" | "paidThrough">[],
  want: { product: BillingProduct; cadence: BillingCadence },
  now: Date = new Date()
): { cancel: string[]; already: boolean; startAt: Date | null } {
  const live = rows.filter((r) => r.entitled && r.status !== "CANCELLED" && r.product !== "SEAT");
  const same = live.find((r) => r.product === want.product);
  if (same && same.cadence === want.cadence) return { cancel: [], already: true, startAt: null };
  if (same) return { cancel: [same.id], already: false, startAt: null };
  if (want.product === "FULL_SHOP") {
    const covered = live.filter((r) => productPlans(want.product).includes(r.product as PlanId));
    return { cancel: covered.map((r) => r.id), already: false, startAt: null };
  }
  // On Max (live, or cancelled but still paid up): the smaller plan waits for it
  const max = rows.find((r) => r.product === "FULL_SHOP" && r.entitled);
  if (max && productPlans("FULL_SHOP").includes(want.product as PlanId)) {
    const at = max.paidThrough ? new Date(Math.max(now.getTime(), max.paidThrough.getTime() - DOWNGRADE_LEAD_MS)) : now;
    return { cancel: max.status === "CANCELLED" ? [] : [max.id], already: false, startAt: at.getTime() > now.getTime() ? at : null };
  }
  return { cancel: [], already: false, startAt: null };
}
