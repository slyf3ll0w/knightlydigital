/**
 * lib/plan-entitlement.ts — the pure half of plan billing.
 *   npx tsx scripts/test-plan-entitlement.ts
 */
import assert from "node:assert/strict";
import { PAYMENT_GRACE_DAYS, addInterval, planChange, reduceSeries, sumEntitlements, type PlanSeriesLike } from "../lib/plan-entitlement";

const now = new Date("2026-10-29T15:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);

const series = (over: Partial<PlanSeriesLike> & { invoices?: PlanSeriesLike["invoices"] }): PlanSeriesLike => ({
  id: "s1",
  status: "ACTIVE",
  interval: "MONTHLY",
  quantity: 1,
  unitPrice: 35,
  product: "DISPATCH",
  createdAt: day(-40),
  invoices: [],
  ...over,
});

// ── Dates ──
assert.equal(addInterval(new Date("2026-01-31T12:00:00Z"), "MONTHLY").toISOString().slice(0, 10), "2026-02-28");
assert.equal(addInterval(new Date("2026-03-15T12:00:00Z"), "ANNUAL").toISOString().slice(0, 10), "2027-03-15");
assert.equal(addInterval(new Date("2026-03-15T12:00:00Z"), "QUARTERLY").toISOString().slice(0, 10), "2026-06-15");

// ── A paid month is on until it ends, plus the grace while ACTIVE ──
const paid = reduceSeries(series({ invoices: [{ status: "PAID", issuedAt: day(-10), total: 35 }] }), now)!;
assert.equal(paid.entitled, true);
assert.equal(paid.status, "ACTIVE");
assert.equal(paid.paidThrough?.toISOString().slice(0, 10), addInterval(day(-10), "MONTHLY").toISOString().slice(0, 10));
assert.equal(paid.cadence, "MONTHLY");
assert.equal(paid.priceCents, 3500);

// Renewal invoice open (autopay still retrying): on through the grace, PAST_DUE
const renewing = reduceSeries(
  series({
    invoices: [
      { status: "AWAITING_PAYMENT", issuedAt: day(-2), total: 35, autoChargeLastError: "Declined" },
      { status: "PAID", issuedAt: day(-32), total: 35 },
    ],
  }),
  now
)!;
assert.equal(renewing.status, "PAST_DUE");
assert.equal(renewing.entitled, true, "inside the grace");
assert.equal(renewing.failing, true);
assert.equal(renewing.unpaidSince?.toISOString().slice(0, 10), day(-2).toISOString().slice(0, 10));

// Grace over: off
const lapsed = reduceSeries(
  series({
    invoices: [
      { status: "PAST_DUE", issuedAt: day(-(PAYMENT_GRACE_DAYS + 2)), total: 35 },
      { status: "PAID", issuedAt: day(-(32 + PAYMENT_GRACE_DAYS)), total: 35 },
    ],
  }),
  now
)!;
assert.equal(lapsed.entitled, false);
assert.equal(lapsed.status, "PAST_DUE");

// Never paid (first charge declined, invoice still open): PENDING, off
const pending = reduceSeries(series({ invoices: [{ status: "AWAITING_PAYMENT", issuedAt: day(-1), total: 35 }] }), now)!;
assert.equal(pending.entitled, false);
assert.equal(pending.status, "PENDING");

// A $0 invoice is a paid one (free trial / comped price)
const free = reduceSeries(series({ unitPrice: 0, invoices: [{ status: "AWAITING_PAYMENT", issuedAt: day(-1), total: 0 }] }), now)!;
assert.equal(free.entitled, true);
assert.equal(free.status, "ACTIVE");

// Cancelled: on through the paid period, no grace
const cancelled = reduceSeries(series({ status: "CANCELLED", invoices: [{ status: "PAID", issuedAt: day(-25), total: 35 }] }), now)!;
assert.equal(cancelled.status, "CANCELLED");
assert.equal(cancelled.entitled, true);
const cancelledOver = reduceSeries(series({ status: "CANCELLED", invoices: [{ status: "PAID", issuedAt: day(-33), total: 35 }] }), now)!;
assert.equal(cancelledOver.entitled, false, "no grace once cancelled");
const pausedOver = reduceSeries(series({ status: "PAUSED", invoices: [{ status: "PAID", issuedAt: day(-33), total: 35 }] }), now)!;
assert.equal(pausedOver.entitled, false);

// Annual
const annual = reduceSeries(series({ interval: "ANNUAL", unitPrice: 350, invoices: [{ status: "PAID", issuedAt: day(-300), total: 350 }] }), now)!;
assert.equal(annual.entitled, true);
assert.equal(annual.cadence, "ANNUAL");

// Drafts and archived invoices don't count; a series that sells nothing of ours is ignored
assert.equal(reduceSeries(series({ invoices: [{ status: "DRAFT", issuedAt: day(-1), total: 35 }] }), now)!.entitled, false);
assert.equal(reduceSeries(series({ invoices: [{ status: "ARCHIVED", issuedAt: day(-1), total: 35 }] }), now)!.entitled, false);
assert.equal(reduceSeries(series({ product: null }), now), null);
assert.equal(reduceSeries(series({ product: "Lawn care" }), now), null);

// ── Sums ──
const rows = [
  reduceSeries(series({ id: "a", product: "SHOP", unitPrice: 89, invoices: [{ status: "PAID", issuedAt: day(-3), total: 89 }] }), now)!,
  reduceSeries(series({ id: "b", product: "SEAT", unitPrice: 10, quantity: 2, invoices: [{ status: "PAID", issuedAt: day(-3), total: 20 }] }), now)!,
  reduceSeries(series({ id: "c", product: "SEAT", unitPrice: 10, invoices: [{ status: "PAID", issuedAt: day(-3), total: 10 }] }), now)!,
  reduceSeries(series({ id: "d", product: "DISPATCH", status: "CANCELLED", invoices: [{ status: "PAID", issuedAt: day(-40), total: 35 }] }), now)!,
];
assert.deepEqual(sumEntitlements(rows), { paidPlans: ["SHOP"], paidSeats: 3 });
assert.deepEqual(sumEntitlements([reduceSeries(series({ product: "FULL_SHOP", unitPrice: 109, invoices: [{ status: "PAID", issuedAt: day(-3), total: 109 }] }), now)!]), {
  paidPlans: ["DISPATCH", "SHOP", "JOBSITE"],
  paidSeats: 0,
});

// ── What a new plan replaces ──
const pro = { id: "p", product: "SHOP" as const, cadence: "MONTHLY" as const, entitled: true, status: "ACTIVE" as const };
const voice = { id: "v", product: "DISPATCH" as const, cadence: "MONTHLY" as const, entitled: true, status: "ACTIVE" as const };
assert.deepEqual(planChange([pro], { product: "SHOP", cadence: "MONTHLY" }), { cancel: [], already: true });
assert.deepEqual(planChange([pro], { product: "SHOP", cadence: "ANNUAL" }), { cancel: ["p"], already: false }, "new term ends the old series");
assert.deepEqual(planChange([pro, voice], { product: "FULL_SHOP", cadence: "MONTHLY" }), { cancel: ["p", "v"], already: false });
assert.deepEqual(planChange([{ ...pro, id: "m", product: "FULL_SHOP" }], { product: "DISPATCH", cadence: "MONTHLY" }), { cancel: [], already: true });
assert.deepEqual(planChange([{ ...pro, status: "CANCELLED" }], { product: "SHOP", cadence: "MONTHLY" }), { cancel: [], already: false }, "a cancelled series doesn't block a new one");
assert.deepEqual(planChange([], { product: "DISPATCH", cadence: "MONTHLY" }), { cancel: [], already: false });

console.log("test-plan-entitlement: ok");
