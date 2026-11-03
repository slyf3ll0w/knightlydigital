/**
 * Sign-up → payment setup (2026-11-03): the setup gate's rule, the fee
 * worked example and the sign-up emails.
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/test-onboarding.ts
 * (lib/payments-gate pulls in the Prisma client; never queried.)
 */
import assert from "node:assert/strict";

process.env.AUTH_SECRET ??= "test-secret-for-onboarding-unit-tests";
process.env.SQUARE_APPLICATION_ID = "sandbox-sq0idb-TEST";
process.env.SQUARE_APPLICATION_SECRET = "sandbox-sq0csb-TEST";
process.env.SQUARE_ENVIRONMENT = "sandbox";
process.env.NEXTAUTH_URL = "https://example.test";
process.env.PAYMENT_PROCESSOR = "square";

import { paymentsSetupGateEnabled, paymentsSetupRequired, type PaymentsSetupCompany } from "../lib/payments-gate";
import { feeExample, serviceFeeCents } from "../lib/service-fee";
import { PROCESSING_RATES } from "../lib/plans";
import { newApplicationEmail, welcomeEmail } from "../lib/email";
import { squareOutcomeNotice } from "../lib/square-outcomes";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

const held: PaymentsSetupCompany = {
  paymentsRequiredAt: new Date("2026-11-03T10:00:00Z"),
  paymentsWaived: false,
  isTest: false,
  squareMerchantId: null,
  squareConnectedAt: null,
};

test("a stamped, unconnected, unwaived company is held at the step", () => {
  assert.equal(paymentsSetupGateEnabled(), true);
  assert.equal(paymentsSetupRequired(held), true);
});

test("connecting Square ends it", () => {
  assert.equal(paymentsSetupRequired({ ...held, squareMerchantId: "ML123", squareConnectedAt: new Date() }), false);
  // Both halves of the connection are needed (clearConnection clears both)
  assert.equal(paymentsSetupRequired({ ...held, squareMerchantId: "ML123" }), true);
  assert.equal(paymentsSetupRequired({ ...held, squareConnectedAt: new Date() }), true);
});

test("a waiver, a test account, or no stamp ends it", () => {
  assert.equal(paymentsSetupRequired({ ...held, paymentsWaived: true }), false, "invite code / console waiver");
  assert.equal(paymentsSetupRequired({ ...held, isTest: true }), false, "test account");
  assert.equal(paymentsSetupRequired({ ...held, paymentsRequiredAt: null }), false, "companies from before the step");
});

test("the gate is Square-only and needs app credentials", () => {
  process.env.PAYMENT_PROCESSOR = "finix";
  assert.equal(paymentsSetupGateEnabled(), false);
  assert.equal(paymentsSetupRequired(held), false);
  process.env.PAYMENT_PROCESSOR = "square";
  const secret = process.env.SQUARE_APPLICATION_SECRET;
  delete process.env.SQUARE_APPLICATION_SECRET;
  assert.equal(paymentsSetupGateEnabled(), false, "no credentials = nothing is held");
  assert.equal(paymentsSetupRequired(held), false);
  process.env.SQUARE_APPLICATION_SECRET = secret;
  assert.equal(paymentsSetupRequired(held), true);
});

test("the $500 worked example agrees with the pay page and the company-paid plan", () => {
  const sf = feeExample("serviceFee", 500);
  assert.equal(sf.youReceive, 500);
  assert.equal(sf.clientPays, 500 + serviceFeeCents(50_000, "CARD") / 100);
  assert.equal(sf.clientPays, 517.8, "3.50% + 30¢ on $500");
  const cp = feeExample("companyPaid", 500);
  assert.equal(cp.clientPays, 500);
  const r = PROCESSING_RATES.companyPaid;
  assert.equal(cp.youReceive, 500 - (Math.round((50_000 * r.cardBps) / 10_000) + r.cardFixedCents) / 100);
  assert.equal(cp.youReceive, 484.95, "2.95% + 30¢ out of $500");
  // Cents stay exact on an awkward amount
  const odd = feeExample("companyPaid", 123.45);
  assert.equal(Math.round(odd.youReceive * 100), Math.round(odd.youReceive * 100));
  assert.ok(odd.youReceive < 123.45 && odd.youReceive > 119);
});

test("the welcome email names the payment-setup step first when they were sent to it", () => {
  const withSetup = welcomeEmail({ name: "Jane", companyName: "Acme HVAC", setupPayments: true });
  assert.equal(withSetup.subject, "Welcome to WorkBench, Acme HVAC");
  assert.match(withSetup.html, /Hi Jane,/);
  assert.match(withSetup.html, /Finish setting up payments/);
  // (lib/email.ts reads NEXTAUTH_URL at import, which ES hoists above the env
  // lines up top — so match the path, not the host.)
  assert.match(withSetup.html, /\/app\/dashboard"/);
  assert.ok(withSetup.html.indexOf("Finish setting up payments") < withSetup.html.indexOf("Check your price book"));
  const without = welcomeEmail({ name: null, companyName: "Acme HVAC", setupPayments: false });
  assert.doesNotMatch(without.html, /Finish setting up payments/);
  assert.match(without.html, /Hello,/);
});

test("the inbox notice is a sign-up, not an application, and opens the company", () => {
  const mail = newApplicationEmail({
    name: "Jane",
    email: "jane@example.test",
    phone: null,
    companyName: "Acme <HVAC>",
    industry: "HVAC",
    teamSize: null,
    city: null,
    state: null,
    paymentsToday: null,
    monthlyVolume: null,
    yearsInBusiness: null,
    entityType: null,
    website: null,
    message: null,
    referral: "A friend",
    companyId: "cmp_1",
  });
  assert.equal(mail.subject, "New WorkBench sign-up: Acme <HVAC>");
  assert.match(mail.html, /Acme &lt;HVAC&gt; signed up/);
  assert.match(mail.html, /Heard about us/);
  assert.match(mail.html, /\/superadmin\/company\/cmp_1/);
  assert.doesNotMatch(mail.html, /Review the application/);
  // The Finix-era shape still works (no company id → the applications list)
  const legacy = newApplicationEmail({ ...{ name: "J", email: "j@x.test", phone: null, companyName: "Co", industry: null, teamSize: "2–5", city: null, state: null, paymentsToday: null, monthlyVolume: null, yearsInBusiness: null, entityType: null, website: null, message: null } });
  assert.match(legacy.html, /\/superadmin\/applications/);
});

test("Square outcomes read the same on the step and in Settings", () => {
  assert.equal(squareOutcomeNotice("connected")?.tone, "good");
  assert.equal(squareOutcomeNotice("denied")?.tone, "bad");
  assert.equal(squareOutcomeNotice(null), null);
  assert.equal(squareOutcomeNotice("something_new")?.tone, "bad", "an unknown outcome still says it didn't complete");
});

console.log(`\n${passed} onboarding tests passed`);
