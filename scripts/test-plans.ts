/**
 * lib/plans.ts — the catalog and the entitlement helper.
 *   npx tsx scripts/test-plans.ts
 */
import assert from "node:assert/strict";
import {
  ANNUAL_MONTHS,
  FULL_SHOP,
  PLANS,
  PLAN_IDS,
  activePlans,
  annualCents,
  formatCents,
  formatUnitCents,
  hasPlan,
  hasUnlimitedSeats,
  isPlanId,
  normalizeGrants,
  separatelyMonthlyCents,
} from "../lib/plans";

// ── Catalog sanity: the numbers the site prints ──
assert.equal(PLANS.DISPATCH.monthlyCents, 2_500);
assert.equal(PLANS.SHOP.monthlyCents, 8_900);
assert.equal(PLANS.JOBSITE.monthlyCents, 2_900);
assert.equal(PLANS.JOBSITE.comingSoon, true);
assert.equal(FULL_SHOP.monthlyCents, 9_900);
assert.equal(FULL_SHOP.monthlyCentsAfterJobsite, 11_900);
assert.equal(ANNUAL_MONTHS, 10);
assert.equal(annualCents(2_500), 25_000);
// Full Shop is a discount on the shipped add-ons bought separately (today: Dispatch + Shop).
assert.equal(separatelyMonthlyCents(), 11_400);
assert.ok(FULL_SHOP.monthlyCents < separatelyMonthlyCents());
// … and after Jobsite joins, still a discount on all three.
assert.ok(
  FULL_SHOP.monthlyCentsAfterJobsite < PLAN_IDS.reduce((s, id) => s + PLANS[id].monthlyCents, 0)
);

// ── Formatting ──
assert.equal(formatCents(2_500), "$25");
assert.equal(formatCents(2_083), "$20.83");
assert.equal(formatUnitCents(3), "3¢");
assert.equal(formatUnitCents(150), "$1.50");

// ── Ids ──
assert.equal(isPlanId("SHOP"), true);
assert.equal(isPlanId("ALL"), false);
assert.equal(isPlanId(42), false);
assert.deepEqual(normalizeGrants(["JOBSITE", "bogus", "DISPATCH", "DISPATCH"]), ["DISPATCH", "JOBSITE"]);

// ── Entitlements ──
const bench = { planGrants: [] as string[], addonActiveAt: null };
assert.equal(hasPlan(bench, "DISPATCH"), false);
assert.equal(hasPlan(bench, "SHOP"), false);
assert.equal(hasUnlimitedSeats(bench), false);
assert.deepEqual(activePlans(bench), []);

// A whitelist grant is a plan.
const granted = { planGrants: ["SHOP"], addonActiveAt: null };
assert.equal(hasPlan(granted, "SHOP"), true);
assert.equal(hasPlan(granted, "DISPATCH"), false);
assert.equal(hasUnlimitedSeats(granted), true);

// A paid Livery subscription is Dispatch even without a grant …
const paid = { planGrants: [], addonActiveAt: new Date() };
assert.equal(hasPlan(paid, "DISPATCH"), true);
assert.equal(hasPlan(paid, "SHOP"), false);
// … and never anything else.
assert.deepEqual(activePlans(paid), ["DISPATCH"]);

// Everything = Full Shop.
const everything = { planGrants: [...PLAN_IDS], addonActiveAt: null };
assert.deepEqual(activePlans(everything), ["DISPATCH", "SHOP", "JOBSITE"]);

// A holder without the optional field still works (a select that skipped addonActiveAt).
assert.equal(hasPlan({ planGrants: ["DISPATCH"] }, "DISPATCH"), true);
assert.equal(hasPlan({ planGrants: [] }, "DISPATCH"), false);

console.log("test-plans: ok");
