/**
 * Unit tests for the pure parts of the Square products build
 * (lib/square-products.ts, lib/gift-cards.ts, docs/plans/square-products-2026-10-30.md):
 * order / payment / gift card mappers and gift card number helpers.
 *   npx tsx scripts/test-square-products.ts
 * Plain assertions, no test framework (repo has none). No database.
 */
import assert from "node:assert/strict";
import {
  formatGan,
  ganTail,
  giftCardActivityDelta,
  mapSellerGiftCardActivity,
  mapSellerOrder,
  mapSellerPaymentDetail,
  normalizeGan,
  productIdempotencyKey,
} from "../lib/square-products";
import { giftCardAmountIssue, GIFT_CARD_MAX_CENTS, GIFT_CARD_MIN_CENTS } from "../lib/gift-cards";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const usd = (amount: number) => ({ amount, currency: "USD" });

console.log("orders");

test("an order maps lines, modifiers, discounts, taxes, tip and the source", () => {
  const o = mapSellerOrder({
    id: "o1",
    created_at: "2026-10-30T15:00:00Z",
    source: { name: "Square Point of Sale" },
    line_items: [
      {
        uid: "a",
        name: "Filter change",
        variation_name: "20x25",
        quantity: "2",
        base_price_money: usd(1500),
        total_money: usd(3240),
        total_tax_money: usd(240),
        total_discount_money: usd(0),
        modifiers: [{ name: "Premium", total_price_money: usd(500) }],
      },
      { uid: "b", name: "Service call", quantity: "1", base_price_money: usd(8900), total_money: usd(7900), total_tax_money: usd(0), total_discount_money: usd(1000), note: "Returning client" },
    ],
    discounts: [{ name: "Loyalty", applied_money: usd(1000) }],
    taxes: [{ name: "Sales tax", applied_money: usd(240) }],
    total_money: usd(11640),
    total_tax_money: usd(240),
    total_discount_money: usd(1000),
    total_tip_money: usd(500),
  });
  assert.equal(o.lines.length, 2);
  assert.deepEqual(o.lines[0], { uid: "a", name: "Filter change", variation: "20x25", quantity: 2, unitCents: 1500, totalCents: 3000, taxCents: 240, discountCents: 0, modifiers: [{ name: "Premium", cents: 500 }], note: null });
  assert.equal(o.lines[1].totalCents, 7900);
  assert.equal(o.lines[1].discountCents, 1000);
  assert.equal(o.lines[1].note, "Returning client");
  // subtotal = line totals before their discounts
  assert.equal(o.subtotalCents, 3000 + 8900);
  assert.equal(o.discountCents, 1000);
  assert.equal(o.taxCents, 240);
  assert.equal(o.tipCents, 500);
  assert.equal(o.totalCents, 11640);
  assert.equal(o.source, "Square Point of Sale");
  assert.deepEqual(o.discounts, [{ name: "Loyalty", cents: 1000 }]);
  assert.deepEqual(o.taxes, [{ name: "Sales tax", cents: 240 }]);
});

test("a bare order (no items, no money) maps to zeros, never throws", () => {
  const o = mapSellerOrder({ id: "o2" });
  assert.deepEqual(o.lines, []);
  assert.equal(o.totalCents, 0);
  assert.equal(o.source, null);
});

console.log("payment detail");

test("a card payment carries fee, tip, card and the refund ids", () => {
  const p = mapSellerPaymentDetail({
    id: "p1",
    status: "COMPLETED",
    created_at: "2026-10-30T15:00:00Z",
    amount_money: usd(10000),
    tip_money: usd(1000),
    total_money: usd(11000),
    processing_fee: [{ amount_money: usd(320) }, { amount_money: usd(5) }],
    refunded_money: usd(2000),
    refund_ids: ["r1", "r2"],
    source_type: "CARD",
    card_details: { entry_method: "KEYED", card: { card_brand: "VISA", last_4: "4242", card_type: "CREDIT" } },
    receipt_url: "https://squareup.com/receipt/preview/abc",
    receipt_number: "AbCd",
    order_id: "o1",
    application_details: { square_product: "SQUARE_POS" },
  });
  assert.equal(p.feeCents, 325);
  assert.equal(p.totalCents, 11000);
  assert.equal(p.refundedCents, 2000);
  assert.deepEqual(p.refundIds, ["r1", "r2"]);
  assert.equal(p.cardBrand, "VISA");
  assert.equal(p.last4, "4242");
  assert.equal(p.entryMethod, "KEYED");
  assert.equal(p.receiptNumber, "AbCd");
  assert.equal(p.orderId, "o1");
});

