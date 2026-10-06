/**
 * Send later: the scheduling-time warnings and the stored-channel reader.
 * `npx tsx scripts/test-send-later.ts`
 */
import assert from "node:assert/strict";
import { scheduleSendWarnings, channelsFromJson, SEND_DEFAULTS, SCHEDULE_WARNING_TEXT } from "../lib/send-document";

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

console.log("test-send-later: all assertions passed");
