/**
 * Unit tests for the pure parts of the Square integration (2026-10-15):
 * the signed OAuth state, secrets at rest, webhook signatures, idempotency
 * keys, the authorize URL, location picking, decline wording and the
 * processor-aware charge gate.
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/test-square.ts
 * (lib/payments-gate pulls in the Prisma client; never queried.)
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.AUTH_SECRET ??= "test-secret-for-square-unit-tests";
process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-TEST";
process.env.SQUARE_APPLICATION_SECRET = "sandbox-sq0csb-TEST";
process.env.SQUARE_ENVIRONMENT = "sandbox";
process.env.NEXTAUTH_URL = "https://example.test";
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "whsec-test-key";

import { openSecret, sealSecret } from "../lib/secret-box";
import {
  buildSquareState,
  verifySquareState,
  isStaticSquareToken,
  needsRefresh,
  REFRESH_AFTER_MS,
  STALE_AFTER_MS,
  STATIC_TOKEN,
} from "../lib/square-connection";
import {
  buildSquareAuthorizeUrl,
  declineMessage,
  isTransientSquareError,
  payoutStatusFromBankAccounts,
  pickChargeLocation,
  squareIdempotencyKey,
  squareRedirectUrl,
  squareScopes,
  squareSignupUrl,
  SquareError,
  verifySquareWebhookSignature,
} from "../lib/square";
import { getProcessor } from "../lib/payments";
import { buyerIdentityData, buyerIdentityRefOf, canChargeOnline, processorMerchantRef } from "../lib/payments-gate";
import { clientPayConfig } from "../lib/pay-client-config";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok — ${name}`);
}

// ─── secret box ──────────────────────────────────────────────────────────────

test("sealSecret round-trips and is scoped", () => {
  const sealed = sealSecret("EAAAl-token", "square-token");
  assert.ok(sealed.startsWith("v1:"));
  assert.equal(openSecret(sealed, "square-token"), "EAAAl-token");
  assert.throws(() => openSecret(sealed, "other-scope"));
  // Different IVs each time — identical plaintexts never share ciphertext
  assert.notEqual(sealSecret("x", "s"), sealSecret("x", "s"));
});

// ─── OAuth state ─────────────────────────────────────────────────────────────

test("state verifies, binds company + user, and expires", () => {
  const now = 1_700_000_000_000;
  const state = buildSquareState("cmp_1", "usr_1", now);
  assert.deepEqual(verifySquareState(state, now + 60_000), { companyId: "cmp_1", userId: "usr_1" });
  assert.equal(verifySquareState(state, now + 11 * 60_000), null, "expired after 10 min");
  assert.equal(verifySquareState(state.replace("cmp_1", "cmp_2"), now), null, "tampered company");
  assert.equal(verifySquareState(state.slice(0, -2) + "zz", now), null, "tampered signature");
  assert.equal(verifySquareState("garbage", now), null);
});

test("authorize URL carries our scopes, state and redirect", () => {
  const url = new URL(buildSquareAuthorizeUrl({ state: "abc.def" }));
  assert.equal(url.origin, "https://connect.squareupsandbox.com");
  assert.equal(url.pathname, "/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "sandbox-sq0idb-TEST");
  assert.equal(url.searchParams.get("state"), "abc.def");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.test/api/app/square/callback");
  const scope = url.searchParams.get("scope")!.split(" ");
  for (const s of ["MERCHANT_PROFILE_READ", "PAYMENTS_WRITE", "PAYMENTS_READ", "CUSTOMERS_READ", "CUSTOMERS_WRITE", "BANK_ACCOUNTS_READ"]) {
    assert.ok(scope.includes(s), `scope has ${s}`);
  }
  assert.equal(url.searchParams.get("session"), null, "session=false is never sent in sandbox");
});

test("extra scopes come from env, de-duplicated and upper-cased", () => {
  process.env.SQUARE_EXTRA_SCOPES = "payments_write, ORDERS_READ";
  const s = squareScopes();
  assert.equal(s.filter((x) => x === "PAYMENTS_WRITE").length, 1);
  assert.ok(s.includes("ORDERS_READ"));
  delete process.env.SQUARE_EXTRA_SCOPES;
});

test("redirect URL honours SQUARE_REDIRECT_URL and strips a trailing slash", () => {
  process.env.NEXTAUTH_URL = "https://example.test/";
  assert.equal(squareRedirectUrl(), "https://example.test/api/app/square/callback");
  process.env.SQUARE_REDIRECT_URL = "https://staging.example.test/api/app/square/callback";
  assert.equal(squareRedirectUrl(), "https://staging.example.test/api/app/square/callback");
  delete process.env.SQUARE_REDIRECT_URL;
  process.env.NEXTAUTH_URL = "https://example.test";
});

// ─── refresh cadence ─────────────────────────────────────────────────────────

test("refresh after 7 days, page after 8 (Square's guidance)", () => {
  assert.equal(REFRESH_AFTER_MS, 7 * 86_400_000);
  assert.equal(STALE_AFTER_MS, 8 * 86_400_000);
});

// ─── webhook signature ───────────────────────────────────────────────────────

test("webhook signature = HMAC-SHA256(url + body), base64", () => {
  const url = "https://example.test/api/public/webhooks/square";
  const body = JSON.stringify({ type: "payment.updated", merchant_id: "M1" });
  const sig = createHmac("sha256", "whsec-test-key").update(url + body).digest("base64");
  assert.equal(verifySquareWebhookSignature({ rawBody: body, signatureHeader: sig, notificationUrl: url }), true);
  assert.equal(verifySquareWebhookSignature({ rawBody: body + " ", signatureHeader: sig, notificationUrl: url }), false);
  assert.equal(verifySquareWebhookSignature({ rawBody: body, signatureHeader: sig, notificationUrl: url + "/" }), false);
  assert.equal(verifySquareWebhookSignature({ rawBody: body, signatureHeader: null, notificationUrl: url }), false);
  assert.equal(verifySquareWebhookSignature({ rawBody: body, signatureHeader: "not-base64!!", notificationUrl: url }), false);
  assert.equal(
    verifySquareWebhookSignature({ rawBody: body, signatureHeader: sig, notificationUrl: url, signatureKey: "" }),
    false,
    "no key configured = refuse everything"
  );
});

// ─── idempotency keys ────────────────────────────────────────────────────────

test("idempotency keys stay under Square's 45 chars and are stable", () => {
  const short = "inv_abc-1000-29000000";
  assert.equal(squareIdempotencyKey(short), short);
  const long = "cmg1abcdefghijklmnopqrstuv-stored-123456-0123456789-a3";
  const k1 = squareIdempotencyKey(long);
  assert.ok(k1.length <= 45, `len ${k1.length}`);
  assert.equal(k1, squareIdempotencyKey(long), "deterministic");
  assert.notEqual(k1, squareIdempotencyKey(long + "x"));
});

// ─── locations ───────────────────────────────────────────────────────────────

test("pickChargeLocation prefers the active main location that takes cards", () => {
  const locs = [
    { id: "L_inactive", status: "INACTIVE" as const, capabilities: ["CREDIT_CARD_PROCESSING"] },
    { id: "L_nocards", status: "ACTIVE" as const, capabilities: [] },
    { id: "L_main", status: "ACTIVE" as const, capabilities: ["CREDIT_CARD_PROCESSING"] },
    { id: "L_other", status: "ACTIVE" as const, capabilities: ["CREDIT_CARD_PROCESSING"] },
  ];
  assert.equal(pickChargeLocation(locs, "L_main")?.id, "L_main");
  assert.equal(pickChargeLocation(locs, "L_inactive")?.id, "L_main", "inactive main falls through to the first usable");
  assert.equal(pickChargeLocation(locs, "L_nocards")?.id, "L_main");
  assert.equal(pickChargeLocation([locs[0], locs[1]], null), null, "nothing usable");
  assert.equal(pickChargeLocation([{ id: "L_x", status: "ACTIVE" }], null)?.id, "L_x", "no capabilities list = assume ok");
});

// ─── errors ──────────────────────────────────────────────────────────────────

test("SquareError exposes code / authDead; transient = 429 / 5xx / network", () => {
  const declined = new SquareError(402, [{ category: "PAYMENT_METHOD_ERROR", code: "CARD_DECLINED", detail: "Card declined." }], "x");
  assert.equal(declined.code, "CARD_DECLINED");
  assert.equal(declined.authDead, false);
  assert.equal(isTransientSquareError(declined), false);
  const revoked = new SquareError(401, [{ code: "ACCESS_TOKEN_REVOKED" }], "x");
  assert.equal(revoked.authDead, true);
  assert.equal(isTransientSquareError(new SquareError(503, [], "down")), true);
  assert.equal(isTransientSquareError(new SquareError(429, [{ code: "RATE_LIMITED" }], "slow")), true);
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.equal(isTransientSquareError(abort), true);
  assert.equal(isTransientSquareError(new TypeError("fetch failed")), true);
});

test("decline wording never leaks Square's seller-facing detail", () => {
  assert.match(declineMessage("INSUFFICIENT_FUNDS"), /insufficient funds/i);
  assert.match(declineMessage("CVV_FAILURE"), /security code/i);
  assert.match(declineMessage("CARD_EXPIRED"), /expired/i);
  assert.match(declineMessage("SOMETHING_NEW"), /declined/i);
  assert.match(declineMessage(null), /declined/i);
});

// ─── the charge gate, per processor ──────────────────────────────────────────

const finixCo = { finixMerchantId: "MU1", finixOnboardingState: "APPROVED", squareMerchantId: null, squareConnectedAt: null, squareLocationId: null };
const squareCo = { finixMerchantId: null, finixOnboardingState: null, squareMerchantId: "MLX1", squareConnectedAt: new Date(), squareLocationId: "L1" };
const nobody = { finixMerchantId: null, finixOnboardingState: null, squareMerchantId: null, squareConnectedAt: null, squareLocationId: null };
const contactF = { finixBuyerIdentityId: "ID1", squareCustomerId: null };
const contactS = { finixBuyerIdentityId: null, squareCustomerId: "CUST1" };

test("PAYMENT_PROCESSOR=square: only a connected Square account can charge", () => {
  process.env.PAYMENT_PROCESSOR = "square";
  assert.equal(canChargeOnline(squareCo), true);
  assert.equal(canChargeOnline(finixCo), false, "an approved Finix merchant is not a Square connection");
  assert.equal(canChargeOnline(nobody), false);
  assert.equal(canChargeOnline({ ...squareCo, squareConnectedAt: null }), false, "disconnected");
  assert.equal(processorMerchantRef(squareCo), "MLX1");
  assert.equal(buyerIdentityRefOf(contactS), "CUST1");
  assert.equal(buyerIdentityRefOf(contactF), null);
  assert.deepEqual(buyerIdentityData("CUST9"), { squareCustomerId: "CUST9" });
  const cfg = clientPayConfig(squareCo);
  assert.deepEqual(cfg, { processor: "square", applicationId: "sandbox-sq0idb-TEST", locationId: "L1", environment: "sandbox" });
  assert.equal(clientPayConfig({ ...squareCo, squareLocationId: null }), null, "no location = no form");
  assert.equal(clientPayConfig(finixCo), null);
});

test("PAYMENT_PROCESSOR=square without app credentials: nothing charges", () => {
  process.env.PAYMENT_PROCESSOR = "square";
  const saved = process.env.SQUARE_APPLICATION_SECRET;
  delete process.env.SQUARE_APPLICATION_SECRET;
  assert.equal(canChargeOnline(squareCo), false);
  process.env.SQUARE_APPLICATION_SECRET = saved;
});

test("PAYMENT_PROCESSOR=finix is unchanged by the Square columns", () => {
  process.env.PAYMENT_PROCESSOR = "finix";
  process.env.FINIX_API_USERNAME = "u";
  process.env.FINIX_API_PASSWORD = "p";
  process.env.FINIX_APPLICATION_ID = "AP1";
  assert.equal(canChargeOnline(finixCo), true);
  assert.equal(canChargeOnline(squareCo), false);
  assert.equal(processorMerchantRef(finixCo), "MU1");
  assert.equal(buyerIdentityRefOf(contactF), "ID1");
  assert.deepEqual(buyerIdentityData("ID2"), { finixBuyerIdentityId: "ID2" });
  assert.equal(clientPayConfig(finixCo)?.processor, "finix");
});

test("static (console) tokens are never refreshed; OAuth tokens are, by age or expiry", () => {
  const now = Date.now();
  const day = 86_400_000;
  const fresh = { refreshTokenEnc: "v1:sealed", refreshedAt: new Date(now - day), expiresAt: new Date(now + 29 * day) };
  assert.equal(needsRefresh(fresh, now), false);
  assert.equal(needsRefresh({ ...fresh, refreshedAt: new Date(now - REFRESH_AFTER_MS - 1) }, now), true, "older than 7 days");
  assert.equal(needsRefresh({ ...fresh, expiresAt: new Date(now + day) }, now), true, "inside the last 2 days");
  const stat = { refreshTokenEnc: STATIC_TOKEN, refreshedAt: new Date(now - 400 * day), expiresAt: new Date(now + 9 * 365 * day) };
  assert.equal(isStaticSquareToken(STATIC_TOKEN), true);
  assert.equal(isStaticSquareToken("v1:sealed"), false);
  assert.equal(needsRefresh(stat, now), false, "a static token is left alone however old");
});

test("PAYMENT_PROCESSOR unset: Square is the platform processor", () => {
  const saved = process.env.PAYMENT_PROCESSOR;
  delete process.env.PAYMENT_PROCESSOR;
  assert.equal(getProcessor().name, "square");
  assert.equal(canChargeOnline(squareCo), true);
  assert.equal(canChargeOnline(finixCo), false);
  process.env.PAYMENT_PROCESSOR = "nonsense";
  assert.equal(getProcessor().name, "manual", "an unknown value charges nobody");
  if (saved === undefined) delete process.env.PAYMENT_PROCESSOR;
  else process.env.PAYMENT_PROCESSOR = saved;
});

test("Square sign-up links: one per processing model, env overrides only when https", () => {
  delete process.env.SQUARE_SIGNUP_URL;
  delete process.env.SQUARE_SIGNUP_URL_SERVICE_FEE;
  assert.equal(squareSignupUrl(), "https://squareup.com/i/086C556067", "company-paid is the default");
  assert.equal(squareSignupUrl("companyPaid"), "https://squareup.com/i/086C556067");
  assert.equal(squareSignupUrl("serviceFee"), "https://squareup.com/i/7002D0C989");
  process.env.SQUARE_SIGNUP_URL = "  https://squareup.com/signup?partner=workbench  ";
  assert.equal(squareSignupUrl("companyPaid"), "https://squareup.com/signup?partner=workbench");
  assert.equal(squareSignupUrl("serviceFee"), "https://squareup.com/i/7002D0C989", "the other model keeps its own link");
  process.env.SQUARE_SIGNUP_URL_SERVICE_FEE = "https://squareup.com/signup?partner=workbench-fee";
  assert.equal(squareSignupUrl("serviceFee"), "https://squareup.com/signup?partner=workbench-fee");
  process.env.SQUARE_SIGNUP_URL = "javascript:alert(1)";
  assert.equal(squareSignupUrl("companyPaid"), "https://squareup.com/i/086C556067", "a bad override falls back to the default");
  process.env.SQUARE_SIGNUP_URL = "http://squareup.com/signup";
  assert.equal(squareSignupUrl("companyPaid"), "https://squareup.com/i/086C556067", "plain http is refused");
  delete process.env.SQUARE_SIGNUP_URL;
  delete process.env.SQUARE_SIGNUP_URL_SERVICE_FEE;
});

test("payout readiness: VERIFIED beats PENDING beats NONE; disabled accounts don't count", () => {
  assert.equal(payoutStatusFromBankAccounts([]), "NONE", "no bank account = the nudge");
  assert.equal(payoutStatusFromBankAccounts([{ id: "a", status: "DISABLED", creditable: false }]), "NONE");
  assert.equal(payoutStatusFromBankAccounts([{ id: "a", status: "VERIFICATION_IN_PROGRESS", creditable: false }]), "PENDING");
  assert.equal(
    payoutStatusFromBankAccounts([
      { id: "a", status: "DISABLED" },
      { id: "b", status: "VERIFICATION_IN_PROGRESS" },
      { id: "c", status: "VERIFIED", creditable: true },
    ]),
    "VERIFIED"
  );
  assert.equal(payoutStatusFromBankAccounts([{ id: "a", status: "VERIFIED", creditable: false }]), "NONE", "verified but not creditable can't receive payouts");
  assert.equal(payoutStatusFromBankAccounts([{ id: "a", status: "VERIFIED" }]), "VERIFIED", "creditable unset = assume yes");
});

test("PAYMENT_PROCESSOR=manual charges nothing anywhere", () => {
  process.env.PAYMENT_PROCESSOR = "manual";
  assert.equal(canChargeOnline(finixCo), false);
  assert.equal(canChargeOnline(squareCo), false);
  assert.equal(processorMerchantRef(squareCo), undefined);
  assert.equal(clientPayConfig(squareCo), null);
});

console.log(`\n${passed} square tests passed`);
