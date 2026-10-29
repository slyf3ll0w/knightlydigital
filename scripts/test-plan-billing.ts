/**
 * lib/plan-subscriptions.ts — the pure half of plan billing.
 *   npx tsx scripts/test-plan-billing.ts
 */
import assert from "node:assert/strict";
import {
  PAYMENT_GRACE_DAYS,
  cadenceForSquare,
  mapCatalogVariations,
  parseSquareDate,
  pickVariation,
  planChange,
  productForPlanName,
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

// ── Plans made in the Square Dashboard → products (2026-10-29) ──
assert.equal(productForPlanName("Voice"), "DISPATCH");
assert.equal(productForPlanName("WorkBench Pro"), "SHOP");
assert.equal(productForPlanName("Max (Voice + Pro)"), "FULL_SHOP");
assert.equal(productForPlanName("Extra seat"), "SEAT");
assert.equal(productForPlanName("Gallery"), "JOBSITE");
assert.equal(productForPlanName("Coffee club"), null);
assert.equal(productForPlanName(""), null);

assert.equal(cadenceForSquare("MONTHLY"), "MONTHLY");
assert.equal(cadenceForSquare("ANNUAL"), "ANNUAL");
assert.equal(cadenceForSquare("WEEKLY"), null);
assert.equal(cadenceForSquare(undefined, "Voice yearly"), "ANNUAL");
assert.equal(cadenceForSquare(undefined, "Voice"), null);

const catalog = [
  {
    id: "P1",
    subscription_plan_data: {
      name: "Voice",
      subscription_plan_variations: [
        { id: "V1", subscription_plan_variation_data: { name: "Monthly", phases: [{ cadence: "MONTHLY", ordinal: 0, pricing: { type: "STATIC", price_money: { amount: 3500 } } }] } },
        { id: "V2", subscription_plan_variation_data: { name: "Founder deal", phases: [{ cadence: "MONTHLY", ordinal: 0, pricing: { type: "STATIC", price_money: { amount: 1000 } } }] } },
        { id: "V3", subscription_plan_variation_data: { name: "Annual", phases: [{ cadence: "ANNUAL", ordinal: 0, pricing: { type: "STATIC", price_money: { amount: 35000 } } }] } },
        { id: "V4", is_deleted: true, subscription_plan_variation_data: { name: "Old", phases: [{ cadence: "MONTHLY", ordinal: 0 }] } },
        { id: "V5", subscription_plan_variation_data: { name: "Weekly", phases: [{ cadence: "WEEKLY", ordinal: 0 }] } },
      ],
    },
  },
  {
    id: "P2",
    subscription_plan_data: {
      name: "WorkBench",
      subscription_plan_variations: [
        // a free first month, then the real price: the LAST phase decides
        { id: "V6", subscription_plan_variation_data: { name: "Pro monthly", phases: [{ cadence: "MONTHLY", ordinal: 0, pricing: { type: "STATIC", price_money: { amount: 0 } } }, { cadence: "MONTHLY", ordinal: 1, pricing: { type: "STATIC", price_money: { amount: 8900 } } }] } },
        { id: "V7", subscription_plan_variation_data: { name: "Lawn care", phases: [{ cadence: "MONTHLY", ordinal: 0 }] } },
      ],
    },
  },
  { id: "P3", is_deleted: true, subscription_plan_data: { name: "Pro", subscription_plan_variations: [{ id: "V8", subscription_plan_variation_data: { name: "Monthly", phases: [{ cadence: "MONTHLY" }] } }] } },
];
const vars = mapCatalogVariations(catalog);
assert.deepEqual(
  vars.map((v) => [v.id, v.product, v.cadence, v.priceCents]),
  [
    ["V1", "DISPATCH", "MONTHLY", 3500],
    ["V2", "DISPATCH", "MONTHLY", 1000],
    ["V3", "DISPATCH", "ANNUAL", 35000],
    ["V6", "SHOP", "MONTHLY", 8900],
  ]
);
// The in-app checkout sells the list-price variation; a discount is entitlement-only.
assert.equal(pickVariation(vars, "DISPATCH", "MONTHLY", 3500)?.id, "V1");
// No list-price match → the dearest, never the discount.
assert.equal(pickVariation(vars, "DISPATCH", "MONTHLY", 3600)?.id, "V1");
assert.equal(pickVariation(vars, "DISPATCH", "ANNUAL", 35000)?.id, "V3");
assert.equal(pickVariation(vars, "SHOP", "ANNUAL", 89000), null);
assert.equal(pickVariation(vars, "SEAT", "MONTHLY", 900), null);

console.log("test-plan-billing: ok");
