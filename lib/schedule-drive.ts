import { prisma } from "@/lib/db";
import { completeAddress, composeAddress, geocodeAddress } from "@/lib/geocoding";
import { driveChainLegs, type RoutePoint } from "@/lib/routing";
import { apptForUsers, peopleOf, peopleSelect } from "@/lib/appointment-people";

/**
 * Drive-time heads-up for staff scheduling (David 2026-10-06): an on-site
 * job or in-person appointment that each person can't reach in time from
 * where they were just before, or that makes them late for where they go
 * next. Never blocks a save — the live check (POST /api/app/schedule/check)
 * shows these lines under the time fields next to the overlap list from
 * lib/schedule-conflicts.ts, and the calendar's move/drag PATCH routes
 * return them with the overlaps.
 *
 * Off-site items (David 2026-10-19) — a phone or video appointment, blocked
 * time with no address — have no pin of their own, but they still take the
 * person's time: one that sits inside the drive they owe to their next
 * on-site stop ("leaving by 10:30 for the 11:00 job") gets the same heads-up.
 * The drive starts from their previous on-site stop, else from the shop
 * (the company pin, like Find a Time's HQ leg).
 *
 * Neighbours = that person's nearest timed on-site stop before and after
 * (jobs, in-person appointments) within 8 hours — further away than that no
 * drive could matter. Road minutes come from the shared leg cache or one
 * Directions request per person (lib/routing.ts driveChainLegs, under the
 * Mapbox budget), else the straight-line estimate, marked "about".
 */

const NEAR_MS = 8 * 3600_000;

type Place = { lat?: number | null; lng?: number | null; line: string | null };
type Stop = { label: string; start: Date; end: Date; place: Place; people: string[] };

type AddrParts = { address: string | null; city: string | null; state: string | null; zip: string | null };
type PropParts = AddrParts & { lat: number | null; lng: number | null };

const placeOf = (address: string | null, property: PropParts | null, contact: AddrParts | null): Place => ({
  lat: property?.lat ?? null,
  lng: property?.lng ?? null,
  line:
    completeAddress(address, contact ?? {}) ||
    (property ? composeAddress(property) : contact ? composeAddress(contact) : "") ||
    null,
});

async function pin(place: Place, companyId: string): Promise<RoutePoint | null> {
  if (place.lat != null && place.lng != null) return { lat: place.lat, lng: place.lng };
  if (!place.line) return null;
  return geocodeAddress(place.line, companyId).catch(() => null);
}

