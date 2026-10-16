/**
 * Unit tests for lib/day-chips.ts — the Today / Tomorrow / Mon 20 chips.
 *   npx tsx scripts/test-day-chips.ts
 */
import assert from "node:assert/strict";
import { dayChoices, dateFromValue, localDateValue, otherDayLabel } from "../lib/day-chips";

// Friday 2026-10-16, mid-afternoon local
const now = new Date(2026, 9, 16, 15, 30);

{
  const days = dayChoices(now);
  assert.equal(days.length, 7);
  assert.deepEqual(days[0], { value: "2026-10-16", label: "Today" });
  assert.deepEqual(days[1], { value: "2026-10-17", label: "Tomorrow" });
  assert.deepEqual(days[2], { value: "2026-10-18", label: "Sun 18" });
  assert.deepEqual(days[3], { value: "2026-10-19", label: "Mon 19" });
  assert.deepEqual(days[6], { value: "2026-10-22", label: "Thu 22" });
}

{
  // Month roll-over keeps counting
  const days = dayChoices(new Date(2026, 9, 30, 8), 4);
  assert.deepEqual(
    days.map((d) => d.value),
    ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]
  );
  assert.equal(days[3].label, "Mon 2");
}

{
  // Late at night is still "today" locally
  const days = dayChoices(new Date(2026, 9, 16, 23, 59), 2);
  assert.equal(days[0].value, "2026-10-16");
}

assert.equal(localDateValue(new Date(2026, 0, 5, 9)), "2026-01-05");
assert.equal(dateFromValue("2026-10-31")?.getDate(), 31);
assert.equal(dateFromValue("2026-10-31T09:00")?.getMonth(), 9);
assert.equal(dateFromValue("nope"), null);
assert.equal(otherDayLabel("2026-10-31"), "Sat, Oct 31");
assert.equal(otherDayLabel(""), "");

console.log("day-chips: all tests passed");
