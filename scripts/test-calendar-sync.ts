/**
 * Calendar sync — pure-function checks (no DB, no network).
 * Run: DATABASE_URL=postgresql://x:y@localhost/z npx tsx scripts/test-calendar-sync.ts
 * (the placeholder URL only keeps the Prisma singleton from complaining at
 * import time; nothing here queries it.)
 *
 * Plain assertions, no test framework (repo has none).
 */
import assert from "node:assert/strict";
import {
  addDaysToKey,
  allDayRange,
  calendarEventFingerprint,
  localDateKey,
  toCalendarEventFromAppointment,
  toCalendarEventFromJob,
  toCalendarEventFromTimeBlock,
} from "../lib/calendar-event-shape";
import { buildIcsCalendar } from "../lib/ics";
import { toGoogleEvent } from "../lib/google-calendar";
import { classifyGoogleEvent } from "../lib/google-calendar-pull";

const TZ = "America/Chicago";
const contact = { firstName: "Ray", lastName: "Delgado", phone: "214-555-0100", address: "1 Main St, Allen, TX" };

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("calendar-sync");

test("local date keys respect the company zone", () => {
  // 2026-03-08 04:30Z is still 2026-03-07 22:30 in Chicago (CST)
  assert.equal(localDateKey(new Date("2026-03-08T04:30:00Z"), TZ), "2026-03-07");
  assert.equal(localDateKey(new Date("2026-03-08T04:30:00Z"), "UTC"), "2026-03-08");
  assert.equal(addDaysToKey("2026-12-31", 1), "2027-01-01");
});

