import { NextRequest, NextResponse } from "next/server";
import { apptForUsers, peopleOf, peopleSelect } from "@/lib/appointment-people";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import {
  dayEndFor,
  dayStartFor,
  minuteOnDay,
  parseRouteDate,
  resolveRouteDay,
  type RouteStop,
  type StopKind,
} from "@/lib/route-plan";
import { driveMatrix, kmToMiles, roundGapMinutes, routeMinutes, samePoint, solveStopOrder, type IndexPrecedence } from "@/lib/routing";
import { notifyClientOfMove } from "@/lib/schedule-notify";
import { rescheduleReminderStamps } from "@/lib/reminder-stage";
import { DEFAULT_JOB_DURATION_MINUTES } from "@/lib/scheduling";
import {
  DAY_KEYS,
  resolveWorkingHours,
  sanitizeBusinessHours,
  timeToMinutes,
} from "@/lib/business-hours";
import { wallTimeToUtc } from "@/lib/booking-engine";
import {
  breakInsertIndex,
  ceilToMinutes,
  clampedDurationMinutes,
  dayInterval,
  enforcePrecedence,
  repairWindows,
  runsPastDay,
  walkDay,
  type Interval,
  type Precedence,
  type WalkStop,
} from "@/lib/route-walk";
import { checkFeature } from "@/lib/plan-gate";

/** The id a not-yet-saved automatic lunch carries through preview → apply. */
const NEW_BREAK_ID = "break:new";

