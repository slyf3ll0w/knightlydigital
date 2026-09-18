/**
 * "Verify it's you" grants and intents (lib/reauth.ts): account-bound,
 * signed, short-lived, and never confused with each other.
 *
 *   npx tsx scripts/test-reauth.ts
 */
process.env.AUTH_SECRET ??= "test-secret-for-reauth";

import {
  createReauthGrant,
  createReauthIntent,
  isSafeReturnTo,
  verifyReauthGrant,
  verifyReauthIntent,
  REAUTH_TTL_MS,
} from "../lib/reauth";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "ok" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
}

(async () => {
  console.log("grant");
  const grant = await createReauthGrant("acct_1", "password");
  eq("verifies for its own account, reports how", await verifyReauthGrant(grant, "acct_1"), "password");
  eq("google grant reports google", await verifyReauthGrant(await createReauthGrant("acct_1", "google"), "acct_1"), "google");
  eq("refused for another account", await verifyReauthGrant(grant, "acct_2"), null);
  eq("refused when empty", await verifyReauthGrant("", "acct_1"), null);
  eq("refused with a tampered signature", await verifyReauthGrant(grant.slice(0, -2) + "zz", "acct_1"), null);
  const [payload] = grant.split(".");
  eq("refused with no signature", await verifyReauthGrant(payload, "acct_1"), null);

  const realNow = Date.now;
  try {
    Date.now = () => realNow() + REAUTH_TTL_MS + 1000;
    eq("expired after the TTL", await verifyReauthGrant(grant, "acct_1"), null);
    Date.now = () => realNow() + REAUTH_TTL_MS - 1000;
    eq("still good just inside the TTL", await verifyReauthGrant(grant, "acct_1"), "password");
  } finally {
    Date.now = realNow;
  }

  const saved = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "someone-elses-secret";
  const foreign = await createReauthGrant("acct_1", "password");
  process.env.AUTH_SECRET = saved;
  eq("refused when signed with another secret", await verifyReauthGrant(foreign, "acct_1"), null);

  console.log("intent");
  const intent = await createReauthIntent("acct_1", "/app/settings/profile");
  eq("intent returns its page", await verifyReauthIntent(intent, "acct_1"), "/app/settings/profile");
  eq("intent refused for another account", await verifyReauthIntent(intent, "acct_2"), null);
  eq("an intent is not a grant", await verifyReauthGrant(intent, "acct_1"), null);
  eq("a grant is not an intent", await verifyReauthIntent(grant, "acct_1"), null);
  eq("intent with a foreign page is dropped", await verifyReauthIntent(await createReauthIntent("acct_1", "https://evil.example/"), "acct_1"), null);

  console.log("isSafeReturnTo");
  eq("app path", isSafeReturnTo("/app/settings?s=business"), true);
  eq("app root", isSafeReturnTo("/app"), true);
  eq("absolute url", isSafeReturnTo("https://evil.example/app"), false);
  eq("protocol-relative", isSafeReturnTo("//evil.example/app"), false);
  eq("outside /app", isSafeReturnTo("/pay/abc"), false);
  eq("not a string", isSafeReturnTo(42), false);

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nall passed");
})();
