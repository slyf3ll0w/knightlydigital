/**
 * IANA timezone validation, shared by Settings (where the company edits it)
 * and signup (where the browser's zone is captured so a company in Denver
 * doesn't run its reminders, booking slots, and arrival windows on Central
 * time until someone finds the setting).
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The signed-up-from browser's zone, or null when it can't be told. */
export function browserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz !== "UTC" ? tz : null;
  } catch {
    return null;
  }
}

/**
 * Wall-clock parts of an instant as seen from `tz`. The server runs on UTC
 * (Railway), so anything that says "today", "this morning" or "this month"
 * to a company has to go through here rather than Date's local getters.
 */
export function zonedParts(
  tz: string,
  date: Date
): { y: number; m: number; d: number; hour: number; minute: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let y = 0, m = 0, d = 0, wd = "Sun", hour = 0, minute = 0;
  for (const part of dtf.formatToParts(date)) {
    if (part.type === "year") y = Number(part.value);
    else if (part.type === "month") m = Number(part.value);
    else if (part.type === "day") d = Number(part.value);
    else if (part.type === "weekday") wd = part.value;
    else if (part.type === "hour") hour = Number(part.value) % 24;
    else if (part.type === "minute") minute = Number(part.value);
  }
  const weekday = Math.max(0, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd));
  return { y, m, d, hour, minute, weekday };
}

/** The instant of local midnight on the calendar day `y-m-d` in `tz`. */
export function zonedMidnight(tz: string, y: number, m: number, d: number): Date {
  // Start from that wall-clock time read as UTC, then subtract the zone's
  // offset at that moment; one more pass settles a DST edge on the day.
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(tz, new Date(guess));
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, 0);
    const want = Date.UTC(y, m - 1, d, 0, 0, 0);
    if (seen === want) break;
    guess += want - seen;
  }
  return new Date(guess);
}

/** Local midnight of the day `date` falls on in `tz`. */
export function startOfDayIn(tz: string, date: Date): Date {
  const p = zonedParts(tz, date);
  return zonedMidnight(tz, p.y, p.m, p.d);
}

/** Local midnight of the 1st of the month `date` falls in, in `tz`. */
export function startOfMonthIn(tz: string, date: Date): Date {
  const p = zonedParts(tz, date);
  return zonedMidnight(tz, p.y, p.m, 1);
}

/** Local midnight of the Sunday starting the week `date` falls in, in `tz`. */
export function startOfWeekIn(tz: string, date: Date): Date {
  const p = zonedParts(tz, date);
  // Date.UTC normalises a day of 0 or below into the previous month.
  return zonedMidnight(tz, p.y, p.m, p.d - p.weekday);
}
