// Relative import (not "@/lib/...") so `npx tsx scripts/test-booking-slots.ts`
// can run this module without the Next.js path alias.
import { type BusinessHours, DAY_KEYS, timeToMinutes } from "./business-hours";

/**
 * Online-booking slot engine. Pure — callers fetch the bookable users and
 * their existing jobs/appointments; this just does the math, so it's unit-
 * testable (scripts/test-booking-slots.mjs runs against the compiled logic).
 *
 * A slot is an ARRIVAL WINDOW ("Tue Jul 8, 8:00–10:00 AM"), not an exact
 * start: `start` is when the tech could arrive earliest, `windowEnd` is
 * start + arrivalWindowMinutes, and the underlying appointment blocks
 * [start, start + durationMinutes]. Candidate starts step in 30-minute
 * increments inside business hours; a slot is open if at least one bookable
 * user has no overlapping busy interval. All computation happens in the
 * company timezone (DST-safe via Intl), all output Dates are UTC instants.
 */

export type BusyInterval = { start: Date; end: Date };
export type BookableUser = { id: string; busy: BusyInterval[] };

export type Slot = {
  start: Date; // earliest arrival (UTC instant)
  end: Date; // start + durationMinutes — what the appointment blocks
  windowEnd: Date; // start + arrivalWindowMinutes — what the client is promised
  userIds: string[]; // bookable users free for this slot
};

export type SlotEngineInput = {
  timezone: string; // IANA, e.g. "America/Chicago"
  hours: BusinessHours;
  durationMinutes: number;
  arrivalWindowMinutes: number;
  users: BookableUser[];
  now: Date;
  leadHours: number; // earliest offered slot = now + leadHours
  horizonDays: number; // how many days out to offer
  maxPerDay?: number; // cap displayed slots per day (default 6)
};

const STEP_MINUTES = 30;

/** Minutes east of UTC for `tz` at instant `date` (negative for the US). */
function tzOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** UTC instant for a wall-clock time in `tz`. Iterates twice for DST edges. */
export function wallTimeToUtc(
  tz: string,
  y: number,
  month1: number, // 1-based
  d: number,
  minutesOfDay: number
): Date {
  const wall = Date.UTC(y, month1 - 1, d, 0, minutesOfDay);
  let ts = wall;
  for (let i = 0; i < 2; i++) {
    ts = wall - tzOffsetMinutes(tz, new Date(ts)) * 60000;
  }
  return new Date(ts);
}

/** Y/M/D + weekday of an instant, seen from `tz`. */
export function localDayParts(tz: string, date: Date): { y: number; m: number; d: number; day: DayKeyIndex } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  let y = 0, m = 0, d = 0, wd = "Sun";
  for (const part of dtf.formatToParts(date)) {
    if (part.type === "year") y = Number(part.value);
    if (part.type === "month") m = Number(part.value);
    if (part.type === "day") d = Number(part.value);
    if (part.type === "weekday") wd = part.value;
  }
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { y, m, d, day: (idx < 0 ? 0 : idx) as DayKeyIndex };
}

type DayKeyIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function overlaps(aStart: Date, aEnd: Date, b: BusyInterval): boolean {
  return aStart < b.end && b.start < aEnd;
}

export function generateSlots(input: SlotEngineInput): Slot[] {
  const {
    timezone,
    hours,
    durationMinutes,
    arrivalWindowMinutes,
    users,
    now,
    leadHours,
    horizonDays,
    maxPerDay = 6,
  } = input;
  if (durationMinutes <= 0 || users.length === 0) return [];

  const earliest = new Date(now.getTime() + leadHours * 3600000);
  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
    // Walk days by adding 24h to noon-now, then reading the local Y/M/D —
    // immune to DST days being 23/25 hours long.
    const probe = new Date(now.getTime() + dayOffset * 86400000);
    const { y, m, d, day } = localDayParts(timezone, probe);
    const ranges = hours[DAY_KEYS[day]] ?? [];
    const daySlots: Slot[] = [];

    for (const range of ranges) {
      const startMin = timeToMinutes(range.start);
      const endMin = timeToMinutes(range.end);
      if (startMin === null || endMin === null) continue;

      for (let t = startMin; t + durationMinutes <= endMin; t += STEP_MINUTES) {
        const start = wallTimeToUtc(timezone, y, m, d, t);
        if (start < earliest) continue;
        const end = new Date(start.getTime() + durationMinutes * 60000);
        const free = users.filter((u) => !u.busy.some((b) => overlaps(start, end, b)));
        if (free.length === 0) continue;
        daySlots.push({
          start,
          end,
          windowEnd: new Date(start.getTime() + arrivalWindowMinutes * 60000),
          userIds: free.map((u) => u.id),
        });
      }
    }

    // Cap what we show per day by sampling EVENLY across the open slots —
    // taking the first N would only ever offer mornings on a 8am–9pm day.
    if (daySlots.length <= maxPerDay) {
      slots.push(...daySlots);
    } else {
      for (let i = 0; i < maxPerDay; i++) {
        const idx = Math.round((i * (daySlots.length - 1)) / (maxPerDay - 1));
        slots.push(daySlots[idx]);
      }
    }
  }

  return slots;
}

/**
 * Re-check a single slot at submit time (inside the transaction) so two
 * clients grabbing the same window can't both win. Returns the chosen user
 * id — the free user with the fewest busy intervals, spreading bookings —
 * or null if the slot was lost.
 */
export function pickUserForSlot(start: Date, end: Date, users: BookableUser[]): string | null {
  const free = users
    .filter((u) => !u.busy.some((b) => overlaps(start, end, b)))
    .sort((a, b) => a.busy.length - b.busy.length);
  return free[0]?.id ?? null;
}
