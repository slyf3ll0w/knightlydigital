import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { localDayKey } from "@/lib/booking-engine";
import { reportError } from "@/lib/report-error";
import { geocodeAddress } from "@/lib/geocoding";
import { getActor, isManager, type Actor } from "@/lib/permissions";
import {
  addDaysToKey,
  horizonEndKey,
  needsTopUp,
  occurrenceDays,
  occurrenceSpan,
  parseSeriesInput,
  SERIES_TOPUP_DAYS,
  type SeriesRule,
} from "@/lib/time-block-recurrence";

/**
 * Repeating blocked time — the database half. A TimeBlockSeries holds the
 * weekly rule; this module turns it into ordinary TimeBlock rows a year
 * ahead (`materializeSeries`), rebuilds them when the rule changes
 * (`regenerateSeries`), lets one day leave the series
 * (`detachOccurrence` / `removeOccurrence`), and keeps the horizon topped up
 * from the hourly cron (`runTimeBlockSeriesSweep`). Every reader of blocked
 * time — the calendar, the booking engine, Find a Time, conflicts, routing,
 * calendar sync — keeps seeing plain TimeBlock rows and needs no change.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type SeriesRow = Prisma.TimeBlockSeriesGetPayload<Record<string, never>>;

export function ruleOf(s: SeriesRow): SeriesRule {
  return {
    weekdays: s.weekdays,
    allDay: s.allDay,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    skipDates: s.skipDates,
  };
}

export async function companyTimezone(companyId: string, db: Db = prisma): Promise<string> {
  const c = await db.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return c?.timezone || "America/Chicago";
}

/**
 * Create the rows for every day from today to the horizon the series lands
 * on and has no row for yet. Idempotent: running it twice adds nothing.
 * Returns how many rows were created.
 */
export async function materializeSeries(series: SeriesRow, tz: string, now: Date, db: Db = prisma): Promise<number> {
  const today = localDayKey(tz, now);
  const through = horizonEndKey(today, series.endsOn);
  const days = occurrenceDays(ruleOf(series), today, through);
  const existing = await db.timeBlock.findMany({ where: { seriesId: series.id }, select: { startAt: true } });
  const have = new Set(existing.map((b) => localDayKey(tz, b.startAt)));
  const data = days
    .filter((d) => !have.has(d))
    .map((d) => {
      const { startAt, endAt } = occurrenceSpan(series, d, tz);
      return {
        companyId: series.companyId,
        userId: series.userId,
        createdById: series.createdById,
        title: series.title,
        startAt,
        endAt,
        allDay: series.allDay,
        address: series.address,
        lat: series.lat,
        lng: series.lng,
        seriesId: series.id,
      };
    });
  if (data.length > 0) await db.timeBlock.createMany({ data });
  await db.timeBlockSeries.update({ where: { id: series.id }, data: { generatedThrough: through } });
  return data.length;
}

/**
 * The rule (or title / who / where) changed: drop every row still ahead and
 * rebuild. Rows already over stay as history; a day that was detached or
 * removed stays out (it's in skipDates).
 */
export async function regenerateSeries(series: SeriesRow, tz: string, now: Date, db: Db = prisma): Promise<number> {
  await db.timeBlock.deleteMany({ where: { seriesId: series.id, endAt: { gt: now } } });
  return materializeSeries(series, tz, now, db);
}

type OccurrenceRef = { id: string; seriesId: string | null; startAt: Date };

/** "Just this day" edit: the row leaves the series so a rebuild never undoes the change. */
export async function detachOccurrence(block: OccurrenceRef, tz: string, db: Db = prisma): Promise<void> {
  if (!block.seriesId) return;
  const day = localDayKey(tz, block.startAt);
  await db.timeBlock.update({ where: { id: block.id }, data: { seriesId: null } });
  await db.timeBlockSeries.update({ where: { id: block.seriesId }, data: { skipDates: { push: day } } });
}

/** "Just this day" remove: the row goes and the day is remembered as skipped. */
export async function removeOccurrence(block: OccurrenceRef, tz: string, db: Db = prisma): Promise<void> {
  const day = localDayKey(tz, block.startAt);
  await db.timeBlock.delete({ where: { id: block.id } });
  if (block.seriesId) {
    await db.timeBlockSeries.update({ where: { id: block.seriesId }, data: { skipDates: { push: day } } });
  }
}

/**
 * Hourly: extend every open-ended series whose horizon is getting short.
 * Cheap — a series needs work about once every two months.
 */
