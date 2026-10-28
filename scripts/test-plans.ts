/**
 * lib/plans.ts — the catalog and the entitlement helper.
 *   npx tsx scripts/test-plans.ts
 */
import assert from "node:assert/strict";
import {
  ANNUAL_MONTHS,
  DISPATCH_FAIR_USE_MINUTES,
  DISPATCH_FAIR_USE_TEXTS,
  FAIR_USE_SENTENCE,
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
  featureAllowed,
  planGatingLive,
} from "../lib/plans";

// ── Catalog sanity: the numbers the site prints ──
assert.equal(PLANS.DISPATCH.monthlyCents, 3_500);
assert.equal(PLANS.SHOP.monthlyCents, 8_900);
assert.equal(PLANS.JOBSITE.monthlyCents, 2_900);
assert.equal(PLANS.JOBSITE.comingSoon, true);
assert.equal(FULL_SHOP.monthlyCents, 9_900);
assert.equal(FULL_SHOP.monthlyCentsAfterJobsite, 11_900);
assert.equal(ANNUAL_MONTHS, 10);
assert.equal(annualCents(3_500), 35_000);
// Max is a discount on the shipped add-ons bought separately (today: Voice + Pro).
assert.equal(separatelyMonthlyCents(), 12_400);
// Voice is unlimited talk and text, defined by a fair-use ceiling no real shop meets.
assert.equal(DISPATCH_FAIR_USE_TEXTS, 3_000);
assert.equal(DISPATCH_FAIR_USE_MINUTES, 3_000);
assert.ok(PLANS.DISPATCH.includes.some((s) => /unlimited talk and text/i.test(s)));
assert.ok(FAIR_USE_SENTENCE.includes("3,000 texts and 3,000 minutes"));
assert.ok(FAIR_USE_SENTENCE.includes("3¢"));
assert.ok(!PLANS.DISPATCH.includes.some((s) => /\d+ texts/.test(s)), "no fixed allowance on the card");
assert.ok(FULL_SHOP.monthlyCents < separatelyMonthlyCents());
// … and after Gallery joins, still a discount on all three.
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

// A paid Livery subscription is Voice even without a grant …
const paid = { planGrants: [], addonActiveAt: new Date() };
assert.equal(hasPlan(paid, "DISPATCH"), true);
assert.equal(hasPlan(paid, "SHOP"), false);
// … and never anything else.
assert.deepEqual(activePlans(paid), ["DISPATCH"]);

// Everything = Max.
const everything = { planGrants: [...PLAN_IDS], addonActiveAt: null };
assert.deepEqual(activePlans(everything), ["DISPATCH", "SHOP", "JOBSITE"]);

// A holder without the optional field still works (a select that skipped addonActiveAt).
assert.equal(hasPlan({ planGrants: ["DISPATCH"] }, "DISPATCH"), true);
assert.equal(hasPlan({ planGrants: [] }, "DISPATCH"), false);

// Feature gates: dark until PLAN_GATING=1, then Pro-only.
assert.equal(featureAllowed(bench, "routes", false), true);
assert.equal(featureAllowed(bench, "routes", true), false);
assert.equal(featureAllowed(granted, "routes", true), true);
assert.equal(featureAllowed(everything, "routes", true), true);
assert.equal(featureAllowed(paid, "routes", true), false, "Voice alone is not Pro");
assert.equal(planGatingLive({}), false);
assert.equal(planGatingLive({ PLAN_GATING: "1" }), true);
assert.equal(planGatingLive({ PLAN_GATING: "0" }), false);

console.log("test-plans: ok");
