// Relative imports (not "@/lib/...") so `npx tsx scripts/test-booking-engine.ts`
// can run this module without the Next.js path alias.
import { type BusinessHours, DAY_KEYS, timeToMinutes } from "./business-hours";
import { estimateDriveBetween, type RoutePoint } from "./geo-estimate";

/**
 * Online-booking availability engine v2 — pure, no I/O, unit-tested.
 *
 * One function answers "can this member take a booking starting here?" and
 * everything else (the public slot list, the settings preview, the submit-
 * time re-check, member assignment) is built on it, so the picker, the
 * server and the settings page can never disagree.
 *
 * Per candidate (member, start):
 *   fits hours       member's effective hours contain [start, end)
 *   not busy         nothing overlaps [start − bufferBefore, end + bufferAfter)
 *   under daily cap  bookings of this type that day < maxPerDay
 *   drive-feasible   (in-person, when the visit is located)
 *     prev = latest busy ending ≤ start that day, else the day-start pin
 *     next = earliest busy starting ≥ end that day
 *     prev.end + drive(prev → here) ≤ start
 *     end + drive(here → next) ≤ next.start
 *     each leg ≤ driveLimitMinutes when the owner set one
 *
 * drive() defaults to the free haversine estimate; the submit path swaps in
 * real road minutes for the one chosen slot. Unlocated busy items can't be
 * judged and contribute only the buffers. All wall-clock math happens in the
 * company timezone (DST-safe via Intl); every Date in and out is a UTC instant.
 */

export type LatLng = RoutePoint;

export type BusyInterval = {
  start: Date;
  end: Date;
  /** Where the member is for this commitment; null/absent = unknown. */
  loc?: LatLng | null;
  /** Which booking type produced it (feeds the per-day cap). */
  bookingTypeId?: string | null;
  label?: string;
};

export type EngineMember = {
  id: string;
  /** Per-member weekly hours; null/absent = works the company's hours. */
  hours?: BusinessHours | null;
  busy: BusyInterval[];
  /** Where this member's day begins; null = the company's day-start pin. */
  startLoc?: LatLng | null;
  priority?: number;
  lastAssignedAt?: Date | null;
};

export type EngineRules = {
  timezone: string; // IANA
  hours: BusinessHours; // company grid — bounds every candidate
  durationMinutes: number;
  stepMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  leadHours: number;
  horizonDays: number;
  /** Per member per day, this type; null = no cap. */
  maxPerDay: number | null;
  /** Evenly sample the day's offered slots down to this many; null = all. */
  maxShownPerDay: number | null;
  /** Width of the promised window; 0 = exact start (calls). */
  arrivalWindowMinutes: number;
  bookingTypeId?: string | null;
  /** In-person: where the new visit is. Absent/null = no drive checks. */
  target?: LatLng | null;
  /** Company day-start pin (the shop); members may override with startLoc. */
  dayStartLoc?: LatLng | null;
  /** Max minutes for any single leg into/out of the visit; null = no limit. */
  driveLimitMinutes?: number | null;
  /** Minutes between two points; defaults to the haversine estimate. */
  driveMinutes?: (from: LatLng, to: LatLng) => number;
};

export type Slot = {
  start: Date;
  end: Date; // start + duration — what the booking blocks
  windowEnd: Date; // start + arrivalWindowMinutes — what the client is promised
  memberIds: string[];
};

export type SlotCheck = {
  ok: boolean;
  reason?: "lead" | "hours" | "busy" | "cap" | "drive";
  prev: BusyInterval | null;
  next: BusyInterval | null;
  driveFromPrev: number | null;
  driveToNext: number | null;
};

// ─── Timezone helpers (Intl-based, DST-safe) ─────────────────────────────────

/** Minutes east of UTC for `tz` at instant `date` (negative for the US). */
function tzOffsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** UTC instant for a wall-clock time in `tz`. Iterates twice for DST edges. */
export function wallTimeToUtc(tz: string, y: number, month1: number, d: number, minutesOfDay: number): Date {
  const wall = Date.UTC(y, month1 - 1, d, 0, minutesOfDay);
  let ts = wall;
  for (let i = 0; i < 2; i++) ts = wall - tzOffsetMinutes(tz, new Date(ts)) * 60000;
  return new Date(ts);
}

export type DayKeyIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Y/M/D + weekday + minutes-since-midnight of an instant, seen from `tz`. */
export function localParts(
  tz: string,
  date: Date
): { y: number; m: number; d: number; day: DayKeyIndex; minutes: number; key: string } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let y = 0, m = 0, d = 0, wd = "Sun", h = 0, mi = 0;
  for (const part of dtf.formatToParts(date)) {
    if (part.type === "year") y = Number(part.value);
    else if (part.type === "month") m = Number(part.value);
    else if (part.type === "day") d = Number(part.value);
    else if (part.type === "weekday") wd = part.value;
    else if (part.type === "hour") h = Number(part.value) % 24;
    else if (part.type === "minute") mi = Number(part.value);
  }
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return {
    y, m, d,
    day: (idx < 0 ? 0 : idx) as DayKeyIndex,
    minutes: h * 60 + mi,
    key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}

