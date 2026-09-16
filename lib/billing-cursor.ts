/**
 * Pure cursor math for the recurring engine — billing cycles (nextRunDate)
 * and visit cadences (nextVisitDate). No DB, no imports beyond Prisma's enum
 * types, so lib/payments.ts can use it without an import cycle and
 * scripts/test-subscriptions.ts can exercise it without a database.
 */

import type { Frequency, RecurringInterval } from "@prisma/client";

const DAY_MS = 86400000;

/**
 * Add N calendar months, clamping the day-of-month to the target month's length
 * so month-end anchors don't overflow. Plain `setMonth(+1)` on Jan 31 rolls to
 * "Feb 31" → Mar 3, silently skipping February and drifting the anchor forever;
 * this keeps Jan 31 → Feb 28/29, Mar 31 → Apr 30, etc. Time-of-day is preserved.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const targetDay = d.getDate();
  d.setDate(1); // avoid transient overflow while shifting the month
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return d;
}

/** Add one billing interval to a date. SEMIANNUAL = +6 months ("biannually"). */
export function addInterval(date: Date, interval: RecurringInterval): Date {
  switch (interval) {
    case "MONTHLY":
      return addMonthsClamped(date, 1);
    case "QUARTERLY":
      return addMonthsClamped(date, 3);
    case "SEMIANNUAL":
      return addMonthsClamped(date, 6);
    case "ANNUAL":
      // +12 months (not setFullYear) so Feb 29 clamps to Feb 28 next year
      return addMonthsClamped(date, 12);
  }
}

/**
 * Advance a billing cursor by whole intervals until it's out of the past —
 * used when resuming a paused/cancelled series so the client isn't
 * retro-billed one full cycle per sweep for the time the series sat paused.
 * Keeps the original anchor day (day-of-month) rather than re-anchoring.
 */
export function rollCursorForward(
  cursor: Date,
  interval: RecurringInterval,
  from: Date = new Date()
): Date {
  let next = cursor;
  while (next < from) next = addInterval(next, interval);
  return next;
}

/**
 * The cursor a billing cycle leaves behind once it has been generated. One
 * interval past the date the cycle was due — but never still in the past: a
 * cursor that sat through a cron outage bills ONE catch-up cycle and then
 * lands on its next future occurrence, instead of one back-dated cycle per
 * hourly tick until it catches up.
 */
export function cursorAfterCycle(
  dueAt: Date,
  interval: RecurringInterval,
  now: Date
): Date {
  return rollCursorForward(addInterval(dueAt, interval), interval, now);
}

/**
 * A first payment within this many days of the cycle start re-anchors the
 * plan to the day it was paid; a later payment is a late payment for a cycle
 * already delivered and keeps the plan's existing cursor.
 */
export const ANCHOR_GRACE_DAYS = 7;

/**
 * Where a plan's cursor goes when its first payment succeeds.
 *
 * Plans mint their first invoice at signup with the cursor one interval out.
 * When the client pays on (or within a week of) signup, "the day you paid"
 * becomes the plan's billing day — the cursor moves to that day-of-month
 * one interval out, rolled forward past `now` for backdated payments. When
 * the payment lands later than that, the cycle the invoice covered has
 * already run: re-anchoring to the pay day would skip everything between the
 * existing cursor and the new one (Sep 1 plan paid Sep 28 → next bill Oct 28,
 * Oct 1–27 never billed), so the cursor stays put and only `anchoredAt` is
 * stamped. A past cursor is left for the sweep's catch-up (cursorAfterCycle).
 */
export function anchoredNextRunDate(params: {
  paidAt: Date;
  interval: RecurringInterval;
  currentCursor: Date | null;
  now: Date;
}): { anchor: Date; next: Date } {
  const anchor = new Date(params.paidAt);
  anchor.setHours(12, 0, 0, 0); // noon-anchored like every engine date
  let paidNext = addInterval(anchor, params.interval);
  while (paidNext < params.now) paidNext = addInterval(paidNext, params.interval);

  const cursor = params.currentCursor;
  if (!cursor || paidNext.getTime() <= cursor.getTime() + ANCHOR_GRACE_DAYS * DAY_MS) {
    return { anchor, next: paidNext };
  }
  return { anchor, next: cursor };
}

/** Add one visit-cadence step. Weekly/biweekly are exact-day; the rest clamp. */
export function addVisitInterval(date: Date, frequency: Frequency): Date {
  switch (frequency) {
    case "WEEKLY":
      return new Date(date.getTime() + 7 * DAY_MS);
    case "BIWEEKLY":
      return new Date(date.getTime() + 14 * DAY_MS);
    case "MONTHLY":
      return addMonthsClamped(date, 1);
    case "QUARTERLY":
      return addMonthsClamped(date, 3);
    case "ANNUALLY":
      return addMonthsClamped(date, 12);
  }
}

/**
 * Visit cursor after a pause/cancel deleted the not-yet-worked future
 * visits: the earliest deleted visit's date, so a resume re-materializes
 * from where the calendar was cut rather than from the ~4-weeks-ahead point
 * the generator had already reached (which left a hole until then).
 */
export function rewoundVisitCursor(
  current: Date | null,
  earliestDeleted: Date | null
): Date | null {
  if (!earliestDeleted) return current;
  if (!current || earliestDeleted < current) return earliestDeleted;
  return current;
}

/**
 * Visit cursor on resume/edit: roll a stale date forward on-cadence so the
 * series keeps its weekday instead of dumping missed visits into the past.
 */
export function resumedVisitCursor(cursor: Date, frequency: Frequency, todayStart: Date): Date {
  let rolled = cursor;
  while (rolled < todayStart) rolled = addVisitInterval(rolled, frequency);
  return rolled;
}
