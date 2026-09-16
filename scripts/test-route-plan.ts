/**
 * Unit tests for the pure route-planning pieces (lib/route-walk.ts).
 *   npx tsx scripts/test-route-plan.ts
 * Plain assertions, no test framework (repo has none).
 */
import assert from "node:assert/strict";
import {
  ceilToMinutes,
  clampedDurationMinutes,
  dayInterval,
  routedChain,
  runsPastDay,
  walkDay,
} from "../lib/route-walk";
import { wallTimeToUtc } from "../lib/booking-engine";
import { autoCloseAt, AUTO_CLOSE_MAX_MS } from "../lib/time-entries";
// lib/routing pulls Prisma in for the matrix cache — mirror its 5-minute gap rounding here
const roundGapMinutes = (minutes: number) => (minutes <= 0 ? 0 : Math.ceil(minutes / 5) * 5);

const TZ = "America/Chicago";
// Monday 2026-07-06, Chicago
const at = (hh: number, mm = 0, dayOffset = 0) => wallTimeToUtc(TZ, 2026, 7, 6 + dayOffset, hh * 60 + mm);
const iso = (d: Date) => d.toISOString();
const DAY_START = at(0).getTime();
const DAY_END = at(0, 0, 1).getTime();

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("route-walk");

test("clampedDurationMinutes: a stop that runs into tomorrow is cut at the day's end", () => {
  // Mon 09:00 → Tue 17:00 install: 32 h on the calendar, 15 h of Monday
  const stop = { scheduledAt: iso(at(9)), scheduledEnd: iso(at(17, 0, 1)), scheduledAnytime: false };
  assert.equal(clampedDurationMinutes(stop, DAY_START, DAY_END, 60), 15 * 60);
  assert.equal(runsPastDay(stop, DAY_END), true);
});

test("clampedDurationMinutes: ordinary spans keep their length; untimed fall back", () => {
  assert.equal(
    clampedDurationMinutes({ scheduledAt: iso(at(9)), scheduledEnd: iso(at(10, 30)), scheduledAnytime: false }, DAY_START, DAY_END, 60),
    90
  );
  assert.equal(clampedDurationMinutes({ scheduledAt: iso(at(9)), scheduledEnd: null, scheduledAnytime: false }, DAY_START, DAY_END, 45), 45);
  assert.equal(clampedDurationMinutes({ scheduledAt: iso(at(9)), scheduledEnd: iso(at(10)), scheduledAnytime: true }, DAY_START, DAY_END, 30), 30);
  assert.equal(runsPastDay({ scheduledAt: iso(at(9)), scheduledEnd: iso(at(10)), scheduledAnytime: false }, DAY_END), false);
});

test("dayInterval: clips to the day, defaults an end-less stop, ignores Anytime", () => {
  const multi = dayInterval({ scheduledAt: iso(at(22)), scheduledEnd: iso(at(3, 0, 1)), scheduledAnytime: false }, DAY_START, DAY_END, 60)!;
  assert.equal(multi.startMs, at(22).getTime());
  assert.equal(multi.endMs, DAY_END);
  const open = dayInterval({ scheduledAt: iso(at(9)), scheduledEnd: null, scheduledAnytime: false }, DAY_START, DAY_END, 30)!;
  assert.equal(open.endMs - open.startMs, 30 * 60000);
  assert.equal(dayInterval({ scheduledAt: iso(at(9)), scheduledEnd: iso(at(10)), scheduledAnytime: true }, DAY_START, DAY_END, 30), null);
});

test("walkDay: stops chain from the anchor with rounded drive gaps", () => {
  const out = walkDay({
    anchorMs: at(8).getTime(),
    stops: [
      { id: "a", durationMin: 60 },
      { id: "b", durationMin: 30 },
      { id: "c", durationMin: 45 },
    ],
    driveMinutes: (p, i) => (p === 0 && i === 1 ? 12 : 7),
    gapMinutes: roundGapMinutes,
  });
  assert.deepEqual(
    out.map((s) => [s.id, new Date(s.startMs).toISOString(), new Date(s.endMs).toISOString(), s.driveMin]),
    [
      ["a", iso(at(8)), iso(at(9)), null],
      ["b", iso(at(9, 15)), iso(at(9, 45)), 12], // 12 min drive rounds up to a 15-min gap
      ["c", iso(at(9, 55)), iso(at(10, 40)), 7], // 7 → 10
    ]
  );
});

