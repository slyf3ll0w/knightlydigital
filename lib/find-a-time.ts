/**
 * "Find a Time" — drive-time-aware slot suggestions for staff scheduling
 * (Jobber's Grow-tier feature, rebuilt on our Route Manager engine).
 *
 * Given a day, a team member, a visit length, and where the work is, suggest
 * start times that fit the tech's existing route: inside business hours, clear
 * of every timed visit, and reachable — a slot only qualifies when the gap
 * around it absorbs the real drive from the previous stop and to the next one
 * (Jobber calls the failure mode "Unfeasible"). One suggestion per gap (the
 * earliest workable start), ranked by total added drive time; the caller
 * highlights the least-driving option. Jobber excludes the home-base legs —
 * we include the HQ→first-stop drive, because the company pin is right there.
 *
 * Degrades exactly like the rest of the Route Manager: no MAPBOX_TOKEN, an
 * unlocatable address, or a blown monthly budget → haversine estimates or,
 * with no coordinates at all, plain gap-fit suggestions with no drive info.
 */

import { prisma } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocoding";
import { driveTimeMatrix } from "@/lib/routing";
import { dayStartFor, resolveRouteDay } from "@/lib/route-plan";
import type { Actor } from "@/lib/permissions";
import {
  sanitizeBusinessHours,
  resolveWorkingHours,
  timeToMinutes,
  DAY_KEYS,
} from "@/lib/business-hours";
import { resolveSlotInterval, DEFAULT_JOB_DURATION_MINUTES } from "@/lib/scheduling";
import { wallTimeToUtc } from "@/lib/booking-slots";

export type TimeSuggestion = {
  start: string; // ISO
  end: string; // ISO
  /** Real-road minutes from the previous stop (or HQ); null = unknown. */
  driveFromPrev: number | null;
  driveToNext: number | null;
  /** What the tech would be coming from / heading to ("HQ", a job title). */
  prevTitle: string | null;
  nextTitle: string | null;
  /** Ranking score: added drive minutes (prev leg + next leg). */
  totalDriveMinutes: number | null;
};

export type FindATimeResult = {
  /** false = no coordinates for the new visit — suggestions are gap-fit only. */
  driveAware: boolean;
  suggestions: TimeSuggestion[];
};

const APPT_DEFAULT_MINUTES = 30;

