/**
 * In-app scheduling helpers — the "even time slots" a business owner picks from
 * when they schedule a job or an appointment by hand (distinct from the public
 * self-booking slot engine in lib/booking-slots.ts, which offers arrival windows
 * to customers).
 *
 * The interval is resolved through `resolveSlotInterval`, whose signature is
 * intentionally a context object so future inputs — a per-service-type override,
 * or a route-management system that spaces stops by drive time — can refine it
 * without touching the call sites. Today it reads the company preset and falls
 * back to a sane default.
 */

export const DEFAULT_SLOT_INTERVAL_MINUTES = 30;

/** End-time autofill for a job whose services carry no price-book duration. */
export const DEFAULT_JOB_DURATION_MINUTES = 60;

/** Interval choices offered in Settings (and accepted by the resolver clamp). */
export const SLOT_INTERVAL_CHOICES = [15, 30, 60] as const;

export type SlotIntervalContext = {
  /** Company.schedulingIntervalMinutes — the owner's preset. */
  companyIntervalMinutes?: number | null;
  /**
   * Duration of the service/job type being scheduled, in minutes. Reserved for
   * per-type refinement (e.g. never offer a coarser grid than the visit itself).
   * Not yet used to change the grid — kept so callers can start passing it now.
   */
  serviceDurationMinutes?: number | null;
  // Future: route context (previous stop, drive-time buffer) plugs in here.
};

/**
 * Resolve the minute-granularity of the in-app time-slot picker. Clamps to a
 * supported choice; unknown/zero values fall back to the default.
 */
export function resolveSlotInterval(ctx: SlotIntervalContext = {}): number {
  const preset = Number(ctx.companyIntervalMinutes);
  if (Number.isFinite(preset) && preset > 0) {
    // Snap to the nearest supported choice so odd stored values stay predictable.
    return SLOT_INTERVAL_CHOICES.reduce((best, choice) =>
      Math.abs(choice - preset) < Math.abs(best - preset) ? choice : best
    );
  }
  return DEFAULT_SLOT_INTERVAL_MINUTES;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format "HH:mm" (24h) as a friendly "9:00 AM" label. */
export function formatSlotLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period}`;
}

/**
 * Every even time slot across a day at the given interval, as { value:"HH:mm",
 * label:"9:00 AM" }. interval must divide evenly; guarded to a sane range.
 *
 * `dayStartMinutes` rotates the list so it opens on the business day instead
 * of midnight: with 480 (8:00 AM) the options run 8:00 AM → 11:30 PM and the
 * small hours trail at the end, so the first visible times are ones an owner
 * would actually pick.
 */
export function slotTimeOptions(
  intervalMinutes: number,
  dayStartMinutes = 0
): { value: string; label: string }[] {
  const step = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : DEFAULT_SLOT_INTERVAL_MINUTES;
  const anchor =
    Number.isFinite(dayStartMinutes) && dayStartMinutes > 0 && dayStartMinutes < 24 * 60
      ? Math.floor(dayStartMinutes / step) * step // snap onto the grid
      : 0;
  const out: { value: string; label: string }[] = [];
  for (let offset = 0; offset < 24 * 60; offset += step) {
    const mins = (anchor + offset) % (24 * 60);
    const value = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
    out.push({ value, label: formatSlotLabel(value) });
  }
  return out;
}

/** Split a `YYYY-MM-DDTHH:mm` local value into its date and time halves. */
export function splitLocalDateTime(value: string): { date: string; time: string } {
  if (!value || value.length < 16) return { date: value?.slice(0, 10) ?? "", time: "" };
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

/** Recombine a date (`YYYY-MM-DD`) and time (`HH:mm`) into a local value. */
export function joinLocalDateTime(date: string, time: string): string {
  if (!date) return "";
  if (!time) return date;
  return `${date}T${time}`;
}

/**
 * Round a "HH:mm" to the nearest slot on the interval grid. Used so an existing
 * odd-minute value (e.g. legacy 9:17) can be shown as the nearest even slot.
 */
export function snapTimeToInterval(hhmm: string, intervalMinutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const step = intervalMinutes > 0 ? intervalMinutes : DEFAULT_SLOT_INTERVAL_MINUTES;
  const total = h * 60 + m;
  const snapped = Math.round(total / step) * step;
  const clamped = Math.min(snapped, 23 * 60 + 59);
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

/**
 * Add `minutes` to a `YYYY-MM-DDTHH:mm` local value, returning the same format.
 * Used to auto-fill an end time from a start + the service/type duration.
 */
export function addMinutesToLocalDateTime(value: string, minutes: number): string {
  const { date, time } = splitLocalDateTime(value);
  if (!date || !time) return value;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  // Local wall-clock arithmetic; the caller converts to ISO via localInputToISO.
  const dt = new Date(y, mo - 1, d, h, mi + minutes, 0, 0);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
