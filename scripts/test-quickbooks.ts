/**
 * Unit tests for the pure halves of the QuickBooks sync (lib/quickbooks.ts):
 *   refundReceiptSplit — how a refund divides into services vs surcharge
 *   verifyState        — the signed OAuth state round-trips and expires
 *   npx tsx scripts/test-quickbooks.ts
 * Plain assertions, no framework. No database (placeholder DATABASE_URL).
 */
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/unused";
process.env.AUTH_SECRET ??= "test-secret-for-quickbooks-state";

async function main() {
  const { refundReceiptSplit, buildAuthorizeUrl, verifyState } = await import("../lib/quickbooks");
  let passed = 0;
  function test(name: string, fn: () => void) {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  }

  console.log("refund receipts: services vs surcharge");
  test("a plain refund is all services", () => {
    assert.deepEqual(refundReceiptSplit(120, null), { services: 120, surcharge: 0 });
  });
  test("the surcharge portion gets its own line", () => {
    assert.deepEqual(refundReceiptSplit(103.5, 3.5), { services: 100, surcharge: 3.5 });
  });
  test("a surcharge-only refund has no services line", () => {
    assert.deepEqual(refundReceiptSplit(3.5, 3.5), { services: 0, surcharge: 3.5 });
  });
  test("a surcharge larger than the refund is capped at the refund", () => {
    assert.deepEqual(refundReceiptSplit(2, 3.5), { services: 0, surcharge: 2 });
  });
  test("cents round cleanly", () => {
    assert.deepEqual(refundReceiptSplit(10.1, 0.3), { services: 9.8, surcharge: 0.3 });
  });
  test("nothing refunded, nothing split", () => {
    assert.deepEqual(refundReceiptSplit(0, 0), { services: 0, surcharge: 0 });
  });

  console.log("oauth state: signed, bound to company and user, short-lived");
  test("the state in the authorize URL verifies back to the same company and user", () => {
    const url = new URL(buildAuthorizeUrl("company_1", "user_1"));
    const state = url.searchParams.get("state");
    assert.ok(state);
    assert.deepEqual(verifyState(state), { companyId: "company_1", userId: "user_1" });
    assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/app/quickbooks/callback");
  });
  test("a tampered state is refused", () => {
    const state = new URL(buildAuthorizeUrl("company_1", "user_1")).searchParams.get("state")!;
    const [companyId, , expiresAt, sig] = state.split(".");
    assert.equal(verifyState(`${companyId}.user_2.${expiresAt}.${sig}`), null);
    assert.equal(verifyState("not.a.state"), null);
  });
  test("an expired state is refused", () => {
    const state = new URL(buildAuthorizeUrl("company_1", "user_1")).searchParams.get("state")!;
    const [companyId, userId, , sig] = state.split(".");
    assert.equal(verifyState(`${companyId}.${userId}.${Date.now() - 1000}.${sig}`), null);
  });

  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
