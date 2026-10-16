/**
 * The day chips on the job and appointment forms: Today, Tomorrow, then the
 * next few days by name ("Mon 20"). Pure date math in the browser's local
 * time, which is what the forms' date inputs already use. Unit-tested in
 * scripts/test-day-chips.ts.
 */

export type DayChoice = { value: string; label: string };

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date → its local "YYYY-MM-DD". */
export function localDateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-10-20" → the local Date at noon that day (noon dodges DST edges). */
export function dateFromValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/**
 * Today, Tomorrow, then `count - 2` more days as "Mon 20". Seven chips by
 * default: a week ahead covers nearly every job someone books by hand.
 */
export function dayChoices(now: Date = new Date(), count = 7): DayChoice[] {
  const out: DayChoice[] = [];
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 12);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${DAY[d.getDay()]} ${d.getDate()}`;
    out.push({ value: localDateValue(d), label });
  }
  return out;
}

/** A date outside the chips, as its own chip label: "Fri, Oct 31". */
export function otherDayLabel(value: string): string {
  const d = dateFromValue(value);
  if (!d) return "";
  return `${DAY[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`;
}
