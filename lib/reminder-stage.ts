/**
 * Client reminder stages — the pure rule behind lib/reminders.ts (appointments
 * and job visits share it). Unit-tested in scripts/test-reminder-copy.ts.
 *
 * Two stages, each sent once:
 *   day  — about a day ahead. Fires once the start is ≤ 24 h away, as long
 *          as the booking EXISTED a day ahead (createdAt ≤ start − 24 h). A
 *          booking made this morning for this afternoon already got its
 *          confirmation; a "reminder" minutes later read as nagging.
 *   hour — about an hour ahead. Fires once the start is ≤ HOUR_STAGE_MS away
 *          and the booking is at least MIN_BOOKING_AGE_MS old. The age floor
 *          is what stops a reminder landing minutes after the booking itself
 *          (the confirmation, or the phone call that made it, IS the
 *          reminder then); it is NOT a lead-time rule, so an appointment
 *          booked by staff 45 minutes ahead still gets its hour reminder —
 *          a manually created appointment sends no confirmation, so without
 *          this the client would hear nothing at all while the assignee's
 *          heads-up push (which has no such rule) still fired.
 *
 * Both rules measure from when the booking was LAST placed, not only from
 * createdAt: a reschedule is a new booking as far as the client is
 * concerned (an appointment made last week and moved to "later today" at
 * 10 AM must not get the day-before text at 10:05 and the hour text at
 * 10:20). There is no reschedule column; instead every route that moves a
 * start writes rescheduleReminderStamps(), which clears the hour stamp and
 * sets the day stamp to "now" when the new start is inside DAY_STAGE_MS.
 * That stamp both skips the day stage (the booking did not exist a day
 * ahead at this time, same as a same-day booking) and is the age anchor for
 * the hour stage, so a move to 45 minutes out is reminded 20 minutes later
 * exactly like a fresh 45-minutes-out booking. A day stamp written by a
 * real send is always 2+ h before the start, so using it as the anchor
 * never delays a normal hour reminder.
 *
 * The sweep runs every REMINDER_TICK_MS (instrumentation.ts) with the hourly
 * cron as the backstop, so the hour stage lands 60–70 min out whatever
 * minute the appointment starts (a 10:30 call is reminded at ~9:25, not at
 * 10:00). Quiet hours (8 AM–9 PM company-local, texts only) can push either
 * stage later; the day stage still fires any time down to 2 h out, the
 * hour stage any time before the start.
 */

export const HOUR_STAGE_MS = 70 * 60_000;
export const DAY_STAGE_MS = 24 * 3_600_000;
/** Day stage is not worth sending inside this — the hour stage covers it. */
export const DAY_STAGE_FLOOR_MS = 2 * 3_600_000;
/** The hour stage never fires inside this long after the booking was made. */
export const MIN_BOOKING_AGE_MS = 20 * 60_000;
/** How often the in-process reminder ticker runs. */
export const REMINDER_TICK_MS = 5 * 60_000;

export type ReminderStage = "day" | "hour";

/**
 * When the booking was last placed: createdAt, or the later day stamp a
 * reschedule wrote (see the header). A day stamp from a real send is older
 * than any start it could delay, so it is harmless as an anchor.
 */
export function bookingAnchor(createdAt: Date, daySentAt: Date | null | undefined): Date {
  return daySentAt && daySentAt.getTime() > createdAt.getTime() ? daySentAt : createdAt;
}

/**
 * Stamp values for a booking whose start just moved (appointment and job
 * PATCH, the client's manage link, Move the day, route optimize). The hour
 * stage re-arms; the day stage is skipped when the new start is already
 * inside a day, and that stamp anchors the hour stage's age floor. A start
 * cleared to null (job unscheduled) resets both.
 */
export function rescheduleReminderStamps(
  now: Date,
  newStart: Date | null
): { reminderDaySentAt: Date | null; reminderHourSentAt: null } {
  const insideDay = newStart != null && newStart.getTime() - now.getTime() <= DAY_STAGE_MS;
  return { reminderDaySentAt: insideDay ? now : null, reminderHourSentAt: null };
}

export function reminderStage(input: {
  now: Date;
  scheduledAt: Date;
  createdAt: Date;
  daySentAt: Date | null;
  hourSentAt: Date | null;
}): ReminderStage | null {
  const msUntil = input.scheduledAt.getTime() - input.now.getTime();
  if (msUntil <= 0) return null;
  const bookedAt = bookingAnchor(input.createdAt, input.daySentAt);
  const leadMs = input.scheduledAt.getTime() - bookedAt.getTime();
  const ageMs = input.now.getTime() - bookedAt.getTime();

  if (!input.hourSentAt && msUntil <= HOUR_STAGE_MS && ageMs >= MIN_BOOKING_AGE_MS) return "hour";
  if (
    !input.daySentAt &&
    msUntil <= DAY_STAGE_MS &&
    msUntil > DAY_STAGE_FLOOR_MS &&
    leadMs > DAY_STAGE_MS
  )
    return "day";
  return null;
}

/**
 * Why a future booking has no reminder yet — for the appointment page, so a
 * missing text explains itself instead of looking like a dropped send.
 */
export function reminderOutlook(input: {
  now: Date;
  scheduledAt: Date;
  createdAt: Date;
  /** Pass the day stamp so a reschedule counts as the booking time. */
  daySentAt?: Date | null;
}): "too-close" | "pending" | "past" {
  const msUntil = input.scheduledAt.getTime() - input.now.getTime();
  if (msUntil <= 0) return "past";
  // The booking will start before it is old enough to be reminded about.
  const leadMs = input.scheduledAt.getTime() - bookingAnchor(input.createdAt, input.daySentAt).getTime();
  if (leadMs < MIN_BOOKING_AGE_MS) return "too-close";
  return "pending";
}

/** 8 AM–9 PM company-local: outside it no text goes out (email is fine anytime). */
export function inSmsQuietHours(now: Date, timeZone: string): boolean {
  const localHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now)
  );
  return localHour < 8 || localHour >= 21;
}
