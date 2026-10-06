/**
 * Tasks: bucket math, reminder offsets and the wall-clock round trip, all in
 * a company zone that is not the server's.  `npx tsx scripts/test-tasks.ts`
 */
import assert from "node:assert/strict";
import {
  taskBucket,
  computeRemindAt,
  reminderChoiceFor,
  parseDue,
  dueFields,
  dueLabel,
  compareTasks,
  reminderBase,
} from "../lib/tasks";

const tz = "America/Denver";
// Wed 2026-10-07 14:30 Denver (MDT, UTC-6) = 20:30Z
const now = new Date("2026-10-07T20:30:00Z");

function due(date: string, time: string | null) {
  const p = parseDue(date, time, tz);
  if (!p || "error" in p) throw new Error("parse failed " + JSON.stringify(p));
  return p;
}

// ── parseDue / dueFields round trip ─────────────────────────────────────────
{
  const d = due("2026-10-07", null);
  assert.equal(d.allDay, true);
  assert.equal(d.dueAt.toISOString(), "2026-10-07T06:00:00.000Z"); // local midnight MDT
  assert.deepEqual(dueFields(d.dueAt, true, tz), { dueDate: "2026-10-07", dueTime: "" });

  const t = due("2026-10-07", "15:45");
  assert.equal(t.allDay, false);
  assert.equal(t.dueAt.toISOString(), "2026-10-07T21:45:00.000Z");
  assert.deepEqual(dueFields(t.dueAt, false, tz), { dueDate: "2026-10-07", dueTime: "15:45" });

  // DST edge: Nov 1 2026 falls back in the US; local midnight is still 00:00
  const dst = due("2026-11-02", "09:00");
  assert.deepEqual(dueFields(dst.dueAt, false, tz), { dueDate: "2026-11-02", dueTime: "09:00" });

  assert.equal(parseDue("", null, tz), null);
  assert.ok("error" in (parseDue("2026-13-01", null, tz) as object));
  assert.ok("error" in (parseDue("2026-10-07", "25:00", tz) as object));
}

// ── Buckets ─────────────────────────────────────────────────────────────────
{
  assert.equal(taskBucket(null, true, now, tz), "none");
  // all-day today = today even though the morning is gone
  assert.equal(taskBucket(due("2026-10-07", null).dueAt, true, now, tz), "today");
  // timed earlier today = overdue; later today = today
  assert.equal(taskBucket(due("2026-10-07", "09:00").dueAt, false, now, tz), "overdue");
  assert.equal(taskBucket(due("2026-10-07", "17:00").dueAt, false, now, tz), "today");
  assert.equal(taskBucket(due("2026-10-06", null).dueAt, true, now, tz), "overdue");
  assert.equal(taskBucket(due("2026-10-08", null).dueAt, true, now, tz), "tomorrow");
  assert.equal(taskBucket(due("2026-10-08", "08:00").dueAt, false, now, tz), "tomorrow");
  assert.equal(taskBucket(due("2026-10-09", null).dueAt, true, now, tz), "later");
  // The server's own day (UTC) must not leak: 23:30 Denver is still "today"
  // in Denver although it is tomorrow in UTC.
  const late = new Date("2026-10-08T05:30:00Z"); // 23:30 Denver Oct 7
  assert.equal(taskBucket(due("2026-10-07", null).dueAt, true, late, tz), "today");
  assert.equal(taskBucket(due("2026-10-08", null).dueAt, true, late, tz), "tomorrow");
}

