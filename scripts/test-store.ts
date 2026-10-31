/**
 * Unit tests for the online store's pure rules (lib/store-rules.ts,
 * docs/plans/online-store-2026-10-31.md): order totals, quantity and buyer
 * checks, the order ceiling, the invoice subject.
 *   npx tsx scripts/test-store.ts
 * Plain assertions, no test framework (repo has none). No database.
 */
import assert from "node:assert/strict";
import { orderAmountIssue, orderTotals, STORE_MAX_ORDER, STORE_MAX_QUANTITY, storeBuyerIssue, storeOrderSubject, storeQuantityIssue } from "../lib/store-rules";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("store rules");

test("totals: quantity × price, company tax on top, cents rounded", () => {
  assert.deepEqual(orderTotals({ unitPrice: 19.5, quantity: 2, taxRate: null }), { subtotal: 39, tax: 0, total: 39 });
  assert.deepEqual(orderTotals({ unitPrice: 19.5, quantity: 2, taxRate: 0.0825 }), { subtotal: 39, tax: 3.22, total: 42.22 });
  assert.deepEqual(orderTotals({ unitPrice: 0.1, quantity: 3, taxRate: 0 }), { subtotal: 0.3, tax: 0, total: 0.3 });
  // a fractional quantity is floored, a negative price is nothing
  assert.deepEqual(orderTotals({ unitPrice: 10, quantity: 2.9, taxRate: null }), { subtotal: 20, tax: 0, total: 20 });
  assert.deepEqual(orderTotals({ unitPrice: -5, quantity: 1, taxRate: null }), { subtotal: 0, tax: 0, total: 0 });
});

test("quantity: a whole number from 1 to the cap", () => {
  assert.equal(storeQuantityIssue(1), null);
  assert.equal(storeQuantityIssue(STORE_MAX_QUANTITY), null);
  assert.match(storeQuantityIssue(0) ?? "", /how many/i);
  assert.match(storeQuantityIssue(1.5) ?? "", /how many/i);
  assert.match(storeQuantityIssue("x") ?? "", /how many/i);
  assert.match(storeQuantityIssue(STORE_MAX_QUANTITY + 1) ?? "", /up to/i);
});

test("buyer: a name and a real email; phone optional", () => {
  assert.equal(storeBuyerIssue({ firstName: "Ann", lastName: "", email: "ann@example.com", phone: "" }), null);
  assert.match(storeBuyerIssue({ firstName: " ", lastName: "Lee", email: "a@b.co", phone: "" }) ?? "", /name/i);
  assert.match(storeBuyerIssue({ firstName: "Ann", lastName: "", email: "", phone: "" }) ?? "", /email/i);
  assert.match(storeBuyerIssue({ firstName: "Ann", lastName: "", email: "not-an-email", phone: "" }) ?? "", /doesn't look right/i);
});

test("the order fits the pay page: $1 up to the payment-request ceiling", () => {
  assert.equal(orderAmountIssue(1), null);
  assert.equal(orderAmountIssue(STORE_MAX_ORDER), null);
  assert.match(orderAmountIssue(0.5) ?? "", /can't be ordered/i);
  assert.match(orderAmountIssue(STORE_MAX_ORDER + 0.01) ?? "", /top out/i);
});

test("the invoice subject names the product and a quantity above one", () => {
  assert.equal(storeOrderSubject("Air filter", 1), "Order · Air filter");
  assert.equal(storeOrderSubject("Air filter", 3), "Order · 3 × Air filter");
});

console.log(`\n${passed} passed`);
