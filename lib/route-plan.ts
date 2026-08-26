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
import { localDayParts, wallTimeToUtc } from "@/lib/booking-slots";
import { driveTimeMatrix } from "@/lib/routing";

export type RouteStop = {
  id: string;
  kind: "job" | "appointment";
  jobNumber: number | null;
  title: string;
  status: string;
  contactName: string;
  address: string | null;
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  /** Unconfirmed online booking (appointments only) — never auto-moved. */
  tentative: boolean;
  assigneeIds: string[];
  lat: number | null;
  lng: number | null;
};

export type RouteDay = {
  enabled: boolean;
  start: { lat: number; lng: number; label: string } | null;
  stops: RouteStop[];
};

export type RouteDrive = {
  /** legs[userId][stopId] = drive minutes into that stop from the previous
      point on that tech's route (the shop for the first stop, when known). */
  legs: Record<string, Record<string, number>>;
  /** totals[userId] = whole-route drive minutes (same legs, summed). */
  totals: Record<string, number>;
};

/**
 * Per-tech drive legs for the day, in the order the calendar reads right now.
 * One Matrix call covers every tech (points dedupe through the matrix cache);
 * days too big for the API silently use the haversine estimate — display
 * copy should hedge ("~12 min") either way.
 */
export async function resolveDriveLegs(day: RouteDay, companyId: string): Promise<RouteDrive> {
  const drive: RouteDrive = { legs: {}, totals: {} };
  const located = day.stops.filter((s) => s.lat != null && s.lng != null);
  if (!located.length) return drive;

  const points = [
    ...(day.start ? [{ lat: day.start.lat, lng: day.start.lng }] : []),
    ...located.map((s) => ({ lat: s.lat!, lng: s.lng! })),
  ];
  if (points.length < 2) return drive;
  const offset = day.start ? 1 : 0;
  const matrix = await driveTimeMatrix(points, companyId);
  const indexOf = new Map(located.map((s, i) => [s.id, i + offset]));

  const userIds = new Set(located.flatMap((s) => s.assigneeIds));
  for (const userId of userIds) {
    const route = located
      .filter((s) => s.assigneeIds.includes(userId))
      .sort((a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime());
    if (!route.length) continue;
    const legs: Record<string, number> = {};
    let total = 0;
    let prev = day.start ? 0 : null; // matrix index of the previous point
    for (const stop of route) {
      const here = indexOf.get(stop.id)!;
      if (prev != null) {
        const minutes = Math.round(matrix[prev][here]);
        legs[stop.id] = minutes;
        total += minutes;
      }
      prev = here;
    }
    drive.legs[userId] = legs;
    drive.totals[userId] = total;
  }
  return drive;
}

export function parseRouteDate(s?: string | null, tz?: string | null): Date {
  if (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) return d;
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

  const stops: RouteStop[] = [];

  for (const j of jobs) {
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

    stops.push({
      id: j.id,
      kind: "job",
      jobNumber: j.jobNumber,
      title: j.title,
      status: j.status,
      contactName: `${j.contact.firstName} ${j.contact.lastName}`.trim(),
      address: j.address?.trim() || (j.property ? composeAddress(j.property) : composeAddress(j.contact)) || null,
      scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
      scheduledEnd: j.scheduledEnd ? j.scheduledEnd.toISOString() : null,
      scheduledAnytime: j.scheduledAnytime,
      tentative: false,
      assigneeIds: j.assignments.map((a) => a.userId),
      lat,
      lng,
    });
  }

  for (const a of appointments) {
    let lat = a.property?.lat ?? null;
    let lng = a.property?.lng ?? null;
    if (lat == null && a.address) {
      const hit = await geocodeAddress(a.address, actor.companyId);
      lat = hit?.lat ?? null;
      lng = hit?.lng ?? null;
    }
    stops.push({
      id: a.id,
      kind: "appointment",
      jobNumber: null,
      title: a.title,
      status: a.status,
      contactName: `${a.contact.firstName} ${a.contact.lastName}`.trim(),
      address: a.address,
      scheduledAt: a.scheduledAt.toISOString(),
      scheduledEnd: a.scheduledEnd ? a.scheduledEnd.toISOString() : null,
      scheduledAnytime: a.scheduledAnytime,
      tentative: a.tentative,
      assigneeIds: a.assignedToId ? [a.assignedToId] : [],
      lat,
      lng,
    });
  }

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

  return { enabled: geocodingEnabled(), start, stops };
}
