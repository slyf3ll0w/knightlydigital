import { prisma } from "@/lib/db";
import { sanitizeBusinessHours, sanitizeWorkingHoursOrNull } from "./business-hours";
import { generateSlots, type BookableUser, type Slot, type SlotEngineInput } from "./booking-slots";
import type { BookingFormConfig } from "./booking-form";
import { geocodeAddress, geocodingEnabled } from "./geocoding";
import { estimateDriveMinutes, haversineKm, type RoutePoint } from "./routing";

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
    select: { id: true, workingHours: true },
  });
  if (users.length === 0) return [];
  const ids = users.map((u) => u.id);
  const hoursById = new Map(users.map((u) => [u.id, sanitizeWorkingHoursOrNull(u.workingHours)]));
  // True overlap: start < to AND end > from. Records without an explicit end
  // default to an hour long, so "end > from" becomes start > from - 1h.
  // "Anytime" (date-only) items don't hold a clock position.
  const HOUR = 3600000;
  const openEndFloor = new Date(from.getTime() - HOUR);
  const overlaps = {
    scheduledAt: { lt: to },
    OR: [
      { scheduledEnd: { gt: from } },
      { scheduledEnd: null, scheduledAt: { gt: openEndFloor } },
    ],
  };

  const [appointments, assignments, unassignedJobs, blocks] = await Promise.all([
    // Unassigned appointments (assignedToId null) still hold real commitments
    // to a client — block every bookable user so "unassign to reassign later"
    // can't reopen the slot to the public.
    db.appointment.findMany({
      where: {
        companyId,
        OR: [{ assignedToId: null }, { assignedToId: { in: ids } }],
        status: "SCHEDULED",
        scheduledAnytime: false,
        AND: [overlaps],
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
          ...overlaps,
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
        ...overlaps,
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
  for (const a of appointments) {
    const interval = {
      start: a.scheduledAt,
      end: a.scheduledEnd ?? new Date(a.scheduledAt.getTime() + HOUR),
    };
    if (a.assignedToId) busyByUser.get(a.assignedToId)?.push(interval);
    else for (const id of ids) busyByUser.get(id)?.push(interval);
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
  return ids.map((id) => ({
    id,
    busy: busyByUser.get(id) ?? [],
    hours: hoursById.get(id) ?? null,
  }));
}

export type BookingCompany = {
  id: string;
  timezone: string;
  businessHours: unknown;
  serviceZips: string[];
  arrivalWindowMinutes: number;
};

// ─── Booking drive-time limit ────────────────────────────────────────────────

export type DriveFilter =
  | { enabled: false }
  | { enabled: true; addressRequired: true; allow?: undefined }
  | { enabled: true; addressRequired?: false; allow: (userId: string, dayKey: string) => boolean };

const dayKeyOf = (tz: string) => {
  const fmt = dayKeyFmt(tz);
  return (d: Date) => fmt.format(d);
};

/** "YYYY-MM-DD" of an instant in the company's timezone — matches the dayKey
 *  the slot engine hands to userAllowedOnDay. */
export function localDayKey(tz: string, d: Date): string {
  return dayKeyFmt(tz).format(d);
}

/**
 * Jobber's booking "drive time limit", built on the Route Manager: when
 * Company.bookingDriveLimitMinutes is set, self-scheduling only offers a
 * member days where the new visit clusters with their existing route — an
 * anchor visit that day (or the shop, for anyone) within the limit's
 * estimated drive of the client's address. Distances are haversine-based
 * (free — no matrix spend); the only Mapbox cost is geocoding, which runs
 * through the shared cache and monthly budget. Degrades to "no restriction"
 * when geocoding is off/over budget or nothing is locatable, and asks for
 * the client's address (addressRequired) before showing any times.
 */
export async function bookingDriveFilter(
  company: {
    id: string;
    timezone: string;
    lat: number | null;
    lng: number | null;
    bookingDriveLimitMinutes: number | null;
  },
  address: string | null | undefined,
  from: Date,
  to: Date
): Promise<DriveFilter> {
  const limit = company.bookingDriveLimitMinutes ?? 0;
  if (limit <= 0) return { enabled: false };
  // No geocoding = no coordinates to judge with — degrade like the rest of
  // the Route Manager rather than blocking the whole booking form.
  if (!geocodingEnabled()) return { enabled: false };

  const target = address?.trim() ? await geocodeAddress(address, company.id) : null;
  if (!target) return { enabled: true, addressRequired: true };

  const withinLimit = (p: RoutePoint) => estimateDriveMinutes(haversineKm(p, target)) <= limit;

  // Client near the shop? Then any day clusters fine for everyone.
  if (company.lat != null && company.lng != null && withinLimit({ lat: company.lat, lng: company.lng })) {
    return { enabled: true, allow: () => true };
  }

  // Anchor visits in the horizon: jobs + confirmed in-person appointments
  // with an address. "Anytime" visits still anchor their day.
  const [jobs, appts] = await Promise.all([
    prisma.job.findMany({
      where: {
        companyId: company.id,
        status: { not: "ARCHIVED" },
        scheduledAt: { gte: from, lt: to },
        address: { not: null },
      },
      select: { scheduledAt: true, address: true, assignments: { select: { userId: true } } },
    }),
    prisma.appointment.findMany({
      where: {
        companyId: company.id,
        type: "IN_PERSON",
        status: "SCHEDULED",
        scheduledAt: { gte: from, lt: to },
        address: { not: null },
      },
      select: { scheduledAt: true, address: true, assignedToId: true },
    }),
  ]);

  const anchors = [
    ...jobs.map((j) => ({
      at: j.scheduledAt!,
      address: j.address!,
      userIds: j.assignments.map((a) => a.userId),
    })),
    ...appts.map((a) => ({
      at: a.scheduledAt,
      address: a.address!,
      userIds: a.assignedToId ? [a.assignedToId] : [],
    })),
  ];

  // Geocode the distinct anchor addresses (global cache makes repeats free;
  // hard cap keeps a pathological horizon from burning the geocode budget).
  const distinct = [...new Set(anchors.map((a) => a.address))].slice(0, 250);
  const points = new Map<string, RoutePoint | null>();
  for (const addr of distinct) {
    points.set(addr, await geocodeAddress(addr, company.id));
  }

  // Nothing locatable anywhere (brand-new company, no shop pin) — we can't
  // evaluate clustering at all, so don't dead-end the booking form.
  const anyLocated = [...points.values()].some(Boolean);
  if (!anyLocated && (company.lat == null || company.lng == null)) return { enabled: false };

  const toKey = dayKeyOf(company.timezone);
  const anyUserDays = new Set<string>(); // unassigned anchors qualify the day for everyone
  const userDays = new Map<string, Set<string>>();
  for (const a of anchors) {
    const p = points.get(a.address);
    if (!p || !withinLimit(p)) continue;
    const key = toKey(a.at);
    if (a.userIds.length === 0) {
      anyUserDays.add(key);
    } else {
      for (const id of a.userIds) {
        if (!userDays.has(id)) userDays.set(id, new Set());
        userDays.get(id)!.add(key);
      }
    }
  }

  return {
    enabled: true,
    allow: (userId, dayKey) => anyUserDays.has(dayKey) || (userDays.get(userId)?.has(dayKey) ?? false),
  };
}

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
  now: Date,
  userAllowedOnDay?: (userId: string, dayKey: string) => boolean
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
    userAllowedOnDay,
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
