/**
 * Unit tests for the online-booking engine v2 (lib/booking-engine.ts).
 *   NODE_OPTIONS=--use-system-ca npx tsx scripts/test-booking-engine.ts
 * Plain assertions, no test framework (repo has none).
 */
import assert from "node:assert/strict";
import {
  checkSlot,
  generateSlots,
  groupSlotsByDay,
  pickMember,
  wallTimeToUtc,
  type EngineMember,
  type EngineRules,
  type Slot,
} from "../lib/booking-engine";
import { DEFAULT_BUSINESS_HOURS } from "../lib/business-hours";

const TZ = "America/Chicago";
const chi = (y: number, m: number, d: number, hh: number, mm = 0) => wallTimeToUtc(TZ, y, m, d, hh * 60 + mm);

// Monday 2026-07-06 06:00 Chicago as "now"
const NOW = chi(2026, 7, 6, 6);

const rules = (over: Partial<EngineRules> = {}): EngineRules => ({
  timezone: TZ,
  hours: DEFAULT_BUSINESS_HOURS,
  durationMinutes: 60,
  stepMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  leadHours: 4,
  horizonDays: 7,
  maxPerDay: null,
  maxShownPerDay: null,
  arrivalWindowMinutes: 120,
  bookingTypeId: "bt1",
  ...over,
});

const member = (id: string, over: Partial<EngineMember> = {}): EngineMember => ({ id, busy: [], ...over });

const fmt = (s: Slot | Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit", hour12: false }).format(
    s instanceof Date ? s : s.start
  );

