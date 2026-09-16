import { localDayParts, wallTimeToUtc } from "@/lib/booking-engine";

/**
 * "Valid until" is a date, not an instant: the client picks "valid until
 * July 30" and expects to be able to sign any time on the 30th. The editor
 * stores the picked day at browser-local noon, so comparing the stored
 * timestamp against `now` expired quotes at lunchtime on their last day.
 * A quote is expired once the whole valid-until day has ended in the
 * company's timezone.
 */
export function quoteExpired(
  validUntil: Date | null | undefined,
  timezone: string,
  now: Date = new Date()
): boolean {
  if (!validUntil) return false;
  // The stored value sits mid-day on the picked date in every US zone, so its
  // company-local calendar day IS the picked day.
  const { y, m, d } = localDayParts(timezone, validUntil);
  const endOfValidDay = wallTimeToUtc(timezone, y, m, d, 24 * 60);
  return now.getTime() >= endOfValidDay.getTime();
}
