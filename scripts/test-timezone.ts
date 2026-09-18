/**
 * Company-calendar helpers (lib/timezone.ts): the dashboard's "today",
 * "this week", "this month" and greeting must follow the company's zone, not
 * the UTC box the app runs on.
 *
 *   npx tsx scripts/test-timezone.ts
 */
import { startOfDayIn, startOfMonthIn, startOfWeekIn, zonedMidnight, zonedParts } from "../lib/timezone";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "ok" : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
}

const CT = "America/Chicago";

console.log("zonedParts");
// 2026-09-18 01:30 UTC is still Thursday 8:30 pm Sept 17 in Chicago (CDT, -5)
const lateEvening = new Date("2026-09-18T01:30:00Z");
eq("8:30 pm CDT reads as the 17th", zonedParts(CT, lateEvening), { y: 2026, m: 9, d: 17, hour: 20, minute: 30, weekday: 4 });
// 16:00 UTC = 11 am CDT: "Good morning", not afternoon
eq("11 am CDT hour", zonedParts(CT, new Date("2026-09-18T16:00:00Z")).hour, 11);

console.log("zonedMidnight / startOfDayIn");
eq("midnight Sept 17 CDT is 05:00Z", zonedMidnight(CT, 2026, 9, 17).toISOString(), "2026-09-17T05:00:00.000Z");
eq("start of the 17th from 8:30 pm", startOfDayIn(CT, lateEvening).toISOString(), "2026-09-17T05:00:00.000Z");
eq("day + 1 rolls the month", zonedMidnight(CT, 2026, 9, 31).toISOString(), "2026-10-01T05:00:00.000Z");
eq("day 0 rolls back a month", zonedMidnight(CT, 2026, 10, 0).toISOString(), "2026-09-30T05:00:00.000Z");
// CST (-6) after the November fall-back
eq("midnight Dec 1 CST is 06:00Z", zonedMidnight(CT, 2026, 12, 1).toISOString(), "2026-12-01T06:00:00.000Z");
// Spring forward 2026-03-08: midnight that day is still CST (-6)
eq("DST day midnight", zonedMidnight(CT, 2026, 3, 8).toISOString(), "2026-03-08T06:00:00.000Z");
eq("day after DST is CDT", zonedMidnight(CT, 2026, 3, 9).toISOString(), "2026-03-09T05:00:00.000Z");

console.log("startOfWeekIn / startOfMonthIn");
// Sept 17 2026 is a Thursday; the week's Sunday is Sept 13
eq("week starts Sunday the 13th", startOfWeekIn(CT, lateEvening).toISOString(), "2026-09-13T05:00:00.000Z");
eq("month starts the 1st", startOfMonthIn(CT, lateEvening).toISOString(), "2026-09-01T05:00:00.000Z");
// A Sunday is its own week start
eq("Sunday is its own week start", startOfWeekIn(CT, new Date("2026-09-13T20:00:00Z")).toISOString(), "2026-09-13T05:00:00.000Z");

console.log("other zones");
eq("Denver midnight (MDT -6)", zonedMidnight("America/Denver", 2026, 9, 17).toISOString(), "2026-09-17T06:00:00.000Z");
eq("UTC is a no-op", zonedMidnight("UTC", 2026, 9, 17).toISOString(), "2026-09-17T00:00:00.000Z");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
