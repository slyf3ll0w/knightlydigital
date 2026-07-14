import { prisma } from "@/lib/db";
import { sanitizeBusinessHours } from "./business-hours";
import { generateSlots, type BookableUser, type Slot, type SlotEngineInput } from "./booking-slots";
import type { BookingFormConfig } from "./booking-form";

/**
 * Server side of the online-booking slot engine: fetches the bookable team
 * and their busy intervals (scheduled appointments — tentative ones included,
 * so an unapproved booking still holds its slot — plus assigned clock-time
 * jobs and blocked-off time) and feeds lib/booking-slots.ts. Used by the
 * public slots endpoint and re-run inside the submit transaction to close
 * the double-booking race.
 */

type Db = Pick<typeof prisma, "user" | "appointment" | "jobAssignment" | "job" | "timeBlock">;

export async function getBookableUsersWithBusy(
  companyId: string,
  from: Date,
  to: Date,
  db: Db = prisma
): Promise<BookableUser[]> {
  const users = await db.user.findMany({
    where: { companyId, isActive: true, bookable: true },
    select: { id: true },
  });
  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);
  // Buffer a day back so something that started before `from` but overlaps it
  // still blocks; "anytime" (date-only) items don't hold a clock position.
  const buffer = new Date(from.getTime() - 86400000);

  const [appointments, assignments, unassignedJobs, blocks] = await Promise.all([
    db.appointment.findMany({
      where: {
        companyId,
        assignedToId: { in: ids },
        status: "SCHEDULED",
        scheduledAnytime: false,
        scheduledAt: { gte: buffer, lt: to },
      },
      select: { assignedToId: true, scheduledAt: true, scheduledEnd: true },
    }),
    db.jobAssignment.findMany({
      where: {
        userId: { in: ids },
        job: {
          companyId,
          status: { not: "ARCHIVED" },
          scheduledAnytime: false,
          scheduledAt: { gte: buffer, lt: to },
        },
      },
      select: { userId: true, job: { select: { scheduledAt: true, scheduledEnd: true } } },
    }),
    // A scheduled job nobody is assigned to still consumes capacity — someone
    // on the team will be doing it. Block the window for EVERY bookable user,
    // otherwise a solo owner who never formally assigns jobs gets double-booked.
    db.job.findMany({
      where: {
        companyId,
        status: { not: "ARCHIVED" },
        scheduledAnytime: false,
        scheduledAt: { gte: buffer, lt: to },
        assignments: { none: {} },
      },
      select: { scheduledAt: true, scheduledEnd: true },
    }),
    // Blocked-off time: personal blocks close that user's slots; company-wide
    // blocks (userId null) close everyone's. All-day blocks store the full
    // day span, so a plain overlap query covers them too.
    db.timeBlock.findMany({
      where: {
        companyId,
        startAt: { lt: to },
        endAt: { gt: from },
        OR: [{ userId: null }, { userId: { in: ids } }],
      },
      select: { userId: true, startAt: true, endAt: true },
    }),
  ]);

  const busyByUser = new Map<string, { start: Date; end: Date }[]>(ids.map((id) => [id, []]));
  const HOUR = 3600000;
  for (const a of appointments) {
    busyByUser.get(a.assignedToId!)?.push({
      start: a.scheduledAt,
      end: a.scheduledEnd ?? new Date(a.scheduledAt.getTime() + HOUR),
    });
  }
  for (const j of assignments) {
    if (!j.job.scheduledAt) continue;
    busyByUser.get(j.userId)?.push({
      start: j.job.scheduledAt,
      end: j.job.scheduledEnd ?? new Date(j.job.scheduledAt.getTime() + HOUR),
    });
  }
  for (const j of unassignedJobs) {
    if (!j.scheduledAt) continue;
    const interval = {
      start: j.scheduledAt,
      end: j.scheduledEnd ?? new Date(j.scheduledAt.getTime() + HOUR),
    };
    for (const id of ids) busyByUser.get(id)?.push(interval);
  }
  for (const b of blocks) {
    const interval = { start: b.startAt, end: b.endAt };
    if (b.userId) busyByUser.get(b.userId)?.push(interval);
    else for (const id of ids) busyByUser.get(id)?.push(interval);
  }
  return ids.map((id) => ({ id, busy: busyByUser.get(id) ?? [] }));
}

export type BookingCompany = {
  id: string;
  timezone: string;
  businessHours: unknown;
  serviceZips: string[];
  arrivalWindowMinutes: number;
};

/** The offered service resolved to its live price-book duration, or null if
 *  it isn't self-bookable (missing from the form/price book, or no duration). */
export async function resolveBookableService(
  companyId: string,
  config: BookingFormConfig,
  formServiceId: unknown
): Promise<{ formServiceId: string; name: string; price: number; durationMinutes: number } | null> {
  if (typeof formServiceId !== "string") return null;
  const svc = config.services.find((s) => s.id === formServiceId);
  if (!svc?.workItemId) return null;
  const wi = await prisma.workItem.findFirst({
    where: { id: svc.workItemId, companyId, isActive: true },
    select: { durationMinutes: true },
  });
  if (!wi?.durationMinutes) return null;
  return { formServiceId: svc.id, name: svc.name, price: svc.price, durationMinutes: wi.durationMinutes };
}

export function engineInputFor(
  company: BookingCompany,
  config: BookingFormConfig,
  durationMinutes: number,
  users: BookableUser[],
  now: Date
): SlotEngineInput {
  return {
    timezone: company.timezone,
    hours: sanitizeBusinessHours(company.businessHours),
    durationMinutes,
    arrivalWindowMinutes: company.arrivalWindowMinutes,
    users,
    now,
    leadHours: config.selfSchedule.leadHours,
    horizonDays: config.selfSchedule.horizonDays,
  };
}

const dayLabelFmt = (tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
const dayKeyFmt = (tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = (tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });

/** "8:00 AM – 10:00 AM" in the company's timezone. */
export function windowLabel(tz: string, start: Date, windowEnd: Date): string {
  const f = timeFmt(tz);
  return `${f.format(start)} – ${f.format(windowEnd)}`;
}

/** "Tue, Jul 7, 8:00 AM – 10:00 AM" — for emails and confirmations. */
export function slotLabel(tz: string, start: Date, windowEnd: Date): string {
  return `${dayLabelFmt(tz).format(start)}, ${windowLabel(tz, start, windowEnd)}`;
}

export type SlotDay = {
  date: string; // YYYY-MM-DD in company tz
  label: string; // "Tue, Jul 7"
  slots: { start: string; label: string }[]; // start ISO + "8:00 AM – 10:00 AM"
};

/** Group engine output into client-renderable days, labeled in company time. */
export function groupSlotsByDay(tz: string, slots: Slot[]): SlotDay[] {
  const keyFmt = dayKeyFmt(tz);
  const labelFmt = dayLabelFmt(tz);
  const days: SlotDay[] = [];
  let current: SlotDay | null = null;
  for (const s of slots) {
    const key = keyFmt.format(s.start);
    if (!current || current.date !== key) {
      current = { date: key, label: labelFmt.format(s.start), slots: [] };
      days.push(current);
    }
    current.slots.push({ start: s.start.toISOString(), label: windowLabel(tz, s.start, s.windowEnd) });
  }
  return days;
}