export async function runTimeBlockSeriesSweep(now: Date): Promise<{ checked: number; extended: number; created: number; errors: number }> {
  // Rough UTC day for the query; the exact company-zone check happens below
  const utcToday = now.toISOString().slice(0, 10);
  const soon = addDaysToKey(utcToday, SERIES_TOPUP_DAYS + 1);
  const series = await prisma.timeBlockSeries.findMany({
    where: { OR: [{ generatedThrough: null }, { generatedThrough: { lt: soon } }] },
    include: { company: { select: { timezone: true } } },
  });
  let extended = 0;
  let created = 0;
  let errors = 0;
  for (const s of series) {
    const tz = s.company.timezone || "America/Chicago";
    if (!needsTopUp(localDayKey(tz, now), s.generatedThrough, s.endsOn)) continue;
    try {
      created += await materializeSeries(s, tz, now);
      extended++;
    } catch (err) {
      errors++;
      reportError(`[time-block-series] extend ${s.id} failed`, err);
    }
  }
  return { checked: series.length, extended, created, errors };
}

// ─── Shared by the API routes ────────────────────────────────────────────────

export const SERIES_TITLE_MAX = 120;

/**
 * Who a block or series applies to, from a request body: self unless an
 * owner/admin names someone else (or null = everyone). Returns the user id,
 * null for company-wide, or an error response shape.
 */
export async function resolveBlockTarget(
  actor: Actor,
  body: Record<string, unknown>,
  fallback: string | null
): Promise<{ ok: true; userId: string | null } | { ok: false; status: number; error: string }> {
  if (!("forUserId" in body) || body.forUserId === fallback) return { ok: true, userId: fallback };
  if (body.forUserId === actor.id) return { ok: true, userId: actor.id };
  if (!isManager(actor.role)) return { ok: false, status: 403, error: "Only owners and admins can block off time for others." };
  if (body.forUserId === null) return { ok: true, userId: null };
  if (typeof body.forUserId !== "string") return { ok: false, status: 400, error: "Invalid team member." };
  const target = await prisma.user.findFirst({
    where: { id: body.forUserId, companyId: actor.companyId, isActive: true },
    select: { id: true },
  });
  if (!target) return { ok: false, status: 404, error: "Team member not found." };
  return { ok: true, userId: target.id };
}

/** Optional "where" → trimmed address + pin (an address that won't resolve is kept for the humans). */
export async function resolveBlockAddress(body: Record<string, unknown>, companyId: string): Promise<{ address: string | null; lat: number | null; lng: number | null }> {
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 240) || null : null;
  const pin = address ? await geocodeAddress(address, companyId) : null;
  return { address, lat: pin?.lat ?? null, lng: pin?.lng ?? null };
}

export function cleanTitle(v: unknown): string {
  return (typeof v === "string" && v.trim() ? v.trim() : "Blocked off").slice(0, SERIES_TITLE_MAX);
}

/** A series the actor may change: managers any in the company, others their own personal ones. */
export async function findEditableSeries(actor: Actor, id: string): Promise<SeriesRow | null> {
  return prisma.timeBlockSeries.findFirst({
    where: { id, companyId: actor.companyId, ...(isManager(actor.role) ? {} : { userId: actor.id }) },
  });
}

/** What the schedule and settings pages show for a series. */
export type SeriesDTO = {
  id: string;
  userId: string | null;
  userName: string | null;
  title: string;
  weekdays: number[];
  allDay: boolean;
  startMinute: number;
  endMinute: number;
  startsOn: string;
  endsOn: string | null;
  address: string | null;
  canEdit: boolean;
};

export function toSeriesDTO(s: SeriesRow & { user?: { name: string } | null }, actor: Pick<Actor, "id" | "role">): SeriesDTO {
  return {
    id: s.id,
    userId: s.userId,
    userName: s.user?.name ?? null,
    title: s.title,
    weekdays: s.weekdays,
    allDay: s.allDay,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    address: s.address,
    canEdit: isManager(actor.role) || s.userId === actor.id,
  };
}

/** Every series in the company, newest first, as DTOs. */
export async function listSeries(actor: Pick<Actor, "id" | "role" | "companyId">): Promise<SeriesDTO[]> {
  const rows = await prisma.timeBlockSeries.findMany({
    where: { companyId: actor.companyId },
    include: { user: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map((s) => toSeriesDTO(s, actor));
}

/** Validate + create a series from a request body and build its rows. */
export async function createSeriesFromBody(
  actor: Actor,
  body: Record<string, unknown>,
  now: Date
): Promise<{ ok: true; series: SeriesRow; created: number } | { ok: false; status: number; error: string }> {
  const parsed = parseSeriesInput(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const who = await resolveBlockTarget(actor, body, actor.id);
  if (!who.ok) return who;
  const where = await resolveBlockAddress(body, actor.companyId);
  const series = await prisma.timeBlockSeries.create({
    data: {
      companyId: actor.companyId,
      userId: who.userId,
      createdById: actor.id,
      title: cleanTitle(body.title),
      ...parsed.rule,
      ...where,
    },
  });
  const created = await materializeSeries(series, await companyTimezone(actor.companyId), now);
  return { ok: true, series, created };
}

export { getActor };