test("a bank payment takes the account suffix as its last 4; total falls back to amount + tip", () => {
  const p = mapSellerPaymentDetail({ id: "p2", status: "PENDING", amount_money: usd(5000), tip_money: usd(0), source_type: "BANK_ACCOUNT", bank_account_details: { bank_name: "Chase", ach_details: { account_number_suffix: "9876" } } });
  assert.equal(p.last4, "9876");
  assert.equal(p.bankName, "Chase");
  assert.equal(p.totalCents, 5000);
  assert.deepEqual(p.refundIds, []);
});

console.log("gift cards");

test("numbers: normalize strips dressing, tail shows the last four, format groups by four", () => {
  assert.equal(normalizeGan(" 7783 3200 0000 1234 "), "7783320000001234");
  assert.equal(normalizeGan("7783-3200-0000-1234"), "7783320000001234");
  assert.equal(normalizeGan("12345"), null);
  assert.equal(normalizeGan(""), null);
  assert.equal(ganTail("7783320000001234"), "•••• 1234");
  assert.equal(ganTail(null), "••••");
  assert.equal(formatGan("7783320000001234"), "7783 3200 0000 1234");
});

test("sale amounts: $5 to $2,000 in whole cents", () => {
  assert.equal(giftCardAmountIssue(GIFT_CARD_MIN_CENTS), null);
  assert.equal(giftCardAmountIssue(GIFT_CARD_MAX_CENTS), null);
  assert.match(giftCardAmountIssue(499) ?? "", /start at \$5/);
  assert.match(giftCardAmountIssue(GIFT_CARD_MAX_CENTS + 1) ?? "", /caps/);
  assert.match(giftCardAmountIssue(0) ?? "", /amount/i);
  assert.match(giftCardAmountIssue(1000.5) ?? "", /whole cents/i);
});

test("activities: money onto the card is positive, off it negative, with the payment that used it", () => {
  assert.equal(giftCardActivityDelta({ id: "a", type: "ACTIVATE", activate_activity_details: { amount_money: usd(5000) } }), 5000);
  assert.equal(giftCardActivityDelta({ id: "a", type: "LOAD", load_activity_details: { amount_money: usd(2500) } }), 2500);
  assert.equal(giftCardActivityDelta({ id: "a", type: "REDEEM", redeem_activity_details: { amount_money: usd(1200), payment_id: "p9" } }), -1200);
  assert.equal(giftCardActivityDelta({ id: "a", type: "REFUND", refund_activity_details: { amount_money: usd(1200) } }), 1200);
  assert.equal(giftCardActivityDelta({ id: "a", type: "ADJUST_DECREMENT", adjust_decrement_activity_details: { amount_money: usd(100) } }), -100);
  assert.equal(giftCardActivityDelta({ id: "a", type: "DEACTIVATE" }), 0);
  const m = mapSellerGiftCardActivity({ id: "a", type: "REDEEM", created_at: "2026-10-30T00:00:00Z", gift_card_balance_money: usd(3800), redeem_activity_details: { amount_money: usd(1200), payment_id: "p9" } });
  assert.deepEqual(m, { id: "a", type: "REDEEM", createdAt: "2026-10-30T00:00:00Z", deltaCents: -1200, balanceAfterCents: 3800, paymentId: "p9", reason: null });
});

test("idempotency keys stay within Square's 45 characters and are stable", () => {
  const long = `gc-activate:${"x".repeat(60)}`;
  assert.ok(productIdempotencyKey(long).length <= 45);
  assert.equal(productIdempotencyKey(long), productIdempotencyKey(long));
  assert.equal(productIdempotencyKey("short"), "short");
});

console.log(`\n${passed} passed`);