test("walkDay: a stop that would land on blocked time slides past it (and past the next block too)", () => {
  // Lunch 12:00–13:00 and a dentist run 13:00–13:30 back to back
  const out = walkDay({
    anchorMs: at(10).getTime(),
    stops: [
      { id: "a", durationMin: 90 }, // 10:00–11:30
      { id: "b", durationMin: 60 }, // would be 11:40–12:40 → overlaps lunch → 13:00 → overlaps dentist → 13:30
      { id: "c", durationMin: 30 },
    ],
    driveMinutes: () => 10,
    gapMinutes: roundGapMinutes,
    fixed: [
      { startMs: at(12).getTime(), endMs: at(13).getTime() },
      { startMs: at(13).getTime(), endMs: at(13, 30).getTime() },
    ],
  });
  assert.equal(new Date(out[1].startMs).toISOString(), iso(at(13, 30)));
  assert.equal(new Date(out[1].endMs).toISOString(), iso(at(14, 30)));
  assert.equal(new Date(out[2].startMs).toISOString(), iso(at(14, 40)));
});

test("walkDay: a multi-day stop pinned as a fixed interval keeps the walk on this day", () => {
  // The install (Mon 15:00 → Tue 17:00) is pinned; its Monday slice is fixed
  // from 15:00 to midnight. Routed stops before it are untouched; nothing
  // is laid out on top of it.
  const install = dayInterval({ scheduledAt: iso(at(15)), scheduledEnd: iso(at(17, 0, 1)), scheduledAnytime: false }, DAY_START, DAY_END, 60)!;
  const out = walkDay({
    anchorMs: at(13).getTime(),
    stops: [
      { id: "a", durationMin: 60 }, // 13:00–14:00
      { id: "b", durationMin: 60 }, // 14:10–15:10 overlaps the install → slides to midnight
    ],
    driveMinutes: () => 10,
    gapMinutes: roundGapMinutes,
    fixed: [install],
  });
  assert.equal(new Date(out[0].endMs).toISOString(), iso(at(14)));
  // Slid to the install's end (the day's end) — never inside it
  assert.equal(out[1].startMs, DAY_END);
});

test("walkDay: with the old unclamped duration the rest of the day landed on Tuesday evening (regression)", () => {
  // What the route used to do: 32 h of "duration" on the first stop
  const before = walkDay({
    anchorMs: at(9).getTime(),
    stops: [
      { id: "install", durationMin: 32 * 60 },
      { id: "mow", durationMin: 30 },
    ],
    driveMinutes: () => 5,
  });
  assert.ok(before[1].startMs > DAY_END + 12 * 3600_000, "unclamped: pushed to the next evening");
  // What it does now: the install's Monday slice
  const stop = { scheduledAt: iso(at(9)), scheduledEnd: iso(at(17, 0, 1)), scheduledAnytime: false };
  const after = walkDay({
    anchorMs: at(9).getTime(),
    stops: [
      { id: "install", durationMin: clampedDurationMinutes(stop, DAY_START, DAY_END, 60) },
      { id: "mow", durationMin: 30 },
    ],
    driveMinutes: () => 5,
  });
  assert.equal(after[0].endMs, DAY_END);
  assert.ok(after[1].startMs < DAY_END + 3600_000, "clamped: stays at the edge of this day");
});

test("routedChain: skips Anytime stops so legs never measure from one", () => {
  const stops = [
    { id: "x", assigneeIds: ["u1"], scheduledAt: iso(at(9)), scheduledAnytime: false },
    { id: "any", assigneeIds: ["u1"], scheduledAt: iso(at(12)), scheduledAnytime: true },
    { id: "y", assigneeIds: ["u1"], scheduledAt: iso(at(14)), scheduledAnytime: false },
    { id: "z", assigneeIds: ["u2"], scheduledAt: iso(at(10)), scheduledAnytime: false },
    { id: "unsched", assigneeIds: ["u1"], scheduledAt: null, scheduledAnytime: false },
  ];
  assert.deepEqual(routedChain(stops, "u1").map((s) => s.id), ["x", "y"]);
  assert.deepEqual(routedChain(stops, "u2").map((s) => s.id), ["z"]);
  // Order is by time, not input order
  assert.deepEqual(routedChain([stops[2], stops[0]], "u1").map((s) => s.id), ["x", "y"]);
});

test("ceilToMinutes rounds up to the step", () => {
  const t = at(13, 7).getTime() + 33_000;
  assert.equal(ceilToMinutes(t, 5), at(13, 10).getTime());
  assert.equal(ceilToMinutes(at(13, 10).getTime(), 5), at(13, 10).getTime());
});

console.log("time-entries");

test("autoCloseAt: closes at the closing moment, capped 12 h after start, never before start", () => {
  const start = at(8);
  assert.equal(autoCloseAt(start, at(16)).getTime(), at(16).getTime());
  assert.equal(autoCloseAt(start, at(9, 0, 3)).getTime(), start.getTime() + AUTO_CLOSE_MAX_MS);
  assert.equal(autoCloseAt(start, at(7)).getTime(), start.getTime());
});

console.log(`\n${passed} passed`);