/** "YYYY-MM-DD" of an instant in `tz`. */
export function localDayKey(tz: string, date: Date): string {
  return localParts(tz, date).key;
}

/** Y/M/D + weekday of an instant, seen from `tz` (the schedule pages' "today"). */
export function localDayParts(tz: string, date: Date): { y: number; m: number; d: number; day: DayKeyIndex } {
  const { y, m, d, day } = localParts(tz, date);
  return { y, m, d, day };
}

// ─── The check ───────────────────────────────────────────────────────────────

function overlaps(aStart: number, aEnd: number, b: BusyInterval): boolean {
  return aStart < b.end.getTime() && b.start.getTime() < aEnd;
}

/** Does this member work the whole [startMin, endMin) window on that weekday?
 *  No personal hours = yes (the company grid already bounds the slot). */
function worksWindow(hours: BusinessHours | null | undefined, day: DayKeyIndex, startMin: number, endMin: number): boolean {
  if (!hours) return true;
  const ranges = hours[DAY_KEYS[day]] ?? [];
  return ranges.some((r) => {
    const s = timeToMinutes(r.start);
    const e = timeToMinutes(r.end);
    return s !== null && e !== null && s <= startMin && endMin <= e;
  });
}

/**
 * Evaluate one member for a booking starting at `start`. `now` gates the
 * lead time; pass the same instant to every call of one sweep.
 */
export function checkSlot(rules: EngineRules, member: EngineMember, start: Date, now: Date): SlotCheck {
  const fail = (reason: SlotCheck["reason"], extra: Partial<SlotCheck> = {}): SlotCheck => ({
    ok: false,
    reason,
    prev: null,
    next: null,
    driveFromPrev: null,
    driveToNext: null,
    ...extra,
  });
  const startMs = start.getTime();
  const endMs = startMs + rules.durationMinutes * 60000;
  if (startMs < now.getTime() + rules.leadHours * 3600000) return fail("lead");

  const lp = localParts(rules.timezone, start);
  if (!worksWindow(member.hours, lp.day, lp.minutes, lp.minutes + rules.durationMinutes)) return fail("hours");

  const padStart = startMs - rules.bufferBeforeMinutes * 60000;
  const padEnd = endMs + rules.bufferAfterMinutes * 60000;
  if (member.busy.some((b) => overlaps(padStart, padEnd, b))) return fail("busy");

  // Same local day only — the day-start pin resets the route each morning
  const sameDay = member.busy
    .filter((b) => localDayKey(rules.timezone, b.start) === lp.key)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (rules.maxPerDay != null && rules.bookingTypeId) {
    const count = sameDay.filter((b) => b.bookingTypeId === rules.bookingTypeId).length;
    if (count >= rules.maxPerDay) return fail("cap");
  }

  let prev: BusyInterval | null = null;
  for (const b of sameDay) if (b.end.getTime() <= startMs) prev = b;
  const next = sameDay.find((b) => b.start.getTime() >= endMs) ?? null;

  let driveFromPrev: number | null = null;
  let driveToNext: number | null = null;
  const target = rules.target ?? null;
  if (target) {
    const drive = rules.driveMinutes ?? estimateDriveBetween;
    const limit = rules.driveLimitMinutes && rules.driveLimitMinutes > 0 ? rules.driveLimitMinutes : null;
    const fromLoc = prev ? (prev.loc ?? null) : (member.startLoc ?? rules.dayStartLoc ?? null);
    if (fromLoc) {
      driveFromPrev = Math.round(drive(fromLoc, target));
      // The first visit of the day has no inbound gap constraint (the leg
      // happens before the day starts) — only the owner's per-leg limit.
      if (prev && prev.end.getTime() + driveFromPrev * 60000 > startMs) {
        return fail("drive", { prev, next, driveFromPrev });
      }
      if (limit != null && driveFromPrev > limit) return fail("drive", { prev, next, driveFromPrev });
    }
    if (next?.loc) {
      driveToNext = Math.round(drive(target, next.loc));
      if (endMs + driveToNext * 60000 > next.start.getTime()) {
        return fail("drive", { prev, next, driveFromPrev, driveToNext });
      }
      if (limit != null && driveToNext > limit) return fail("drive", { prev, next, driveFromPrev, driveToNext });
    }
  }

  return { ok: true, prev, next, driveFromPrev, driveToNext };
}

// ─── The sweep ───────────────────────────────────────────────────────────────

