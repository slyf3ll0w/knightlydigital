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
  if (stop.scheduledAt && stop.scheduledEnd) {
    if (stop.scheduledAnytime) {
      // An Anytime stop has no slot, but a generated visit (noon anchor +
      // the series' visit length) still says how long it takes — a four-hour
      // install used to be packed as an hour.
      const mins = (new Date(stop.scheduledEnd).getTime() - new Date(stop.scheduledAt).getTime()) / 60000;
      return mins > 0 ? mins : fallbackMin;
    }
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

export type WalkStop = {
  id: string;
  durationMin: number;
  /** The client can't take the visit before this (ms) — the walk waits. */
  earliestMs?: number | null;
  /** …or after this (ms) — the walk can't fix that, it flags `late`. */
  latestMs?: number | null;
};

export type WalkedStop = {
  id: string;
  startMs: number;
  endMs: number;
  /** Raw drive minutes into this stop (null for the first — that leg happens before the day starts). */
  driveMin: number | null;
  /** Minutes the tech waits at (or before) this stop for its window to open. */
  waitMin: number;
  /** Arrives after the stop's `latestMs`. */
  late: boolean;
};

/**
 * Lay the stops out in order. The first keeps the anchor; every later stop
 * starts after the previous one ends plus `gapMinutes(drive)`. A stop that
 * would land on a fixed interval slides to that interval's end (and is
 * re-checked, since sliding can land it on the next one). A stop with an
 * `earliestMs` window waits for it; one whose start passes `latestMs` is
 * marked late (the caller warns, or reorders — see repairWindows).
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
    let waitMin = 0;
    if (s.earliestMs != null && startMs < s.earliestMs) {
      waitMin = Math.round((s.earliestMs - startMs) / 60000);
      startMs = s.earliestMs;
    }
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
    return { id: s.id, startMs, endMs, driveMin, waitMin, late: s.latestMs != null && startMs > s.latestMs };
  });
}

/**
 * The solver orders stops by drive alone; a client's "not before 1 PM" or
 * "before noon" can leave that order arriving late somewhere. This moves
 * each late stop, one at a time, to the position where the walk arrives on
 * time with the fewest OTHER stops made late (and the least drive on ties),
 * and stops when nothing improves. Pure; `walk(order)` is the caller's
 * walkDay over that order.
 */
export function repairWindows(
  order: string[],
  walk: (order: string[]) => WalkedStop[],
  cost: (order: string[]) => number
): string[] {
  let current = [...order];
  let walked = walk(current);
  let lateCount = walked.filter((w) => w.late).length;
  let currentCost = cost(current);
  for (let guard = 0; guard < order.length && lateCount > 0; guard++) {
    const lateId = walked.find((w) => w.late)!.id;
    let best: { order: string[]; late: number; cost: number } | null = null;
    const without = current.filter((id) => id !== lateId);
    for (let pos = 0; pos <= without.length; pos++) {
      const candidate = [...without.slice(0, pos), lateId, ...without.slice(pos)];
      const w = walk(candidate);
      if (w.find((x) => x.id === lateId)!.late) continue;
      const late = w.filter((x) => x.late).length;
      const c = cost(candidate);
      if (!best || late < best.late || (late === best.late && c < best.cost)) best = { order: candidate, late, cost: c };
    }
    if (!best || best.late > lateCount || (best.late === lateCount && best.cost >= currentCost)) break;
    current = best.order;
    walked = walk(current);
    lateCount = best.late;
    currentCost = best.cost;
  }
  return current;
}

/** Round a timestamp up to the next whole `stepMin` boundary. */
export function ceilToMinutes(ms: number, stepMin: number): number {
  const step = stepMin * 60000;
  return Math.ceil(ms / step) * step;
}

// ── Precedence ("pick up the valve BEFORE the Henderson job") ───────────────

/** [before, after] pairs: the first id must come earlier in the order than the second. */
export type Precedence = [string, string];

/** True when every pair holds in `order` (ids absent from the order don't constrain it). */
export function precedenceHolds(order: string[], pairs: Precedence[]): boolean {
  if (!pairs.length) return true;
  const at = new Map(order.map((id, i) => [id, i]));
  return pairs.every(([a, b]) => {
    const ia = at.get(a);
    const ib = at.get(b);
    return ia === undefined || ib === undefined || ia < ib;
  });
}

/**
 * Repair an order so every precedence pair holds, moving as little as
 * possible: each violating "before" stop is pulled to just ahead of its
 * target. Pure; a hand order gets the same treatment (the dispatcher asked
 * for the errand before that job — honour it).
 */
export function enforcePrecedence(order: string[], pairs: Precedence[]): string[] {
  let current = [...order];
  // A few passes settle chains (a before b, b before c); bounded for safety
  for (let guard = 0; guard < pairs.length + 1 && !precedenceHolds(current, pairs); guard++) {
    for (const [a, b] of pairs) {
      const ia = current.indexOf(a);
      const ib = current.indexOf(b);
      if (ia < 0 || ib < 0 || ia < ib) continue;
      current.splice(ia, 1);
      const target = current.indexOf(b);
      current.splice(target, 0, a);
    }
  }
  return current;
}

// ── Breaks (lunch inside a window) ──────────────────────────────────────────

/**
 * Where a break goes in a walked day: the index (in the stop list) to insert
 * it at, or null when the day is over before the window opens. The break
 * follows the first stop that ends once the window has opened; a stop that
 * straddles the whole window (a long install) is not split — the break goes
 * before it when something precedes it, else after it. The caller re-walks
 * with the break as a zero-drive stop whose window is [afterMs, beforeMs].
 */
export function breakInsertIndex(walked: Pick<WalkedStop, "startMs" | "endMs">[], afterMs: number, beforeMs: number): number | null {
  if (!walked.length) return null;
  const i = walked.findIndex((w) => w.endMs >= afterMs);
  if (i < 0) return null; // every stop ends before lunch could start — no break today
  if (walked[i].endMs <= beforeMs) return i + 1; // after the first stop that ends inside the window
  // Stop i ends past the window: it either starts inside it (break before it) or spans it entirely
  if (walked[i].startMs >= afterMs) return i;
  return i > 0 ? i : i + 1;
}