// ── Reminders ───────────────────────────────────────────────────────────────
{
  const timed = due("2026-10-09", "10:00");
  const base = reminderBase(timed.dueAt, false, tz);
  assert.equal(base.getTime(), timed.dueAt.getTime());
  const at = computeRemindAt({ dueAt: timed.dueAt, allDay: false, choice: "at", tz });
  assert.equal(at?.toISOString(), timed.dueAt.toISOString());
  const h = computeRemindAt({ dueAt: timed.dueAt, allDay: false, choice: "1h", tz });
  assert.equal(h?.toISOString(), "2026-10-09T15:00:00.000Z");
  assert.equal(reminderChoiceFor(timed.dueAt, false, h, tz), "1h");
  assert.equal(reminderChoiceFor(timed.dueAt, false, at, tz), "at");

  // All-day tasks count back from 9 AM local
  const allDay = due("2026-10-09", null);
  const morning = computeRemindAt({ dueAt: allDay.dueAt, allDay: true, choice: "at", tz });
  assert.deepEqual(dueFields(morning!, false, tz), { dueDate: "2026-10-09", dueTime: "09:00" });
  const dayBefore = computeRemindAt({ dueAt: allDay.dueAt, allDay: true, choice: "1d", tz });
  assert.deepEqual(dueFields(dayBefore!, false, tz), { dueDate: "2026-10-08", dueTime: "09:00" });
  assert.equal(reminderChoiceFor(allDay.dueAt, true, dayBefore, tz), "1d");

  // Custom survives as custom; none clears; a relative choice needs a due
  const custom = new Date("2026-10-08T18:00:00Z");
  assert.equal(computeRemindAt({ dueAt: allDay.dueAt, allDay: true, choice: "custom", customAt: custom, tz })?.getTime(), custom.getTime());
  assert.equal(reminderChoiceFor(allDay.dueAt, true, custom, tz), "custom");
  assert.equal(computeRemindAt({ dueAt: allDay.dueAt, allDay: true, choice: "none", tz }), null);
  assert.equal(computeRemindAt({ dueAt: null, allDay: true, choice: "1h", tz }), null);
  assert.equal(reminderChoiceFor(null, true, custom, tz), "custom");
  assert.equal(reminderChoiceFor(null, true, null, tz), "none");
}

// ── Labels ──────────────────────────────────────────────────────────────────
{
  assert.equal(dueLabel(due("2026-10-07", null).dueAt, true, tz, now), "Today");
  assert.equal(dueLabel(due("2026-10-07", "17:00").dueAt, false, tz, now), "Today · 5:00 PM");
  assert.equal(dueLabel(due("2026-10-07", "09:00").dueAt, false, tz, now), "Overdue · Today · 9:00 AM");
  assert.equal(dueLabel(due("2026-10-08", null).dueAt, true, tz, now), "Tomorrow");
  assert.equal(dueLabel(due("2026-10-12", "08:15").dueAt, false, tz, now), "Mon, Oct 12 · 8:15 AM");
  assert.equal(dueLabel(due("2026-10-01", null).dueAt, true, tz, now), "Overdue · Thu, Oct 1");
  assert.equal(dueLabel(due("2027-01-04", null).dueAt, true, tz, now), "Mon, Jan 4, 2027");
  assert.equal(dueLabel(null, true, tz, now), null);
}

// ── Sort inside a group ─────────────────────────────────────────────────────
{
  const mk = (dueAt: Date | null, allDay: boolean, priority: "NORMAL" | "HIGH", createdAt: string) => ({
    dueAt,
    allDay,
    priority,
    createdAt: new Date(createdAt),
  });
  const day = due("2026-10-07", null).dueAt;
  const nineAm = due("2026-10-07", "09:00").dueAt;
  const fivePm = due("2026-10-07", "17:00").dueAt;
  const rows = [
    mk(day, true, "NORMAL", "2026-10-01T00:00:00Z"),
    mk(fivePm, false, "NORMAL", "2026-10-01T00:00:00Z"),
    mk(nineAm, false, "NORMAL", "2026-10-01T00:00:00Z"),
    mk(day, true, "HIGH", "2026-10-01T00:00:00Z"),
    mk(null, true, "HIGH", "2026-10-01T00:00:00Z"),
  ].sort(compareTasks);
  assert.deepEqual(
    rows.map((r) => `${r.dueAt ? (r.allDay ? "day" : dueFields(r.dueAt, false, tz).dueTime) : "none"}/${r.priority}`),
    ["09:00/NORMAL", "17:00/NORMAL", "day/HIGH", "day/NORMAL", "none/HIGH"]
  );
}

console.log("test-tasks: all assertions passed");
