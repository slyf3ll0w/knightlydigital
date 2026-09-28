import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { parseRouteDate, resolveRouteDay, dayStartFor, type RouteStop } from "@/lib/route-plan";
import { driveMatrix, kmToMiles, roundGapMinutes, routeMinutes, solveStopOrder } from "@/lib/routing";
import { notifyClientOfMove } from "@/lib/schedule-notify";
import { DEFAULT_JOB_DURATION_MINUTES } from "@/lib/scheduling";
import {
  DAY_KEYS,
  resolveWorkingHours,
  sanitizeBusinessHours,
  timeToMinutes,
} from "@/lib/business-hours";
import { wallTimeToUtc } from "@/lib/booking-engine";
import {
  ceilToMinutes,
  clampedDurationMinutes,
  dayInterval,
  repairWindows,
  runsPastDay,
  walkDay,
  type Interval,
  type WalkStop,
} from "@/lib/route-walk";
import { checkFeature } from "@/lib/plan-gate";

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
 *   roundTrip?: boolean,       // cost the drive back to the start
 *   notify?: boolean,          // on apply: tell each client whose time changed
 *   apply?: boolean            // false/absent = preview only, nothing written
 * }
 *
 * The route covers jobs AND confirmed in-person appointments — both get
 * reordered and re-timed together. Preview returns the proposed order with
 * proposed times and the drive-time delta; apply rewrites
 * scheduledAt/scheduledEnd (durations preserved, drive-time gaps between
 * stops, "Anytime" stops get real times) inside one transaction, clearing
 * client-reminder stamps so moved visits remind at their new times.
 * Tentative (unconfirmed) bookings, phone/video appointments, and time
 * blocks are never moved — the walk steps over the routed tech's own and
 * warns about teammates'. Stops that already started today, are on the
 * clock, run into the next day, or are LOCKED (`keep`) are pinned
 * (`pinned` in the response): they hold their times and the route is laid
 * out around them. A stop's client window (Job.arriveAfterMin/BeforeMin)
 * is honoured: the walk waits for it to open and the order is repaired so
 * nobody is arrived at after their window closes when another order can
 * avoid it; when none can, the preview warns.
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
    select: { id: true, name: true, workingHours: true },
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

  // Routable: the tech's jobs + their confirmed in-person appointments.
  // Tentative bookings hold their promised slot — they only warn. Phone/video
  // appointments (no address) now ride the day as pin-less stops for
  // Find-a-Time's sake; they're not routable and already warn via apptsRaw.
  const assigned = day.stops.filter(
    (s) =>
      s.assigneeIds.includes(userId) &&
      (s.kind === "job"
        ? s.status === "ACTIVE" && s.progress !== "done"
        : s.kind === "appointment" && s.status === "SCHEDULED" && !s.tentative && s.address != null)
  );
  const mapped = assigned.filter((s) => s.lat != null && s.lng != null);
  const skipped = assigned.filter((s) => s.lat == null).map((s) => s.title);

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
  const stops = mapped.filter((s) => !pinnedStops.some((p) => p.stop.id === s.id));
  if (stops.length < 2) {
    return NextResponse.json(
      {
        error:
          pinned.length && mapped.length >= 2
            ? pinnedStops.some((p) => p.reason === "kept")
              ? "Need at least two stops that aren't kept at their time — unlock one to build a route."
              : "Need at least two stops that haven't started yet to build a route."
            : "Need at least two mapped stops to build a route.",
        skipped,
        pinned,
        pinnedStops: pinnedDetail,
      },
      { status: 400 }
    );
  }

  // Current order = how the day reads on the calendar right now
  const current = [...stops].sort(
    (a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime()
  );

  // Matrix points: the day start first when we know it (the shop, or this
  // tech's own start address — index 0), stops after
  const routeStart = dayStartFor(day, userId);
  const hasStart = routeStart != null;
  const points = [
    ...(hasStart ? [{ lat: routeStart!.lat, lng: routeStart!.lng }] : []),
    ...current.map((s) => ({ lat: s.lat!, lng: s.lng! })),
  ];
  const offset = hasStart ? 1 : 0;
  const dm = await driveMatrix(points, actor.companyId);
  const matrix = dm.minutes;
  // Round trip: cost the drive back to the start so the last stop lands
  // near home (only meaningful when we know where the day starts)
  const roundTrip = body.roundTrip === true && hasStart;

  const currentOrder = current.map((_, i) => i + offset);
  const currentPath = hasStart ? [0, ...currentOrder] : currentOrder;
  const currentDriveMinutes = routeMinutes(matrix, currentPath, roundTrip);

  // Target order: manual (validated: every routable stop present, extras —
  // a done stop, a pin the client didn't know about — ignored) or solved
  let orderedStops: typeof current;
  if (Array.isArray(body.order)) {
    const byId = new Map(current.map((s) => [s.id, s]));
    const ids: string[] = body.order.filter((v: unknown): v is string => typeof v === "string" && byId.has(v));
    if (new Set(ids).size !== current.length) {
      return NextResponse.json(
        { error: "Stop list changed — reload the route and try again." },
        { status: 409 }
      );
    }
    orderedStops = ids.map((id) => byId.get(id)!);
  } else {
    const solved = solveStopOrder(
      matrix,
      hasStart ? 0 : currentPath[0],
      roundTrip
    ).filter((i) => i >= offset);
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

  // Appointments default to their 30-minute convention, jobs to an hour;
  // a span that leaves the day is cut at the day's edge (see route-walk)
  const fallbackMinutes = (s: { kind: string }) => (s.kind === "appointment" ? 30 : DEFAULT_JOB_DURATION_MINUTES);
  const durationOf = (s: (typeof current)[number]): number =>
    clampedDurationMinutes(s, dayStart.getTime(), dayEnd.getTime(), fallbackMinutes(s));

  // Fixed commitments we never move. Routed in-person appointments are
  // excluded (they move with the route); what's left is phone/video calls,
  // tentative bookings, blocked time, pinned stops and timed jobs that
  // aren't on this route. The routed tech's own commitments shape the walk
  // (stops step around them); teammates' only warn. Moved stops can carry
  // CO-ASSIGNEES (a two-tech job), so their commitments are scanned too —
  // applying tech A's route must not silently bury tech B's day.
  const routedIds = new Set(orderedStops.map((s) => s.id));
  const scanUserIds = [...new Set([userId, ...orderedStops.flatMap((s) => s.assigneeIds)])];
  const [apptsRaw, blocks, otherJobsRaw, scanUsers] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: actor.companyId,
        assignedToId: { in: scanUserIds },
        status: "SCHEDULED",
        scheduledAnytime: false,
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, title: true, scheduledAt: true, scheduledEnd: true, assignedToId: true },
    }),
    prisma.timeBlock.findMany({
      where: {
        companyId: actor.companyId,
        allDay: false,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        OR: [{ userId: { in: scanUserIds } }, { userId: null }],
      },
      select: { title: true, startAt: true, endAt: true, userId: true },
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
    ...appts.filter((a) => a.assignedToId === userId).map((a) => clip(a.scheduledAt, a.scheduledEnd, 30)),
    ...otherJobs
      .filter((j) => j.scheduledAt && j.assignments.some((x) => x.userId === userId))
      .map((j) => clip(j.scheduledAt!, j.scheduledEnd, DEFAULT_JOB_DURATION_MINUTES)),
    ...pinnedStops.map((p) => dayInterval(p.stop, dayStart.getTime(), dayEnd.getTime(), fallbackMinutes(p.stop))),
  ].filter((x): x is Interval => x != null);

  // Walk the day: the first stop keeps the anchor (the shop→first leg happens
  // before the day starts), every later stop begins after the previous one
  // ends plus the rounded drive gap, stepping over fixed commitments and
  // waiting for a client window to open.
  const byId = new Map(current.map((s) => [s.id, s]));
  const matrixIndex = (s: (typeof current)[number]) => current.indexOf(s) + offset;
  const walkStopOf = (s: (typeof current)[number]): WalkStop => ({
    id: s.id,
    durationMin: durationOf(s),
    earliestMs: s.windowStart ? new Date(s.windowStart).getTime() : null,
    latestMs: s.windowEnd ? new Date(s.windowEnd).getTime() : null,
  });
  const walkOrder = (ids: string[]) => {
    const seq = ids.map((id) => byId.get(id)!);
    return walkDay({
      anchorMs: anchor.getTime(),
      stops: seq.map(walkStopOf),
      driveMinutes: (prev, i) => matrix[matrixIndex(seq[prev])][matrixIndex(seq[i])],
      gapMinutes: roundGapMinutes,
      fixed,
    });
  };
  const pathOf = (ids: string[]) => [...(hasStart ? [0] : []), ...ids.map((id) => matrixIndex(byId.get(id)!))];
  // A solved order knows nothing about windows — repair it; a hand order is
  // the dispatcher's call and only warns.
  if (!Array.isArray(body.order) && orderedStops.some((s) => s.windowStart || s.windowEnd)) {
    const repaired = repairWindows(
      orderedStops.map((s) => s.id),
      walkOrder,
      (ids) => routeMinutes(matrix, pathOf(ids), roundTrip)
    );
    orderedStops = repaired.map((id) => byId.get(id)!);
  }
  const orderedIds = orderedStops.map((s) => s.id);
  const orderedPath = pathOf(orderedIds);
  const totalDriveMinutes = routeMinutes(matrix, orderedPath, roundTrip);
  const totalDistanceKm = routeMinutes(dm.km, orderedPath, roundTrip);
  const returnMinutes = roundTrip ? matrix[orderedPath[orderedPath.length - 1]][0] : 0;
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
    if (p.late && p.windowEnd) {
      warnings.push(`"${p.title}" would arrive at ${fmt(new Date(p.proposedStart))}, after the client's ${fmt(new Date(p.windowEnd))} cut-off.`);
    }
    if (p.waitMinutes >= 15 && p.windowStart) {
      warnings.push(`"${p.title}" can't start before ${fmt(new Date(p.windowStart))} — ${p.waitMinutes} min of waiting before it.`);
    }
    for (const a of appts) {
      const ae = (a.scheduledEnd ?? new Date(a.scheduledAt.getTime() + 3600_000)).getTime();
      if (ps < ae && pe > a.scheduledAt.getTime()) {
        warnings.push(
          `"${p.title}" overlaps appointment "${a.title}" (${fmt(a.scheduledAt)})${whose(a.assignedToId)}`
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
          `"${p.title}" overlaps blocked time "${b.title || "Busy"}" (${fmt(b.startAt)})${whose(b.userId)}`
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
  const flexible = orderedStops.filter((s) => s.scheduledAnytime).length;
  if (flexible > 0 && body.apply !== true) {
    warnings.unshift(
      `${flexible} "Anytime" stop${flexible === 1 ? "" : "s"} will get set arrival times when you apply this route.`
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
          `${roundTrip ? "Back at the start" : "Last stop wraps"} around ${fmt(homeAt)}, past ${user.name}'s ${fmt(
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

  // Who would hear about it: every client whose arrival actually changes
  // (Anytime → a real time counts; a stop that kept its slot to the minute
  // stays quiet)
  const movedStops = proposed.filter((p) => {
    const before = p.scheduledAt ? new Date(p.scheduledAt).getTime() : null;
    return p.scheduledAnytime || before === null || Math.abs(before - new Date(p.proposedStart).getTime()) >= 60000;
  });

  let applied = false;
  let notified = 0;
  if (body.apply === true) {
    // Clearing reminder stamps re-arms the day-before/1-hour client reminders
    // for the new times (both models carry the same stamp columns).
    await prisma.$transaction(
      proposed.map((p) => {
        const data = {
          scheduledAt: new Date(p.proposedStart),
          scheduledEnd: new Date(p.proposedEnd),
          scheduledAnytime: false,
          reminderDaySentAt: null,
          reminderHourSentAt: null,
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
          // Only jobs and appointments are ever routed (blocks are fixed points)
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
    measured: dm.measured,
    totalDistanceMiles: Math.round(kmToMiles(totalDistanceKm) * 10) / 10,
    returnMinutes: roundTrip ? Math.round(returnMinutes) : null,
    notified,
    /** How many clients a notify-on-apply would reach with this order. */
    movedCount: movedStops.length,
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
