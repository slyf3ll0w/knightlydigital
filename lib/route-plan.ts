/**
 * Route Manager read model — one day of field work as mappable stops.
 *
 * Coordinate resolution per job, cheapest first:
 *   1. the linked property's stored pin (ContactAddress.lat/lng)
 *   2. — if the property exists but was never geocoded, geocode it now and
 *     persist onto the row so the next load is free
 *   3. the job's free-text address snapshot via the global GeocodeCache
 *   4. the contact's primary address via the cache
 * Stops that still have no pin come back with lat/lng null — the UI lists
 * them with a "no map pin" note instead of dropping them.
 *
 * Day bounds are computed in the COMPANY's timezone (Company.timezone) — the
 * server's own TZ must never decide which stops belong to a tenant's day.
 * The requested date is a calendar Y-M-D; wallTimeToUtc turns it into that
 * company's midnight-to-midnight window, DST-safely.
 */

import { prisma } from "@/lib/db";
import { peopleOf } from "@/lib/appointment-people";
import { completeAddress, composeAddress, geocodeAddress, geocodingEnabled } from "@/lib/geocoding";
import type { Actor } from "@/lib/permissions";
import { appointmentScope, isManager, jobScope } from "@/lib/permissions";
import { localDayParts, wallTimeToUtc } from "@/lib/booking-engine";
import { driveChainLegs } from "@/lib/routing";
import { routedChain } from "@/lib/route-walk";

export type StopProgress = "pending" | "active" | "done";

/** A task stop with no length of its own — a drop-off, a pick-up. */
export const DEFAULT_TASK_STOP_MINUTES = 15;
/** An errand with no length of its own (a supply-house counter, the dump). */
export const DEFAULT_ERRAND_MINUTES = 30;

/**
 * What a stop IS. Jobs and in-person appointments are client visits.
 * "block" = blocked-off time with an address — fixed, never re-timed.
 * "errand" = a stop that isn't a client (supply house, dump), "break" =
 * lunch (no place), "task" = a task with a place on its due day — the
 * optimizer may place all three (see `flexible`).
 */
export type StopKind = "job" | "appointment" | "block" | "errand" | "break" | "task";

export type RouteStop = {
  id: string;
  kind: StopKind;
  jobNumber: number | null;
  title: string;
  status: string;
  /** Where the visit stands today: on the clock ("active"), finished, or still to come. */
  progress: StopProgress;
  contactName: string;
  address: string | null;
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  /** Unconfirmed online booking (appointments only) — never auto-moved. */
  tentative: boolean;
  /** A visit reminder already went to the client for this time. */
  reminded: boolean;
  /** The client's window for this day (Job.arriveAfterMin/arriveBeforeMin) — or an errand / break's float window — as ISO instants. */
  windowStart: string | null;
  windowEnd: string | null;
  assigneeIds: string[];
  lat: number | null;
  lng: number | null;
  /** The optimizer may give this stop a time (a flexible errand / break, an all-day task). Jobs and appointments say so through scheduledAnytime. */
  flexible: boolean;
  /** An errand that must come before this job (TimeBlock.beforeJobId). */
  beforeStopId: string | null;
  /** How long the stop takes when it has no span of its own (errands, breaks, tasks). */
  durationMin: number | null;
};

export type RoutePin = { lat: number; lng: number; label: string };

export type DayEndChoice = "SHOP" | "START" | "LAST_STOP";

export type BreakDefault = { minutes: number; afterMin: number; beforeMin: number };

export type RouteDay = {
  enabled: boolean;
  /** The company's timezone — every wall-clock label downstream uses it. */
  timezone: string;
  /** The shop — where a day starts unless the member set their own start address. */
  start: RoutePin | null;
  /** Members who start the day somewhere else (User.startAddress), by user id. */
  memberStarts: Record<string, RoutePin>;
  /** Where each member's day ends (User.dayEndsAt); missing = the shop. */
  memberEnds: Record<string, DayEndChoice>;
  /** The company's automatic lunch (Company.break*); minutes 0 = off. */
  breakDefault: BreakDefault;
  stops: RouteStop[];
};

/** Where this member's day begins: their own start address, else the shop. */
export function dayStartFor(day: Pick<RouteDay, "start" | "memberStarts">, userId: string | null | undefined): RoutePin | null {
  return (userId && day.memberStarts[userId]) || day.start;
}

