// Relative imports so `npx tsx scripts/test-time-block-recurrence.ts` runs
// without the Next.js path alias.
import { wallTimeToUtc } from "./booking-engine";

/**
 * Repeating blocked time — the pure half. A rule is "these weekdays, this
 * time of day (or all day), from this date, until that date (or forever)",
 * all in the company's timezone. `lib/time-block-series.ts` turns a rule
 * into real TimeBlock rows; nothing in here touches the database.
 *
 * Day keys are "YYYY-MM-DD" and are compared as strings (same length, so
 * lexical order is date order). Weekdays are 0 = Sunday … 6 = Saturday.
 */

/** How far ahead occurrences exist. The cron keeps the horizon topped up. */
export const SERIES_HORIZON_DAYS = 365;
/** The sweep extends a series once fewer than this many days remain. */
export const SERIES_TOPUP_DAYS = 300;

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type SeriesRule = {
  weekdays: number[];
  allDay: boolean;
  /** Minutes since midnight; ignored when allDay */
  startMinute: number;
  endMinute: number;
  startsOn: string;
  /** Last day the rule applies; null = no end */
  endsOn: string | null;
  /** Days removed or detached — never regenerated */
  skipDates: string[];
};

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DAY_KEY_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function dayKeyParts(key: string): { y: number; m: number; d: number } {
  const m = DAY_KEY_RE.exec(key);
  if (!m) throw new Error(`Bad day key: ${key}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function keyOfUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** `key` + n days (negative allowed), as a day key. */
export function addDaysToKey(key: string, n: number): string {
  const { y, m, d } = dayKeyParts(key);
  return keyOfUtc(new Date(Date.UTC(y, m - 1, d + n)));
}

/** 0 = Sunday … 6 = Saturday for a day key. */
export function weekdayOfKey(key: string): number {
  const { y, m, d } = dayKeyParts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Deduped, sorted 0–6; anything else dropped. */
export function sanitizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const v of raw) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export function sanitizeSkipDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isDayKey))].sort().slice(0, 2000);
}

/**
 * Every day in [from, to] (inclusive, both day keys) the rule lands on, in
 * order: on one of its weekdays, on/after startsOn, on/before endsOn, and
 * not skipped.
 */
export function occurrenceDays(rule: SeriesRule, from: string, to: string): string[] {
  if (rule.weekdays.length === 0) return [];
  let start = from > rule.startsOn ? from : rule.startsOn;
  let end = to;
  if (rule.endsOn && rule.endsOn < end) end = rule.endsOn;
  if (start > end) return [];
  const want = new Set(rule.weekdays);
  const skip = new Set(rule.skipDates);
  const out: string[] = [];
  // Cap the walk so a corrupt range can't spin: 3 years of days is plenty
  for (let i = 0; i < 1100; i++) {
    const key = addDaysToKey(start, i);
    if (key > end) break;
    if (want.has(weekdayOfKey(key)) && !skip.has(key)) out.push(key);
  }
  return out;
}

/**
 * The UTC span of one occurrence on `dayKey` in `tz`. All-day follows the
 * existing TimeBlock convention: local midnight to the last millisecond of
 * the day — DST days come out 23 or 25 hours long, which is correct.
 */
export function occurrenceSpan(rule: Pick<SeriesRule, "allDay" | "startMinute" | "endMinute">, dayKey: string, tz: string): { startAt: Date; endAt: Date } {
  const { y, m, d } = dayKeyParts(dayKey);
  if (rule.allDay) {
    return { startAt: wallTimeToUtc(tz, y, m, d, 0), endAt: new Date(wallTimeToUtc(tz, y, m, d + 1, 0).getTime() - 1) };
  }
  return { startAt: wallTimeToUtc(tz, y, m, d, rule.startMinute), endAt: wallTimeToUtc(tz, y, m, d, rule.endMinute) };
}

/** Last day occurrences should exist for, seen from `todayKey`. */
export function horizonEndKey(todayKey: string, endsOn: string | null): string {
  const far = addDaysToKey(todayKey, SERIES_HORIZON_DAYS);
  return endsOn && endsOn < far ? endsOn : far;
}

/** Does `generatedThrough` leave enough runway, or should the sweep extend? */
export function needsTopUp(todayKey: string, generatedThrough: string | null, endsOn: string | null): boolean {
  if (!generatedThrough) return true;
  if (endsOn && generatedThrough >= endsOn) return false;
  return generatedThrough < addDaysToKey(todayKey, SERIES_TOPUP_DAYS);
}

// ─── Words ───────────────────────────────────────────────────────────────────

/** "1:00 PM" */
export function minutesLabel(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const mm = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "Mon, Wed, Fri" / "every weekday" / "every day" / "weekends" */
export function weekdaysLabel(weekdays: number[]): string {
  const days = sanitizeWeekdays(weekdays);
  if (days.length === 7) return "every day";
  if (days.length === 5 && days.join() === "1,2,3,4,5") return "every weekday";
  if (days.length === 2 && days.join() === "0,6") return "weekends";
  return `every ${days.map((d) => DAY_SHORT[d]).join(", ")}`;
}

/** "Dec 20" or "Dec 20, 2027" when not this year. */
export function dayKeyLabel(key: string, todayKey?: string): string {
  const { y, m, d } = dayKeyParts(key);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sameYear = todayKey ? dayKeyParts(todayKey).y === y : true;
  return `${months[m - 1]} ${d}${sameYear ? "" : `, ${y}`}`;
}

/** "Every weekday, 12:00 PM – 1:00 PM, until Dec 20" */
export function describeRule(rule: Pick<SeriesRule, "weekdays" | "allDay" | "startMinute" | "endMinute" | "endsOn">, todayKey?: string): string {
  const days = weekdaysLabel(rule.weekdays);
  const when = rule.allDay ? "all day" : `${minutesLabel(rule.startMinute)} – ${minutesLabel(rule.endMinute)}`;
  const first = days.charAt(0).toUpperCase() + days.slice(1);
  return `${first}, ${when}${rule.endsOn ? `, until ${dayKeyLabel(rule.endsOn, todayKey)}` : ""}`;
}

// ─── Input ───────────────────────────────────────────────────────────────────

export type SeriesInput = {
  weekdays: number[];
  allDay: boolean;
  startMinute: number;
  endMinute: number;
  startsOn: string;
  endsOn: string | null;
};

/** "HH:MM" → minutes, or null. */
function hhmm(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Validate a series body (settings sheet or the schedule's block sheet).
 * Times arrive as "HH:MM" strings (`startTime` / `endTime`); days as keys.
 */
export function parseSeriesInput(body: Record<string, unknown>): { ok: true; rule: SeriesInput } | { ok: false; error: string } {
  const weekdays = sanitizeWeekdays(body.weekdays);
  if (weekdays.length === 0) return { ok: false, error: "Pick at least one day of the week." };
  if (!isDayKey(body.startsOn)) return { ok: false, error: "Pick a start date." };
  const startsOn = body.startsOn;
  let endsOn: string | null = null;
  if (body.endsOn != null && body.endsOn !== "") {
    if (!isDayKey(body.endsOn)) return { ok: false, error: "The end date isn't a valid date." };
    endsOn = body.endsOn;
    if (endsOn < startsOn) return { ok: false, error: "The end date can't be before the start date." };
  }
  const allDay = body.allDay === true;
  let startMinute = 0;
  let endMinute = 24 * 60;
  if (!allDay) {
    const s = hhmm(body.startTime);
    const e = hhmm(body.endTime);
    if (s === null || e === null) return { ok: false, error: "A valid start and end time are required." };
    if (e <= s) return { ok: false, error: "The end time must be after the start time." };
    startMinute = s;
    endMinute = e;
  }
  return { ok: true, rule: { weekdays, allDay, startMinute, endMinute, startsOn, endsOn } };
}
