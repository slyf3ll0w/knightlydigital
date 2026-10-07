/** Send later — what the action bars show after scheduling (client-safe, no Prisma). */

export type ScheduleWarning = "past" | "expires_first" | "unreachable";

export const SCHEDULE_WARNING_TEXT: Record<ScheduleWarning, string> = {
  past: "That time has already passed, so it will go out within the next few minutes.",
  expires_first: "This quote expires before that time. Extend the expiry or pick an earlier time.",
  unreachable: "The client has no email or textable phone on file yet, so this will fail unless one is added first.",
};

/**
 * Tomorrow's calendar day (YYYY-MM-DD) in `timeZone` — the Send later
 * default. The server parses that date in the company's zone, so "tomorrow"
 * must be the company's tomorrow, not the browser's (a day ahead for someone
 * travelling east late in the evening → today 9:00 → immediate send).
 * Falls back to the browser's day with no / an unknown zone.
 */
export function tomorrowISO(timeZone?: string, now: Date = new Date()): string {
  if (timeZone) {
    try {
      // Today's wall-clock date in the zone, then + 1 day via UTC arithmetic
      // (no DST drift from adding 24 hours)
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      const y = get("year");
      const m = get("month");
      const d = get("day");
      if (y && m && d) return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    } catch {
      // unknown zone id → browser day below
    }
  }
  const d = new Date(now.getTime() + 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
