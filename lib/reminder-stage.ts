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
 * 10:20). Every route that moves a start writes rescheduleReminderStamps():
 * `rescheduledAt = now` and both sent stamps cleared. The anchor
 * (bookingAnchor) is the later of createdAt and rescheduledAt, so a move to
 * later today has no day-ahead lead (no day text) and a move to 45 minutes
 * out is reminded 20 minutes later, exactly like a fresh booking. The sent
 * stamps stay what their names say — a reminder actually went out — because
 * the Route Manager locks a stop on them and the appointment page prints
 * them (an earlier cut faked the day stamp on a move and both read it as
 * "the client was reminded").
 *
 * The sweep runs every REMINDER_TICK_MS (instrumentation.ts) with the hourly
 * cron as the backstop, so the hour stage lands 60–70 min out whatever
 * minute the appointment starts (a 10:30 call is reminded at ~9:25, not at
 * 10:00). Quiet hours (8 AM–9 PM company-local, texts only) can push either
 * stage later; the day stage still fires any time down to 2 h out, the
 * hour stage any time before the start.
 */

import { zonedParts } from "@/lib/timezone";

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
 * When the booking was last placed: createdAt, or the later move
 * (Appointment/Job.rescheduledAt — see the header).
 */
export function bookingAnchor(createdAt: Date, rescheduledAt: Date | null | undefined): Date {
  return rescheduledAt && rescheduledAt.getTime() > createdAt.getTime() ? rescheduledAt : createdAt;
}

/**
 * Stamp values for a booking whose start just moved (appointment and job
 * PATCH, the client's manage link, Move the day, route optimize): the move
 * is recorded and both stages re-arm for the new time — the stage rule
 * then measures from the move. A start cleared to null (job unscheduled)
 * forgets the move too.
 */
export function rescheduleReminderStamps(
  now: Date,
  newStart: Date | null
): { rescheduledAt: Date | null; reminderDaySentAt: null; reminderHourSentAt: null } {
  return { rescheduledAt: newStart ? now : null, reminderDaySentAt: null, reminderHourSentAt: null };
}

export function reminderStage(input: {
  now: Date;
  scheduledAt: Date;
  createdAt: Date;
  /** The last move, if any (rescheduleReminderStamps). */
  rescheduledAt?: Date | null;
  daySentAt: Date | null;
  hourSentAt: Date | null;
}): ReminderStage | null {
  const msUntil = input.scheduledAt.getTime() - input.now.getTime();
  if (msUntil <= 0) return null;
  const bookedAt = bookingAnchor(input.createdAt, input.rescheduledAt);
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
  /** The last move, so a reschedule counts as the booking time. */
  rescheduledAt?: Date | null;
}): "too-close" | "pending" | "past" {
  const msUntil = input.scheduledAt.getTime() - input.now.getTime();
  if (msUntil <= 0) return "past";
  // The booking will start before it is old enough to be reminded about.
  const leadMs = input.scheduledAt.getTime() - bookingAnchor(input.createdAt, input.rescheduledAt).getTime();
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

/**
 * When the quiet-hours stretch `at` falls in ends: 8:00 AM company-local,
 * that morning (an early-hours `at`) or the next (an evening one). The sweep
 * leaves a stage unclaimed while texts are paused and sends on its first
 * tick after this, so a text-only hour reminder for a start later than this
 * still goes out — just at 8 AM. Only meaningful when inSmsQuietHours(at).
 */
export function smsQuietHoursEnd(at: Date, timeZone: string): Date {
  const p = zonedParts(timeZone, at);
  const day = p.hour >= 21 ? p.d + 1 : p.d; // Date.UTC carries a month overflow
  // Local wall clock read as UTC, then corrected by the zone's offset at that
  // moment; a second pass settles a DST switch that morning.
  const want = Date.UTC(p.y, p.m - 1, day, 8, 0, 0);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const q = zonedParts(timeZone, new Date(guess));
    const seen = Date.UTC(q.y, q.m - 1, q.d, q.hour, q.minute, 0);
    if (seen === want) break;
    guess += want - seen;
  }
  return new Date(guess);
}
