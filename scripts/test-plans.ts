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
  GATED_FEATURES,
  INCLUDED_SEATS,
  canAddPerson,
  featureBlurb,
  featureLabel,
  featurePlan,
  planSource,
  productPlans,
  productPriceCents,
  productSellable,
  seatLimit,
} from "../lib/plans";

// ── Catalog sanity: the numbers the site prints ──
assert.equal(PLANS.DISPATCH.monthlyCents, 3_500);
assert.equal(PLANS.SHOP.monthlyCents, 8_900);
assert.equal(PLANS.JOBSITE.monthlyCents, 2_900);
assert.equal(PLANS.JOBSITE.comingSoon, true);
assert.equal(FULL_SHOP.monthlyCents, 10_900);
assert.equal(FULL_SHOP.monthlyCentsAfterJobsite, 12_900);
// Max keeps its $15 discount against Voice + Pro bought separately.
assert.equal(separatelyMonthlyCents() - FULL_SHOP.monthlyCents, 1_500);
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

// A plan paid through Square counts like a grant …
const paidPro = { planGrants: [], paidPlans: ["SHOP"], addonActiveAt: null };
assert.equal(hasPlan(paidPro, "SHOP"), true);
assert.equal(hasUnlimitedSeats(paidPro), true);
assert.equal(planSource(paidPro, "SHOP"), "paid");
assert.equal(planSource(granted, "SHOP"), "grant");
assert.equal(planSource(paid, "DISPATCH"), "livery");
assert.equal(planSource(bench, "SHOP"), null);
// … and Max pays for every plan.
assert.deepEqual(productPlans("FULL_SHOP"), ["DISPATCH", "SHOP", "JOBSITE"]);
assert.deepEqual(productPlans("SEAT"), []);
assert.deepEqual(productPlans("SHOP"), ["SHOP"]);
assert.equal(productPriceCents("SHOP", "MONTHLY"), 8_900);
assert.equal(productPriceCents("SHOP", "ANNUAL"), 89_000);
assert.equal(productPriceCents("FULL_SHOP", "MONTHLY"), 10_900);
assert.equal(productPriceCents("SEAT", "MONTHLY"), 1_000);
assert.equal(productSellable("JOBSITE"), false, "Gallery is coming soon");
assert.equal(productSellable("FULL_SHOP"), true);

// Feature gates: dark until PLAN_GATING=1, then Pro-only.
assert.equal(featureAllowed(bench, "routes", false), true);
assert.equal(featureAllowed(bench, "routes", true), false);
assert.equal(featureAllowed(granted, "routes", true), true);
assert.equal(featureAllowed(paidPro, "routes", true), true);
assert.equal(featureAllowed(everything, "routes", true), true);
assert.equal(featureAllowed(paid, "routes", true), false, "Voice alone is not Pro");
// Every Pro feature carries a gate, named and described, and is Pro.
for (const f of GATED_FEATURES) {
  // Gallery is the one photo gate; every other gated feature is Pro.
  assert.equal(featurePlan(f), f === "gallery" ? "JOBSITE" : "SHOP");
  assert.ok(featureLabel(f).length > 3, f);
  assert.ok(featureBlurb(f).length > 20, f);
  assert.equal(featureAllowed(bench, f, true), false, `${f} gated for Core`);
  assert.equal(featureAllowed(granted, f, true), f !== "gallery", `${f} ${f === "gallery" ? "not opened by Pro" : "open for Pro"}`);
  assert.equal(featureAllowed(everything, f, true), true, `${f} open on Max`);
}
// Gallery: its own grant opens it, Pro alone does not.
const galleryOnly = { planGrants: ["JOBSITE"], addonActiveAt: null };
assert.equal(featureAllowed(galleryOnly, "gallery", true), true);
assert.equal(featureAllowed(galleryOnly, "routes", true), false, "Gallery alone is not Pro");
// A test account passes every gate (David 2026-10-28) — Voice is not a gate.
const tester = { planGrants: [] as string[], addonActiveAt: null, isTest: true };
for (const f of GATED_FEATURES) assert.equal(featureAllowed(tester, f, true), true, `${f} open for a test account`);
assert.equal(hasPlan(tester, "DISPATCH"), false, "a test account still needs Voice granted");
assert.equal(planGatingLive({}), false);
assert.equal(planGatingLive({ PLAN_GATING: "1" }), true);
assert.equal(planGatingLive({ PLAN_GATING: "0" }), false);

// Seats: Core = INCLUDED_SEATS + paid seats; Pro, test accounts and a dark gate = no limit.
assert.equal(INCLUDED_SEATS, 2);
assert.equal(seatLimit(bench, true), 2);
assert.equal(seatLimit({ ...bench, paidSeats: 3 }, true), 5);
assert.equal(seatLimit(bench, false), null);
assert.equal(seatLimit(granted, true), null);
assert.equal(seatLimit(paidPro, true), null);
assert.equal(seatLimit(tester, true), null);
assert.equal(canAddPerson(bench, 1, true), true);
assert.equal(canAddPerson(bench, 2, true), false);
assert.equal(canAddPerson({ ...bench, paidSeats: 1 }, 2, true), true);
assert.equal(canAddPerson(bench, 50, false), true);
assert.equal(canAddPerson(paid, 2, true), false, "Voice alone keeps the Core seat count");

console.log("test-plans: ok");