/** Where this member's day ends: the shop, back where it started, or nowhere in particular (null). */
export function dayEndFor(
  day: Pick<RouteDay, "start" | "memberStarts" | "memberEnds">,
  userId: string | null | undefined
): RoutePin | null {
  const choice: DayEndChoice = (userId && day.memberEnds[userId]) || "SHOP";
  if (choice === "LAST_STOP") return null;
  if (choice === "START") return dayStartFor(day, userId);
  return day.start;
}

/** Minutes from midnight (company-local) → an ISO instant on that day. */
export function minuteOnDay(tz: string, date: Date, min: number): string {
  return wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), min).toISOString();
}

export type RouteDrive = {
  /** legs[userId][stopId] = drive minutes into that stop from the previous
      point on that tech's route (the shop for the first stop, when known). */
  legs: Record<string, Record<string, number>>;
  /** totals[userId] = whole-route drive minutes (same legs, summed). */
  totals: Record<string, number>;
  /** km[userId][stopId] = road distance into that stop; kmTotals[userId] = the day. */
  km: Record<string, Record<string, number>>;
  kmTotals: Record<string, number>;
  /** true = every leg is a Mapbox road figure; false = at least one straight-line estimate (hedge the copy). */
  measured: boolean;
};

/**
 * Per-tech drive legs for the day, in the order the calendar reads right now.
 * One chain per tech (shop → stops in time order), answered from the leg
 * cache or one Directions request each — never an N² matrix over the whole
 * company, so a six-tech day gets road figures like a one-tech day does.
 * Display copy should hedge ("~12 min") whenever `measured` is false.
 */
export async function resolveDriveLegs(day: RouteDay, companyId: string): Promise<RouteDrive> {
  const drive: RouteDrive = { legs: {}, totals: {}, km: {}, kmTotals: {}, measured: true };
  const located = day.stops.filter((s) => s.lat != null && s.lng != null);
  if (!located.length) {
    drive.measured = day.enabled;
    return drive;
  }

  // Timed stops only: an "Anytime"/all-day stop has no place in the
  // sequence, so a leg measured from it would label the wrong gap on the
  // calendar (and flag a false "tight" one). Find-a-Time skips them too.
  const userIds = [...new Set(located.flatMap((s) => s.assigneeIds))];
  await Promise.all(
    userIds.map(async (userId) => {
      const route = routedChain(located, userId);
      if (!route.length) return;
      const start = dayStartFor(day, userId);
      const points = [
        ...(start ? [{ lat: start.lat, lng: start.lng }] : []),
        ...route.map((s) => ({ lat: s.lat!, lng: s.lng! })),
      ];
      if (points.length < 2) return;
      const chain = await driveChainLegs(points, companyId);
      if (!chain.measured) drive.measured = false;
      const legs: Record<string, number> = {};
      const kms: Record<string, number> = {};
      let total = 0;
      let kmTotal = 0;
      // With a start pin, leg i lands on route[i]; without one, leg i lands on route[i+1]
      const offset = start ? 0 : 1;
      chain.legs.forEach((leg, i) => {
        const stop = route[i + offset];
        if (!stop) return;
        const minutes = Math.round(leg.minutes);
        legs[stop.id] = minutes;
        total += minutes;
        const km = Math.round(leg.km * 10) / 10;
        kms[stop.id] = km;
        kmTotal += km;
      });
      drive.legs[userId] = legs;
      drive.totals[userId] = total;
      drive.km[userId] = kms;
      drive.kmTotals[userId] = Math.round(kmTotal * 10) / 10;
    })
  );
  return drive;
}

/** Promise.all with at most `limit` in flight; results keep input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function parseRouteDate(s?: string | null, tz?: string | null): Date {
  if (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      // "2026-02-31" would roll into March; refuse the roll-over, fall through to today
      if (!isNaN(d.getTime()) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])) return d;
    }
  }
  if (tz) {
    // No date given = "today" — the COMPANY's calendar day, not the server's.
    // A late-evening tenant west of the server would otherwise open on
    // tomorrow's route every night.
    const { y, m, d } = localDayParts(tz, new Date());
    return new Date(y, m - 1, d);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** A Job's client window (minutes from midnight, company-local) as instants on this day. */
