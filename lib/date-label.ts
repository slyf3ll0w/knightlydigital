/**
 * What a date / time box reads on a phone (components/DateField.tsx): the
 * native control's own text is hidden there and this label sits over it, so
 * an empty box says "Pick a date" instead of collapsing, and a filled one
 * reads "Mon, Oct 20" instead of "10/20/2026". Pure; unit-tested in
 * scripts/test-date-label.ts.
 */

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-20" → "Mon, Oct 20" (", 2027" when it isn't this year). Anything else → "". */
export function dateLabel(value: string | undefined | null, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return "";
  const y = Number(m[1]);
  const d = new Date(y, Number(m[2]) - 1, Number(m[3]), 12);
  if (Number.isNaN(d.getTime())) return "";
  const base = `${DAY[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}`;
  return y === now.getFullYear() ? base : `${base}, ${y}`;
}

/** "14:30" → "2:30 PM"; "09:00" → "9:00 AM". Anything else → "". */
export function timeLabel(value: string | undefined | null): string {
  const m = /^(\d{2}):(\d{2})/.exec(value ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  const mi = m[2];
  if (h > 23) return "";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mi} ${h < 12 ? "AM" : "PM"}`;
}

/** "2026-10-20T14:30" → "Mon, Oct 20 · 2:30 PM"; a bare date reads as a date. */
export function dateTimeLabel(value: string | undefined | null, now: Date = new Date()): string {
  const v = value ?? "";
  const date = dateLabel(v.slice(0, 10), now);
  if (!date) return "";
  const time = v.length >= 16 ? timeLabel(v.slice(11, 16)) : "";
  return time ? `${date} · ${time}` : date;
}
