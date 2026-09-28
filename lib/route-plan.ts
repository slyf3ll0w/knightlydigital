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
import { composeAddress, geocodeAddress, geocodingEnabled } from "@/lib/geocoding";
import type { Actor } from "@/lib/permissions";
import { appointmentScope, isManager, jobScope } from "@/lib/permissions";
import { localDayParts, wallTimeToUtc } from "@/lib/booking-engine";
import { driveChainLegs } from "@/lib/routing";
import { routedChain } from "@/lib/route-walk";

export type StopProgress = "pending" | "active" | "done";

export type RouteStop = {
  id: string;
  /** "block" = blocked-off time with an address — a fixed stop the route
      drives to and from, never reordered or re-timed. */
  kind: "job" | "appointment" | "block";
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
  /** The client's window for this day (Job.arriveAfterMin/arriveBeforeMin), as ISO instants. */
  windowStart: string | null;
  windowEnd: string | null;
  assigneeIds: string[];
  lat: number | null;
  lng: number | null;
};

export type RoutePin = { lat: number; lng: number; label: string };

export type RouteDay = {
  enabled: boolean;
  /** The company's timezone — every wall-clock label downstream uses it. */
  timezone: string;
  /** The shop — where a day starts unless the member set their own start address. */
  start: RoutePin | null;
  /** Members who start the day somewhere else (User.startAddress), by user id. */
  memberStarts: Record<string, RoutePin>;
  stops: RouteStop[];
};

/** Where this member's day begins: their own start address, else the shop. */
export function dayStartFor(day: Pick<RouteDay, "start" | "memberStarts">, userId: string | null | undefined): RoutePin | null {
  return (userId && day.memberStarts[userId]) || day.start;
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
        contact: { select: { firstName: true, lastName: true } },
        property: true,
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
    if (lat == null) {
      const query = j.address?.trim() || composeAddress(j.contact);
      const hit = query ? await geocodeAddress(query, actor.companyId) : null;
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
      address: j.address?.trim() || (j.property ? composeAddress(j.property) : composeAddress(j.contact)) || null,
      scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
      scheduledEnd: j.scheduledEnd ? j.scheduledEnd.toISOString() : null,
      scheduledAnytime: j.scheduledAnytime,
      tentative: false,
      reminded: j.reminderDaySentAt != null || j.reminderHourSentAt != null,
      ...windowOn(tz, date, j.arriveAfterMin, j.arriveBeforeMin),
      assigneeIds: j.assignments.map((a) => a.userId),
      lat,
      lng,
    };
  });

  const apptStops = await mapLimit(appointments, 6, async (a): Promise<RouteStop> => {
    let lat = a.property?.lat ?? null;
    let lng = a.property?.lng ?? null;
    if (lat == null && a.address) {
      const hit = await geocodeAddress(a.address, actor.companyId);
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
      address: a.address,
      scheduledAt: a.scheduledAt.toISOString(),
      scheduledEnd: a.scheduledEnd ? a.scheduledEnd.toISOString() : null,
      scheduledAnytime: a.scheduledAnytime,
      tentative: a.tentative,
      reminded: a.reminderDaySentAt != null || a.reminderHourSentAt != null,
      windowStart: null,
      windowEnd: null,
      assigneeIds: a.assignedToId ? [a.assignedToId] : [],
      lat,
      lng,
    };
  });

  // Blocked-off time WITH a location (dentist, supplier run) is a real stop
  // on that tech's route — drive time to and from it counts. Company-wide
  // blocks have no single driver, so only personal ones ride along.
  const blocks = await prisma.timeBlock.findMany({
    where: {
      companyId: actor.companyId,
      userId: { not: null },
      lat: { not: null },
      lng: { not: null },
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
      ...(isManager(actor.role) || actor.role === "USER" ? {} : { userId: actor.id }),
    },
    select: { id: true, userId: true, title: true, address: true, startAt: true, endAt: true, allDay: true, lat: true, lng: true },
  });
  const blockStops: RouteStop[] = blocks.map((b) => ({
    id: b.id,
    kind: "block",
    jobNumber: null,
    title: b.title || "Blocked off",
    status: "BLOCK",
    progress: "pending",
    contactName: "",
    address: b.address,
    // Clamp multi-day blocks to this day so the walk stays inside it
    scheduledAt: new Date(Math.max(b.startAt.getTime(), dayStart.getTime())).toISOString(),
    scheduledEnd: new Date(Math.min(b.endAt.getTime(), dayEnd.getTime())).toISOString(),
    scheduledAnytime: b.allDay,
    tentative: false,
    reminded: false,
    windowStart: null,
    windowEnd: null,
    assigneeIds: [b.userId!],
    lat: b.lat,
    lng: b.lng,
  }));

  const stops: RouteStop[] = [...jobStops, ...apptStops, ...blockStops];

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
  const starters = await prisma.user.findMany({
    where: { companyId: actor.companyId, isActive: true, startLat: { not: null }, startLng: { not: null } },
    select: { id: true, name: true, startLat: true, startLng: true, startAddress: true },
  });
  for (const u of starters) {
    memberStarts[u.id] = { lat: u.startLat!, lng: u.startLng!, label: u.startAddress ? `${u.name} — ${u.startAddress}` : u.name };
  }

  return { enabled: geocodingEnabled(), timezone: tz, start, memberStarts, stops };
}
