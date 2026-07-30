/**
 * When an invoice is actually late.
 *
 * Due dates are dates, not deadlines: the client picking "due July 30" reads
 * that as "any time on the 30th". They're stored as a timestamp at noon
 * though, so a plain `dueDate < now` comparison flips the invoice to PAST_DUE
 * at 12:00:01 on the very day it's due — the shop sees red, the reminder
 * cadence starts, and the client gets a "your payment is overdue" email hours
 * before it actually is. Jobber, Housecall Pro and ServiceTitan all wait for
 * the day to end.
 *
 * So: an invoice is past due once the whole due day has passed. Dates are
 * written at noon (`YYYY-MM-DDT12:00:00`), which lands mid-day in every US
 * timezone, so the UTC calendar day of the stored value is the day the user
 * picked — no per-company timezone lookup needed to compare days.
 */

/** Midnight UTC at the start of `now`'s day — the cutoff for "day has passed". */
export function startOfDayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * True once the due date's day is fully behind us. An invoice due today is
 * NOT past due, however late in the day it is.
 */
export function isPastDue(dueDate: Date | null | undefined, now: Date = new Date()): boolean {
  return !!dueDate && dueDate.getTime() < startOfDayUtc(now).getTime();
}

/**
 * Prisma filter for the same rule: `{ dueDate: pastDueFilter() }` selects
 * invoices whose due day has already ended. Equivalent to isPastDue because
 * stored due dates sit at noon, safely inside their own UTC day.
 */
export function pastDueFilter(now: Date = new Date()): { lt: Date } {
  return { lt: startOfDayUtc(now) };
}
