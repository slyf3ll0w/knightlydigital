/**
 * Siri's "my next job" — the pick over the day's list must agree with the
 * dashboard's Up next hero (today's anytime work first, then the first stop
 * that hasn't started), and the spoken time must honour the job's own
 * anytime flag. Run: npx tsx scripts/test-next-job.ts
 */
import assert from "node:assert/strict";
import { pickNextJob, spokenWhen, timeLabel } from "../lib/next-job";

const at = (iso: string) => new Date(iso);
const tz = "America/Chicago";
// 2026-10-07, company day starts 05:00Z (CDT)
const dayStart = at("2026-10-07T05:00:00Z");

{
  const nine = { id: "nine", scheduledAt: at("2026-10-07T14:00:00Z"), scheduledAnytime: false };
  const four = { id: "four", scheduledAt: at("2026-10-07T21:00:00Z"), scheduledAnytime: false };
  const anytime = { id: "any", scheduledAt: at("2026-10-07T17:00:00Z"), scheduledAnytime: true };
  const tomorrow = { id: "tmrw", scheduledAt: at("2026-10-08T14:00:00Z"), scheduledAnytime: false };
  const tomorrowAnytime = { id: "tmrw-any", scheduledAt: at("2026-10-08T17:00:00Z"), scheduledAnytime: true };

  // 3 PM: the 9 AM job is still open but its time has passed — the 4 PM stop is next
  assert.equal(pickNextJob([nine, four, tomorrow], at("2026-10-07T20:00:00Z"), dayStart)?.id, "four", "a passed stop is never 'next'");
  // 8 AM: the 9 AM job is next
  assert.equal(pickNextJob([nine, four], at("2026-10-07T13:00:00Z"), dayStart)?.id, "nine", "first stop still ahead");
  // Today's anytime work comes first whatever the clock says
  assert.equal(pickNextJob([nine, anytime, four], at("2026-10-07T20:00:00Z"), dayStart)?.id, "any", "anytime today beats a timed stop");
  assert.equal(pickNextJob([nine, anytime, four], at("2026-10-07T13:00:00Z"), dayStart)?.id, "any", "…even in the morning (the dashboard's rule)");
  // Day done: tomorrow's first job, timed or anytime
  assert.equal(pickNextJob([nine, four, tomorrow], at("2026-10-07T23:00:00Z"), dayStart)?.id, "tmrw", "today over: tomorrow's job");
  assert.equal(pickNextJob([nine, tomorrowAnytime], at("2026-10-07T23:00:00Z"), dayStart)?.id, "tmrw-any", "tomorrow's anytime job counts as upcoming");
  assert.equal(pickNextJob([nine], at("2026-10-07T23:00:00Z"), dayStart), null, "nothing ahead: nothing");
}

{
  // Spoken time: the job's own flag, not a noon heuristic
  const noon = at("2026-10-07T17:00:00Z"); // 12:00 pm Chicago
  assert.equal(timeLabel(noon, tz), "12 pm", "a real noon job reads as 12 pm");
  assert.equal(spokenWhen(noon, tz, at("2026-10-07T13:00:00Z")), "today at 12 pm", "timed noon job");
  assert.equal(spokenWhen(noon, tz, at("2026-10-07T13:00:00Z"), true), "anytime today", "anytime job");
  // An anytime job anchored from a browser in another zone (11 am Chicago) is still anytime
  assert.equal(spokenWhen(at("2026-10-07T16:00:00Z"), tz, at("2026-10-07T13:00:00Z"), true), "anytime today", "anchor time never leaks");
  assert.equal(spokenWhen(at("2026-10-08T14:30:00Z"), tz, at("2026-10-07T13:00:00Z")), "tomorrow at 9:30 am", "tomorrow");
  assert.equal(spokenWhen(null, tz), "not scheduled yet");
}

console.log("test-next-job: all assertions passed");