test("anytime job → one all-day event, exclusive end", () => {
  const ev = toCalendarEventFromJob(
    {
      id: "j1",
      jobNumber: 42,
      title: "Mow",
      description: null,
      scheduledAt: new Date("2026-09-14T17:00:00Z"), // noon Chicago (CDT)
      scheduledEnd: null,
      scheduledAnytime: true,
      address: null,
      contact,
    },
    TZ
  )!;
  assert.equal(ev.allDay, true);
  assert.deepEqual(allDayRange(ev), { start: "2026-09-14", end: "2026-09-15" });
  assert.equal(ev.location, contact.address, "falls back to the client's address");
  assert.equal(ev.uid, "wb-job-j1@workbenchfsm.com");
  assert.match(ev.title, /^Mow · Ray Delgado$/);
  assert.match(ev.description, /Job #42/);
  assert.match(ev.description, /\/app\/jobs\/j1$/);
});

test("timed job defaults to one hour; a bad end is ignored", () => {
  const start = new Date("2026-09-14T14:00:00Z");
  const ev = toCalendarEventFromJob(
    {
      id: "j2",
      jobNumber: 1,
      title: "Repair",
      description: "Bring the long ladder",
      scheduledAt: start,
      scheduledEnd: new Date("2026-09-14T13:00:00Z"), // before start
      scheduledAnytime: false,
      address: "9 Oak Ave",
      contact,
    },
    TZ
  )!;
  assert.equal(ev.end.getTime() - start.getTime(), 3_600_000);
  assert.equal(ev.location, "9 Oak Ave", "job address wins over the client's");
  assert.match(ev.description, /Bring the long ladder/);
});

test("unscheduled job is not an event", () => {
  const ev = toCalendarEventFromJob(
    { id: "j3", jobNumber: 2, title: "x", description: null, scheduledAt: null, scheduledEnd: null, scheduledAnytime: false, address: null, contact },
    TZ
  );
  assert.equal(ev, null);
});

test("appointments: type label, 30-min default, tentative flag, call location", () => {
  const base = {
    id: "a1",
    title: "Estimate",
    scheduledAt: new Date("2026-09-15T15:00:00Z"),
    scheduledEnd: null,
    scheduledAnytime: false,
    tentative: true,
    address: null,
    meetingLink: null,
    notes: "Gate code 1234",
    contact,
  };
  const call = toCalendarEventFromAppointment({ ...base, type: "PHONE_CALL" }, TZ);
  assert.equal(call.end.getTime() - call.start.getTime(), 30 * 60_000);
  assert.equal(call.status, "TENTATIVE");
  assert.equal(call.location, "Call 214-555-0100");
  assert.match(call.title, /^Phone call: Estimate · Ray Delgado$/);
  assert.match(call.description, /Awaiting approval/);
  assert.match(call.description, /Gate code 1234/);

  const video = toCalendarEventFromAppointment({ ...base, type: "VIDEO_CALL", meetingLink: "https://meet.example/x", tentative: false }, TZ);
  assert.equal(video.location, "https://meet.example/x");
  assert.equal(video.status, "CONFIRMED");

  const visit = toCalendarEventFromAppointment({ ...base, type: "IN_PERSON", address: "5 Elm", tentative: false }, TZ);
  assert.equal(visit.location, "5 Elm");
});

test("all-day block spanning two days ends on the third", () => {
  const ev = toCalendarEventFromTimeBlock(
    {
      id: "b1",
      userId: null,
      title: "Labor Day",
      startAt: new Date("2026-09-07T05:00:00Z"), // 00:00 CDT
      endAt: new Date("2026-09-09T04:59:59Z"), // 23:59:59 CDT on the 8th
      allDay: true,
      address: null,
    },
    TZ
  );
  assert.deepEqual(allDayRange(ev), { start: "2026-09-07", end: "2026-09-09" });
  assert.match(ev.description, /Company-wide/);
});

test("fingerprint changes only when the calendar-visible fields change", () => {
  const mk = (title: string, start: string) =>
    toCalendarEventFromJob(
      { id: "j9", jobNumber: 9, title, description: null, scheduledAt: new Date(start), scheduledEnd: null, scheduledAnytime: false, address: null, contact },
      TZ
    )!;
  const a = calendarEventFingerprint(mk("Mow", "2026-09-14T14:00:00Z"));
  assert.equal(a, calendarEventFingerprint(mk("Mow", "2026-09-14T14:00:00Z")), "stable");
  assert.notEqual(a, calendarEventFingerprint(mk("Mow", "2026-09-14T15:00:00Z")), "time moved");
  assert.notEqual(a, calendarEventFingerprint(mk("Edge", "2026-09-14T14:00:00Z")), "renamed");
  assert.equal(a.length, 32);
});

test("ICS calendar: header, one VEVENT per event, DATE vs DATE-TIME, escaping", () => {
  const timed = toCalendarEventFromJob(
    { id: "j1", jobNumber: 1, title: "Mow; front, back", description: null, scheduledAt: new Date("2026-09-14T14:00:00Z"), scheduledEnd: null, scheduledAnytime: false, address: null, contact },
    TZ
  )!;
  const allDay = toCalendarEventFromTimeBlock(
    { id: "b1", userId: "u1", title: "Dentist", startAt: new Date("2026-09-07T05:00:00Z"), endAt: new Date("2026-09-08T04:59:59Z"), allDay: true, address: null },
    TZ
  );
  const ics = buildIcsCalendar([timed, allDay], { name: "Acme · Ray", tz: TZ, now: new Date("2026-09-11T12:00:00Z") });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.match(ics, /X-WR-CALNAME:Acme · Ray/);
  assert.match(ics, /X-WR-TIMEZONE:America\/Chicago/);
  assert.doesNotMatch(ics, /^METHOD:/m, "subscribe feeds carry no METHOD");
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.match(ics, /DTSTART:20260914T140000Z\r\nDTEND:20260914T150000Z/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260907\r\nDTEND;VALUE=DATE:20260908/);
  assert.match(ics, /SUMMARY:Mow\\; front\\, back · Ray Delgado/);
  assert.match(ics, /UID:wb-block-b1@workbenchfsm.com/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  for (const line of ics.split("\r\n")) assert.ok(line.length <= 75, `folded: ${line.length}`);
});

test("Google event payload: dateTime + zone, all-day dates, private marker, no default reminders", () => {
  const timed = toCalendarEventFromJob(
    { id: "j1", jobNumber: 1, title: "Mow", description: null, scheduledAt: new Date("2026-09-14T14:00:00Z"), scheduledEnd: null, scheduledAnytime: false, address: "9 Oak", contact },
    TZ
  )!;
  const g = toGoogleEvent(timed);
  assert.deepEqual(g.start, { dateTime: "2026-09-14T14:00:00.000Z", timeZone: TZ });
  assert.deepEqual(g.end, { dateTime: "2026-09-14T15:00:00.000Z", timeZone: TZ });
  assert.equal(g.location, "9 Oak");
  assert.equal(g.status, "confirmed");
  assert.deepEqual(g.reminders, { useDefault: false });
  assert.equal(g.extendedProperties.private.workbench, "wb-job-j1@workbenchfsm.com");
  assert.equal(g.extendedProperties.private.wb, "1");
  assert.match(g.source.url, /\/app\/jobs\/j1$/);

  const tentative = toCalendarEventFromAppointment(
    { id: "a1", title: "Est", type: "IN_PERSON", scheduledAt: new Date("2026-09-14T17:00:00Z"), scheduledEnd: null, scheduledAnytime: true, tentative: true, address: null, meetingLink: null, notes: null, contact },
    TZ
  );
  const ga = toGoogleEvent(tentative);
  assert.deepEqual(ga.start, { date: "2026-09-14" });
  assert.deepEqual(ga.end, { date: "2026-09-15" });
  assert.equal(ga.status, "tentative");
  assert.equal(ga.transparency, "transparent");
});

test("Google → Workbench: busy timed event becomes a block; free/cancelled/ours/declined don't", () => {
  const opts = { tz: TZ, from: new Date("2026-09-10T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z"), shareTitles: false };
  const timed = { id: "g1", summary: "Dentist", start: { dateTime: "2026-09-15T14:00:00-05:00" }, end: { dateTime: "2026-09-15T15:00:00-05:00" } };
  const b = classifyGoogleEvent(timed, opts)!;
  assert.ok(b);
  assert.equal(b.title, "Busy", "private by default");
  assert.equal(b.externalId, "g1");
  assert.equal(b.allDay, false);
  assert.equal(b.startAt.toISOString(), "2026-09-15T19:00:00.000Z");
  assert.equal(classifyGoogleEvent(timed, { ...opts, shareTitles: true })!.title, "Dentist");
  assert.equal(classifyGoogleEvent({ ...timed, status: "cancelled" }, opts), null);
  assert.equal(classifyGoogleEvent({ ...timed, transparency: "transparent" as const }, opts), null, "shows as Free");
  assert.equal(classifyGoogleEvent({ ...timed, extendedProperties: { private: { wb: "1" } } }, opts), null, "our own push");
  assert.equal(classifyGoogleEvent({ ...timed, attendees: [{ self: true, responseStatus: "declined" }] }, opts), null);
  assert.equal(classifyGoogleEvent({ ...timed, start: { dateTime: "2027-03-01T14:00:00Z" }, end: { dateTime: "2027-03-01T15:00:00Z" } }, opts), null, "outside window");
  assert.equal(classifyGoogleEvent({ id: "g2", start: { dateTime: "2026-09-15T15:00:00Z" }, end: { dateTime: "2026-09-15T14:00:00Z" } }, opts), null, "ends before start");
});

test("Google → Workbench: all-day busy event spans local midnight to 23:59:59 on the last day", () => {
  const opts = { tz: TZ, from: new Date("2026-09-10T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z"), shareTitles: true };
  // Google's end date is exclusive: 16th..18th = two days
  const b = classifyGoogleEvent({ id: "g3", summary: "PTO", transparency: "opaque" as const, start: { date: "2026-09-16" }, end: { date: "2026-09-18" } }, opts)!;
  assert.equal(b.allDay, true);
  assert.equal(b.startAt.toISOString(), "2026-09-16T05:00:00.000Z", "00:00 CDT");
  assert.equal(b.endAt.toISOString(), "2026-09-18T04:59:59.000Z", "23:59:59 CDT on the 17th");
  assert.equal(b.title, "PTO");
});

console.log(`\n${passed} passed`);