function windowOn(tz: string, date: Date, afterMin: number | null, beforeMin: number | null) {
  const at = (min: number) => wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), min).toISOString();
  return {
    windowStart: afterMin != null ? at(afterMin) : null,
    windowEnd: beforeMin != null ? at(beforeMin) : null,
  };
}

export async function resolveRouteDay(actor: Actor, date: Date): Promise<RouteDay> {
  // Company first: its timezone defines what "this day" even means
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: {
      name: true, address: true, city: true, state: true, zip: true,
      lat: true, lng: true, geocodedAt: true, timezone: true,
      breakMinutes: true, breakAfterMin: true, breakBeforeMin: true,
    },
  });
  const tz = company?.timezone || "America/Chicago";
  const dayStart = wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), 0);
  const dayEnd = wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), 24 * 60);

  const [jobs, appointments] = await Promise.all([
    prisma.job.findMany({
      where: {
        companyId: actor.companyId,
        ...jobScope(actor),
        status: { not: "ARCHIVED" },
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
      include: {
        contact: { select: { firstName: true, lastName: true, address: true, city: true, state: true, zip: true } },
        property: true,
        assignments: { select: { userId: true } },
        // On the clock right now = an open time entry
        timeEntries: { where: { endedAt: null }, select: { id: true }, take: 1 },
      },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    }),
    // Dispatchers (managers + USER — who optimize/Find-a-Time already let
    // plan any tech's day) need the WHOLE committed day: appointmentScope
    // would hide appointments a colleague assigned, and routes/suggestions
    // would land on top of them. Techs/sales keep their scoped view.
    // No address filter: phone/video appointments (address null) are real
    // time commitments — they ride along as pin-less stops so Find-a-Time
    // and the day view see them; the optimizer never moves them (no pin).
    prisma.appointment.findMany({
      where: {
        companyId: actor.companyId,
        ...(isManager(actor.role) || actor.role === "USER" ? {} : appointmentScope(actor)),
        status: "SCHEDULED",
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
      include: {
        contact: { select: { firstName: true, lastName: true, city: true, state: true, zip: true } },
        property: true,
        extraAssignees: { select: { userId: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 100,
    }),
  ]);

  // Geocoding used to run one stop at a time — a 40-stop day was 40 serial
  // round-trips on every page load. A handful in flight at once is plenty
  // (the cache absorbs repeats) without hammering the geocoder.
  const jobStops = await mapLimit(jobs, 6, async (j): Promise<RouteStop> => {
    let lat: number | null = null;
    let lng: number | null = null;

    if (j.property?.lat != null && j.property?.lng != null) {
      lat = j.property.lat;
      lng = j.property.lng;
    } else if (j.property && j.property.geocodedAt == null) {
      // Property saved before geocoding existed — resolve once, keep forever
      const hit = await geocodeAddress(composeAddress(j.property), actor.companyId);
      if (geocodingEnabled()) {
        await prisma.contactAddress
          .update({
            where: { id: j.property.id },
            data: { lat: hit?.lat ?? null, lng: hit?.lng ?? null, geocodedAt: new Date() },
          })
          .catch(() => {});
      }
      lat = hit?.lat ?? null;
      lng = hit?.lng ?? null;
    }
    // The address line completed with the client's city/state/ZIP — a job
    // made from a client carries only their street, which on its own
    // geocodes to the wrong town (or state)
    const line = completeAddress(j.address, j.contact) || (j.property ? composeAddress(j.property) : composeAddress(j.contact)) || null;
    if (lat == null) {
      const hit = line ? await geocodeAddress(line, actor.companyId) : null;
      lat = hit?.lat ?? null;
      lng = hit?.lng ?? null;
    }

    const done = j.status === "REQUIRES_INVOICING" || j.completedAt != null;
    return {
      id: j.id,
      kind: "job",
      jobNumber: j.jobNumber,
      title: j.title,
      status: j.status,
      progress: done ? "done" : j.timeEntries.length > 0 ? "active" : "pending",
      contactName: `${j.contact.firstName} ${j.contact.lastName}`.trim(),
      address: line,
      scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
      scheduledEnd: j.scheduledEnd ? j.scheduledEnd.toISOString() : null,
      scheduledAnytime: j.scheduledAnytime,
      tentative: false,
      reminded: j.reminderDaySentAt != null || j.reminderHourSentAt != null,
      ...windowOn(tz, date, j.arriveAfterMin, j.arriveBeforeMin),
      assigneeIds: j.assignments.map((a) => a.userId),
      lat,
      lng,
      flexible: j.scheduledAnytime,
      beforeStopId: null,
      durationMin: null,
    };
  });

  const apptStops = await mapLimit(appointments, 6, async (a): Promise<RouteStop> => {
    let lat = a.property?.lat ?? null;
    let lng = a.property?.lng ?? null;
    const apptLine = completeAddress(a.address, a.contact);
    if (lat == null && apptLine) {
      const hit = await geocodeAddress(apptLine, actor.companyId);
      lat = hit?.lat ?? null;
      lng = hit?.lng ?? null;
    }
    return {
      id: a.id,
      kind: "appointment",
      jobNumber: null,
      title: a.title,
      status: a.status,
      progress: a.scheduledEnd && a.scheduledEnd.getTime() < Date.now() ? "done" : "pending",
      contactName: `${a.contact.firstName} ${a.contact.lastName}`.trim(),
      address: apptLine,
      scheduledAt: a.scheduledAt.toISOString(),
      scheduledEnd: a.scheduledEnd ? a.scheduledEnd.toISOString() : null,
      scheduledAnytime: a.scheduledAnytime,
      tentative: a.tentative,
      reminded: a.reminderDaySentAt != null || a.reminderHourSentAt != null,
      windowStart: null,
      windowEnd: null,
      assigneeIds: peopleOf(a),
      lat,
      lng,
      flexible: a.scheduledAnytime,
      beforeStopId: null,
      durationMin: null,
    };
  });

  const dispatcher = isManager(actor.role) || actor.role === "USER";

  // Blocked-off time WITH a location (dentist, supplier run) is a real stop
  // on that tech's route — drive time to and from it counts. Errands and
  // breaks ride along even without a pin (an errand whose address didn't
  // geocode still lists with "No pin"; a break has no place at all).
  // Company-wide blocks have no single driver, so only personal ones ride along.
  const blocks = await prisma.timeBlock.findMany({
    where: {
      companyId: actor.companyId,
      userId: { not: null },
      OR: [{ lat: { not: null }, lng: { not: null } }, { kind: { in: ["ERRAND", "BREAK"] } }],
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
      ...(dispatcher ? {} : { userId: actor.id }),
    },
    select: {
      id: true, userId: true, title: true, address: true, startAt: true, endAt: true, allDay: true, lat: true, lng: true,
      kind: true, flexible: true, floatAfterMin: true, floatBeforeMin: true, beforeJobId: true, placedAt: true, doneAt: true,
      place: { select: { name: true } },
    },
  });
  const blockStops: RouteStop[] = blocks.map((b) => {
    const kind: StopKind = b.kind === "ERRAND" ? "errand" : b.kind === "BREAK" ? "break" : "block";
    // A flexible errand / break that no Optimize has placed yet has no
    // real time — it shows as "Anytime" inside its window
    const floating = kind !== "block" && b.flexible && b.placedAt == null;
    const durationMin = Math.max(5, Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60000));
    return {
      id: b.id,
      kind,
      jobNumber: null,
      title: b.title || (kind === "break" ? "Lunch" : kind === "errand" ? b.place?.name || "Errand" : "Blocked off"),
      status: kind === "block" ? "BLOCK" : b.kind,
      progress: b.doneAt ? "done" : "pending",
      contactName: kind === "errand" && b.place?.name && b.place.name !== b.title ? b.place.name : "",
      address: b.address,
      // Clamp multi-day blocks to this day so the walk stays inside it
      scheduledAt: new Date(Math.max(b.startAt.getTime(), dayStart.getTime())).toISOString(),
      scheduledEnd: new Date(Math.min(b.endAt.getTime(), dayEnd.getTime())).toISOString(),
      scheduledAnytime: b.allDay || floating,
      tentative: false,
      reminded: false,
      windowStart: kind !== "block" && b.floatAfterMin != null ? minuteOnDay(tz, date, b.floatAfterMin) : null,
      windowEnd: kind !== "block" && b.floatBeforeMin != null ? minuteOnDay(tz, date, b.floatBeforeMin) : null,
      assigneeIds: [b.userId!],
      lat: b.lat,
      lng: b.lng,
      flexible: kind !== "block" && b.flexible,
      beforeStopId: kind === "errand" ? b.beforeJobId : null,
      durationMin: kind === "block" ? null : durationMin,
    };
  });

  // Tasks with a place, due this day, are stops on the assignee's route
  // ("drop the keys at the office"). An all-day task is flexible (Optimize
  // slots it); a timed one holds its time like an appointment. Done tasks
  // stay on the day, ticked, so the route reads right at 3 PM.
  const tasks = await prisma.task.findMany({
    where: {
      companyId: actor.companyId,
      dueAt: { gte: dayStart, lt: dayEnd },
      OR: [{ lat: { not: null }, lng: { not: null } }, { address: { not: null } }],
      ...(dispatcher ? {} : { assigneeId: actor.id }),
    },
    select: {
      id: true, title: true, address: true, lat: true, lng: true, dueAt: true, allDay: true, estimatedMinutes: true,
      doneAt: true, assigneeId: true, place: { select: { name: true } },
    },
    take: 100,
  });
  const taskStops = await mapLimit(tasks, 6, async (t): Promise<RouteStop> => {
    let lat = t.lat;
    let lng = t.lng;
    if (lat == null && t.address) {
      const hit = await geocodeAddress(t.address, actor.companyId);
      lat = hit?.lat ?? null;
      lng = hit?.lng ?? null;
    }
    const durationMin = t.estimatedMinutes ?? DEFAULT_TASK_STOP_MINUTES;
    // An all-day task carries the company's local midnight; anchor it at
    // noon like an Anytime job so the list sorts it with the other
    // flexible stops instead of ahead of every timed one
    const start = t.allDay ? new Date(minuteOnDay(tz, date, 12 * 60)) : t.dueAt!;
    return {
      id: t.id,
      kind: "task",
      jobNumber: null,
      title: t.title,
      status: "TASK",
      progress: t.doneAt ? "done" : "pending",
      contactName: t.place?.name ?? "",
      address: t.address,
      scheduledAt: start.toISOString(),
      scheduledEnd: new Date(start.getTime() + durationMin * 60000).toISOString(),
      scheduledAnytime: t.allDay,
      tentative: false,
      reminded: false,
      windowStart: null,
      windowEnd: null,
      assigneeIds: [t.assigneeId],
      lat,
      lng,
      flexible: t.allDay,
      beforeStopId: null,
      durationMin,
    };
  });

  const stops: RouteStop[] = [...jobStops, ...apptStops, ...blockStops, ...taskStops];

  // Shop pin: geocode lazily the first time a route view loads after the
  // address exists (or after it changed — the settings PATCH clears the stamp).
  let start: RouteDay["start"] = null;
  if (company) {
    let { lat, lng } = company;
    if (lat == null && company.geocodedAt == null && company.address && geocodingEnabled()) {
      const hit = await geocodeAddress(composeAddress(company), actor.companyId);
      await prisma.company
        .update({
          where: { id: actor.companyId },
          data: { lat: hit?.lat ?? null, lng: hit?.lng ?? null, geocodedAt: new Date() },
        })
        .catch(() => {});
      lat = hit?.lat ?? null;
      lng = hit?.lng ?? null;
    }
    if (lat != null && lng != null) start = { lat, lng, label: company.name };
  }

  // Members with their own start address (Team page) — geocoded on save;
  // anyone still pending falls back to the shop.
  const memberStarts: Record<string, RoutePin> = {};
  const memberEnds: Record<string, DayEndChoice> = {};
  const members = await prisma.user.findMany({
    where: { companyId: actor.companyId, isActive: true },
    select: { id: true, name: true, startLat: true, startLng: true, startAddress: true, dayEndsAt: true },
  });
  for (const u of members) {
    if (u.startLat != null && u.startLng != null) {
      memberStarts[u.id] = { lat: u.startLat, lng: u.startLng, label: u.startAddress ? `${u.name} — ${u.startAddress}` : u.name };
    }
    if (u.dayEndsAt !== "SHOP") memberEnds[u.id] = u.dayEndsAt;
  }

  const breakDefault: BreakDefault = {
    minutes: company?.breakMinutes ?? 0,
    afterMin: company?.breakAfterMin ?? 11 * 60 + 30,
    beforeMin: company?.breakBeforeMin ?? 13 * 60,
  };

  return { enabled: geocodingEnabled(), timezone: tz, start, memberStarts, memberEnds, breakDefault, stops };
}
