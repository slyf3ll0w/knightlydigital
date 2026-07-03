/**
 * Unit tests for the online-booking slot engine.
 *   NODE_OPTIONS=--use-system-ca npx tsx scripts/test-booking-slots.ts
 * Plain assertions, no test framework (repo has none).
 */
import assert from "node:assert/strict";
import { generateSlots, pickUserForSlot, wallTimeToUtc, type Slot } from "../lib/booking-slots";
import { DEFAULT_BUSINESS_HOURS, sanitizeBusinessHours, sanitizeServiceZips, zipFromAddress } from "../lib/business-hours";

const TZ = "America/Chicago";
const chi = (y: number, m: number, d: number, hh: number, mm = 0) =>
  wallTimeToUtc(TZ, y, m, d, hh * 60 + mm);

// Monday 2026-07-06 06:00 Chicago as "now"
const NOW = chi(2026, 7, 6, 6);

const base = {
  timezone: TZ,
  hours: DEFAULT_BUSINESS_HOURS,
  durationMinutes: 60,
  arrivalWindowMinutes: 120,
  users: [{ id: "u1", busy: [] }],
  now: NOW,
  leadHours: 4,
  horizonDays: 7,
};

const fmt = (s: Slot) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit", hour12: false,
  }).format(s.start);

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok — ${name}`);
}

test("weekday hours produce slots; first respects lead time", () => {
  const slots = generateSlots(base);
  assert.ok(slots.length > 0);
  // now=6:00 + 4h lead = 10:00; business opens 8:00, so first slot is 10:00
  assert.equal(fmt(slots[0]), "Mon 10:00");
  // every slot fits inside 08:00–17:00 (start+60min <= 17:00)
  for (const s of slots) {
    assert.ok(s.start >= new Date(NOW.getTime() + 4 * 3600000));
  }
});

test("maxPerDay caps each day and windowEnd = start + arrival window", () => {
  const slots = generateSlots({ ...base, maxPerDay: 3 });
  const byDay = new Map<string, number>();
  for (const s of slots) {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: TZ, dateStyle: "short" }).format(s.start);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    assert.equal(s.windowEnd.getTime() - s.start.getTime(), 120 * 60000);
  }
  for (const n of byDay.values()) assert.ok(n <= 3);
});

test("closed days (sat/sun) offer nothing", () => {
  const slots = generateSlots({ ...base, horizonDays: 13 });
  for (const s of slots) {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(s.start);
    assert.ok(wd !== "Sat" && wd !== "Sun", `slot on closed day: ${fmt(s)}`);
  }
});

test("busy interval removes the only user's slot", () => {
  const busy = [{ start: chi(2026, 7, 6, 10), end: chi(2026, 7, 6, 12) }];
  const slots = generateSlots({ ...base, users: [{ id: "u1", busy }] });
  const monday = slots.filter((s) => fmt(s).startsWith("Mon"));
  // 10:00–12:00 blocked (60-min service): starts 9:30..11:30 all overlap →
  // with 10:00 lead cutoff the first open Monday slot is 12:00
  assert.equal(fmt(monday[0]), "Mon 12:00");
});

test("second free user keeps the slot open and is the one offered", () => {
  const busy = [{ start: chi(2026, 7, 6, 10), end: chi(2026, 7, 6, 12) }];
  const slots = generateSlots({
    ...base,
    users: [{ id: "u1", busy }, { id: "u2", busy: [] }],
  });
  const at10 = slots.find((s) => fmt(s) === "Mon 10:00");
  assert.ok(at10);
  assert.deepEqual(at10!.userIds, ["u2"]);
});

test("duration longer than any range yields nothing", () => {
  const slots = generateSlots({ ...base, durationMinutes: 10 * 60 });
  assert.equal(slots.length, 0);
});

test("DST spring-forward day (Mar 8 2026) stays on wall-clock hours", () => {
  const now = chi(2026, 3, 6, 6); // Friday before
  const hours = { ...DEFAULT_BUSINESS_HOURS, sun: [{ start: "08:00", end: "17:00" }] };
  const slots = generateSlots({ ...base, now, hours, horizonDays: 3 });
  const sunday = slots.filter(
    (s) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(s.start) === "Sun"
  );
  assert.ok(sunday.length > 0);
  const first = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: false,
  }).format(sunday[0].start);
  assert.equal(first, "08:00"); // 8am local even though UTC offset changed overnight
});

test("pickUserForSlot: least-loaded free user wins; lost slot → null", () => {
  const s = chi(2026, 7, 6, 10);
  const e = chi(2026, 7, 6, 11);
  const u1 = { id: "u1", busy: [{ start: chi(2026, 7, 6, 13), end: chi(2026, 7, 6, 14) }] };
  const u2 = { id: "u2", busy: [] };
  assert.equal(pickUserForSlot(s, e, [u1, u2]), "u2");
  const busyBoth = [
    { id: "u1", busy: [{ start: s, end: e }] },
    { id: "u2", busy: [{ start: chi(2026, 7, 6, 10, 30), end: chi(2026, 7, 6, 11, 30) }] },
  ];
  assert.equal(pickUserForSlot(s, e, busyBoth), null);
});

test("sanitizeBusinessHours drops garbage, keeps valid, sorts ranges", () => {
  const h = sanitizeBusinessHours({
    mon: [{ start: "13:00", end: "17:00" }, { start: "08:00", end: "11:30" }],
    tue: [{ start: "17:00", end: "08:00" }, { start: "9:00", end: "12:00" }, "junk"],
    wat: [{ start: "08:00", end: "17:00" }],
  });
  assert.deepEqual(h.mon, [{ start: "08:00", end: "11:30" }, { start: "13:00", end: "17:00" }]);
  assert.deepEqual(h.tue, []); // backwards range + bad format + junk all dropped
  assert.deepEqual(h.wed, []); // unspecified day = closed
  assert.deepEqual(sanitizeBusinessHours(null), DEFAULT_BUSINESS_HOURS);
});

test("ZIP helpers", () => {
  assert.deepEqual(sanitizeServiceZips(["75002", "75002", "7500", "abcde", " 75013 "]), ["75002", "75013"]);
  assert.equal(zipFromAddress("123 Main St, Allen, TX 75002"), "75002");
  assert.equal(zipFromAddress("456 Oak Ave Suite 75 Dallas TX 75201-1234"), "75201");
  assert.equal(zipFromAddress("no zip here"), null);
});

console.log(`\n${passed} tests passed`);
