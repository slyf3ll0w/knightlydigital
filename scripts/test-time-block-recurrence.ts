/**
 * Unit tests for lib/time-block-recurrence.ts — the weekly rule behind
 * repeating blocked time (which days it lands on, the UTC span of one
 * occurrence, the words, and input validation).
 *   npx tsx scripts/test-time-block-recurrence.ts
 */
import assert from "node:assert/strict";
import {
  addDaysToKey,
  describeRule,
  horizonEndKey,
  isDayKey,
  needsTopUp,
  occurrenceDays,
  occurrenceSpan,
  parseSeriesInput,
  sanitizeWeekdays,
  weekdayOfKey,
  weekdaysLabel,
  SERIES_HORIZON_DAYS,
} from "../lib/time-block-recurrence";

// ─── Day keys ────────────────────────────────────────────────────────────────
assert.equal(isDayKey("2026-10-19"), true);
assert.equal(isDayKey("2026-02-30"), false);
assert.equal(isDayKey("2026-1-9"), false);
assert.equal(isDayKey(20261019), false);
assert.equal(addDaysToKey("2026-10-30", 3), "2026-11-02");
assert.equal(addDaysToKey("2026-01-01", -1), "2025-12-31");
assert.equal(weekdayOfKey("2026-10-19"), 1); // a Monday
assert.equal(weekdayOfKey("2026-10-18"), 0);

// ─── Weekdays ────────────────────────────────────────────────────────────────
assert.deepEqual(sanitizeWeekdays([5, 1, 1, "3", 9, -1, "x"]), [1, 3, 5]);
assert.deepEqual(sanitizeWeekdays("mon"), []);

// ─── Which days ──────────────────────────────────────────────────────────────
const monWed = { weekdays: [1, 3], allDay: false, startMinute: 12 * 60, endMinute: 13 * 60, startsOn: "2026-10-19", endsOn: null, skipDates: [] };
assert.deepEqual(occurrenceDays(monWed, "2026-10-19", "2026-11-01"), ["2026-10-19", "2026-10-21", "2026-10-26", "2026-10-28"]);
// The window starts before the rule does → nothing before startsOn
assert.deepEqual(occurrenceDays(monWed, "2026-10-01", "2026-10-21"), ["2026-10-19", "2026-10-21"]);
// endsOn cuts the window short
assert.deepEqual(occurrenceDays({ ...monWed, endsOn: "2026-10-26" }, "2026-10-19", "2026-12-31"), ["2026-10-19", "2026-10-21", "2026-10-26"]);
// A skipped day is left out
assert.deepEqual(occurrenceDays({ ...monWed, skipDates: ["2026-10-21"] }, "2026-10-19", "2026-10-28"), ["2026-10-19", "2026-10-26", "2026-10-28"]);
// Window entirely before the rule, or no weekdays → nothing
assert.deepEqual(occurrenceDays(monWed, "2026-09-01", "2026-09-30"), []);
assert.deepEqual(occurrenceDays({ ...monWed, weekdays: [] }, "2026-10-19", "2026-12-31"), []);
// Every day for a year is a full year of rows
assert.equal(occurrenceDays({ ...monWed, weekdays: [0, 1, 2, 3, 4, 5, 6] }, "2026-10-19", addDaysToKey("2026-10-19", 364)).length, 365);

// ─── Span in the company's zone ──────────────────────────────────────────────
const tz = "America/Chicago";
// Noon–1 PM Central on a CDT day = 17:00–18:00Z
let span = occurrenceSpan(monWed, "2026-10-19", tz);
assert.equal(span.startAt.toISOString(), "2026-10-19T17:00:00.000Z");
assert.equal(span.endAt.toISOString(), "2026-10-19T18:00:00.000Z");
// After the fall-back (Nov 1 2026) the same wall time is 18:00–19:00Z
span = occurrenceSpan(monWed, "2026-11-02", tz);
assert.equal(span.startAt.toISOString(), "2026-11-02T18:00:00.000Z");
// All day = local midnight → last ms of the day; the fall-back day is 25 h
span = occurrenceSpan({ allDay: true, startMinute: 0, endMinute: 0 }, "2026-11-01", tz);
assert.equal(span.startAt.toISOString(), "2026-11-01T05:00:00.000Z");
assert.equal(span.endAt.getTime() - span.startAt.getTime(), 25 * 3600000 - 1);
span = occurrenceSpan({ allDay: true, startMinute: 0, endMinute: 0 }, "2026-10-20", tz);
assert.equal(span.endAt.getTime() - span.startAt.getTime(), 24 * 3600000 - 1);