export async function findDriveConflicts(params: {
  companyId: string;
  start: Date;
  end: Date;
  userIds: string[];
  /**
   * On-site work (a job, an in-person appointment — the default): the new
   * item is a stop of its own, so the question is whether each person can
   * get there from their previous stop and on to their next. Off-site (a
   * phone/video appointment, blocked time without an address): the question
   * is whether the slot lands on a drive they already owe.
   */
  onSite?: boolean;
  /** Where the new item is: a typed address, a saved property, and/or the client (for city/state). */
  address?: string | null;
  propertyId?: string | null;
  contactId?: string | null;
  excludeJobId?: string;
  excludeAppointmentId?: string;
}): Promise<string[]> {
  const { companyId, start, end, userIds } = params;
  if (userIds.length === 0) return [];
  const onSite = params.onSite ?? true;

  const addrSel = { address: true, city: true, state: true, zip: true } as const;
  const [company, users, property, contact] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true, lat: true, lng: true } }),
    prisma.user.findMany({ where: { id: { in: userIds }, companyId }, select: { id: true, name: true, email: true } }),
    onSite && params.propertyId
      ? prisma.contactAddress.findFirst({
          where: { id: params.propertyId, contact: { companyId } },
          select: { ...addrSel, lat: true, lng: true },
        })
      : null,
    onSite && params.contactId
      ? prisma.contact.findFirst({ where: { id: params.contactId, companyId }, select: addrSel })
      : null,
  ]);
  // The new item's pin is wanted only once someone has a neighbouring stop
  // to drive from or to — geocoding it up front sent every partial address
  // typed into the live form (450 ms debounce) to Mapbox and cached junk
  // like "1234, Plano, TX" as a real hit. Resolved at most once per call.
  const herePlace: Place = onSite ? placeOf(params.address ?? null, property, contact) : { line: null };
  if (onSite && (herePlace.lat == null || herePlace.lng == null) && !herePlace.line) return [];
  let herePromise: Promise<RoutePoint | null> | null = null;
  const hereLazy = () => (herePromise ??= pin(herePlace, companyId));
  const shop: RoutePoint | null =
    company?.lat != null && company?.lng != null ? { lat: company.lat, lng: company.lng } : null;

  const from = new Date(start.getTime() - NEAR_MS);
  const to = new Date(end.getTime() + NEAR_MS);
  const [jobs, appts] = await Promise.all([
    prisma.job.findMany({
      where: {
        companyId,
        ...(params.excludeJobId ? { id: { not: params.excludeJobId } } : {}),
        status: "ACTIVE",
        outsourced: false,
        scheduledAnytime: false,
        scheduledAt: { not: null, gte: from, lt: to },
        assignments: { some: { userId: { in: userIds } } },
      },
      select: {
        jobNumber: true,
        title: true,
        scheduledAt: true,
        scheduledEnd: true,
        address: true,
        property: { select: { ...addrSel, lat: true, lng: true } },
        contact: { select: { firstName: true, lastName: true, ...addrSel } },
        assignments: { select: { userId: true } },
      },
      take: 100,
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
        status: "SCHEDULED",
        type: "IN_PERSON",
        scheduledAnytime: false,
        scheduledAt: { gte: from, lt: to },
        ...apptForUsers(userIds),
      },
      select: {
        title: true,
        scheduledAt: true,
        scheduledEnd: true,
        address: true,
        property: { select: { ...addrSel, lat: true, lng: true } },
        contact: { select: { firstName: true, lastName: true, ...addrSel } },
        ...peopleSelect,
      },
      take: 100,
    }),
  ]);

  const who = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim();
  const stops: Stop[] = [
    ...jobs.map((j) => ({
      label: `Job #${j.jobNumber} (${who(j.contact)})`,
      start: j.scheduledAt!,
      end: j.scheduledEnd ?? new Date(j.scheduledAt!.getTime() + 3600_000),
      place: placeOf(j.address, j.property, j.contact),
      people: j.assignments.map((a) => a.userId),
    })),
    ...appts.map((a) => ({
      label: `"${a.title}" (${who(a.contact)})`,
      start: a.scheduledAt,
      end: a.scheduledEnd ?? new Date(a.scheduledAt.getTime() + 3600_000),
      place: placeOf(a.address, a.property, a.contact),
      people: peopleOf(a),
    })),
  ];

  const tz = company?.timezone || "America/Chicago";
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u?.name?.split(" ")[0] || u?.email || "Someone";
  };

  const out: string[] = [];
  for (const userId of userIds) {
    const mine = stops.filter((s) => s.people.includes(userId));
    // Overlapping stops are the overlap list's job — only true neighbours here
    const prev = mine.filter((s) => s.end <= start).sort((a, b) => b.end.getTime() - a.end.getTime())[0];
    const next = mine.filter((s) => s.start >= end).sort((a, b) => a.start.getTime() - b.start.getTime())[0];

    if (!onSite) {
      // Nothing of theirs to drive to after this → no drive for it to land on
      if (!next) continue;
      const [origin, dest] = await Promise.all([prev ? pin(prev.place, companyId) : shop, pin(next.place, companyId)]);
      if (!origin || !dest) continue;
      const { legs, measured } = await driveChainLegs([origin, dest], companyId);
      const mins = Math.ceil(legs[0]?.minutes ?? 0);
      if (mins <= 0) continue;
      // They have to be on the road from this moment to make the next stop
      const leaveBy = new Date(next.start.getTime() - mins * 60_000);
      if (end <= leaveBy) continue;
      const about = measured ? "" : "about ";
      out.push(
        `${nameOf(userId)} would be on the road then — ${about}${mins} min drive from ${prev ? prev.label : "the shop"} to ${next.label}, leaving by ${fmt(leaveBy)} to arrive at ${fmt(next.start)}`
      );
      continue;
    }

    if (!prev && !next) continue;
    const [prevPin, here, nextPin] = await Promise.all([
      prev ? pin(prev.place, companyId) : null,
      hereLazy(),
      next ? pin(next.place, companyId) : null,
    ]);
    if (!here) return [];
    const chain = [prevPin, here, nextPin].filter((p): p is RoutePoint => p != null);
    if (chain.length < 2) continue;
    const { legs, measured } = await driveChainLegs(chain, companyId);
    const about = measured ? "" : "about ";
    let i = 0;
    if (prevPin) {
      const mins = Math.ceil(legs[i++].minutes);
      const late = Math.ceil((prev!.end.getTime() + mins * 60_000 - start.getTime()) / 60_000);
      if (late > 0) {
        out.push(
          `${nameOf(userId)} drives ${about}${mins} min from ${prev!.label}, which ends at ${fmt(prev!.end)}, so they'd be ${late} min late here`
        );
      }
    }
    if (nextPin) {
      const mins = Math.ceil(legs[i].minutes);
      const late = Math.ceil((end.getTime() + mins * 60_000 - next!.start.getTime()) / 60_000);
      if (late > 0) {
        out.push(
          `${nameOf(userId)} needs ${about}${mins} min to drive to ${next!.label} at ${fmt(next!.start)}, so they'd be ${late} min late there`
        );
      }
    }
  }
  return out.slice(0, 5);
}
