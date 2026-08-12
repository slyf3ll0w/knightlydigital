import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { parseRouteDate, resolveRouteDay } from "@/lib/route-plan";
import { driveTimeMatrix, roundGapMinutes, routeMinutes, solveStopOrder } from "@/lib/routing";
import { DEFAULT_JOB_DURATION_MINUTES } from "@/lib/scheduling";
import {
  DAY_KEYS,
  resolveWorkingHours,
  sanitizeBusinessHours,
  timeToMinutes,
} from "@/lib/business-hours";

/**
 * POST /api/app/route-plan/optimize — order one tech's day by drive time.
 *
 * Body: {
 *   date: "YYYY-MM-DD",
 *   userId: string,            // whose route
 *   order?: string[],          // manual stop order (stop ids) instead of solving
 *   anchorTime?: "HH:mm",      // when the day starts (default: earliest timed stop)
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
 * blocks are never moved — overlaps come back as warnings instead.
 *
 * Who may run it mirrors the job PATCH: managers + USER for any tech, TECH
 * for their own route only, SALES never.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const date = parseRouteDate(typeof body.date === "string" ? body.date : null);
  const day = await resolveRouteDay(actor, date);

  // Routable: the tech's jobs + their confirmed in-person appointments.
  // Tentative bookings hold their promised slot — they only warn.
  const assigned = day.stops.filter(
    (s) =>
      s.assigneeIds.includes(userId) &&
      (s.kind === "job" ? s.status === "ACTIVE" : s.status === "SCHEDULED" && !s.tentative)
  );
  const stops = assigned.filter((s) => s.lat != null && s.lng != null);
  const skipped = assigned.filter((s) => s.lat == null).map((s) => s.title);
  if (stops.length < 2) {
    return NextResponse.json(
      { error: "Need at least two mapped stops to build a route.", skipped },
      { status: 400 }
    );
  }

  // Current order = how the day reads on the calendar right now
  const current = [...stops].sort(
    (a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime()
  );

  // Matrix points: shop first when we know it (index 0), stops after
  const hasStart = day.start != null;
  const points = [
    ...(hasStart ? [{ lat: day.start!.lat, lng: day.start!.lng }] : []),
    ...current.map((s) => ({ lat: s.lat!, lng: s.lng! })),
  ];
  const offset = hasStart ? 1 : 0;
  const matrix = await driveTimeMatrix(points, actor.companyId);

  const currentOrder = current.map((_, i) => i + offset);
  const currentPath = hasStart ? [0, ...currentOrder] : currentOrder;
  const currentDriveMinutes = routeMinutes(matrix, currentPath);

  // Target order: manual (validated same set) or solved
  let orderedStops: typeof current;
  if (Array.isArray(body.order)) {
    const ids = body.order.filter((v: unknown): v is string => typeof v === "string");
    const byId = new Map(current.map((s) => [s.id, s]));
    if (ids.length !== current.length || ids.some((id: string) => !byId.has(id))) {
      return NextResponse.json(
        { error: "Stop list changed — reload the route and try again." },
        { status: 409 }
      );
    }
    orderedStops = ids.map((id: string) => byId.get(id)!);
  } else {
    const solved = solveStopOrder(
      matrix,
      hasStart ? 0 : currentPath[0]
    ).filter((i) => i >= offset);
    orderedStops = solved.map((i) => current[i - offset]);
  }

  const orderedPath = [
    ...(hasStart ? [0] : []),
    ...orderedStops.map((s) => current.indexOf(s) + offset),
  ];
  const totalDriveMinutes = routeMinutes(matrix, orderedPath);

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
    anchor = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Number(anchorMatch[1]),
      Number(anchorMatch[2]),
      0,
      0
    );
  } else if (timed.length) {
    anchor = new Date(Math.min(...timed.map((s) => new Date(s.scheduledAt!).getTime())));
  } else {
    const company = await prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { businessHours: true },
    });
    const week = resolveWorkingHours(user.workingHours, sanitizeBusinessHours(company?.businessHours));
    const ranges = week[DAY_KEYS[date.getDay()]] ?? [];
    const startMin = (ranges.length ? timeToMinutes(ranges[0].start) : null) ?? 8 * 60;
    anchor = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Math.floor(startMin / 60),
      startMin % 60,
      0,
      0
    );
  }

  const durationOf = (s: (typeof current)[number]): number => {
    if (!s.scheduledAnytime && s.scheduledAt && s.scheduledEnd) {
      const mins = (new Date(s.scheduledEnd).getTime() - new Date(s.scheduledAt).getTime()) / 60000;
      if (mins > 0) return mins;
    }
    // Appointments default to their 30-minute convention, jobs to an hour
    return s.kind === "appointment" ? 30 : DEFAULT_JOB_DURATION_MINUTES;
  };

  // Walk the day: the first stop keeps the anchor (the shop→first leg happens
  // before the day starts), every later stop begins after the previous one
  // ends plus the rounded drive gap.
  const matrixIndex = (s: (typeof current)[number]) => current.indexOf(s) + offset;
  let cursor = anchor.getTime();
  const proposed = orderedStops.map((s, i) => {
    const driveMin = i === 0 ? 0 : matrix[matrixIndex(orderedStops[i - 1])][matrixIndex(s)];
    const startMs = i === 0 ? cursor : cursor + roundGapMinutes(driveMin) * 60000;
    const endMs = startMs + durationOf(s) * 60000;
    cursor = endMs;
    return {
      ...s,
      driveMinutesFromPrev: i === 0 ? null : Math.round(driveMin),
      proposedStart: new Date(startMs).toISOString(),
      proposedEnd: new Date(endMs).toISOString(),
    };
  });

  // Fixed commitments we never move — warn when the proposed route runs over.
  // Routed in-person appointments are excluded (they move with the route);
  // what's left is phone/video calls and tentative bookings.
  const routedIds = new Set(orderedStops.map((s) => s.id));
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const [apptsRaw, blocks, otherJobsRaw] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: actor.companyId,
        assignedToId: userId,
        status: "SCHEDULED",
        scheduledAnytime: false,
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true, title: true, scheduledAt: true, scheduledEnd: true },
    }),
    prisma.timeBlock.findMany({
      where: {
        companyId: actor.companyId,
        allDay: false,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        OR: [{ userId }, { userId: null }],
      },
      select: { title: true, startAt: true, endAt: true },
    }),
    // The tech's timed jobs that are NOT on this route (skipped for a missing
    // pin, or excluded by status) keep their old times — the new walk can run
    // straight over them without this scan.
    prisma.job.findMany({
      where: {
        companyId: actor.companyId,
        status: "ACTIVE",
        scheduledAnytime: false,
        scheduledAt: { gte: dayStart, lt: dayEnd },
        assignments: { some: { userId } },
      },
      select: { id: true, jobNumber: true, title: true, scheduledAt: true, scheduledEnd: true },
    }),
  ]);
  const appts = apptsRaw.filter((a) => !routedIds.has(a.id));
  const otherJobs = otherJobsRaw.filter((j) => !routedIds.has(j.id));
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const warnings: string[] = [];
  for (const p of proposed) {
    const ps = new Date(p.proposedStart).getTime();
    const pe = new Date(p.proposedEnd).getTime();
    for (const a of appts) {
      const ae = (a.scheduledEnd ?? new Date(a.scheduledAt.getTime() + 3600_000)).getTime();
      if (ps < ae && pe > a.scheduledAt.getTime()) {
        warnings.push(`"${p.title}" overlaps appointment "${a.title}" (${fmt(a.scheduledAt)})`);
      }
    }
    for (const j of otherJobs) {
      if (!j.scheduledAt) continue;
      const je = (j.scheduledEnd ?? new Date(j.scheduledAt.getTime() + 3600_000)).getTime();
      if (ps < je && pe > j.scheduledAt.getTime()) {
        warnings.push(
          `"${p.title}" overlaps Job #${j.jobNumber} (${j.title}) at ${fmt(j.scheduledAt)} — not on this route`
        );
      }
    }
    for (const b of blocks) {
      if (ps < b.endAt.getTime() && pe > b.startAt.getTime()) {
        warnings.push(`"${p.title}" overlaps blocked time "${b.title || "Busy"}" (${fmt(b.startAt)})`);
      }
    }
  }
  // Day-first honesty: flexible stops get real clock times when applied —
  // say so up front instead of silently pinning them.
  const flexible = orderedStops.filter((s) => s.scheduledAnytime).length;
  if (flexible > 0 && body.apply !== true) {
    warnings.unshift(
      `${flexible} "Anytime" stop${flexible === 1 ? "" : "s"} will get set arrival times when you apply this route.`
    );
  }

  let applied = false;
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
          : prisma.job.update({ where: { id: p.id }, data });
      })
    );
    applied = true;
  }

  return NextResponse.json({
    userName: user.name,
    stops: proposed.map((p) => ({
      id: p.id,
      kind: p.kind,
      jobNumber: p.jobNumber,
      title: p.title,
      contactName: p.contactName,
      address: p.address,
      currentStart: p.scheduledAt,
      scheduledAnytime: p.scheduledAnytime,
      proposedStart: p.proposedStart,
      proposedEnd: p.proposedEnd,
      driveMinutesFromPrev: p.driveMinutesFromPrev,
    })),
    anchorTime: `${String(anchor.getHours()).padStart(2, "0")}:${String(anchor.getMinutes()).padStart(2, "0")}`,
    currentDriveMinutes: Math.round(currentDriveMinutes),
    totalDriveMinutes: Math.round(totalDriveMinutes),
    savedMinutes: Math.max(0, Math.round(currentDriveMinutes - totalDriveMinutes)),
    skipped,
    warnings: warnings.slice(0, 8),
    applied,
  });
}