/** Every candidate start in the horizon where ≥1 member passes checkSlot. */
export function generateSlots(rules: EngineRules, members: EngineMember[], now: Date): Slot[] {
  if (rules.durationMinutes <= 0 || members.length === 0) return [];
  const step = rules.stepMinutes > 0 ? rules.stepMinutes : 30;
  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset <= rules.horizonDays; dayOffset++) {
    // Walk days by adding 24h, then read the local Y/M/D — immune to DST
    // days being 23/25 hours long.
    const probe = new Date(now.getTime() + dayOffset * 86400000);
    const { y, m, d, day } = localParts(rules.timezone, probe);
    const ranges = rules.hours[DAY_KEYS[day]] ?? [];
    const daySlots: Slot[] = [];

    for (const range of ranges) {
      const open = timeToMinutes(range.start);
      const close = timeToMinutes(range.end);
      if (open === null || close === null) continue;
      for (let t = Math.ceil(open / step) * step; t + rules.durationMinutes <= close; t += step) {
        const start = wallTimeToUtc(rules.timezone, y, m, d, t);
        const free = members.filter((u) => checkSlot(rules, u, start, now).ok);
        if (free.length === 0) continue;
        daySlots.push({
          start,
          end: new Date(start.getTime() + rules.durationMinutes * 60000),
          windowEnd: new Date(start.getTime() + rules.arrivalWindowMinutes * 60000),
          memberIds: free.map((u) => u.id),
        });
      }
    }

    // Cap what we show per day by sampling EVENLY across the open slots —
    // taking the first N would only ever offer mornings on a 8am–9pm day.
    const cap = rules.maxShownPerDay;
    if (cap == null || daySlots.length <= cap) {
      slots.push(...daySlots);
    } else if (cap === 1) {
      slots.push(daySlots[0]);
    } else {
      for (let i = 0; i < cap; i++) {
        slots.push(daySlots[Math.round((i * (daySlots.length - 1)) / (cap - 1))]);
      }
    }
  }
  return slots;
}

// ─── Assignment ──────────────────────────────────────────────────────────────

/**
 * Who takes a booking at `start`: the members who pass the check, ordered by
 * priority (PRIORITY mode only), then least recently assigned (never = first),
 * then fewest upcoming bookings of this type, then input order. Returns the
 * winner's id or null when nobody fits (the slot was lost).
 */
export function pickMember(
  rules: EngineRules,
  members: EngineMember[],
  start: Date,
  now: Date,
  mode: "ROUND_ROBIN" | "PRIORITY" = "ROUND_ROBIN"
): string | null {
  const weekOut = now.getTime() + 7 * 86400000;
  const upcoming = (u: EngineMember) =>
    rules.bookingTypeId
      ? u.busy.filter((b) => b.bookingTypeId === rules.bookingTypeId && b.start.getTime() >= now.getTime() && b.start.getTime() < weekOut).length
      : 0;
  const ranked = members
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => checkSlot(rules, u, start, now).ok)
    .sort((a, b) => {
      if (mode === "PRIORITY") {
        const p = (b.u.priority ?? 0) - (a.u.priority ?? 0);
        if (p !== 0) return p;
      }
      const la = a.u.lastAssignedAt?.getTime() ?? -Infinity;
      const lb = b.u.lastAssignedAt?.getTime() ?? -Infinity;
      if (la !== lb) return la - lb;
      const ua = upcoming(a.u);
      const ub = upcoming(b.u);
      if (ua !== ub) return ua - ub;
      return a.i - b.i;
    });
  return ranked[0]?.u.id ?? null;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const timeFmt = (tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
const dayFmt = (tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
const longDayFmt = (tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** "8:00 AM – 10:00 AM" (window) or "8:00 AM" (exact), in `tz`. */
export function timeLabel(tz: string, start: Date, windowEnd: Date): string {
  const f = timeFmt(tz);
  return windowEnd.getTime() > start.getTime() ? `${f.format(start)} – ${f.format(windowEnd)}` : f.format(start);
}

/** "Tue, Jul 7, 8:00 AM – 10:00 AM" — emails, confirmations, push. */
export function slotLabel(tz: string, start: Date, windowEnd: Date): string {
  return `${dayFmt(tz).format(start)}, ${timeLabel(tz, start, windowEnd)}`;
}

/** "Tuesday, July 7, 2026" */
export function longDayLabel(tz: string, date: Date): string {
  return longDayFmt(tz).format(date);
}

export type SlotDay = {
  date: string; // YYYY-MM-DD in tz
  label: string; // "Tue, Jul 7"
  slots: { start: string; end: string; windowEnd: string; label: string }[];
};

/** Group engine output into renderable days, labeled in `tz`. */
export function groupSlotsByDay(tz: string, slots: Slot[]): SlotDay[] {
  const days: SlotDay[] = [];
  let current: SlotDay | null = null;
  for (const s of slots) {
    const key = localDayKey(tz, s.start);
    if (!current || current.date !== key) {
      current = { date: key, label: dayFmt(tz).format(s.start), slots: [] };
      days.push(current);
    }
    current.slots.push({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      windowEnd: s.windowEnd.toISOString(),
      label: timeLabel(tz, s.start, s.windowEnd),
    });
  }
  return days;
}
