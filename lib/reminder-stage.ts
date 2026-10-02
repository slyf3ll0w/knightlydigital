/**
 * Client reminder stages — the pure rule behind lib/reminders.ts (appointments
 * and job visits share it). Unit-tested in scripts/test-reminder-copy.ts.
 *
 * Two stages, each sent once:
 *   day  — about a day ahead. Fires once the start is ≤ 24 h away, as long
 *          as the booking EXISTED a day ahead (createdAt ≤ start − 24 h). A
 *          booking made this morning for this afternoon already got its
 *          confirmation; a "reminder" minutes later read as nagging.
 *   hour — about an hour ahead. Fires once the start is ≤ HOUR_STAGE_MS away,
 *          again only for bookings made more than that far ahead.
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
/** How often the in-process reminder ticker runs. */
export const REMINDER_TICK_MS = 5 * 60_000;

export type ReminderStage = "day" | "hour";

export function reminderStage(input: {
  now: Date;
  scheduledAt: Date;
  createdAt: Date;
  daySentAt: Date | null;
  hourSentAt: Date | null;
}): ReminderStage | null {
  const msUntil = input.scheduledAt.getTime() - input.now.getTime();
  if (msUntil <= 0) return null;
  const leadMs = input.scheduledAt.getTime() - input.createdAt.getTime();

  if (!input.hourSentAt && msUntil <= HOUR_STAGE_MS && leadMs > HOUR_STAGE_MS) return "hour";
  if (
    !input.daySentAt &&
    msUntil <= DAY_STAGE_MS &&
    msUntil > DAY_STAGE_FLOOR_MS &&
    leadMs > DAY_STAGE_MS
  )
    return "day";
  return null;
}

/** 8 AM–9 PM company-local: outside it no text goes out (email is fine anytime). */
export function inSmsQuietHours(now: Date, timeZone: string): boolean {
  const localHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now)
  );
  return localHour < 8 || localHour >= 21;
}
