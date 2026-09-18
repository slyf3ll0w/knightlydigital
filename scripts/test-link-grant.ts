/**
 * The "Connect Google" re-auth grant (lib/link-grant.ts): account-bound,
 * signed, and short-lived — the OAuth callback links nothing without one.
 *
 *   npx tsx scripts/test-link-grant.ts
 */
process.env.AUTH_SECRET ??= "test-secret-for-link-grant";

import { createLinkGrant, verifyLinkGrant, LINK_GRANT_TTL_MS } from "../lib/link-grant";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "ok" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
}

(async () => {
  console.log("link grant");
  const grant = await createLinkGrant("acct_1");
  eq("verifies for its own account", await verifyLinkGrant(grant, "acct_1"), true);
  eq("refused for another account", await verifyLinkGrant(grant, "acct_2"), false);
  eq("refused when empty", await verifyLinkGrant("", "acct_1"), false);
  eq("refused with a tampered signature", await verifyLinkGrant(grant.slice(0, -2) + "zz", "acct_1"), false);

  // Forge the payload with the right shape but no valid signature
  const [payload] = grant.split(".");
  eq("refused with a missing signature", await verifyLinkGrant(payload, "acct_1"), false);
  eq("refused with a re-signed-by-nobody payload", await verifyLinkGrant(`${payload}.AAAA`, "acct_1"), false);

  // Expiry: mint, then move the clock past the TTL
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + LINK_GRANT_TTL_MS + 1000;
    eq("expired after the TTL", await verifyLinkGrant(grant, "acct_1"), false);
    Date.now = () => realNow() + LINK_GRANT_TTL_MS - 1000;
    eq("still good just inside the TTL", await verifyLinkGrant(grant, "acct_1"), true);
  } finally {
    Date.now = realNow;
  }

  // A grant minted under a different secret is worthless here
  const saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "someone-elses-secret";
  const foreign = await createLinkGrant("acct_1");
  process.env.AUTH_SECRET = saved;
  eq("refused when signed with another secret", await verifyLinkGrant(foreign, "acct_1"), false);

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nall passed");
})();
