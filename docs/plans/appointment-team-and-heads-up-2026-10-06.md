# Appointments for several people + end follows start + live heads-up — 2026-10-06

David's ask: appointments for more than one person; when the start time
moves, the end keeps the meeting's length; warn about conflicts, drive
time included. His answers: **team members** (not clients), warning
**live before saving**, **road time with an estimate fallback**, and the
end rule for **appointments and jobs**.

## What changed

- **Several team members per appointment.** `Appointment.assignedToId`
  stays the lead person; everyone else is an `AppointmentAssignee` row
  (additive table, `db:push` on deploy, no backfill). `lib/appointment-people.ts`
  holds the where-helpers and the write. New Appointment and the
  appointment's Edit dialog use a tick list (`components/PeoplePicker.tsx`).
  Every extra person: sees it (appointmentScope), has it on the Schedule
  (+ By-tech lane and team filter), in calendar sync, blocks their
  online-booking times, counts in Routes / Optimize / Move the day, gets
  the 1-hour heads-up push. Lists show "Name +1". Techs still can't be
  put on an appointment (they can't open appointment pages).
- **End follows start.** Changing the start keeps the length
  (`endFollowingStart` in lib/scheduling.ts, unit-tested): New
  Appointment, appointment Reschedule, New Job, the job page's Schedule
  card. No length yet → 30 min (appointments) / price-book duration or
  1 hour (jobs).
- **Live heads-up** (`components/ScheduleHeadsUp.tsx` →
  `POST /api/app/schedule/check`): as soon as the time or people change, a
  box under the time fields lists overlaps (`lib/schedule-conflicts.ts`,
  now counting extra people) and, for in-person appointments and jobs,
  drive-time problems (`lib/schedule-drive.ts`): each person's nearest
  on-site stop before and after within 8 hours; "drives 25 min from Job
  #12 …, so they'd be 10 min late here" / "… late there". Road minutes
  from the leg cache or one Directions call (Mapbox budget), else a
  straight-line estimate worded "about". Never blocks the save; the old
  after-save overlap pop-up is gone from those four screens (calendar
  drag keeps its own).

## Test recipes

1. New Appointment → tick yourself and a teammate → save. The page shows
   both names; the Appointments list shows "You +1".
2. Schedule → Day → By tech: the appointment is in both people's columns.
   Filter to the teammate: it's there.
3. Sign in as the teammate (Sales role): they can open it; it's in their
   calendar sync after a sync.
4. On the appointment, Edit → untick the teammate → Save → only you.
5. New Appointment → set start 9:00 (end fills 9:30) → change end to
   10:00 → change start to 1:00 PM → end reads **2:00 PM**. Change the
   date → end moves to the same day.
6. Same on Reschedule of an existing 1-hour appointment, on New Job, and
   on a job page's Schedule card.
7. Put an appointment at a time someone already has a job → a yellow
   "Heads up" box appears under the times naming the job, before saving.
   Save still works.
8. Drive time: give a tech a job 10:00–11:00 across town, then schedule an
   in-person appointment for them at 11:05 nearby-the-other-side → the box
   says they'd be N min late. Move it to 12:00 → the line goes away.
9. A phone/video appointment never shows drive lines.
10. Book online (booking page) at a time a teammate is extra on → that
    slot is not offered for them.
