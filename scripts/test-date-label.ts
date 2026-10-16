/**
 * Unit tests for lib/date-label.ts — what phone date / time boxes read.
 *   npx tsx scripts/test-date-label.ts
 */
import assert from "node:assert/strict";
import { dateLabel, dateTimeLabel, timeLabel } from "../lib/date-label";

const now = new Date(2026, 9, 16, 12);

assert.equal(dateLabel("2026-10-20", now), "Tue, Oct 20");
assert.equal(dateLabel("2027-01-05", now), "Tue, Jan 5, 2027");
assert.equal(dateLabel("", now), "");
assert.equal(dateLabel(undefined, now), "");
assert.equal(dateLabel("2026-10-20T09:00", now), ""); // a date box never holds a time
assert.equal(dateLabel("nope", now), "");

assert.equal(timeLabel("14:30"), "2:30 PM");
assert.equal(timeLabel("09:00"), "9:00 AM");
assert.equal(timeLabel("00:15"), "12:15 AM");
assert.equal(timeLabel("12:00"), "12:00 PM");
assert.equal(timeLabel("14:30:00"), "2:30 PM"); // seconds are ignored
assert.equal(timeLabel(""), "");
assert.equal(timeLabel("25:00"), "");

assert.equal(dateTimeLabel("2026-10-20T14:30", now), "Tue, Oct 20 · 2:30 PM");
assert.equal(dateTimeLabel("2026-10-20", now), "Tue, Oct 20");
assert.equal(dateTimeLabel("", now), "");

console.log("date-label: all tests passed");