// ─── Horizon ─────────────────────────────────────────────────────────────────
assert.equal(horizonEndKey("2026-10-19", null), addDaysToKey("2026-10-19", SERIES_HORIZON_DAYS));
assert.equal(horizonEndKey("2026-10-19", "2026-12-20"), "2026-12-20");
assert.equal(needsTopUp("2026-10-19", null, null), true);
assert.equal(needsTopUp("2026-10-19", addDaysToKey("2026-10-19", 365), null), false);
assert.equal(needsTopUp("2026-10-19", addDaysToKey("2026-10-19", 200), null), true);
// Finished series never need more
assert.equal(needsTopUp("2026-10-19", "2026-12-20", "2026-12-20"), false);

// ─── Words ───────────────────────────────────────────────────────────────────
assert.equal(weekdaysLabel([1, 2, 3, 4, 5]), "every weekday");
assert.equal(weekdaysLabel([0, 1, 2, 3, 4, 5, 6]), "every day");
assert.equal(weekdaysLabel([6, 0]), "weekends");
assert.equal(weekdaysLabel([3, 1]), "every Mon, Wed");
assert.equal(describeRule(monWed, "2026-10-19"), "Every Mon, Wed, 12:00 PM – 1:00 PM");
assert.equal(describeRule({ ...monWed, weekdays: [1, 2, 3, 4, 5], endsOn: "2026-12-20" }, "2026-10-19"), "Every weekday, 12:00 PM – 1:00 PM, until Dec 20");
assert.equal(describeRule({ ...monWed, weekdays: [5], allDay: true, endsOn: "2027-03-01" }, "2026-10-19"), "Every Fri, all day, until Mar 1, 2027");
assert.equal(describeRule({ ...monWed, startMinute: 0, endMinute: 30 }), "Every Mon, Wed, 12:00 AM – 12:30 AM");

// ─── Input ───────────────────────────────────────────────────────────────────
let parsed = parseSeriesInput({ weekdays: [1, 3], allDay: false, startTime: "12:00", endTime: "13:00", startsOn: "2026-10-19", endsOn: "" });
assert.ok(parsed.ok);
assert.deepEqual(parsed.rule, { weekdays: [1, 3], allDay: false, startMinute: 720, endMinute: 780, startsOn: "2026-10-19", endsOn: null });
parsed = parseSeriesInput({ weekdays: [5], allDay: true, startsOn: "2026-10-19", endsOn: "2026-12-20" });
assert.ok(parsed.ok);
assert.equal(parsed.rule.allDay, true);
assert.equal(parsed.rule.endsOn, "2026-12-20");
assert.equal(parsed.rule.endMinute, 1440);
// Single-digit hour from a time input still parses
parsed = parseSeriesInput({ weekdays: [1], startTime: "9:00", endTime: "9:30", startsOn: "2026-10-19" });
assert.ok(parsed.ok && parsed.rule.startMinute === 540);
const bad = (body: Record<string, unknown>) => {
  const r = parseSeriesInput(body);
  assert.ok(!r.ok);
  return r.error;
};
assert.match(bad({ weekdays: [], startsOn: "2026-10-19", startTime: "09:00", endTime: "10:00" }), /at least one day/);
assert.match(bad({ weekdays: [1], startsOn: "nope", startTime: "09:00", endTime: "10:00" }), /start date/);
assert.match(bad({ weekdays: [1], startsOn: "2026-10-19", endsOn: "2026-10-01", startTime: "09:00", endTime: "10:00" }), /before the start/);
assert.match(bad({ weekdays: [1], startsOn: "2026-10-19", startTime: "10:00", endTime: "09:00" }), /after the start time/);
assert.match(bad({ weekdays: [1], startsOn: "2026-10-19", startTime: "10:00" }), /valid start and end/);

console.log("test-time-block-recurrence: ok");
