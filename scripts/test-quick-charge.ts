/**
 * Quick charge + Tap to Pay pure helpers.
 *   npx tsx scripts/test-quick-charge.ts
 */
import assert from "node:assert/strict";
import { parseDollars, quickChargeIssue, QUICK_CHARGE_MAX } from "../lib/quick-charge";
import { hasInPersonScope, tapToPayFailureText } from "../lib/tap-to-pay-shared";

let passed = 0;
function t(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("  ok", name);
}

console.log("quick charge");
t("parseDollars accepts typed money", () => {
  assert.equal(parseDollars("120"), 120);
  assert.equal(parseDollars("$1,200.50"), 1200.5);
  assert.equal(parseDollars(" 80.1 "), 80.1);
  assert.ok(Number.isNaN(parseDollars("")));
  assert.ok(Number.isNaN(parseDollars("12.345")));
  assert.ok(Number.isNaN(parseDollars("abc")));
});
t("quickChargeIssue: amount floor and ceiling", () => {
  assert.match(quickChargeIssue({ amount: 0.5, description: "Filter" }) ?? "", /at least/);
  assert.match(quickChargeIssue({ amount: QUICK_CHARGE_MAX + 1, description: "Filter" }) ?? "", /top out/);
  assert.equal(quickChargeIssue({ amount: QUICK_CHARGE_MAX, description: "Filter" }), null);
  assert.equal(quickChargeIssue({ amount: 1, description: "Filter" }), null);
});
t("quickChargeIssue: needs a description", () => {
  assert.match(quickChargeIssue({ amount: 50, description: "   " }) ?? "", /what the payment is for/);
  assert.match(quickChargeIssue({ amount: 50, description: "x".repeat(121) }) ?? "", /under 120/);
});

console.log("tap to pay");
t("hasInPersonScope reads the recorded grant", () => {
  assert.equal(hasInPersonScope("MERCHANT_PROFILE_READ PAYMENTS_WRITE PAYMENTS_WRITE_IN_PERSON"), true);
  assert.equal(hasInPersonScope("MERCHANT_PROFILE_READ PAYMENTS_WRITE"), false);
  assert.equal(hasInPersonScope(null), false);
  assert.equal(hasInPersonScope("PAYMENTS_WRITE_IN_PERSON_X"), false);
});
t("tapToPayFailureText words the codes, falls back to the message", () => {
  assert.match(tapToPayFailureText("CANCELED"), /nothing was charged/);
  assert.match(tapToPayFailureText("canceled"), /nothing was charged/);
  assert.match(tapToPayFailureText("NOT_CAPABLE"), /iPhone XS/);
  assert.equal(tapToPayFailureText("SOMETHING_ELSE", "Square said no"), "Square said no");
  assert.match(tapToPayFailureText(null), /didn't go through/);
});

console.log(`\n${passed} passed`);