// Two real DFW points ~25 km apart (Plano ↔ Allen is closer; use Plano ↔ Fort Worth-ish for a long leg)
const PLANO = { lat: 33.0198, lng: -96.6989 };
const ALLEN = { lat: 33.1032, lng: -96.6706 }; // ~10 km from Plano → ~17 min estimate
const FORT_WORTH = { lat: 32.7555, lng: -97.3308 }; // ~65 km → ~113 min estimate

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok — ${name}`);
}

test("weekday hours produce slots; first respects lead time", () => {
  const slots = generateSlots(rules(), [member("u1")], NOW);
  assert.ok(slots.length > 0);
  // now=06:00 + 4h lead = 10:00 → first Monday slot is 10:00
  assert.equal(fmt(slots[0]), "Mon 10:00");
  // last slot of a day ends by 17:00 → 16:00 start
  const monday = slots.filter((s) => fmt(s).startsWith("Mon"));
  assert.equal(fmt(monday[monday.length - 1]), "Mon 16:00");
  // weekend closed
  assert.ok(!slots.some((s) => fmt(s).startsWith("Sat") || fmt(s).startsWith("Sun")));
});

test("step 15 lists every quarter hour for calls; exact time → windowEnd = start", () => {
  const slots = generateSlots(rules({ stepMinutes: 15, durationMinutes: 30, arrivalWindowMinutes: 0, horizonDays: 0 }), [member("u1")], NOW);
  assert.equal(fmt(slots[0]), "Mon 10:00");
  assert.equal(fmt(slots[1]), "Mon 10:15");
  assert.equal(slots[0].windowEnd.getTime(), slots[0].start.getTime());
});

test("busy interval blocks overlapping starts; buffers widen the block", () => {
  const busy = [{ start: chi(2026, 7, 6, 12), end: chi(2026, 7, 6, 13) }];
  const plain = generateSlots(rules({ horizonDays: 0 }), [member("u1", { busy })], NOW);
  const labels = plain.map(fmt);
  assert.ok(!labels.includes("Mon 12:00") && !labels.includes("Mon 11:30") && !labels.includes("Mon 12:30"));
  assert.ok(labels.includes("Mon 11:00") && labels.includes("Mon 13:00"));
  const buffered = generateSlots(rules({ horizonDays: 0, bufferBeforeMinutes: 30, bufferAfterMinutes: 30 }), [member("u1", { busy })], NOW);
  const bl = buffered.map(fmt);
  // 13:00 start needs a 30-min gap after the 12–13 job → 13:30 is first after
  assert.ok(!bl.includes("Mon 13:00") && bl.includes("Mon 13:30"));
  assert.ok(!bl.includes("Mon 11:00") && bl.includes("Mon 10:30"));
});

test("per-member hours narrow their own availability only", () => {
  const afternoonOnly = { ...DEFAULT_BUSINESS_HOURS, mon: [{ start: "13:00", end: "17:00" }] };
  const slots = generateSlots(rules({ horizonDays: 0 }), [member("u1", { hours: afternoonOnly }), member("u2")], NOW);
  const ten = slots.find((s) => fmt(s) === "Mon 10:00")!;
  assert.deepEqual(ten.memberIds, ["u2"]);
  const two = slots.find((s) => fmt(s) === "Mon 14:00")!;
  assert.deepEqual(two.memberIds, ["u1", "u2"]);
});

test("daily cap hides a member once they have maxPerDay bookings of this type", () => {
  const busy = [
    { start: chi(2026, 7, 6, 10), end: chi(2026, 7, 6, 11), bookingTypeId: "bt1" },
    { start: chi(2026, 7, 6, 12), end: chi(2026, 7, 6, 13), bookingTypeId: "other" },
  ];
  const r = rules({ horizonDays: 0, maxPerDay: 1 });
  assert.equal(checkSlot(r, member("u1", { busy }), chi(2026, 7, 6, 14), NOW).reason, "cap");
  // Tuesday is a fresh day
  assert.ok(checkSlot(r, member("u1", { busy }), chi(2026, 7, 7, 14), NOW).ok);
  // cap 2 → still room
  assert.ok(checkSlot(rules({ horizonDays: 0, maxPerDay: 2 }), member("u1", { busy }), chi(2026, 7, 6, 14), NOW).ok);
});

test("drive: gap must absorb the leg from the previous located stop", () => {
  // 8–9 job in Fort Worth; target in Plano (~113 min away)
  const busy = [{ start: chi(2026, 7, 6, 8), end: chi(2026, 7, 6, 9), loc: FORT_WORTH }];
  const r = rules({ horizonDays: 0, leadHours: 0, target: PLANO, dayStartLoc: PLANO });
  const nineThirty = checkSlot(r, member("u1", { busy }), chi(2026, 7, 6, 9, 30), NOW);
  assert.equal(nineThirty.reason, "drive");
  assert.ok((nineThirty.driveFromPrev ?? 0) > 60);
  // 11:00 leaves 120 min → fits
  assert.ok(checkSlot(r, member("u1", { busy }), chi(2026, 7, 6, 11), NOW).ok);
  // Same schedule but the job is in Allen (~17 min) → 9:30 fits
  const near = [{ start: chi(2026, 7, 6, 8), end: chi(2026, 7, 6, 9), loc: ALLEN }];
  assert.ok(checkSlot(r, member("u1", { busy: near }), chi(2026, 7, 6, 9, 30), NOW).ok);
});

test("drive: the leg to the NEXT stop must fit too", () => {
  const busy = [{ start: chi(2026, 7, 6, 12), end: chi(2026, 7, 6, 13), loc: FORT_WORTH }];
  const r = rules({ horizonDays: 0, leadHours: 0, target: PLANO, dayStartLoc: PLANO });
  // 10:00–11:00 visit then 60 min to reach Fort Worth by 12:00 → ~113 min needed → fail
  assert.equal(checkSlot(r, member("u1", { busy }), chi(2026, 7, 6, 10), NOW).reason, "drive");
  // 9:00–10:00 leaves 120 min → ok
  assert.ok(checkSlot(r, member("u1", { busy }), chi(2026, 7, 6, 9), NOW).ok);
});

test("drive: first visit of the day has no inbound gap constraint, but the per-leg limit applies from the day-start pin", () => {
  const r = rules({ horizonDays: 0, leadHours: 0, target: PLANO, dayStartLoc: FORT_WORTH });
  assert.ok(checkSlot(r, member("u1"), chi(2026, 7, 6, 8), NOW).ok);
  const limited = rules({ horizonDays: 0, leadHours: 0, target: PLANO, dayStartLoc: FORT_WORTH, driveLimitMinutes: 30 });
  assert.equal(checkSlot(limited, member("u1"), chi(2026, 7, 6, 8), NOW).reason, "drive");
  // A member who starts the day in Allen is fine under the same limit
  assert.ok(checkSlot(limited, member("u2", { startLoc: ALLEN }), chi(2026, 7, 6, 8), NOW).ok);
});

test("drive: unlocated busy items only contribute buffers", () => {
  const busy = [{ start: chi(2026, 7, 6, 8), end: chi(2026, 7, 6, 9) }];
  const r = rules({ horizonDays: 0, leadHours: 0, target: PLANO, dayStartLoc: FORT_WORTH });
  assert.ok(checkSlot(r, member("u1", { busy }), chi(2026, 7, 6, 9), NOW).ok);
});

test("drive: injected real-road minutes override the estimate", () => {
  const busy = [{ start: chi(2026, 7, 6, 8), end: chi(2026, 7, 6, 9), loc: ALLEN }];
  const slow = rules({ horizonDays: 0, leadHours: 0, target: PLANO, driveMinutes: () => 45 });
  assert.equal(checkSlot(slow, member("u1", { busy }), chi(2026, 7, 6, 9, 30), NOW).reason, "drive");
  assert.ok(checkSlot(slow, member("u1", { busy }), chi(2026, 7, 6, 9, 45), NOW).ok);
});

test("a slot is offered when ANY member is free; memberIds lists who", () => {
  const busy = [{ start: chi(2026, 7, 6, 10), end: chi(2026, 7, 6, 11) }];
  const slots = generateSlots(rules({ horizonDays: 0 }), [member("u1", { busy }), member("u2")], NOW);
  const ten = slots.find((s) => fmt(s) === "Mon 10:00")!;
  assert.deepEqual(ten.memberIds, ["u2"]);
});

test("maxShownPerDay samples evenly across the day", () => {
  const slots = generateSlots(rules({ horizonDays: 0, maxShownPerDay: 3 }), [member("u1")], NOW);
  assert.deepEqual(slots.map(fmt), ["Mon 10:00", "Mon 13:00", "Mon 16:00"]);
});

test("round robin: least recently assigned wins; never-assigned first", () => {
  const start = chi(2026, 7, 6, 10);
  const r = rules();
  const a = member("a", { lastAssignedAt: chi(2026, 7, 1, 9) });
  const b = member("b", { lastAssignedAt: chi(2026, 7, 3, 9) });
  const c = member("c");
  assert.equal(pickMember(r, [a, b, c], start, NOW), "c");
  assert.equal(pickMember(r, [b, a], start, NOW), "a");
  // busy member is skipped
  const aBusy = { ...a, busy: [{ start, end: chi(2026, 7, 6, 11) }] };
  assert.equal(pickMember(r, [aBusy, b], start, NOW), "b");
  // nobody free → null
  assert.equal(pickMember(r, [aBusy], start, NOW), null);
});

test("priority mode ranks priority first, then rotation", () => {
  const start = chi(2026, 7, 6, 10);
  const a = member("a", { priority: 5, lastAssignedAt: chi(2026, 7, 5, 9) });
  const b = member("b", { priority: 0 });
  assert.equal(pickMember(rules(), [a, b], start, NOW, "PRIORITY"), "a");
  assert.equal(pickMember(rules(), [a, b], start, NOW, "ROUND_ROBIN"), "b");
});

test("rotation tiebreak: fewer upcoming bookings of this type", () => {
  const start = chi(2026, 7, 6, 10);
  const a = member("a", { busy: [{ start: chi(2026, 7, 7, 9), end: chi(2026, 7, 7, 10), bookingTypeId: "bt1" }] });
  const b = member("b");
  assert.equal(pickMember(rules(), [a, b], start, NOW), "b");
});

test("DST: slots on the spring-forward Sunday keep wall-clock times", () => {
  const sundayHours = { ...DEFAULT_BUSINESS_HOURS, sun: [{ start: "08:00", end: "12:00" }] };
  const now = wallTimeToUtc(TZ, 2026, 3, 8, 0); // 2026-03-08 is spring-forward in the US
  const slots = generateSlots(rules({ hours: sundayHours, horizonDays: 0, leadHours: 0 }), [member("u1")], now);
  assert.deepEqual(slots.map(fmt), ["Sun 08:00", "Sun 08:30", "Sun 09:00", "Sun 09:30", "Sun 10:00", "Sun 10:30", "Sun 11:00"]);
});

test("groupSlotsByDay labels windows and exact times", () => {
  const slots = generateSlots(rules({ horizonDays: 0, maxShownPerDay: 1 }), [member("u1")], NOW);
  const days = groupSlotsByDay(TZ, slots);
  assert.equal(days.length, 1);
  assert.equal(days[0].slots[0].label, "10:00 AM – 12:00 PM");
  const exact = generateSlots(rules({ horizonDays: 0, maxShownPerDay: 1, arrivalWindowMinutes: 0 }), [member("u1")], NOW);
  assert.equal(groupSlotsByDay(TZ, exact)[0].slots[0].label, "10:00 AM");
});

console.log(`\n${passed} booking-engine tests passed`);
