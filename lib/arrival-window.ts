/**
 * Arrival windows — what the CLIENT is promised, never what the tech sees.
 *
 * A job's visit keeps its exact scheduledAt/scheduledEnd internally (calendar,
 * routes, dispatch all read real times); every client-facing surface — the
 * hub, visit reminders, booking emails, on-my-way texts — promises a window
 * instead: "we'll arrive between 8:00 and 10:00". The width resolves per job
 * (Job.arrivalWindowMinutes) falling back to the company default
 * (Company.arrivalWindowMinutes); 0 = promise the exact start time.
 *
 * Jobber-parity note: their window applies to all visits of a job, options
 * none/15 min–4 hr, and the window is invisible to techs. Same model here.
 */

export const ARRIVAL_WINDOW_CHOICES = [0, 30, 60, 120, 180, 240] as const;

export function arrivalWindowChoiceLabel(minutes: number): string {
  if (minutes <= 0) return "Exact time";
  if (minutes < 60) return `${minutes} min window`;
  const h = minutes / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)} hour window`;
}

/** Per-job override wins; null/undefined falls back to the company default. */
export function resolveArrivalWindowMinutes(
  jobOverride: number | null | undefined,
  companyDefault: number | null | undefined
): number {
  if (jobOverride != null && Number.isFinite(jobOverride) && jobOverride >= 0) {
    return jobOverride;
  }
  const d = Number(companyDefault);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

const timeFmt = (tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
const dayFmt = (tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });

/** "8:00 AM – 10:00 AM", or just "8:00 AM" when the window is off. */
export function arrivalTimeLabel(tz: string, start: Date, windowMinutes: number): string {
  const f = timeFmt(tz);
  if (windowMinutes <= 0) return f.format(start);
  return `${f.format(start)} – ${f.format(new Date(start.getTime() + windowMinutes * 60000))}`;
}

/** "Tue, Jul 7, 8:00 AM – 10:00 AM" — for reminder emails/texts. */
export function arrivalSlotLabel(tz: string, start: Date, windowMinutes: number): string {
  return `${dayFmt(tz).format(start)}, ${arrivalTimeLabel(tz, start, windowMinutes)}`;
}
