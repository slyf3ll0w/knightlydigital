/**
 * lib/get-started.ts — the Get started checklist's ticking rules.
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/test-get-started.ts
 */
import assert from "node:assert/strict";
import { buildGetStarted, type GetStartedFacts } from "../lib/get-started";

// A company that never needs the payment steps (waived / test / not on Square).
const fresh: GetStartedFacts = {
  phone: null,
  address: null,
  businessHours: null,
  bookingLinkSharedAt: null,
  mobileAppSeenAt: null,
  services: 0,
  clients: 0,
  quotes: 0,
  jobs: 0,
  people: 1,
  onPhone: 0,
  payments: "skip",
  squareConnectedAt: null,
  payoutStatus: null,
};

const byKey = (f: GetStartedFacts) => Object.fromEntries(buildGetStarted(f).items.map((i) => [i.key, i]));

// A brand-new company: nothing ticked, seven core steps, two optional
{
  const r = buildGetStarted(fresh);
  assert.equal(r.items.length, 9);
  assert.equal(r.total, 7);
  assert.equal(r.done, 0);
  assert.equal(r.complete, false);
  assert.deepEqual(r.items.filter((i) => i.optional).map((i) => i.key), ["team", "app"]);
  assert.ok(r.items.every((i) => !i.done));
  assert.equal(byKey(fresh).services.title, "Add your services");
}

// A pre-loaded price book turns the first step into a review
assert.equal(byKey({ ...fresh, services: 12 }).services.title, "Review your prices");
assert.equal(byKey({ ...fresh, services: 12 }).services.done, true);

// Business details need BOTH a phone and an address, and blanks don't count
assert.equal(byKey({ ...fresh, phone: "(469) 555-0100" }).details.done, false);
assert.equal(byKey({ ...fresh, phone: "(469) 555-0100", address: "   " }).details.done, false);
assert.equal(byKey({ ...fresh, phone: "(469) 555-0100", address: "412 Oak St" }).details.done, true);

// Hours: any saved JSON counts, null does not
assert.equal(byKey({ ...fresh, businessHours: { mon: [] } }).hours.done, true);

// Counts tick their steps
assert.equal(byKey({ ...fresh, clients: 1 }).client.done, true);
assert.equal(byKey({ ...fresh, quotes: 1 }).quote.done, true);
assert.equal(byKey({ ...fresh, jobs: 1 }).job.done, true);
assert.equal(byKey({ ...fresh, bookingLinkSharedAt: new Date() }).booking.done, true);

// Team: one person is not a team (audit 2026-10-14: active users only — the caller counts them)
assert.equal(byKey({ ...fresh, people: 1 }).team.done, false);
assert.equal(byKey({ ...fresh, people: 2 }).team.done, true);

// The app: the company stamp wins, else someone seen from a phone
assert.equal(byKey({ ...fresh, mobileAppSeenAt: new Date() }).app.done, true);
assert.equal(byKey({ ...fresh, onPhone: 1 }).app.done, true);
assert.equal(byKey(fresh).app.done, false);

// Complete = every CORE step; the optional two don't hold it back
{
  const allCore: GetStartedFacts = {
    ...fresh,
    phone: "(469) 555-0100",
    address: "412 Oak St",
    businessHours: {},
    bookingLinkSharedAt: new Date(),
    services: 3,
    clients: 1,
    quotes: 1,
    jobs: 1,
  };
  const r = buildGetStarted(allCore);
  assert.equal(r.done, 7);
  assert.equal(r.complete, true);
  const oneShort = buildGetStarted({ ...allCore, bookingLinkSharedAt: null });
  assert.equal(oneShort.done, 6);
  assert.equal(oneShort.complete, false);
}

// ── Online payments (Square, 2026-11-03): two more core steps, first on the list ──
{
  const asked: GetStartedFacts = { ...fresh, payments: "ask" };
  const r = buildGetStarted(asked);
  assert.equal(r.items.length, 11);
  assert.equal(r.total, 9);
  assert.deepEqual(r.items.slice(0, 2).map((i) => i.key), ["payments", "bank"]);
  assert.equal(byKey(asked).payments.title, "Set up online payments");
  assert.equal(byKey(asked).payments.href, "/app/setup/payments");
  assert.equal(byKey(asked).payments.done, false);
  assert.equal(byKey(asked).bank.done, false);

  // Connected ticks payments; the bank step waits on a payout-ready account
  const connected = { ...asked, squareConnectedAt: new Date() };
  assert.equal(byKey(connected).payments.done, true);
  assert.equal(byKey(connected).payments.title, "Online payments are on");
  assert.equal(byKey(connected).bank.done, false, "never checked yet");
  assert.equal(byKey({ ...connected, payoutStatus: "NONE" }).bank.done, false);
  assert.equal(byKey({ ...connected, payoutStatus: "PENDING" }).bank.done, false);
  assert.equal(byKey({ ...connected, payoutStatus: "VERIFIED" }).bank.done, true);
  assert.equal(byKey({ ...connected, payoutStatus: "UNKNOWN" }).bank.done, true, "an older grant we can't read doesn't nag");
  // A payout status without a connection means nothing
  assert.equal(byKey({ ...asked, payoutStatus: "VERIFIED" }).bank.done, false);

  // Waived / test companies never see either step
  assert.equal("payments" in byKey({ ...connected, payments: "skip" }), false);
  assert.equal("bank" in byKey({ ...connected, payments: "skip" }), false);

  // Complete needs them too
  const allCore: GetStartedFacts = {
    ...connected,
    payoutStatus: "VERIFIED",
    phone: "(469) 555-0100",
    address: "412 Oak St",
    businessHours: {},
    bookingLinkSharedAt: new Date(),
    services: 3,
    clients: 1,
    quotes: 1,
    jobs: 1,
  };
  assert.equal(buildGetStarted(allCore).complete, true);
  assert.equal(buildGetStarted({ ...allCore, payoutStatus: "NONE" }).complete, false);
}

console.log("get-started: all assertions passed");
