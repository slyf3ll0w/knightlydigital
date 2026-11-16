/**
 * lib/setup-call.ts — who gets the stalled-sign-up nudge.
 *   npx tsx scripts/test-setup-nudge.ts
 */
import assert from "node:assert/strict";
import { NUDGE_EPOCH, nudgeReason, setupCallUrl, type NudgeFacts } from "../lib/setup-call";

const HOUR = 3_600_000;
const signedUp = new Date(NUDGE_EPOCH.getTime() + 24 * HOUR);
const at = (hoursAfter: number) => new Date(signedUp.getTime() + hoursAfter * HOUR);

const base: NudgeFacts = {
  createdAt: signedUp,
  setupNudgeSentAt: null,
  isTest: false,
  isPlatform: false,
  suspended: false,
  paymentsHeld: false,
  clients: 0,
};

// Too early: a day in, nobody hears anything
assert.equal(nudgeReason(base, at(24)), null);
assert.equal(nudgeReason(base, at(47)), null);

// Two days in with no client: nudged
assert.equal(nudgeReason(base, at(48)), "no_clients");

// Still held at the payment step wins over "no clients" (they never got in)
assert.equal(nudgeReason({ ...base, paymentsHeld: true }, at(50)), "payments");
assert.equal(nudgeReason({ ...base, paymentsHeld: true, clients: 3 }, at(50)), "payments");

// Up and running: left alone
assert.equal(nudgeReason({ ...base, clients: 1 }, at(72)), null);

// Once, ever
assert.equal(nudgeReason({ ...base, setupNudgeSentAt: at(48) }, at(72)), null);

// Never: test accounts, WorkBench's own company, suspended companies
assert.equal(nudgeReason({ ...base, isTest: true }, at(72)), null);
assert.equal(nudgeReason({ ...base, isPlatform: true }, at(72)), null);
assert.equal(nudgeReason({ ...base, suspended: true }, at(72)), null);

// Cold after two weeks
assert.equal(nudgeReason(base, at(14 * 24)), "no_clients");
assert.equal(nudgeReason(base, at(14 * 24 + 1)), null);

// Companies opened before the nudge shipped never get it
const old = { ...base, createdAt: new Date(NUDGE_EPOCH.getTime() - HOUR) };
assert.equal(nudgeReason(old, new Date(old.createdAt.getTime() + 72 * HOUR)), null);

// Email link
assert.equal(setupCallUrl("https://workbenchfsm.com/"), "https://workbenchfsm.com/book-a-call");

console.log("test-setup-nudge: ok");
