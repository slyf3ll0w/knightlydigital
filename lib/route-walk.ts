/**
 * Pure pieces of the route optimizer and the calendar's drive-leg chain —
 * no Prisma, no network — so `scripts/test-route-plan.ts` can drive them.
 *
 *  - `routedChain`: which of a tech's stops the drive-leg labels chain
 *    through (timed stops only; "Anytime"/all-day rows have no slot, so a
 *    leg "from" one of them would label the wrong gap on the calendar).
 *  - `clampedDurationMinutes`: how long a stop occupies THIS day. A job that
 *    runs into tomorrow used to carry its whole 30-hour span into the walk
 *    and shove the rest of the day onto the next evening.
 *  - `walkDay`: lay the ordered stops out from the anchor, drive gap between
 *    them, stepping over fixed commitments (blocked time, tentative /
 *    phone appointments, pinned stops) instead of writing on top of them.
 */

export type Interval = { startMs: number; endMs: number };

export type ChainStop = {
  id: string;
  assigneeIds: string[];
  scheduledAt: string | null;
  scheduledAnytime: boolean;
};

/** The stops the drive-leg chain walks for one tech, in calendar order. */
export function routedChain<T extends ChainStop>(stops: T[], userId: string): T[] {
  return stops
    .filter((s) => s.assigneeIds.includes(userId) && !s.scheduledAnytime && s.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
}

export type TimedStop = {
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
};

/** True when a timed stop's end lands after the day being routed ends. */
export function runsPastDay(stop: TimedStop, dayEndMs: number): boolean {
  if (stop.scheduledAnytime || !stop.scheduledEnd) return false;
  return new Date(stop.scheduledEnd).getTime() > dayEndMs;
}

/**
 * Minutes the stop takes up inside [dayStartMs, dayEndMs). Untimed or
 * end-less stops fall back to `fallbackMin`; a span that leaves the day is
 * cut at the day's edge so the walk can never run past midnight on its own.
 */
export function clampedDurationMinutes(
  stop: TimedStop,
  dayStartMs: number,
  dayEndMs: number,
  fallbackMin: number
): number {
  if (!stop.scheduledAnytime && stop.scheduledAt && stop.scheduledEnd) {
    const start = Math.max(new Date(stop.scheduledAt).getTime(), dayStartMs);
    const end = Math.min(new Date(stop.scheduledEnd).getTime(), dayEndMs);
    const mins = (end - start) / 60000;
    if (mins > 0) return mins;
  }
  return fallbackMin;
}

/** A stop's [start, end) clipped to the day, or null when it has no time. */
export function dayInterval(stop: TimedStop, dayStartMs: number, dayEndMs: number, fallbackMin: number): Interval | null {
  if (stop.scheduledAnytime || !stop.scheduledAt) return null;
  const startMs = Math.max(new Date(stop.scheduledAt).getTime(), dayStartMs);
  const rawEnd = stop.scheduledEnd ? new Date(stop.scheduledEnd).getTime() : startMs + fallbackMin * 60000;
  const endMs = Math.min(rawEnd, dayEndMs);
  return endMs > startMs ? { startMs, endMs } : null;
}

export type WalkStop = { id: string; durationMin: number };

export type WalkedStop = {
  id: string;
  startMs: number;
  endMs: number;
  /** Raw drive minutes into this stop (null for the first — that leg happens before the day starts). */
  driveMin: number | null;
};

/**
 * Lay the stops out in order. The first keeps the anchor; every later stop
 * starts after the previous one ends plus `gapMinutes(drive)`. A stop that
 * would land on a fixed interval slides to that interval's end (and is
 * re-checked, since sliding can land it on the next one).
 */
export function walkDay(opts: {
  anchorMs: number;
  stops: WalkStop[];
  /** Drive minutes from stops[prev] to stops[index]. */
  driveMinutes: (prev: number, index: number) => number;
  /** Rounding applied to a drive before it becomes a gap (default: as-is). */
  gapMinutes?: (driveMin: number) => number;
  fixed?: Interval[];
}): WalkedStop[] {
  const gap = opts.gapMinutes ?? ((m) => m);
  const fixed = [...(opts.fixed ?? [])].sort((a, b) => a.startMs - b.startMs);
  let cursor = opts.anchorMs;
  return opts.stops.map((s, i) => {
    const driveMin = i === 0 ? null : opts.driveMinutes(i - 1, i);
    let startMs = i === 0 ? cursor : cursor + gap(driveMin!) * 60000;
    const durMs = s.durationMin * 60000;
    // Step over anything fixed that the proposed span would overlap. Sorted
    // by start, so one pass from the top settles it; bounded for safety.
    for (let guard = 0; guard < fixed.length + 1; guard++) {
      const hit = fixed.find((f) => f.startMs < startMs + durMs && f.endMs > startMs);
      if (!hit) break;
      startMs = hit.endMs;
    }
    const endMs = startMs + durMs;
    cursor = endMs;
    return { id: s.id, startMs, endMs, driveMin };
  });
}

/** Round a timestamp up to the next whole `stepMin` boundary. */
export function ceilToMinutes(ms: number, stepMin: number): number {
  const step = stepMin * 60000;
  return Math.ceil(ms / step) * step;
}