export async function suggestTimes(
  actor: Actor,
  opts: {
    date: Date;
    userId: string;
    durationMinutes?: number;
    /** Where the new visit is — free-text address (geocoded via the cache). */
    address?: string | null;
    /** Visit being rescheduled — its current slot doesn't block itself. */
    excludeId?: string | null;
  }
): Promise<FindATimeResult> {
  const duration =
    Number.isFinite(opts.durationMinutes) && opts.durationMinutes! > 0
      ? Math.min(opts.durationMinutes!, 12 * 60)
      : DEFAULT_JOB_DURATION_MINUTES;

  const [company, tech, day] = await Promise.all([
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { businessHours: true, schedulingIntervalMinutes: true, timezone: true },
    }),
    prisma.user.findFirst({
      where: { id: opts.userId, companyId: actor.companyId },
      select: { workingHours: true },
    }),
    resolveRouteDay(actor, opts.date),
  ]);
  const tz = company?.timezone || "America/Chicago";

  // Blocked-off time is just as committed as a visit — without this the
  // engine happily suggested slots inside "Shop closed" / personal blocks.
  const blocksDayStart = wallTimeToUtc(tz, opts.date.getFullYear(), opts.date.getMonth() + 1, opts.date.getDate(), 0);
  const blocksDayEnd = wallTimeToUtc(tz, opts.date.getFullYear(), opts.date.getMonth() + 1, opts.date.getDate(), 24 * 60);
  const timeBlocks = await prisma.timeBlock.findMany({
    where: {
      companyId: actor.companyId,
      startAt: { lt: blocksDayEnd },
      endAt: { gt: blocksDayStart },
      OR: [{ userId: opts.userId }, { userId: null }],
    },
    select: { startAt: true, endAt: true, allDay: true },
  });
  const busyBlocks = timeBlocks.map((b) => ({
    startMs: b.allDay ? blocksDayStart.getTime() : b.startAt.getTime(),
    endMs: b.allDay ? blocksDayEnd.getTime() : b.endAt.getTime(),
  }));

  // The tech's committed day: timed visits only ("anytime" stops have no slot
  // to defend), minus the visit being rescheduled.
  const stops = day.stops
    .filter(
      (s) =>
        s.assigneeIds.includes(opts.userId) &&
        !s.scheduledAnytime &&
        s.scheduledAt &&
        s.id !== opts.excludeId
    )
    .map((s) => {
      const start = new Date(s.scheduledAt!).getTime();
      const fallback = s.kind === "appointment" ? APPT_DEFAULT_MINUTES : DEFAULT_JOB_DURATION_MINUTES;
      const end = s.scheduledEnd ? new Date(s.scheduledEnd).getTime() : start + fallback * 60000;
      return { ...s, startMs: start, endMs: Math.max(end, start) };
    })
    .sort((a, b) => a.startMs - b.startMs);

  // Where is the new visit? Free when cached; null coords = gap-fit mode.
  const target = opts.address?.trim()
    ? await geocodeAddress(opts.address, actor.companyId)
    : null;

  // One matrix over the day start (HQ, or the tech's own start address) +
  // the day's located stops + the new visit.
  const dayStart = dayStartFor(day, opts.userId);
  const located = stops.filter((s) => s.lat != null && s.lng != null);
  const points = [
    ...(dayStart ? [{ lat: dayStart.lat, lng: dayStart.lng }] : []),
    ...located.map((s) => ({ lat: s.lat!, lng: s.lng! })),
    ...(target ? [target] : []),
  ];
  const matrix = target && points.length >= 2 ? await driveTimeMatrix(points, actor.companyId) : null;
  const hqIdx = dayStart ? 0 : -1;
  const offset = dayStart ? 1 : 0;
  const targetIdx = target ? points.length - 1 : -1;
  const stopIdx = new Map(located.map((s, i) => [s.id, i + offset]));

  const legMinutes = (fromStopId: string | "hq" | null, toStopId: string | "hq" | null): number | null => {
    if (!matrix || targetIdx < 0) return null;
    const idx = (key: string | "hq" | null): number | null =>
      key === "hq" ? (hqIdx >= 0 ? hqIdx : null) : key ? (stopIdx.get(key) ?? null) : null;
    const from = fromStopId === null ? targetIdx : idx(fromStopId);
    const to = toStopId === null ? targetIdx : idx(toStopId);
    if (from == null || to == null) return null;
    return Math.round(matrix[from][to]);
  };

  // Candidate grid: the company's slot interval across that day's open hours —
  // the TECH's hours when they have their own week, else the company's.
  const hours = resolveWorkingHours(tech?.workingHours, sanitizeBusinessHours(company?.businessHours));
  const ranges = hours[DAY_KEYS[opts.date.getDay()]] ?? [];
  const interval = resolveSlotInterval({ companyIntervalMinutes: company?.schedulingIntervalMinutes });
  // Candidate wall-times resolve in the COMPANY's timezone (DST-safe per
  // slot), not the server's
  const slotStartMs = (minutesOfDay: number) =>
    wallTimeToUtc(
      tz,
      opts.date.getFullYear(),
      opts.date.getMonth() + 1,
      opts.date.getDate(),
      minutesOfDay
    ).getTime();

  type Candidate = TimeSuggestion & { startMs: number; gapKey: string };
  const byGap = new Map<string, Candidate>();

  for (const range of ranges) {
    const open = timeToMinutes(range.start);
    const close = timeToMinutes(range.end);
    if (open == null || close == null) continue;
    for (let m = Math.ceil(open / interval) * interval; m + duration <= close; m += interval) {
      const startMs = slotStartMs(m);
      const endMs = startMs + duration * 60000;
      if (startMs <= Date.now()) continue; // no time travel (past slots on any day)
      if (stops.some((s) => startMs < s.endMs && endMs > s.startMs)) continue; // occupied
      if (busyBlocks.some((b) => startMs < b.endMs && endMs > b.startMs)) continue; // blocked time

      const prev = [...stops].reverse().find((s) => s.endMs <= startMs) ?? null;
      const next = stops.find((s) => s.startMs >= endMs) ?? null;

      const driveFromPrev = legMinutes(prev ? prev.id : dayStart ? "hq" : null, null);
      const driveToNext = next ? legMinutes(null, next.id) : null;

      // Feasibility: the gap must absorb the drive on both sides. The first
      // visit of the day has no inbound constraint — the HQ leg happens
      // before the day starts (but still counts toward the ranking).
      if (prev && driveFromPrev != null && startMs - prev.endMs < driveFromPrev * 60000) continue;
      if (next && driveToNext != null && next.startMs - endMs < driveToNext * 60000) continue;

      const gapKey = `${prev?.id ?? "open"}|${next?.id ?? "close"}|${range.start}`;
      if (byGap.has(gapKey)) continue; // earliest feasible start per gap
      byGap.set(gapKey, {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        startMs,
        gapKey,
        driveFromPrev,
        driveToNext,
        prevTitle: prev ? prev.title : dayStart && driveFromPrev != null ? dayStart.label : null,
        nextTitle: next?.title ?? null,
        totalDriveMinutes:
          driveFromPrev == null && driveToNext == null
            ? null
            : (driveFromPrev ?? 0) + (driveToNext ?? 0),
      });
    }
  }

  const suggestions = [...byGap.values()]
    .sort(
      (a, b) =>
        (a.totalDriveMinutes ?? Number.MAX_SAFE_INTEGER) -
          (b.totalDriveMinutes ?? Number.MAX_SAFE_INTEGER) || a.startMs - b.startMs
    )
    .slice(0, 6)
    .map(({ startMs: _s, gapKey: _g, ...rest }) => rest);

  return { driveAware: target != null, suggestions };
}
