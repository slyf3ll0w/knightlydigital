/**
 * Unit tests for the pure halves of the 2026-11-02 readiness fixes:
 *   lib/fair-use.ts         — the Voice plan's fair-use verdict
 *   lib/telnyx-balance.ts   — warn / critical lines
 *   lib/payment-source.ts   — the Square idempotency suffix
 *   lib/plan-entitlement.ts — grace covers the whole retry ladder
 *   npx tsx scripts/test-fixes-nov2.ts
 */
import assert from "node:assert/strict";
import { squareIdempotencySuffix } from "../lib/payment-source";
import { balanceLevel, balanceThresholds } from "../lib/telnyx-balance";
import { PAYMENT_GRACE_DAYS } from "../lib/plan-entitlement";
import { MAX_AUTO_CHARGE_ATTEMPTS, nextRetryAt } from "../lib/autopay-rules";

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/unused";

async function main() {
  const { fairUseVerdict } = await import("../lib/fair-use");
  let passed = 0;
  const test = (name: string, fn: () => void) => {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  };

  console.log("fair use");
  test("under the ceiling is ok; 80% warns; the ceiling stops", () => {
    assert.deepEqual(fairUseVerdict(10, 3000), { ok: true, used: 10, cap: 3000, pct: 10 / 3000, warn: false });
    assert.equal(fairUseVerdict(2400, 3000).warn, true);
    assert.equal(fairUseVerdict(2400, 3000).ok, true);
    assert.equal(fairUseVerdict(3000, 3000).ok, false);
    assert.equal(fairUseVerdict(0, 0).ok, true, "a zero cap means unmetered");
  });

  console.log("telnyx balance");
  test("thresholds read the env with sane defaults", () => {
    assert.deepEqual(balanceThresholds({}), { warn: 25, critical: 10 });
    assert.deepEqual(balanceThresholds({ TELNYX_BALANCE_WARN: "40", TELNYX_BALANCE_CRITICAL: "15" }), { warn: 40, critical: 15 });
    assert.deepEqual(balanceThresholds({ TELNYX_BALANCE_WARN: "nope" }), { warn: 25, critical: 10 });
  });
  test("levels", () => {
    const t = { warn: 25, critical: 10 };
    assert.equal(balanceLevel(100, t), "ok");
    assert.equal(balanceLevel(25, t), "warn");
    assert.equal(balanceLevel(10, t), "critical");
    assert.equal(balanceLevel(-3, t), "critical");
  });

  console.log("square idempotency");
  test("same token → same suffix; different token → different; no token → fixed", () => {
    assert.equal(squareIdempotencySuffix("cnon:abc"), squareIdempotencySuffix("cnon:abc"));
    assert.notEqual(squareIdempotencySuffix("cnon:abc"), squareIdempotencySuffix("cnon:abd"));
    assert.equal(squareIdempotencySuffix(undefined), squareIdempotencySuffix(null));
    assert.match(squareIdempotencySuffix("bauth:x"), /^[0-9a-f]{12}$/);
  });

  console.log("plan grace");
  test("the grace period outlasts autopay's last retry", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    let at: Date | null = now;
    let last = now;
    for (let attempts = 1; attempts <= MAX_AUTO_CHARGE_ATTEMPTS; attempts++) {
      at = nextRetryAt({ attempts, kind: "soft", now: last });
      if (at) last = at;
    }
    const lastRetryDays = (last.getTime() - now.getTime()) / 86_400_000;
    assert.ok(PAYMENT_GRACE_DAYS > lastRetryDays, `grace ${PAYMENT_GRACE_DAYS}d must exceed the last retry at day ${lastRetryDays}`);
  });

  console.log(`\n${passed} tests passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
