/**
 * Unit tests for lib/notify.ts — the pure rule under companyNotifyAddress:
 * does the team notification email go to the inbox, given who reads it
 * (audit 2026-10-06 C10 was NOT taken: by David's 2026-10-01 call a shared
 * info@ inbox follows the oldest owner's setting, push included).
 *   npx tsx scripts/test-notify.ts
 * Needs a placeholder DATABASE_URL (the module imports Prisma, never queries).
 */
import assert from "node:assert/strict";
import { inboxEmailWanted } from "../lib/notify";

function main() {
  // Nobody to ask (no owner at all): send.
  assert.equal(inboxEmailWanted(null), true);

  // The inbox is a member's login: their word — always / never — wins…
  assert.equal(inboxEmailWanted({ login: true, emailAlerts: true, pushOn: true }), true);
  assert.equal(inboxEmailWanted({ login: true, emailAlerts: false, pushOn: false }), false);
  // …and automatic skips the email only while a device of theirs has push on.
  assert.equal(inboxEmailWanted({ login: true, emailAlerts: null, pushOn: true }), false);
  assert.equal(inboxEmailWanted({ login: true, emailAlerts: null, pushOn: false }), true);

  // A shared inbox (nobody's login; the oldest owner stands in) follows the
  // owner exactly like their own inbox: always / never wins…
  assert.equal(inboxEmailWanted({ login: false, emailAlerts: false, pushOn: false }), false);
  assert.equal(inboxEmailWanted({ login: false, emailAlerts: true, pushOn: true }), true);
  // …and automatic skips the email while one of the owner's devices has push on.
  assert.equal(inboxEmailWanted({ login: false, emailAlerts: null, pushOn: true }), false);
  assert.equal(inboxEmailWanted({ login: false, emailAlerts: null, pushOn: false }), true);

  console.log("test-notify: all passed");
}

main();
