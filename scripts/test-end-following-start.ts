/**
 * Unit tests for lib/scheduling.ts endFollowingStart — the end time keeps
 * the length it had when the start moves (David 2026-10-06).
 *   npx tsx scripts/test-end-following-start.ts
 */
import assert from "node:assert/strict";
import { endFollowingStart } from "../lib/scheduling";

// A 1-hour visit moved to 1:00 ends at 2:00
assert.equal(endFollowingStart("2026-10-06T09:00", "2026-10-06T10:00", "2026-10-06T13:00", 30), "2026-10-06T14:00");
// Moved to another day — same length, on the new day
assert.equal(endFollowingStart("2026-10-06T09:00", "2026-10-06T10:30", "2026-10-09T13:00", 30), "2026-10-09T14:30");
// Moved earlier
assert.equal(endFollowingStart("2026-10-06T15:00", "2026-10-06T15:45", "2026-10-06T08:15", 30), "2026-10-06T09:00");
// Late start pushes the end past midnight
assert.equal(endFollowingStart("2026-10-06T09:00", "2026-10-06T11:00", "2026-10-06T23:00", 30), "2026-10-07T01:00");
// No end yet → the default length
assert.equal(endFollowingStart("", "", "2026-10-06T13:00", 30), "2026-10-06T13:30");
assert.equal(endFollowingStart("2026-10-06T09:00", "", "2026-10-06T13:00", 60), "2026-10-06T14:00");
// An end that wasn't after the start is no length to keep
assert.equal(endFollowingStart("2026-10-06T09:00", "2026-10-06T09:00", "2026-10-06T13:00", 60), "2026-10-06T14:00");
// Only a date picked so far (no time) → leave the end alone
assert.equal(endFollowingStart("2026-10-06T09:00", "2026-10-06T10:00", "2026-10-08", 30), "2026-10-06T10:00");

console.log("test-end-following-start: ok");
