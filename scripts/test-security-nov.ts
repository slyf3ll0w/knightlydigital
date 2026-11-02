/**
 * Unit tests for the pure halves of the 2026-11-01 security fixes:
 *   lib/payment-source.ts  — the Square token decides card vs bank
 *   lib/canonical-host.ts  — one hostname per deployment
 *   lib/login-return.ts    — where the login page may send someone
 *   lib/gift-cards.ts      — when a sold card may actually be loaded
 *   lib/team-login.ts      — which passwords are provisional
 *   lib/rate-limit.ts      — the visitor address off Cloudflare
 *   npx tsx scripts/test-security-nov.ts
 * Plain assertions, no framework. No database (placeholder DATABASE_URL).
 */
import assert from "node:assert/strict";
import { billingMethodFor, squareSourceKind } from "../lib/payment-source";
import { canonicalHost, hostVerdict } from "../lib/canonical-host";
import { DEFAULT_LOGIN_RETURN, loginUrlReturningTo, safeLoginReturn } from "../lib/login-return";
import { clientIp } from "../lib/rate-limit";

// Imports are hoisted, so the Prisma-backed modules are loaded after the placeholder is set
process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/unused";

async function main() {
const { classifyGiftCardPayments } = await import("../lib/gift-cards");
const { isProvisionalPassword } = await import("../lib/team-login");
let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("payment-source");
test("Square tokens: cnon/ccof are cards, bauth is a bank account, anything else is refused", () => {
  assert.equal(squareSourceKind("cnon:CBASEabc"), "CARD");
  assert.equal(squareSourceKind("ccof:customer-card-id"), "CARD");
  assert.equal(squareSourceKind("bauth:plaid-token"), "ACH");
  assert.equal(squareSourceKind("TKabc"), null);
  assert.equal(squareSourceKind(undefined), null);
  assert.equal(squareSourceKind(42), null);
});
test("on Square the token wins over the declared word (the fee-category trick)", () => {
  assert.equal(billingMethodFor({ processor: "square", token: "cnon:x", declared: "ACH" }), "CARD");
  assert.equal(billingMethodFor({ processor: "square", token: "bauth:x", declared: "CARD" }), "ACH");
  assert.equal(billingMethodFor({ processor: "square", token: "garbage", declared: "CARD" }), null);
  assert.equal(billingMethodFor({ processor: "square", token: undefined, declared: "CARD" }), null);
});
test("other processors keep the declared word, narrowed to CARD / ACH", () => {
  assert.equal(billingMethodFor({ processor: "finix", token: "TKabc", declared: "ACH" }), "ACH");
  assert.equal(billingMethodFor({ processor: "finix", token: "TKabc", declared: "CARD" }), "CARD");
  assert.equal(billingMethodFor({ processor: "finix", token: "TKabc", declared: "GIFT_CARD" }), null);
  assert.equal(billingMethodFor({ processor: "manual", token: undefined, declared: undefined }), null);
});

console.log("canonical-host");
const prod = { NEXTAUTH_URL: "https://workbenchfsm.com" };
test("the canonical host comes from NEXTAUTH_URL", () => {
  assert.equal(canonicalHost(prod), "workbenchfsm.com");
  assert.equal(canonicalHost({ NEXTAUTH_URL: "https://streamflaire-staging.up.railway.app/" }), "streamflaire-staging.up.railway.app");
  assert.equal(canonicalHost({}), null);
  assert.equal(canonicalHost({ NEXTAUTH_URL: "not a url" }), null);
});
test("the real hostname passes; the hosting hostname is sent home", () => {
  assert.deepEqual(hostVerdict({ requestHost: "workbenchfsm.com", method: "POST", pathAndQuery: "/api/public/x", env: prod }), { kind: "ok" });
  assert.deepEqual(hostVerdict({ requestHost: "WorkBenchFSM.com", method: "GET", pathAndQuery: "/", env: prod }), { kind: "ok" });
  assert.deepEqual(hostVerdict({ requestHost: "knightlydigital-production.up.railway.app", method: "GET", pathAndQuery: "/app/login?x=1", env: prod }), {
    kind: "redirect",
    location: "https://workbenchfsm.com/app/login?x=1",
  });
  assert.deepEqual(hostVerdict({ requestHost: "knightlydigital-production.up.railway.app", method: "POST", pathAndQuery: "/api/auth/callback/credentials", env: prod }), { kind: "refuse" });
});
test("a listed alias passes; nothing else does", () => {
  const env = { ...prod, CANONICAL_HOST_ALIASES: "streamflaire.com, www.workbenchfsm.com" };
  assert.deepEqual(hostVerdict({ requestHost: "streamflaire.com", method: "POST", pathAndQuery: "/api/public/leads/t", env }), { kind: "ok" });
  assert.deepEqual(hostVerdict({ requestHost: "WWW.workbenchfsm.com", method: "POST", pathAndQuery: "/", env }), { kind: "ok" });
  assert.equal(hostVerdict({ requestHost: "x.up.railway.app", method: "POST", pathAndQuery: "/", env }).kind, "refuse");
});
test("no NEXTAUTH_URL, a missing Host, or a dev loopback never bounces", () => {
  assert.deepEqual(hostVerdict({ requestHost: "anything", method: "POST", pathAndQuery: "/", env: {} }), { kind: "ok" });
  assert.deepEqual(hostVerdict({ requestHost: null, method: "POST", pathAndQuery: "/", env: prod }), { kind: "ok" });
  assert.deepEqual(hostVerdict({ requestHost: "127.0.0.1:3000", method: "GET", pathAndQuery: "/", env: { NEXTAUTH_URL: "http://localhost:3000" } }), { kind: "ok" });
  assert.deepEqual(hostVerdict({ requestHost: "192.168.1.20:3000", method: "POST", pathAndQuery: "/", env: { NEXTAUTH_URL: "http://localhost:3000" } }), { kind: "ok" });
});

console.log("login-return");
test("the dashboard unless it is one of the three OAuth callbacks", () => {
  assert.equal(safeLoginReturn(null), DEFAULT_LOGIN_RETURN);
  assert.equal(safeLoginReturn("/app/settings"), DEFAULT_LOGIN_RETURN);
  assert.equal(safeLoginReturn("/api/app/square/callback?code=abc&state=x.y.z"), "/api/app/square/callback?code=abc&state=x.y.z");
  assert.equal(safeLoginReturn("/api/app/quickbooks/callback?code=1&state=2&realmId=3"), "/api/app/quickbooks/callback?code=1&state=2&realmId=3");
  assert.equal(safeLoginReturn("/api/app/integrations/google-calendar/callback?code=1&state=2"), "/api/app/integrations/google-calendar/callback?code=1&state=2");
});
test("never an open redirect", () => {
  assert.equal(safeLoginReturn("https://evil.example/api/app/square/callback"), DEFAULT_LOGIN_RETURN);
  assert.equal(safeLoginReturn("//evil.example/api/app/square/callback"), DEFAULT_LOGIN_RETURN);
  assert.equal(safeLoginReturn("/api/app/square/callbackx"), DEFAULT_LOGIN_RETURN);
  assert.equal(safeLoginReturn("/api/app/square/callback\\@evil"), DEFAULT_LOGIN_RETURN);
  assert.equal(loginUrlReturningTo("/api/app/square/callback?code=a&state=b"), "/app/login?callbackUrl=%2Fapi%2Fapp%2Fsquare%2Fcallback%3Fcode%3Da%26state%3Db");
});

console.log("gift cards: when the money is real");
test("a card charge settles at once", () => {
  assert.equal(classifyGiftCardPayments([{ method: "CARD", processorRef: "sq1" }], false), "settled");
  assert.equal(classifyGiftCardPayments([{ method: "GIFT_CARD", processorRef: "sq1" }], false), "settled");
});
test("a bank transfer waits for Square's COMPLETED", () => {
  assert.equal(classifyGiftCardPayments([{ method: "ACH", processorRef: "sq1", squareStatus: "PENDING" }], false), "pending_ach");
  assert.equal(classifyGiftCardPayments([{ method: "ACH", processorRef: "sq1", squareStatus: null }], false), "pending_ach");
  assert.equal(classifyGiftCardPayments([{ method: "ACH", processorRef: "sq1", squareStatus: "COMPLETED" }], false), "settled");
});
test("a typed-in payment needs an owner; the owner's OK does not skip a clearing transfer", () => {
  assert.equal(classifyGiftCardPayments([{ method: "CASH", processorRef: null }], false), "needs_owner");
  assert.equal(classifyGiftCardPayments([{ method: "CASH", processorRef: null }], true), "settled");
  assert.equal(
    classifyGiftCardPayments([{ method: "CHECK", processorRef: null }, { method: "ACH", processorRef: "sq1", squareStatus: "PENDING" }], false),
    "needs_owner"
  );
  assert.equal(
    classifyGiftCardPayments([{ method: "CHECK", processorRef: null }, { method: "ACH", processorRef: "sq1", squareStatus: "PENDING" }], true),
    "pending_ach"
  );
});

console.log("team-login");
test("a password nobody has chosen themselves is provisional", () => {
  assert.equal(isProvisionalPassword({ passwordHash: "$2a$12$x", passwordChangedAt: null }), true);
  assert.equal(isProvisionalPassword({ passwordHash: "$2a$12$x", passwordChangedAt: new Date() }), false);
  assert.equal(isProvisionalPassword({ passwordHash: null, passwordChangedAt: null }), false);
});

console.log("rate-limit: visitor address");
test("Cloudflare's header first; off Cloudflare the LAST forwarded hop, never the caller's own first entry", () => {
  assert.equal(clientIp(new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 1.2.3.4" })), "1.2.3.4");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 5.6.7.8" })), "5.6.7.8");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8", "x-real-ip": "9.9.9.9" })), "5.6.7.8");
  assert.equal(clientIp(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(clientIp(new Headers()), "unknown");
});

console.log(`\n${passed} tests passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
