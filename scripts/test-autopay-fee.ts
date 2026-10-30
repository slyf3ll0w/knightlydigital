/**
 * Unit tests for the card-on-file (autopay) surcharge rule in
 * lib/autopay-rules.ts — what a saved-card charge collects when the
 * company's Service fee switch is on.
 *   npx tsx scripts/test-autopay-fee.ts
 * Plain assertions, no test framework (repo has none). No database.
 */
import assert from "node:assert/strict";
import { cardOnFileCharge, MAX_SURCHARGE_RATE } from "../lib/autopay-rules";
import { calculateSurcharge } from "../lib/payments";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("cardOnFileCharge");

test("switch off → the bare balance, no surcharge", () => {
  assert.deepEqual(cardOnFileCharge({ amount: 35, surchargeEnabled: false, surchargeRate: 0.035 }), { amount: 35, surcharge: 0, total: 35 });
});

test("switch on → balance plus the company's rate, rounded to cents", () => {
  assert.deepEqual(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: 0.035 }), { amount: 35, surcharge: 1.23, total: 36.23 });
  assert.deepEqual(cardOnFileCharge({ amount: 89, surchargeEnabled: true, surchargeRate: 0.035 }), { amount: 89, surcharge: 3.12, total: 92.12 });
  assert.deepEqual(cardOnFileCharge({ amount: 10, surchargeEnabled: true, surchargeRate: 0.035 }), { amount: 10, surcharge: 0.35, total: 10.35 });
});

test("the surcharge matches the pay page's calculateSurcharge to the cent", () => {
  for (const amount of [0.5, 1, 12.34, 35, 89, 109, 1234.56, 9999.99]) {
    for (const rate of [0.01, 0.0295, 0.035, 0.1]) {
      const fee = cardOnFileCharge({ amount, surchargeEnabled: true, surchargeRate: rate });
      assert.equal(fee.surcharge, calculateSurcharge(amount, rate), `${amount} @ ${rate}`);
      assert.equal(fee.total, Math.round((amount + fee.surcharge) * 100) / 100);
    }
  }
});

test("a missing, zero, negative or absurd rate charges no fee (bad row, not a fee)", () => {
  assert.equal(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: null }).surcharge, 0);
  assert.equal(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: undefined }).surcharge, 0);
  assert.equal(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: 0 }).surcharge, 0);
  assert.equal(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: -0.03 }).surcharge, 0);
  assert.equal(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: MAX_SURCHARGE_RATE + 0.001 }).surcharge, 0);
  assert.equal(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: Number.NaN }).surcharge, 0);
  assert.equal(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: MAX_SURCHARGE_RATE }).surcharge, 3.5);
});

test("a Decimal-shaped rate (Prisma) works once the caller Numbers it", () => {
  const decimal = { toString: () => "0.0350" };
  assert.equal(cardOnFileCharge({ amount: 35, surchargeEnabled: true, surchargeRate: Number(decimal) }).surcharge, 1.23);
});

test("nothing to charge → nothing surcharged", () => {
  assert.deepEqual(cardOnFileCharge({ amount: 0, surchargeEnabled: true, surchargeRate: 0.035 }), { amount: 0, surcharge: 0, total: 0 });
  assert.deepEqual(cardOnFileCharge({ amount: -5, surchargeEnabled: true, surchargeRate: 0.035 }), { amount: -5, surcharge: 0, total: -5 });
});

test("a retry charges the remaining PRINCIPAL plus its own fee — never the old fee again", () => {
  // Invoice $100, first autopay of $103.50 declined; the retry sweep passes the
  // invoiceBalance (still $100, nothing was recorded) and gets the same ask.
  const first = cardOnFileCharge({ amount: 100, surchargeEnabled: true, surchargeRate: 0.035 });
  const retry = cardOnFileCharge({ amount: 100, surchargeEnabled: true, surchargeRate: 0.035 });
  assert.deepEqual(retry, first);
  // A partial $40 manual payment in between leaves $60 of principal.
  assert.deepEqual(cardOnFileCharge({ amount: 60, surchargeEnabled: true, surchargeRate: 0.035 }), { amount: 60, surcharge: 2.1, total: 62.1 });
});

console.log(`\n${passed} passed`);