/**
 * POST /api/app/route-plan/optimize — order one tech's day by drive time.
 *
 * Body: {
 *   date: "YYYY-MM-DD",
 *   userId: string,            // whose route
 *   order?: string[],          // manual stop order (stop ids) instead of solving
 *   keep?: string[],           // stops to keep at their current time (locks);
 *                              // absent = every stop a reminder already went out for
 *   anchorTime?: "HH:mm",      // when the day starts (default: earliest timed stop)
 *   roundTrip?: boolean,       // cost the drive to the day's end point
 *                              // (default: the member's "day ends at" setting)
 *   notify?: boolean,          // on apply: tell each client whose time changed
 *   apply?: boolean            // false/absent = preview only, nothing written
 * }
 *
 * The route covers the tech's jobs, confirmed in-person appointments,
 * flexible errands (supply house, dump — placed inside their float window
 * and before the job they're for), all-day tasks with a place, and lunch:
 * an existing BREAK block, or the company's automatic break when the day
 * has none (saved as a BREAK block on apply). Preview returns the proposed
 * order with proposed times and the drive-time delta; apply rewrites
 * scheduledAt/scheduledEnd (durations preserved, drive-time gaps between
 * stops, "Anytime" stops get real times) inside one transaction, clearing
 * client-reminder stamps so moved visits remind at their new times.
 * Tentative (unconfirmed) bookings, phone/video appointments, plain time
 * blocks and timed errands/tasks are never moved — the walk steps over the
 * routed tech's own and warns about teammates'. Stops that already started
 * today, are on the clock, run into the next day, or are LOCKED (`keep`)
 * are pinned (`pinned` in the response): they hold their times and the
 * route is laid out around them. A stop's client window
 * (Job.arriveAfterMin/BeforeMin) is honoured: the walk waits for it to
 * open and the order is repaired so nobody is arrived at after their
 * window closes when another order can avoid it; when none can, the
 * preview warns.
 *
 * Who may run it mirrors the job PATCH: managers + USER for any tech, TECH
 * for their own route only, SALES never. Part of Route Manager (Pro).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const gate = await checkFeature(actor.companyId, "routes");
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  const dispatcher = isManager(actor.role) || actor.role === "USER";
  if (!dispatcher && userId !== actor.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, companyId: actor.companyId, isActive: true },
    select: { id: true, name: true, workingHours: true, dayEndsAt: true },
  });
  if (!user) return NextResponse.json({ error: "Team member not found." }, { status: 404 });

  // All wall-clock math (the "today" default, anchor, day bounds, warning
  // labels) runs in the COMPANY's timezone, not the server's
  const tzCompany = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true, businessHours: true },
  });
  const tz = tzCompany?.timezone || "America/Chicago";
  const date = parseRouteDate(typeof body.date === "string" ? body.date : null, tz);
  const day = await resolveRouteDay(actor, date);
  const dayStart = wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), 0);
  const dayEnd = wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), 24 * 60);
  const now = new Date();
  const isToday = now.getTime() >= dayStart.getTime() && now.getTime() < dayEnd.getTime();
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

  // A day the tech (or the whole company) is blocked off has no route
  const dayOff = await prisma.timeBlock.findFirst({
    where: {
      companyId: actor.companyId,
      allDay: true,
      kind: "BLOCK",
      startAt: { lt: dayEnd },
      endAt: { gt: dayStart },
      OR: [{ userId }, { userId: null }],
    },
    select: { title: true, userId: true },
  });
  if (dayOff) {
    return NextResponse.json(
      {
        error: dayOff.userId
          ? `${user.name} is blocked off all day${dayOff.title ? ` (${dayOff.title})` : ""} — nothing to route.`
          : `The company is closed that day${dayOff.title ? ` (${dayOff.title})` : ""} — nothing to route.`,
        skipped: [],
        pinned: [],
      },
      { status: 400 }
    );
  }

  // Routable: the tech's jobs, confirmed in-person appointments, flexible
  // errands and breaks, and all-day tasks with a place. Tentative bookings
  // hold their promised slot — they only warn. Phone/video appointments (no
  // address) ride the day as pin-less stops for Find-a-Time's sake; they're
  // not routable and already warn via apptsRaw. A timed errand/task keeps
  // its time like a block. Done errands/tasks are over.
  const isRoutable = (s: RouteStop) => {
    if (!s.assigneeIds.includes(userId)) return false;
    switch (s.kind) {
      case "job":
        return s.status === "ACTIVE" && s.progress !== "done";
      case "appointment":
        return s.status === "SCHEDULED" && !s.tentative && s.address != null;
      case "errand":
      case "task":
      case "break":
        return s.flexible && s.progress !== "done";
      default:
        return false;
    }
  };
  const assigned = day.stops.filter(isRoutable);
  // A break has no place of its own — it rides the route without a pin
  const mapped = assigned.filter((s) => s.kind === "break" || (s.lat != null && s.lng != null));
  const skipped = assigned.filter((s) => s.kind !== "break" && s.lat == null).map((s) => s.title);

  // Locks: an explicit list wins; otherwise every stop whose client already
  // heard a time (a reminder went out) keeps it — re-timing a promised visit
  // is a decision, never a side effect of pressing Optimize.
  const keepIds = new Set<string>(
    Array.isArray(body.keep)
      ? body.keep.filter((v: unknown): v is string => typeof v === "string")
      : mapped.filter((s) => s.reminded).map((s) => s.id)
  );

  // Pinned: on the route's day but not up for re-timing — a visit that has
  // already started (its time is in the past, or a tech is on the clock
  // there), a job that runs into tomorrow (its span isn't one day's work;
  // re-timing it would drag the rest of the day after it), and anything
  // locked. They hold their times and the walk steps around them.
  const pinReason = (s: RouteStop): string | null => {
    if (s.kind === "job" && s.progress === "active") return "in progress";
    if (isToday && !s.scheduledAnytime && s.scheduledAt && new Date(s.scheduledAt).getTime() < now.getTime())
      return "already started";
    if (runsPastDay(s, dayEnd.getTime())) return "runs into the next day";
    if (keepIds.has(s.id) && !s.scheduledAnytime && s.scheduledAt) return "kept";
    return null;
  };
  const pinnedStops = mapped.map((s) => ({ stop: s, reason: pinReason(s)! })).filter((p) => p.reason);
  const pinned = pinnedStops.map((p) => `${p.stop.title} (${p.reason})`);
  const pinnedDetail = pinnedStops.map((p) => ({
    id: p.stop.id,
    kind: p.stop.kind,
    title: p.stop.title,
    contactName: p.stop.contactName,
    reason: p.reason,
    /** Only a "kept" pin can be released from the preview. */
    locked: p.reason === "kept",
    start: p.stop.scheduledAt,
    end: p.stop.scheduledEnd,
  }));
  // Errands and tasks given a set time hold it (they're walls the walk steps
  // around) — list them with the pins so the preview reads as the whole day
  for (const s of day.stops) {
    if ((s.kind === "errand" || s.kind === "task") && !s.flexible && !s.scheduledAnytime && s.progress !== "done" && s.assigneeIds.includes(userId)) {
      pinnedDetail.push({
        id: s.id,
        kind: s.kind,
        title: s.title,
        contactName: s.contactName,
        reason: "set time",
        locked: false,
        start: s.scheduledAt,
        end: s.scheduledEnd,
      });
    }
  }
  const pinnedIds = new Set(pinnedStops.map((p) => p.stop.id));
  const stops = mapped.filter((s) => !pinnedIds.has(s.id));

  // The automatic lunch: the company's default, unless the day already has
  // a break of its own (routed, pinned, or fixed)
  const existingBreak = day.stops.some((s) => s.kind === "break" && s.assigneeIds.includes(userId));
  const breakDefault = day.breakDefault;
  const autoBreak: RouteStop | null =
    !existingBreak && breakDefault.minutes > 0
      ? {
          id: NEW_BREAK_ID,
          kind: "break",
          jobNumber: null,
          title: "Lunch",
          status: "BREAK",
          progress: "pending",
          contactName: "",
          address: null,
          scheduledAt: null,
          scheduledEnd: null,
          scheduledAnytime: true,
          tentative: false,
          reminded: false,
          windowStart: minuteOnDay(tz, date, breakDefault.afterMin),
          windowEnd: minuteOnDay(tz, date, breakDefault.beforeMin),
          assigneeIds: [userId],
          lat: null,
          lng: null,
          flexible: true,
          beforeStopId: null,
          durationMin: breakDefault.minutes,
        }
      : null;

  // Located stops are what the solver orders; breaks slot in afterwards.
  // One is enough: a single flexible errand around a set-time one still
  // needs a time ("when should I be there?").
  const located = stops.filter((s) => s.kind !== "break");
  if (located.length < 1) {
    return NextResponse.json(
      {
        error:
          pinned.length && mapped.length >= 1
            ? pinnedStops.some((p) => p.reason === "kept")
              ? "Every stop is kept at its time — unlock one to build a route."
              : "Every stop has already started — nothing left to place."
            : skipped.length
              ? "Nothing to place yet: the stops on this day have no map pin (check their addresses)."
              : "Nothing to place yet: add a stop that Optimize may move, or give an errand a set time.",
        skipped,
        pinned,
        pinnedStops: pinnedDetail,
      },
      { status: 400 }
    );
  }

  // Current order = how the day reads on the calendar right now
  const current = [...located].sort(
    (a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime()
  );

  // Matrix points: the day start first when we know it (the shop, or this
  // tech's own start address — index 0), the stops, then the day's END point
  // when it's somewhere other than the start (started at home, ends at the shop)
  const routeStart = dayStartFor(day, userId);
  const hasStart = routeStart != null;
  const routeEnd = dayEndFor(day, userId);
  const endIsStart = Boolean(routeStart && routeEnd && samePoint(routeStart, routeEnd));
  const separateEnd = routeEnd != null && !endIsStart;
  const points = [
    ...(hasStart ? [{ lat: routeStart!.lat, lng: routeStart!.lng }] : []),
    ...current.map((s) => ({ lat: s.lat!, lng: s.lng! })),
    ...(separateEnd ? [{ lat: routeEnd!.lat, lng: routeEnd!.lng }] : []),
  ];
  const offset = hasStart ? 1 : 0;
  const endIndex = separateEnd ? points.length - 1 : null;
  const dm = await driveMatrix(points, actor.companyId);
  const matrix = dm.minutes;
  // Round trip: cost the drive to where the day ends so the last stop lands
  // near it. Default from the member's setting; the preview's checkbox
  // overrides per run. Only meaningful when we know an end point.
  const roundTrip = (typeof body.roundTrip === "boolean" ? body.roundTrip : user.dayEndsAt !== "LAST_STOP") && routeEnd != null;
  // What routeMinutes/solveStopOrder close the path to
  const closeTo: boolean | number = !roundTrip ? false : endIndex != null ? endIndex : hasStart ? true : false;

  const currentOrder = current.map((_, i) => i + offset);
  const currentPath = hasStart ? [0, ...currentOrder] : currentOrder;
  const currentDriveMinutes = routeMinutes(matrix, currentPath, closeTo);

  // Precedence: an errand that must come before a job on this route. When
  // that job is pinned, the errand just has to be done before it starts —
  // that becomes the errand's cut-off instead.
  const routableIds = new Set(located.map((s) => s.id));
  const precedence: Precedence[] = [];
  const cutoffBefore = new Map<string, number>();
  for (const s of located) {
    if (s.kind !== "errand" || !s.beforeStopId) continue;
    if (routableIds.has(s.beforeStopId)) precedence.push([s.id, s.beforeStopId]);
    else {
      const target = day.stops.find((x) => x.id === s.beforeStopId);
      if (target?.scheduledAt && !target.scheduledAnytime) cutoffBefore.set(s.id, new Date(target.scheduledAt).getTime());
    }
  }

  // Target order: manual (validated: every routable stop present, extras —
  // a done stop, a pin the client didn't know about — ignored) or solved
  const byId = new Map<string, RouteStop>(current.map((s) => [s.id, s]));
  const breakStops = stops.filter((s) => s.kind === "break");
  for (const b of breakStops) byId.set(b.id, b);
  if (autoBreak) byId.set(autoBreak.id, autoBreak);
  const manual = Array.isArray(body.order);
  let orderedStops: RouteStop[];
  if (manual) {
    const ids: string[] = body.order.filter((v: unknown): v is string => typeof v === "string" && byId.has(v));
    const locatedIds = ids.filter((id) => byId.get(id)!.kind !== "break");
    if (new Set(locatedIds).size !== current.length) {
      return NextResponse.json(
        { error: "Stop list changed — reload the route and try again." },
        { status: 409 }
      );
    }
    // The dispatcher asked for the errand before that job — honour it even by hand
    orderedStops = enforcePrecedence([...new Set(ids)], precedence).map((id) => byId.get(id)!);
  } else {
    const indexPairs: IndexPrecedence = precedence.map(([a, b]) => [current.indexOf(byId.get(a)!) + offset, current.indexOf(byId.get(b)!) + offset]);
    const solved = solveStopOrder(matrix, hasStart ? 0 : currentPath[0], closeTo, indexPairs).filter((i) => i >= offset && i !== endIndex);
    orderedStops = solved.map((i) => current[i - offset]);
  }

  // The tech's hours today — the anchor for an all-Anytime day, and the
  // close we warn about running past
  const week = resolveWorkingHours(user.workingHours, sanitizeBusinessHours(tzCompany?.businessHours));
  const dayRanges = week[DAY_KEYS[date.getDay()]] ?? [];

  // Anchor: an explicit start time wins (the "day starts at" control —
  // per-day, per-run; Jobber can't do this); otherwise keep the day starting
  // when it already starts — the earliest timed stop; a fully-"Anytime" day
  // anchors where this tech's week begins (their working hours, else the
  // company's business hours, else 8:00 AM company-local).
  const timed = current.filter((s) => !s.scheduledAnytime && s.scheduledAt);
  const anchorMatch =
    typeof body.anchorTime === "string" ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(body.anchorTime) : null;
  let anchor: Date;
  if (anchorMatch) {
    anchor = wallTimeToUtc(
      tz,
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      Number(anchorMatch[1]) * 60 + Number(anchorMatch[2])
    );
  } else if (timed.length) {
    anchor = new Date(Math.min(...timed.map((s) => new Date(s.scheduledAt!).getTime())));
  } else {
    const startMin = (dayRanges.length ? timeToMinutes(dayRanges[0].start) : null) ?? 8 * 60;
    anchor = wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), startMin);
  }
  // Today's route can't start in the past — an 8 AM anchor at 1 PM would
  // re-time this afternoon's stops into the morning that's already gone
  if (isToday && anchor.getTime() < now.getTime()) {
    anchor = new Date(ceilToMinutes(now.getTime(), 5));
  }

  // Appointments default to their 30-minute convention, jobs to an hour,
  // errands / breaks / tasks to their own length; a span that leaves the
  // day is cut at the day's edge (see route-walk)
  const fallbackMinutes = (s: { kind: StopKind; durationMin: number | null }) =>
    s.kind === "appointment" ? 30 : s.durationMin ?? DEFAULT_JOB_DURATION_MINUTES;
  const durationOf = (s: RouteStop): number =>
    s.kind === "break" || s.kind === "errand" || s.kind === "task"
      ? Math.min(s.durationMin ?? fallbackMinutes(s), 12 * 60)
      : clampedDurationMinutes(s, dayStart.getTime(), dayEnd.getTime(), fallbackMinutes(s));

  // Fixed commitments we never move. Routed in-person appointments are
  // excluded (they move with the route); what's left is phone/video calls,
  // tentative bookings, blocked time, timed errands/tasks, pinned stops and
  // timed jobs that aren't on this route. The routed tech's own commitments
  // shape the walk (stops step around them); teammates' only warn. Moved
  // stops can carry CO-ASSIGNEES (a two-tech job), so their commitments are
  // scanned too — applying tech A's route must not silently bury tech B's day.
  const routedIds = new Set(orderedStops.map((s) => s.id));
  const scanUserIds = [...new Set([userId, ...orderedStops.flatMap((s) => s.assigneeIds)])];
  const [apptsRaw, blocksRaw, otherJobsRaw, scanUsers] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: actor.companyId,
        ...apptForUsers(scanUserIds),
        status: "SCHEDULED",
        scheduledAnytime: false,
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, title: true, scheduledAt: true, scheduledEnd: true, ...peopleSelect },
    }),
    prisma.timeBlock.findMany({
      where: {
        companyId: actor.companyId,
        allDay: false,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        OR: [{ userId: { in: scanUserIds } }, { userId: null }],
      },
      select: { id: true, title: true, startAt: true, endAt: true, userId: true, kind: true, flexible: true, placedAt: true },
    }),
    // Timed jobs that are NOT on this route (skipped for a missing pin, or
    // excluded by status) keep their old times — the new walk can run
    // straight over them without this scan.
    prisma.job.findMany({
      where: {
        companyId: actor.companyId,
        status: "ACTIVE",
        scheduledAnytime: false,
        scheduledAt: { gte: dayStart, lt: dayEnd },
        assignments: { some: { userId: { in: scanUserIds } } },
      },
      select: {
        id: true,
        jobNumber: true,
        title: true,
        scheduledAt: true,
        scheduledEnd: true,
        assignments: { select: { userId: true } },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: scanUserIds }, companyId: actor.companyId },
      select: { id: true, name: true },
    }),
  ]);
  const appts = apptsRaw.filter((a) => !routedIds.has(a.id));
  // A flexible errand / break that's on this route (or still unplaced)
  // isn't a wall — it moves with the day
  const blocks = blocksRaw.filter((b) => !routedIds.has(b.id) && !(b.kind !== "BLOCK" && b.flexible && b.placedAt == null));
  const otherJobs = otherJobsRaw.filter((j) => !routedIds.has(j.id));

  // What the routed tech's day already has nailed down — the walk lays the
  // route out around these instead of on top of them
  const clip = (start: Date, end: Date | null, fallbackMin: number): Interval | null =>
    dayInterval(
      { scheduledAt: start.toISOString(), scheduledEnd: end?.toISOString() ?? null, scheduledAnytime: false },
      dayStart.getTime(),
      dayEnd.getTime(),
      fallbackMin
    );
  const fixed: Interval[] = [
    ...blocks.filter((b) => b.userId === userId || b.userId == null).map((b) => clip(b.startAt, b.endAt, 60)),
    ...appts.filter((a) => peopleOf(a).includes(userId)).map((a) => clip(a.scheduledAt, a.scheduledEnd, 30)),
    ...otherJobs
      .filter((j) => j.scheduledAt && j.assignments.some((x) => x.userId === userId))
      .map((j) => clip(j.scheduledAt!, j.scheduledEnd, DEFAULT_JOB_DURATION_MINUTES)),
    // Timed tasks with a place hold their time like an appointment would
    ...day.stops
      .filter((s) => s.kind === "task" && !s.scheduledAnytime && s.assigneeIds.includes(userId) && !routedIds.has(s.id))
      .map((s) => dayInterval(s, dayStart.getTime(), dayEnd.getTime(), fallbackMinutes(s))),
    ...pinnedStops.map((p) => dayInterval(p.stop, dayStart.getTime(), dayEnd.getTime(), fallbackMinutes(p.stop))),
  ].filter((x): x is Interval => x != null);

  // Walk the day: the first stop keeps the anchor (the shop→first leg happens
  // before the day starts), every later stop begins after the previous one
  // ends plus the rounded drive gap, stepping over fixed commitments and
  // waiting for a client window (or an errand's float window) to open. A
  // break has no place: no drive into it, and the next leg is measured from
  // the last real stop.
  const matrixIndex = (s: RouteStop) => (s.kind === "break" ? -1 : current.indexOf(s) + offset);
  const walkStopOf = (s: RouteStop): WalkStop => ({
    id: s.id,
    durationMin: durationOf(s),
    earliestMs: s.windowStart ? new Date(s.windowStart).getTime() : null,
    latestMs: cutoffBefore.get(s.id) ?? (s.windowEnd ? new Date(s.windowEnd).getTime() : null),
  });
  const walkOrder = (ids: string[]) => {
    const seq = ids.map((id) => byId.get(id)!);
    const lastLocatedBefore = (i: number) => {
      for (let k = i - 1; k >= 0; k--) if (seq[k].kind !== "break") return k;
      return -1;
    };
    return walkDay({
      anchorMs: anchor.getTime(),
      stops: seq.map(walkStopOf),
      driveMinutes: (_prev, i) => {
        if (seq[i].kind === "break") return 0;
        const from = lastLocatedBefore(i);
        if (from < 0) return 0;
        return matrix[matrixIndex(seq[from])][matrixIndex(seq[i])];
      },
      gapMinutes: roundGapMinutes,
      fixed,
    });
  };
  const pathOf = (ids: string[]) => [
    ...(hasStart ? [0] : []),
    ...ids.map((id) => byId.get(id)!).filter((s) => s.kind !== "break").map(matrixIndex),
  ];
  const costOf = (ids: string[]) => routeMinutes(matrix, pathOf(ids), closeTo);

  // Lunch: an existing break on the route keeps its place in a hand order;
  // otherwise (solved, or an order that never mentioned it) it goes after
  // the first stop that ends once its window opens
  let orderedIds = orderedStops.map((s) => s.id);
  const breaksToPlace = [...breakStops, ...(autoBreak ? [autoBreak] : [])].filter((b) => !orderedIds.includes(b.id));
  for (const b of breaksToPlace) {
    const walked = walkOrder(orderedIds);
    const at = breakInsertIndex(walked, new Date(b.windowStart ?? anchor.toISOString()).getTime(), b.windowEnd ? new Date(b.windowEnd).getTime() : dayEnd.getTime());
    if (at == null) continue; // the day is over before lunch could start
    orderedIds = [...orderedIds.slice(0, at), b.id, ...orderedIds.slice(at)];
  }
  // A solved order knows nothing about windows — repair it; a hand order is
  // the dispatcher's call and only warns.
  if (!manual && orderedIds.some((id) => byId.get(id)!.windowStart || byId.get(id)!.windowEnd || cutoffBefore.has(id))) {
    orderedIds = repairWindows(orderedIds, walkOrder, costOf);
    orderedIds = enforcePrecedence(orderedIds, precedence);
  }
  orderedStops = orderedIds.map((id) => byId.get(id)!);
  const orderedPath = pathOf(orderedIds);
  const totalDriveMinutes = routeMinutes(matrix, orderedPath, closeTo);
  const totalDistanceKm = routeMinutes(dm.km, orderedPath, closeTo);
  const returnMinutes =
    closeTo === false || orderedPath.length === 0
      ? 0
      : matrix[orderedPath[orderedPath.length - 1]][closeTo === true ? orderedPath[0] : closeTo];
  const walked = walkOrder(orderedIds);
  const proposed = orderedStops.map((s, i) => ({
    ...s,
    driveMinutesFromPrev: walked[i].driveMin == null ? null : Math.round(walked[i].driveMin!),
    waitMinutes: walked[i].waitMin,
    late: walked[i].late,
    proposedStart: new Date(walked[i].startMs).toISOString(),
    proposedEnd: new Date(walked[i].endMs).toISOString(),
  }));

  // The walk steps over fixed commitments clipped to the day, so a stop
  // pushed past an install that runs into tomorrow (or an evening block to
  // midnight) lands AT midnight — on the next date. That is never a route
  // anyone meant: refuse to apply it, and say so in the preview.
  const spillsOver = walked.some((w) => w.startMs >= dayEnd.getTime() || w.endMs > dayEnd.getTime());
  if (spillsOver && body.apply === true) {
    return NextResponse.json(
      { error: "This order doesn't fit in the day — some stops would land after midnight. Move or unpin a stop and try again." },
      { status: 409 }
    );
  }

  // Name the teammate when the buried commitment isn't the routed tech's own
  const whose = (ownerId: string | null | undefined) => {
    if (!ownerId || ownerId === userId) return "";
    const n = scanUsers.find((u) => u.id === ownerId)?.name;
    return n ? ` — ${n}'s` : " — a teammate's";
  };
  const warnings: string[] = [];
  for (const p of proposed) {
    const ps = new Date(p.proposedStart).getTime();
    const pe = new Date(p.proposedEnd).getTime();
    const cutoff = cutoffBefore.get(p.id);
    if (p.late && cutoff != null) {
      const target = day.stops.find((x) => x.id === p.beforeStopId);
      warnings.push(`"${p.title}" would start at ${fmt(new Date(p.proposedStart))}, after ${target ? `"${target.title}"` : "the job it's for"} begins at ${fmt(new Date(cutoff))}.`);
    } else if (p.late && p.windowEnd) {
      warnings.push(
        p.kind === "job" || p.kind === "appointment"
          ? `"${p.title}" would arrive at ${fmt(new Date(p.proposedStart))}, after the client's ${fmt(new Date(p.windowEnd))} cut-off.`
          : `"${p.title}" would start at ${fmt(new Date(p.proposedStart))}, past its ${fmt(new Date(p.windowEnd))} window.`
      );
    }
    if (p.waitMinutes >= 15 && p.windowStart) {
      warnings.push(`"${p.title}" can't start before ${fmt(new Date(p.windowStart))} — ${p.waitMinutes} min of waiting before it.`);
    }
    for (const a of appts) {
      const ae = (a.scheduledEnd ?? new Date(a.scheduledAt.getTime() + 3600_000)).getTime();
      if (ps < ae && pe > a.scheduledAt.getTime()) {
        warnings.push(
          `"${p.title}" overlaps appointment "${a.title}" (${fmt(a.scheduledAt)})${whose(peopleOf(a).find((id) => scanUserIds.includes(id)) ?? a.assignedToId)}`
        );
      }
    }
    for (const j of otherJobs) {
      if (!j.scheduledAt) continue;
      const je = (j.scheduledEnd ?? new Date(j.scheduledAt.getTime() + 3600_000)).getTime();
      if (ps < je && pe > j.scheduledAt.getTime()) {
        const other = j.assignments.find((x) => x.userId !== userId && scanUserIds.includes(x.userId));
        const mine = j.assignments.some((x) => x.userId === userId);
        warnings.push(
          `"${p.title}" overlaps Job #${j.jobNumber} (${j.title}) at ${fmt(j.scheduledAt)} — not on this route${mine ? "" : whose(other?.userId)}`
        );
      }
    }
    for (const b of blocks) {
      if (ps < b.endAt.getTime() && pe > b.startAt.getTime()) {
        warnings.push(
          `"${p.title}" overlaps ${b.kind === "BLOCK" ? "blocked time" : b.kind === "BREAK" ? "a break" : "an errand"} "${b.title || "Busy"}" (${fmt(b.startAt)})${whose(b.userId)}`
        );
      }
    }
  }
  // A two-tech job moves for both of them
  const shared = orderedStops.filter((s) => s.assigneeIds.length > 1);
  if (shared.length) {
    warnings.push(
      `${shared.length === 1 ? `"${shared[0].title}" is` : `${shared.length} stops are`} shared with a teammate — their day moves too.`
    );
  }
  // Day-first honesty: flexible stops get real clock times when applied —
  // say so up front instead of silently pinning them.
  const flexible = orderedStops.filter((s) => s.scheduledAnytime && s.kind !== "break").length;
  if (flexible > 0 && body.apply !== true) {
    warnings.unshift(
      `${flexible} "Anytime" stop${flexible === 1 ? "" : "s"} will get set times when you apply this route.`
    );
  }

  // Can this day physically be driven? Past the tech's close, or on
  // guessed figures because Mapbox wasn't reachable — say so.
  if (proposed.length) {
    const lastEnd = new Date(proposed[proposed.length - 1].proposedEnd);
    const homeAt = new Date(lastEnd.getTime() + returnMinutes * 60000);
    const closeMin = dayRanges.length ? timeToMinutes(dayRanges[dayRanges.length - 1].end) : null;
    if (closeMin !== null) {
      let localMin = 0;
      for (const part of new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(homeAt)) {
        if (part.type === "hour") localMin += Number(part.value) * 60;
        if (part.type === "minute") localMin += Number(part.value);
      }
      const closeAt = wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), closeMin);
      if (localMin > closeMin || homeAt.getTime() > closeAt.getTime()) {
        warnings.unshift(
          `${roundTrip ? (endIsStart ? "Back at the start" : "At the day's end point") : "Last stop wraps"} around ${fmt(homeAt)}, past ${user.name}'s ${fmt(
            wallTimeToUtc(tz, date.getFullYear(), date.getMonth() + 1, date.getDate(), closeMin)
          )} finish.`
        );
      }
    }
  }
  if (spillsOver) {
    warnings.unshift("Doesn't fit: some stops would land after midnight. This order can't be applied as-is.");
  }
  if (!dm.measured) {
    warnings.push("Drive times are straight-line estimates right now — real road times weren't available.");
  }

  // Who would hear about it: every CLIENT whose arrival actually changes
  // (Anytime → a real time counts; a stop that kept its slot to the minute
  // stays quiet). Errands, breaks and tasks have nobody to tell.
  const movedStops = proposed.filter((p) => {
    if (p.kind !== "job" && p.kind !== "appointment") return false;
    const before = p.scheduledAt ? new Date(p.scheduledAt).getTime() : null;
    return p.scheduledAnytime || before === null || Math.abs(before - new Date(p.proposedStart).getTime()) >= 60000;
  });

  let applied = false;
  let notified = 0;
  if (body.apply === true) {
    // A stop whose arrival changed is a reschedule: its client reminders and
    // the crew heads-up re-arm for the new time (both models carry the same
    // stamp columns). A stop that kept its slot keeps its stamps — re-arming
    // those re-sent reminders and, with the sent stamps gone and back, locked
    // every stop as "Reminded" on the next Optimize.
    const movedIds = new Set(movedStops.map((p) => p.id));
    await prisma.$transaction(
      proposed.map((p) => {
        const start = new Date(p.proposedStart);
        const end = new Date(p.proposedEnd);
        if (p.kind === "break" && p.id === NEW_BREAK_ID) {
          return prisma.timeBlock.create({
            data: {
              companyId: actor.companyId,
              userId,
              createdById: actor.id,
              title: "Lunch",
              kind: "BREAK",
              flexible: true,
              floatAfterMin: breakDefault.afterMin,
              floatBeforeMin: breakDefault.beforeMin,
              startAt: start,
              endAt: end,
              placedAt: now,
            },
          });
        }
        if (p.kind === "errand" || p.kind === "break") {
          return prisma.timeBlock.update({ where: { id: p.id }, data: { startAt: start, endAt: end, placedAt: now } });
        }
        if (p.kind === "task") {
          return prisma.task.update({ where: { id: p.id }, data: { dueAt: start, allDay: false } });
        }
        const data = {
          scheduledAt: start,
          scheduledEnd: end,
          scheduledAnytime: false,
          ...(movedIds.has(p.id) && { ...rescheduleReminderStamps(now, start), techHeadsUpSentAt: null }),
        };
        return p.kind === "appointment"
          ? prisma.appointment.update({ where: { id: p.id }, data })
          : // Re-timing counts as a human touching the schedule — the
            // generated-visit conflict badge is done
            prisma.job.update({ where: { id: p.id }, data: { ...data, conflictNote: null } });
      })
    );
    applied = true;

    if (body.notify === true) {
      for (const p of movedStops) {
        const r = await notifyClientOfMove({
          companyId: actor.companyId,
          kind: p.kind as "job" | "appointment",
          id: p.id,
          previousStart: p.scheduledAt ? new Date(p.scheduledAt) : null,
          previousAnytime: p.scheduledAnytime,
        }).catch(() => ({ sent: false }));
        if (r.sent) notified++;
      }
    }
  }

  return NextResponse.json({
    userName: user.name,
    roundTrip,
    /** Where the costed return leg goes: the start, the shop, or nowhere. */
    endsAt: !roundTrip ? "LAST_STOP" : endIsStart || !separateEnd ? "START" : "SHOP",
    measured: dm.measured,
    totalDistanceMiles: Math.round(kmToMiles(totalDistanceKm) * 10) / 10,
    returnMinutes: roundTrip ? Math.round(returnMinutes) : null,
    notified,
    /** How many clients a notify-on-apply would reach with this order. */
    movedCount: movedStops.length,
    /** The automatic lunch was added to this route (saved as a break on apply). */
    breakAdded: orderedStops.some((s) => s.id === NEW_BREAK_ID),
    stops: proposed.map((p) => ({
      id: p.id,
      kind: p.kind,
      jobNumber: p.jobNumber,
      title: p.title,
      contactName: p.contactName,
      address: p.address,
      currentStart: p.scheduledAt,
      scheduledAnytime: p.scheduledAnytime,
      reminded: p.reminded,
      windowStart: p.windowStart,
      windowEnd: p.windowEnd,
      beforeStopId: p.beforeStopId,
      late: p.late,
      waitMinutes: p.waitMinutes,
      proposedStart: p.proposedStart,
      proposedEnd: p.proposedEnd,
      driveMinutesFromPrev: p.driveMinutesFromPrev,
    })),
    // Company-TZ wall time in "HH:mm" (the client echoes this back on apply)
    anchorTime: anchor.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }),
    timezone: tz,
    currentDriveMinutes: Math.round(currentDriveMinutes),
    totalDriveMinutes: Math.round(totalDriveMinutes),
    savedMinutes: Math.max(0, Math.round(currentDriveMinutes - totalDriveMinutes)),
    skipped,
    pinned,
    pinnedStops: pinnedDetail,
    keep: [...keepIds],
    warnings: warnings.slice(0, 8),
    applied,
  });
}
