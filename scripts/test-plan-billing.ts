/**
 * lib/plan-subscriptions.ts — the pure half of plan billing.
 *   npx tsx scripts/test-plan-billing.ts
 */
import assert from "node:assert/strict";
import {
  PAYMENT_GRACE_DAYS,
  parseSquareDate,
  planChange,
  productForVariation,
  reduceSubscription,
  sumEntitlements,
  variationEnvName,
  variationIdFor,
} from "../lib/plan-subscriptions";

const now = new Date("2026-10-28T15:00:00Z");

// ── Dates ──
assert.equal(parseSquareDate("2026-10-28")?.toISOString(), "2026-10-28T00:00:00.000Z");
assert.equal(parseSquareDate("nope"), null);
assert.equal(parseSquareDate(undefined), null);

// ── One subscription → entitlement ──
const active = reduceSubscription({ id: "s1", status: "ACTIVE", start_date: "2026-10-01", charged_through_date: "2026-11-01" }, now);
assert.equal(active.entitled, true);
assert.equal(active.pastDue, false);
assert.equal(active.startedAt?.toISOString().slice(0, 10), "2026-10-01");

// Scheduled cancel: still ACTIVE with a future canceled_date → still on.
const ending = reduceSubscription({ id: "s2", status: "ACTIVE", canceled_date: "2026-11-01", charged_through_date: "2026-11-01" }, now);
assert.equal(ending.entitled, true);
assert.equal(ending.canceledAt?.toISOString().slice(0, 10), "2026-11-01");

// The cancel took effect but the term was paid through a later day → on until then.
assert.equal(reduceSubscription({ id: "s3", status: "CANCELED", charged_through_date: "2026-11-15" }, now).entitled, true);
assert.equal(reduceSubscription({ id: "s4", status: "CANCELED", charged_through_date: "2026-10-27" }, now).entitled, false);
assert.equal(reduceSubscription({ id: "s5", status: "DEACTIVATED", charged_through_date: "2026-10-28" }, now).entitled, true, "paid through today counts");
assert.equal(reduceSubscription({ id: "s6", status: "PENDING", start_date: "2026-11-01" }, now).entitled, false);
assert.equal(reduceSubscription({ id: "s7", status: "PAUSED" }, now).entitled, false);

// A card Square can't charge: ACTIVE but paid-through slips behind. Grace, then off.
const inGrace = reduceSubscription({ id: "s8", status: "ACTIVE", charged_through_date: "2026-10-25" }, now);
assert.equal(inGrace.entitled, true);
assert.equal(inGrace.pastDue, false);
const pastGrace = reduceSubscription(
  { id: "s9", status: "ACTIVE", charged_through_date: `2026-10-${String(28 - PAYMENT_GRACE_DAYS - 1).padStart(2, "0")}` },
  now
);
assert.equal(pastGrace.pastDue, true);
assert.equal(pastGrace.entitled, false);
// Newer field name is honoured.
assert.equal(reduceSubscription({ id: "s10", status: "CANCELED", paid_until_date: "2026-12-01" }, now).entitled, true);

// ── Rows → company ──
assert.deepEqual(sumEntitlements([]), { paidPlans: [], paidSeats: 0 });
assert.deepEqual(sumEntitlements([{ product: "SHOP", entitled: true }]), { paidPlans: ["SHOP"], paidSeats: 0 });
assert.deepEqual(sumEntitlements([{ product: "FULL_SHOP", entitled: true }]), { paidPlans: ["DISPATCH", "SHOP", "JOBSITE"], paidSeats: 0 });
assert.deepEqual(
  sumEntitlements([
    { product: "SEAT", entitled: true },
    { product: "SEAT", entitled: true },
    { product: "SEAT", entitled: false },
    { product: "DISPATCH", entitled: false },
    { product: "bogus", entitled: true },
  ]),
  { paidPlans: [], paidSeats: 2 }
);

// ── Variations from env ──
const env = {
  SQUARE_PLAN_SHOP_MONTHLY: "VAR_SHOP_M",
  SQUARE_PLAN_SHOP_ANNUAL: "VAR_SHOP_A",
  SQUARE_PLAN_FULL_SHOP_MONTHLY: "VAR_MAX_M",
  SQUARE_PLAN_SEAT_MONTHLY: " VAR_SEAT ",
};
assert.equal(variationEnvName("FULL_SHOP", "ANNUAL"), "SQUARE_PLAN_FULL_SHOP_ANNUAL");
assert.equal(variationIdFor("SHOP", "MONTHLY", env), "VAR_SHOP_M");
assert.equal(variationIdFor("SEAT", "MONTHLY", env), "VAR_SEAT", "trimmed");
assert.equal(variationIdFor("DISPATCH", "MONTHLY", env), null);
assert.deepEqual(productForVariation("VAR_SHOP_A", env), { product: "SHOP", cadence: "ANNUAL" });
assert.deepEqual(productForVariation("VAR_MAX_M", env), { product: "FULL_SHOP", cadence: "MONTHLY" });
assert.equal(productForVariation("nope", env), null);
assert.equal(productForVariation(undefined, env), null);

// ── What buying a product does to the rows ──
const pro = { id: "r-pro", product: "SHOP", cadence: "MONTHLY", entitled: true };
const voice = { id: "r-voice", product: "DISPATCH", cadence: "MONTHLY", entitled: true };
const oldPro = { id: "r-old", product: "SHOP", cadence: "MONTHLY", entitled: false };
assert.deepEqual(planChange([], { product: "SHOP", cadence: "MONTHLY" }), { swap: null, cancel: [], already: false });
assert.deepEqual(planChange([pro], { product: "SHOP", cadence: "MONTHLY" }), { swap: null, cancel: [], already: true });
assert.deepEqual(planChange([pro], { product: "SHOP", cadence: "ANNUAL" }), { swap: "r-pro", cancel: [], already: false }, "monthly → annual swaps the term");
assert.deepEqual(planChange([oldPro], { product: "SHOP", cadence: "MONTHLY" }), { swap: null, cancel: [], already: false }, "an ended row is not a swap");
assert.deepEqual(planChange([pro], { product: "FULL_SHOP", cadence: "MONTHLY" }), { swap: "r-pro", cancel: [], already: false }, "Pro → Max swaps");
assert.deepEqual(planChange([voice, pro], { product: "FULL_SHOP", cadence: "MONTHLY" }), { swap: "r-pro", cancel: ["r-voice"], already: false }, "Voice + Pro → Max swaps Pro, ends Voice");
assert.deepEqual(planChange([voice], { product: "FULL_SHOP", cadence: "ANNUAL" }), { swap: "r-voice", cancel: [], already: false });
const max = { id: "r-max", product: "FULL_SHOP", cadence: "MONTHLY", entitled: true };
assert.deepEqual(planChange([max], { product: "SHOP", cadence: "MONTHLY" }), { swap: null, cancel: [], already: true }, "Max already covers Pro");
assert.deepEqual(planChange([max], { product: "FULL_SHOP", cadence: "ANNUAL" }), { swap: "r-max", cancel: [], already: false });
const seat = { id: "r-seat", product: "SEAT", cadence: "MONTHLY", entitled: true };
assert.deepEqual(planChange([seat], { product: "SHOP", cadence: "MONTHLY" }), { swap: null, cancel: [], already: false }, "seats are not plans");

console.log("test-plan-billing: ok");
