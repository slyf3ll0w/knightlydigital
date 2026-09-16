/**
 * Unit tests for the pure money helpers behind refunds, deposits and due
 * dates (ops-flow review 2026-09-15, Batch A).
 *   npx tsx scripts/test-money.ts
 * Plain assertions, no test framework (repo has none). lib/payments pulls in
 * the Prisma client, so a placeholder DATABASE_URL is needed (never queried):
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/test-money.ts
 */
import assert from "node:assert/strict";
import { refundSplit, invoiceBalance } from "../lib/payments";
import { depositCredit, sanitizeDeposit } from "../lib/deposits";
import { dueDateFromTerms, isPastDue } from "../lib/due-dates";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok — ${name}`);
}

// ─── refundSplit ─────────────────────────────────────────────────────────────

test("full refund of a surcharged payment zeroes both amount and surcharge", () => {
  const s = refundSplit({ amount: 103, surchargeAmount: 3 }, 103);
  assert.equal(s.remainingAmount, 0);
  assert.equal(s.remainingSurcharge, 0);
  assert.equal(s.refundedSurcharge, 3);
  // …so the invoice balance is back to the full total, not total + surcharge.
  const balance = invoiceBalance({
    total: 100,
    payments: [{ amount: s.remainingAmount, surchargeAmount: s.remainingSurcharge }],
  });
  assert.equal(balance, 100);
});

test("partial refund scales the surcharge with the principal", () => {
  const s = refundSplit({ amount: 103, surchargeAmount: 3 }, 50);
  assert.equal(s.remainingAmount, 53);
  assert.equal(s.remainingSurcharge, 1.54); // 3 × 53/103
  assert.equal(s.refundedSurcharge, 1.46);
  // Client has 53 in, of which 1.54 is surcharge → 51.46 toward the $100 job.
  const balance = invoiceBalance({
    total: 100,
    payments: [{ amount: s.remainingAmount, surchargeAmount: s.remainingSurcharge }],
  });
  assert.equal(balance, 48.54);
});

test("un-surcharged payments keep a null surcharge", () => {
  const s = refundSplit({ amount: 40, surchargeAmount: null }, 10);
  assert.equal(s.remainingAmount, 30);
  assert.equal(s.remainingSurcharge, null);
  assert.equal(s.refundedSurcharge, 0);
});

test("refund + restore round-trips (webhook reversal-failed path)", () => {
  const s = refundSplit({ amount: 206.5, surchargeAmount: 6.5 }, 100);
  const restoredAmount = Math.round((s.remainingAmount + 100) * 100) / 100;
  const restoredSurcharge = Math.round(((s.remainingSurcharge ?? 0) + s.refundedSurcharge) * 100) / 100;
  assert.equal(restoredAmount, 206.5);
  assert.equal(restoredSurcharge, 6.5);
});

// ─── depositCredit ───────────────────────────────────────────────────────────

test("a partially paid deposit invoice still credits what was paid", () => {
  assert.equal(depositCredit([{ total: 500, payments: [{ amount: 200 }] }]), 200);
});

test("deposit credit is principal only (card surcharge excluded) and capped at the deposit", () => {
  assert.equal(depositCredit([{ total: 500, payments: [{ amount: 515, surchargeAmount: 15 }] }]), 500);
  assert.equal(depositCredit([{ total: 500, payments: [{ amount: 600 }] }]), 500);
  assert.equal(depositCredit([]), 0);
});

// ─── sanitizeDeposit ─────────────────────────────────────────────────────────

test("PERCENT deposits clamp to 0–100 and FIXED to ≥ 0", () => {
  assert.deepEqual(sanitizeDeposit({ depositType: "PERCENT", depositValue: 150 }), {
    depositType: "PERCENT",
    depositValue: 100,
  });
  assert.deepEqual(sanitizeDeposit({ depositType: "FIXED", depositValue: -20 }), {
    depositType: "FIXED",
    depositValue: 0,
  });
  assert.deepEqual(sanitizeDeposit({ depositType: "FULL", depositValue: 40 }), {
    depositType: "FULL",
    depositValue: null,
  });
  assert.deepEqual(sanitizeDeposit({ depositType: "bogus" }), { depositType: "NONE", depositValue: null });
});

// ─── dueDateFromTerms ────────────────────────────────────────────────────────

test("Net-N due dates land at noon UTC on the Nth calendar day", () => {
  const issued = new Date("2026-09-16T21:45:00Z"); // 9:45pm UTC
  const due = dueDateFromTerms(issued, 7);
  assert.equal(due.toISOString(), "2026-09-23T12:00:00.000Z");
  // Not late until the whole due day has passed.
  assert.equal(isPastDue(due, new Date("2026-09-23T23:59:00Z")), false);
  assert.equal(isPastDue(due, new Date("2026-09-24T00:00:01Z")), true);
});

test("Net-0 is due today at noon, not the instant the invoice was issued", () => {
  const issued = new Date("2026-09-16T00:30:00Z");
  assert.equal(dueDateFromTerms(issued, 0).toISOString(), "2026-09-16T12:00:00.000Z");
  assert.equal(isPastDue(dueDateFromTerms(issued, 0), issued), false);
  // Garbage terms fall back to Net-0, never NaN.
  assert.equal(dueDateFromTerms(issued, NaN).toISOString(), "2026-09-16T12:00:00.000Z");
});

console.log(`\n${passed} money tests passed`);
