/**
 * Send later: the scheduling-time warnings and the stored-channel reader.
 * `npx tsx scripts/test-send-later.ts`
 */
import assert from "node:assert/strict";
import { scheduleSendWarnings, channelsFromJson, dueDateOnSend, SEND_DEFAULTS, SCHEDULE_WARNING_TEXT } from "../lib/send-document";
import { dueDateFromTerms } from "../lib/due-dates";

const now = new Date("2026-10-07T20:30:00Z");
const tomorrow = new Date("2026-10-08T14:00:00Z");
const yesterday = new Date("2026-10-06T14:00:00Z");

// A normal schedule: nothing to say
assert.deepEqual(scheduleSendWarnings({ at: tomorrow, now, validUntil: null, emailable: true, textable: false }), []);

// In the past: goes out on the next tick, say so
assert.deepEqual(scheduleSendWarnings({ at: yesterday, now, emailable: true, textable: true }), ["past"]);
assert.deepEqual(scheduleSendWarnings({ at: now, now, emailable: true, textable: true }), ["past"]);

// Quote expires before the send time
assert.deepEqual(
  scheduleSendWarnings({ at: tomorrow, now, validUntil: new Date("2026-10-08T00:00:00Z"), emailable: true, textable: false }),
  ["expires_first"]
);
// …but an expiry after the send time is fine
assert.deepEqual(
  scheduleSendWarnings({ at: tomorrow, now, validUntil: new Date("2026-10-20T00:00:00Z"), emailable: true, textable: false }),
  []
);

// Nobody reachable by the chosen channels
assert.deepEqual(scheduleSendWarnings({ at: tomorrow, now, emailable: false, textable: false }), ["unreachable"]);
// Several at once, in a stable order
assert.deepEqual(
  scheduleSendWarnings({ at: yesterday, now, validUntil: new Date("2026-10-01T00:00:00Z"), emailable: false, textable: false }),
  ["past", "expires_first", "unreachable"]
);
for (const w of ["past", "expires_first", "unreachable"] as const) assert.ok(SCHEDULE_WARNING_TEXT[w].length > 10);

// Stored channels: JSON column round trip with the route's own defaults
assert.deepEqual(channelsFromJson({ email: false, text: true }, SEND_DEFAULTS.quote), { email: false, text: true });
assert.deepEqual(channelsFromJson(null, SEND_DEFAULTS.quote), { email: true, text: false });
assert.deepEqual(channelsFromJson(null, SEND_DEFAULTS.invoice), { email: true, text: true });
assert.deepEqual(channelsFromJson({ email: "yes" }, SEND_DEFAULTS.invoice), { email: true, text: true });

// Due date at send time (audit 2026-10-06 A1): a draft's terms-derived due
// date counts from the send, not from creation.
const created = new Date("2026-09-27T15:00:00Z");
const sendNow = new Date("2026-10-07T15:00:00Z");
const netSeven = 7;
// Net-7 draft created 10 days ago, sent today: would already be past due → re-counted from today
assert.deepEqual(
  dueDateOnSend({ status: "DRAFT", dueDate: dueDateFromTerms(created, netSeven), createdAt: created, termsDays: netSeven, now: sendNow }),
  dueDateFromTerms(sendNow, netSeven)
);
// Net-30 draft created 10 days ago (still in the future, but nobody picked it): also counts from the send
assert.deepEqual(
  dueDateOnSend({ status: "DRAFT", dueDate: dueDateFromTerms(created, 30), createdAt: created, termsDays: 30, now: sendNow }),
  dueDateFromTerms(sendNow, 30)
);
// A hand-picked future due date on a draft stays
const picked = new Date("2026-11-15T12:00:00Z");
assert.equal(dueDateOnSend({ status: "DRAFT", dueDate: picked, createdAt: created, termsDays: netSeven, now: sendNow }), null);
// A hand-picked date that has already gone by is re-counted
assert.deepEqual(
  dueDateOnSend({ status: "DRAFT", dueDate: new Date("2026-10-01T12:00:00Z"), createdAt: created, termsDays: netSeven, now: sendNow }),
  dueDateFromTerms(sendNow, netSeven)
);
// Created and sent the same day: nothing to change
assert.equal(
  dueDateOnSend({ status: "DRAFT", dueDate: dueDateFromTerms(sendNow, netSeven), createdAt: sendNow, termsDays: netSeven, now: sendNow }),
  null
);
// A re-send of an issued invoice is a reminder — its due date is untouched…
assert.equal(
  dueDateOnSend({ status: "AWAITING_PAYMENT", dueDate: dueDateFromTerms(created, netSeven), createdAt: created, termsDays: netSeven, now: sendNow }),
  null
);
// …unless it never had one
assert.deepEqual(
  dueDateOnSend({ status: "AWAITING_PAYMENT", dueDate: null, createdAt: created, termsDays: netSeven, now: sendNow }),
  dueDateFromTerms(sendNow, netSeven)
);

console.log("test-send-later: all assertions passed");
