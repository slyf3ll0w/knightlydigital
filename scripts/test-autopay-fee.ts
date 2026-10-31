/**
 * Unit tests for the client service fee (lib/service-fee.ts) and the
 * card-on-file (autopay) rule built on it (lib/autopay-rules.ts): what a
 * payment collects when the company's Service fee switch is on. The rates
 * are the service-fee billing plan's (lib/plans.ts PROCESSING_RATES): card
 * 3.50% + 30¢, bank 0.75% with a $1 floor and an $8 cap.
 *   npx tsx scripts/test-autopay-fee.ts
 * Plain assertions, no test framework (repo has none). No database.
 */
import assert from "node:assert/strict";
import { cardOnFileCharge } from "../lib/autopay-rules";
import { serviceFee, serviceFeeCents, serviceFeeLabel, SERVICE_FEE_ACH, SERVICE_FEE_CARD } from "../lib/service-fee";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("serviceFee");

test("card: 3.50% + 30¢, rounded to the cent", () => {
  assert.equal(serviceFee(100, "CARD", true), 3.8);
  assert.equal(serviceFee(12.34, "CARD", true), 0.73); // 0.4319 → 0.43 + 0.30
  assert.equal(serviceFee(35, "CARD", true), 1.53); // 1.225 → 1.23 + 0.30
  assert.equal(serviceFee(0.99, "CARD", true), 0.33);
  assert.equal(serviceFeeCents(10_000, "CARD"), 380);
});

test("bank: 0.75% with a $1 floor and an $8 cap", () => {
  assert.equal(serviceFee(50, "ACH", true), 1); // 0.375 → floor
  assert.equal(serviceFee(100, "ACH", true), 1); // 0.75 → floor
  assert.equal(serviceFee(200, "ACH", true), 1.5);
  assert.equal(serviceFee(500, "ACH", true), 3.75);
  assert.equal(serviceFee(2000, "ACH", true), 8); // 15 → cap
  assert.equal(serviceFeeCents(100_000, "ACH"), 750);
});

test("switch off or nothing to pay → no fee", () => {
  assert.equal(serviceFee(100, "CARD", false), 0);
  assert.equal(serviceFee(100, "ACH", false), 0);
  assert.equal(serviceFee(0, "CARD", true), 0);
  assert.equal(serviceFee(-5, "ACH", true), 0);
  assert.equal(serviceFeeCents(Number.NaN, "CARD"), 0);
});

test("labels carry the plan's rates", () => {
  assert.equal(SERVICE_FEE_CARD, "3.50% + 30¢");
  assert.equal(SERVICE_FEE_ACH, "0.75%, $1–$8");
  assert.equal(serviceFeeLabel("CARD"), "Card service fee (3.50% + 30¢)");
  assert.equal(serviceFeeLabel("ACH"), "Bank service fee (0.75%, $1–$8)");
});

console.log("cardOnFileCharge");

test("switch off → the bare balance, no fee", () => {
  assert.deepEqual(cardOnFileCharge({ amount: 35, surchargeEnabled: false }), { amount: 35, surcharge: 0, total: 35 });
});

test("switch on → balance + the card service fee, same cents as the pay page", () => {
  assert.deepEqual(cardOnFileCharge({ amount: 35, surchargeEnabled: true }), { amount: 35, surcharge: 1.53, total: 36.53 });
  assert.deepEqual(cardOnFileCharge({ amount: 89, surchargeEnabled: true }), { amount: 89, surcharge: 3.42, total: 92.42 });
  assert.deepEqual(cardOnFileCharge({ amount: 10, surchargeEnabled: true }), { amount: 10, surcharge: 0.65, total: 10.65 });
  for (const amount of [0.5, 1, 9.99, 12.34, 100, 123.45, 999.99, 2500]) {
    const fee = cardOnFileCharge({ amount, surchargeEnabled: true });
    assert.equal(fee.surcharge, serviceFee(amount, "CARD", true), `${amount}`);
    assert.equal(fee.total, Math.round((amount + fee.surcharge) * 100) / 100);
  }
});

test("nothing to charge → nothing surcharged", () => {
  assert.deepEqual(cardOnFileCharge({ amount: 0, surchargeEnabled: true }), { amount: 0, surcharge: 0, total: 0 });
  assert.deepEqual(cardOnFileCharge({ amount: -5, surchargeEnabled: true }), { amount: -5, surcharge: 0, total: -5 });
});

test("a retry charges the remaining PRINCIPAL plus its own fee — never the old fee again", () => {
  const first = cardOnFileCharge({ amount: 100, surchargeEnabled: true });
  const retry = cardOnFileCharge({ amount: 100, surchargeEnabled: true });
  assert.deepEqual(retry, first);
  // A partial $40 manual payment in between leaves $60 of principal.
  assert.deepEqual(cardOnFileCharge({ amount: 60, surchargeEnabled: true }), { amount: 60, surcharge: 2.4, total: 62.4 });
});

console.log(`\n${passed} passed`);
