import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { sanitizeBusinessHours, sanitizeWorkingHoursOrNull } from "@/lib/business-hours";
import { composeAddress, geocodeAddress, geocodingEnabled } from "@/lib/geocoding";
import { driveTimeMatrix } from "@/lib/routing";
import { resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { resolvePublicCompany } from "@/lib/web-forms";
import { servicePriceLabel } from "@/lib/booking-form";
import {
  checkSlot,
  generateSlots,
  pickMember,
  type BusyInterval,
  type EngineMember,
  type EngineRules,
  type LatLng,
  type Slot,
} from "@/lib/booking-engine";
import { KIND_META, type BookingKind } from "@/lib/booking-types";
import { estimateDriveBetween } from "@/lib/geo-estimate";

/**
 * Server side of online scheduling: loads a booking type, its pool and their
 * commitments (with coordinates, so the engine can judge drive time), builds
 * the engine rules, and records assignments. Used by the public slot/submit
 * routes, the settings preview, and the reschedule flow — one loader, so
 * every surface sees the same availability.
 */

type Db = Prisma.TransactionClient | typeof prisma;

// ─── Booking type loading ────────────────────────────────────────────────────

export const bookingTypeInclude = {
  members: {
    include: {
      user: { select: { id: true, name: true, isActive: true, bookable: true, workingHours: true, meetingLink: true, startLat: true, startLng: true } },
    },
    orderBy: [{ priority: "desc" as const }, { userId: "asc" as const }],
  },
  services: {
    include: {
      workItem: {
        select: {
          id: true,
          name: true,
          description: true,
          unitPrice: true,
          priceDisplay: true,
          durationMinutes: true,
          depositType: true,
          depositValue: true,
          isActive: true,
          requiresAgreement: true,
          recurringInterval: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.BookingTypeInclude;

export type LoadedBookingType = Prisma.BookingTypeGetPayload<{ include: typeof bookingTypeInclude }>;

/** Members who can actually take bookings right now (active + bookable). */
export function eligibleMembers(type: LoadedBookingType) {
  return type.members.filter((m) => m.user.isActive && m.user.bookable);
}

/** Active price-book services on a SERVICE type (inactive items drop out). */
export function activeServices(type: LoadedBookingType) {
  return type.services.filter((s) => s.workItem.isActive);
}

/** What the public page may know about a type — no ids of people, no costs. */
export type PublicBookingType = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: BookingKind;
  exactTime: boolean;
  needsAddress: boolean;
  durationMinutes: number;
  arrivalWindowMinutes: number;
  confirmation: "INSTANT" | "APPROVAL";
  paymentMode: "NONE" | "DEPOSIT" | "FULL";
  clientCanReschedule: boolean;
  clientCanCancel: boolean;
  cutoffHours: number;
  /** false when no eligible member / no bookable service — page shows a note */
  bookable: boolean;
  services: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    priceLabel: string;
    priceDisplay: "FIXED" | "STARTING_AT" | "HOURLY" | "QUOTE";
    durationMinutes: number | null;
  }[];
};

export function toPublicBookingType(
  type: LoadedBookingType,
  company: { arrivalWindowMinutes: number }
): PublicBookingType {
  const meta = KIND_META[type.kind];
  const services = activeServices(type).map((s) => ({
    id: s.workItem.id,
    name: s.workItem.name,
    description: s.workItem.description,
    price: Number(s.workItem.unitPrice),
    priceLabel: servicePriceLabel({ price: Number(s.workItem.unitPrice), priceDisplay: s.workItem.priceDisplay }),
    priceDisplay: s.workItem.priceDisplay,
    durationMinutes: s.workItem.durationMinutes,
  }));
  return {
    id: type.id,
    slug: type.slug,
    name: type.name,
    description: type.description,
    kind: type.kind,
    exactTime: meta.exactTime,
    needsAddress: meta.needsAddress,
    durationMinutes: type.durationMinutes,
    arrivalWindowMinutes: meta.exactTime ? 0 : resolveArrivalWindowMinutes(type.arrivalWindowMinutes, company.arrivalWindowMinutes),
    confirmation: type.confirmation,
    paymentMode: type.paymentMode,
    clientCanReschedule: type.clientCanReschedule,
    clientCanCancel: type.clientCanCancel,
    cutoffHours: type.cutoffHours,
    bookable: eligibleMembers(type).length > 0 && (type.kind !== "SERVICE" || services.length > 0),
    services,
  };
}

/** Public resolution: company gate + active type by slug. */
export async function resolvePublicBookingType(companySlug: string, typeSlug: string) {
  const company = await resolvePublicCompany(companySlug);
  if (!company) return null;
  const type = await prisma.bookingType.findFirst({
    where: { companyId: company.id, slug: typeSlug, isActive: true },
    include: bookingTypeInclude,
  });
  if (!type) return null;
  return { company, type };
}

/**
 * Booking types a classic BOOKING form offers inline: the ids the form
 * points at, still active, bookable, and not collecting payment (the inline
 * form has no card step — paid types live on their own booking page).
 */
export async function formBookingTypes(
  company: { id: string; arrivalWindowMinutes: number },
  config: { selfSchedule: { enabled: boolean; bookingTypeIds: string[] } }
): Promise<PublicBookingType[]> {
  if (!config.selfSchedule.enabled || config.selfSchedule.bookingTypeIds.length === 0) return [];
  const types = await prisma.bookingType.findMany({
    where: { companyId: company.id, id: { in: config.selfSchedule.bookingTypeIds }, isActive: true, paymentMode: "NONE" },
    include: bookingTypeInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return types.map((t) => toPublicBookingType(t, company)).filter((t) => t.bookable);
}

/** Public menu: every active type of the company. */
export async function listPublicBookingTypes(companySlug: string) {
  const company = await resolvePublicCompany(companySlug);
  if (!company) return null;
  const types = await prisma.bookingType.findMany({
    where: { companyId: company.id, isActive: true },
    include: bookingTypeInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return { company, types: types.map((t) => toPublicBookingType(t, company)) };
}

// ─── Members + busy intervals ────────────────────────────────────────────────

const HOUR = 3600000;
const MAX_GEOCODES_PER_SWEEP = 250;

type LocatedBusy = BusyInterval & { address?: string | null; propertyId?: string | null };

/**
 * The pool with everything the engine needs: effective hours, day-start pin,
 * rotation state, and every commitment in [from, to) — appointments
 * (tentative ones included: an unapproved booking still holds its slot),
 * assigned jobs, unassigned scheduled jobs and unassigned appointments
 * (block everyone — someone will do them), and blocked-off time. When
 * `locate` is on, each commitment carries coordinates (property pin →
 * geocode cache) so the drive check can judge it.
 */
export async function loadPoolWithBusy(
  type: LoadedBookingType,
  from: Date,
  to: Date,
  opts: { locate: boolean; excludeAppointmentId?: string | null },
  db: Db = prisma
): Promise<EngineMember[]> {
  const pool = eligibleMembers(type);
  if (pool.length === 0) return [];
  const ids = pool.map((m) => m.userId);
  const companyId = type.companyId;

  // True overlap: start < to AND end > from. Records without an explicit end
  // default to an hour long, so "end > from" becomes start > from - 1h.
  // "Anytime" (date-only) items don't hold a clock position.
  const openEndFloor = new Date(from.getTime() - HOUR);
  const overlapsRange = {
    scheduledAt: { lt: to },
    OR: [{ scheduledEnd: { gt: from } }, { scheduledEnd: null, scheduledAt: { gt: openEndFloor } }],
  };

  const [appointments, assignments, unassignedJobs, blocks] = await Promise.all([
    db.appointment.findMany({
      where: {
        companyId,
        OR: [{ assignedToId: null }, { assignedToId: { in: ids } }],
        status: "SCHEDULED",
        scheduledAnytime: false,
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
        AND: [overlapsRange],
      },
      select: {
        assignedToId: true,
        scheduledAt: true,
        scheduledEnd: true,
        type: true,
        address: true,
        bookingTypeId: true,
        title: true,
        property: { select: { lat: true, lng: true } },
      },
    }),
    db.jobAssignment.findMany({
      where: {
        userId: { in: ids },
        job: { companyId, status: { not: "ARCHIVED" }, scheduledAnytime: false, ...overlapsRange },
      },
      select: {
        userId: true,
        job: {
          select: {
            scheduledAt: true,
            scheduledEnd: true,
            address: true,
            bookingTypeId: true,
            title: true,
            property: { select: { lat: true, lng: true } },
            contact: { select: { address: true, city: true, state: true, zip: true } },
          },
        },
      },
    }),
    db.job.findMany({
      where: { companyId, status: { not: "ARCHIVED" }, scheduledAnytime: false, ...overlapsRange, assignments: { none: {} } },
      select: {
        scheduledAt: true,
        scheduledEnd: true,
        address: true,
        bookingTypeId: true,
        title: true,
        property: { select: { lat: true, lng: true } },
        contact: { select: { address: true, city: true, state: true, zip: true } },
      },
    }),
    db.timeBlock.findMany({
      where: { companyId, startAt: { lt: to }, endAt: { gt: from }, OR: [{ userId: null }, { userId: { in: ids } }] },
      select: { userId: true, startAt: true, endAt: true, title: true },
    }),
  ]);

  const busyByUser = new Map<string, LocatedBusy[]>(ids.map((id) => [id, []]));
  const push = (userId: string | null, item: LocatedBusy) => {
    if (userId) busyByUser.get(userId)?.push(item);
    else for (const id of ids) busyByUser.get(id)?.push({ ...item });
  };
  const endOf = (s: Date, e: Date | null) => e ?? new Date(s.getTime() + HOUR);

  for (const a of appointments) {
    push(a.assignedToId, {
      start: a.scheduledAt,
      end: endOf(a.scheduledAt, a.scheduledEnd),
      bookingTypeId: a.bookingTypeId,
      label: a.title,
      // Calls happen wherever the member is — no pin to drive from/to
      loc: a.type === "IN_PERSON" && a.property?.lat != null && a.property?.lng != null ? { lat: a.property.lat, lng: a.property.lng } : null,
      address: a.type === "IN_PERSON" ? a.address : null,
    });
  }
  const jobBusy = (j: (typeof unassignedJobs)[number]): LocatedBusy | null => {
    if (!j.scheduledAt) return null;
    return {
      start: j.scheduledAt,
      end: endOf(j.scheduledAt, j.scheduledEnd),
      bookingTypeId: j.bookingTypeId,
      label: j.title,
      loc: j.property?.lat != null && j.property?.lng != null ? { lat: j.property.lat, lng: j.property.lng } : null,
      address: j.address?.trim() || composeAddress(j.contact) || null,
    };
  };
  for (const a of assignments) {
    const item = jobBusy(a.job);
    if (item) push(a.userId, item);
  }
  for (const j of unassignedJobs) {
    const item = jobBusy(j);
    if (item) push(null, item);
  }
  for (const b of blocks) {
    push(b.userId, { start: b.startAt, end: b.endAt, label: b.title, loc: null });
  }

  // Coordinates for located commitments: property pins are free; free-text
  // addresses resolve through the global geocode cache (paid once platform-
  // wide), capped per sweep so a pathological horizon can't burn the budget.
  if (opts.locate && geocodingEnabled()) {
    const pending = new Set<string>();
    for (const list of busyByUser.values()) {
      for (const b of list) if (!b.loc && b.address) pending.add(b.address);
    }
    const points = new Map<string, LatLng | null>();
    for (const addr of [...pending].slice(0, MAX_GEOCODES_PER_SWEEP)) {
      points.set(addr, await geocodeAddress(addr, companyId));
    }
    for (const list of busyByUser.values()) {
      for (const b of list) if (!b.loc && b.address) b.loc = points.get(b.address) ?? null;
    }
  }

  return pool.map((m) => ({
    id: m.userId,
    hours: sanitizeWorkingHoursOrNull(m.user.workingHours),
    busy: (busyByUser.get(m.userId) ?? []).map(({ address: _a, propertyId: _p, ...rest }) => rest),
    startLoc: m.user.startLat != null && m.user.startLng != null ? { lat: m.user.startLat, lng: m.user.startLng } : null,
    priority: m.priority,
    lastAssignedAt: m.lastAssignedAt,
  }));
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export type BookingCompany = {
  id: string;
  timezone: string;
  businessHours: unknown;
  arrivalWindowMinutes: number;
  bookingDriveLimitMinutes: number | null;
  lat: number | null;
  lng: number | null;
};

/** Engine rules for one type. `durationMinutes` overrides the type's (SERVICE picks). */
export function rulesFor(
  type: LoadedBookingType,
  company: BookingCompany,
  opts: { target?: LatLng | null; durationMinutes?: number; maxShownPerDay?: number | null; driveMinutes?: EngineRules["driveMinutes"] } = {}
): EngineRules {
  const meta = KIND_META[type.kind];
  return {
    timezone: company.timezone,
    hours: sanitizeBusinessHours(company.businessHours),
    durationMinutes: opts.durationMinutes ?? type.durationMinutes,
    stepMinutes: meta.exactTime ? type.stepMinutes : 30,
    bufferBeforeMinutes: type.bufferBeforeMinutes,
    bufferAfterMinutes: type.bufferAfterMinutes,
    leadHours: type.leadHours,
    horizonDays: type.horizonDays,
    maxPerDay: type.maxPerDay,
    maxShownPerDay: opts.maxShownPerDay === undefined ? (meta.exactTime ? null : type.maxShownPerDay) : opts.maxShownPerDay,
    arrivalWindowMinutes: meta.exactTime ? 0 : resolveArrivalWindowMinutes(type.arrivalWindowMinutes, company.arrivalWindowMinutes),
    bookingTypeId: type.id,
    target: meta.needsAddress ? (opts.target ?? null) : null,
    dayStartLoc: company.lat != null && company.lng != null ? { lat: company.lat, lng: company.lng } : null,
    driveLimitMinutes: company.bookingDriveLimitMinutes,
    driveMinutes: opts.driveMinutes,
  };
}

/** Horizon end for loading busy intervals (one day of slack past the last offered day). */
export function horizonEnd(type: { horizonDays: number }, now: Date): Date {
  return new Date(now.getTime() + (type.horizonDays + 2) * 86400000);
}

/** Geocode the customer's address for the drive check; null = judge without drive. */
export async function locateTarget(address: string | null | undefined, companyId: string): Promise<LatLng | null> {
  if (!address?.trim() || !geocodingEnabled()) return null;
  return geocodeAddress(address, companyId);
}

/** Full public sweep for a type → slots (engine output, member ids intact). */
export async function slotsForType(
  type: LoadedBookingType,
  company: BookingCompany,
  opts: { address?: string | null; durationMinutes?: number; now?: Date; maxShownPerDay?: number | null }
): Promise<{ slots: Slot[]; driveAware: boolean; members: EngineMember[]; rules: EngineRules }> {
  const now = opts.now ?? new Date();
  const meta = KIND_META[type.kind];
  const target = meta.needsAddress ? await locateTarget(opts.address, company.id) : null;
  const members = await loadPoolWithBusy(type, now, horizonEnd(type, now), { locate: Boolean(target) });
  const rules = rulesFor(type, company, { target, durationMinutes: opts.durationMinutes, maxShownPerDay: opts.maxShownPerDay });
  return { slots: generateSlots(rules, members, now), driveAware: Boolean(target), members, rules };
}

// ─── Submit-time verification + assignment ───────────────────────────────────

/**
 * Real-road check for the one chosen slot: replaces the haversine estimate
 * with a Mapbox matrix over prev → here → next for a member. Returns a
 * driveMinutes function the engine can use, or null when nothing to verify
 * (no coordinates, no token, over budget → the estimate stands).
 */
export async function roadDriveFor(
  rules: EngineRules,
  member: EngineMember,
  start: Date,
  now: Date,
  companyId: string
): Promise<EngineRules["driveMinutes"] | null> {
  if (!rules.target) return null;
  const est = checkSlot(rules, member, start, now);
  const points: LatLng[] = [];
  const fromLoc = est.prev ? (est.prev.loc ?? null) : (member.startLoc ?? rules.dayStartLoc ?? null);
  const toLoc = est.next?.loc ?? null;
  if (fromLoc) points.push(fromLoc);
  points.push(rules.target);
  if (toLoc) points.push(toLoc);
  if (points.length < 2) return null;
  const matrix = await driveTimeMatrix(points, companyId);
  const key = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  const idx = new Map(points.map((p, i) => [key(p), i]));
  return (a, b) => {
    const i = idx.get(key(a));
    const j = idx.get(key(b));
    if (i == null || j == null) return estimateDriveBetween(a, b);
    return matrix[i][j];
  };
}

/**
 * Inside the booking transaction: re-load the pool for just this slot's
 * window (fresh, under Serializable isolation), pick the member, verify the
 * chosen member's legs against real road minutes when available, and stamp
 * the rotation. Returns the member id or null when the slot was lost.
 */
export async function assignMemberForSlot(
  tx: Prisma.TransactionClient,
  type: LoadedBookingType,
  company: BookingCompany,
  rules: EngineRules,
  start: Date,
  now: Date,
  opts: { excludeAppointmentId?: string | null } = {}
): Promise<{ userId: string; meetingLink: string | null } | null> {
  // Same-day window so prev/next legs and the daily cap are judged correctly
  const dayLo = new Date(start.getTime() - 24 * HOUR);
  const dayHi = new Date(start.getTime() + 24 * HOUR);
  const members = await loadPoolWithBusy(type, dayLo, dayHi, { locate: Boolean(rules.target), excludeAppointmentId: opts.excludeAppointmentId }, tx);
  // Rank once on the estimate, then confirm the winner (and fall through
  // the ranking) on real road minutes.
  const tried = new Set<string>();
  for (let i = 0; i < members.length; i++) {
    const candidates = members.filter((m) => !tried.has(m.id));
    const userId = pickMember(rules, candidates, start, now, type.assignment);
    if (!userId) return null;
    tried.add(userId);
    const member = members.find((m) => m.id === userId)!;
    const road = await roadDriveFor(rules, member, start, now, company.id);
    if (road && !checkSlot({ ...rules, driveMinutes: road }, member, start, now).ok) continue;
    await tx.bookingTypeMember.update({
      where: { bookingTypeId_userId: { bookingTypeId: type.id, userId } },
      data: { lastAssignedAt: new Date() },
    });
    const row = type.members.find((m) => m.userId === userId);
    return { userId, meetingLink: row?.user.meetingLink ?? type.meetingLink ?? null };
  }
  return null;
}

/** Geocode + stamp a member's start address (fire-and-forget from the team PATCH). */
export async function geocodeMemberStart(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { startAddress: true, companyId: true } });
  if (!u) return;
  const hit = u.startAddress ? await geocodeAddress(u.startAddress, u.companyId) : null;
  await prisma.user
    .update({ where: { id: userId }, data: { startLat: hit?.lat ?? null, startLng: hit?.lng ?? null, startGeocodedAt: new Date() } })
    .catch(() => {});
}
