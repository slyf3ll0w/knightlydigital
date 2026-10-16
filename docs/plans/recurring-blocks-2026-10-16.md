# Repeating blocked time + custom address question — 2026-10-16

David's ask: "add a way to create recurring events on Workbench? so instead of
setting your business hours, you can look busy on booking forms for times
you're not available. also, can we make it so the Service Address question on
service booking forms can be customized?"

Decisions (AskUserQuestion, 2026-10-16): repeating blocks live in BOTH the
Schedule's Block Off Time sheet and a list under Settings → Booking & forms →
Scheduling rules; round one is weekly on chosen days (no every-N-weeks, no
monthly); the address question gets a custom label + placeholder (the helper
line under the box stays).

## How it works

- **`TimeBlockSeries`** (prisma) holds the rule: weekdays (0 = Sun), all day
  or `startMinute`/`endMinute`, `startsOn`, optional `endsOn`, `skipDates`,
  title, who (`userId` null = everyone), optional where. `TimeBlock.seriesId`
  links each generated day; the series cascades its rows on delete.
- **Materialized, not expanded.** `lib/time-block-series.ts` writes ordinary
  `TimeBlock` rows a year ahead (`materializeSeries`, idempotent by day).
  Every existing reader of blocked time — calendar, booking engine, Find a
  Time, conflicts, routing, calendar feed, Google push — needed no change.
  The hourly cron step `timeBlockSeries` (`runTimeBlockSeriesSweep`) extends
  a series once fewer than 300 days remain.
- **Rule math** is pure in `lib/time-block-recurrence.ts` (day keys,
  `occurrenceDays`, `occurrenceSpan` in the company zone, `describeRule`,
  `parseSeriesInput`) — `npx tsx scripts/test-time-block-recurrence.ts`.
- **Just this day.** Editing or dragging one occurrence detaches it
  (`seriesId` → null, the day joins `skipDates`); removing one occurrence
  deletes it and skips the day. Changing the rule deletes the rows still
  ahead and rebuilds (`regenerateSeries`); past rows and detached days stay.
- **API**: `GET/POST /api/app/time-block-series`,
  `PATCH/DELETE /api/app/time-block-series/[id]` (same permissions as blocks:
  self for everyone, anyone / the whole company for owners and admins).
  `PATCH /api/app/time-blocks/[id]` on an occurrence answers `detached: true`.
- **UI**: `components/RepeatPicker.tsx` (day chips + Until),
  `components/RepeatingBlockSheet.tsx` (the series editor),
  `components/RepeatingBlocksList.tsx` (Settings list). The Schedule's block
  sheet gains "Repeats every week" when creating; opening a day of a series
  shows the rule with **Edit every time**, and Remove splits into **This day**
  / **Every time**.
- **Address question**: `StdField.placeholder` (address only) in
  `lib/booking-intake.ts`, `ADDRESS_DEFAULTS` for the fallbacks. The stepper's
  address step and the request form read the label + placeholder; the item
  editor's Address row edits both (scheduled visits too, where the field
  used to be a fixed note).

## Test recipes (David)

Repeating blocks — Schedule
1. Schedule → **Block off time** → reason "Lunch", 12:00–1:00 PM, tick
   **Repeats every week**, leave the day chips as they are (today's weekday is
   pre-picked), add Mon–Fri → **Block every week**. Expect: a toast naming the
   rule, striped Lunch blocks on every weekday for the next year.
2. Open a booking page for a visit/service item → pick a weekday → 12:00
   and 12:30 are gone (the 1:00 slot may stay, depending on buffers).
3. Open one Lunch block → sheet shows "Every weekday, 12:00 PM – 1:00 PM"
   with **Edit every time**. Change the reason to "Dentist" → Save → toast
   "Changed just this day"; only that day is renamed.
4. Open another Lunch block → **This day** removes only that day.
5. Open another → **Edit every time** → change To 1:30 PM → Save. Expect:
   every future Lunch runs 12–1:30, the Dentist day and the removed day stay
   as they were.
6. Drag a Lunch block to another hour → toast "Moved Lunch (just this day)".
7. Open any Lunch → **Every time** → confirm → all Lunch blocks gone.
8. Phone: the same sheet is a bottom sheet; the seven day chips fit on one
   row at 375 px.

Repeating blocks — Settings
9. Settings → Booking & forms → Scheduling rules → under Business hours:
   **Repeating blocks** → **Add** → "Church", Sun, all day → Add. Row reads
   "Church · Every Sun, all day · Me" (owner: "Everyone" when Who = everyone).
10. Tap the row → set **Until** six weeks out → Save. Sunday blocks stop
    after that date.
11. Row → **Remove** → confirm → row and blocks gone.
12. Team member (TECH) signs in: Schedule block sheet lets them repeat their
    own time; a company-wide series shows read-only.

Address question
13. Settings → Booking & forms → a scheduled visit or service item →
    Questions → Address: type "Where should we come?" and example text
    "Street, city, ZIP" → the preview's address step shows both.
14. A request-mode visit item: Address row shows the same example-text box
    under the label; the request form uses it.
15. Clear both → the defaults ("Service address" / "123 Main St, Plano, TX
    75024") come back.

## Status

- 2026-10-16: built on branch `recurring-blocks` (worktree
  `~/knightlydigital-wt/recurring-blocks`). tsc + 48/48 unit tests green;
  e2e `schedule-tools` gained a series test. **Needs `db:push`** (new model +
  column) — `db:predeploy` handles it on Railway. Not yet pushed.
