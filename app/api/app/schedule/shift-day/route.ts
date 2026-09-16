import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { findScheduleConflicts } from "@/lib/schedule-conflicts";
import { notifyClientOfMove } from "@/lib/schedule-notify";
import { wallTimeToUtc } from "@/lib/booking-engine";

/**
 * POST /api/app/schedule/shift-day — "Rain delay": move a whole day's work
 * to another date in one go, keeping each visit's time of day and length.
 *
 * Body: {
 *   date: "YYYY-MM-DD",         // the day being emptied
 *   toDate: "YYYY-MM-DD",       // where it lands
 *   userId?: string,            // only this tech's items (omit = everyone)
 *   ids?: string[],             // only these items (jobs + appointments)
 *   includeAppointments?: bool, // default true
 *   notify?: bool               // text/email each client the new time
 * }
 * Managers and USER only. Completed / archived / cancelled items stay put,
 * and so does anything on TODAY that already started or is on the clock
 * (`left` in the response counts them).
 * Every moved visit gets its reminder stamps cleared so it reminds again at
 * the new time. Returns what moved, who was told, and any double-booking
 * heads-ups on the destination day.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(isManager(actor.role) || actor.role === "USER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const companyId = actor.companyId;

  const body = await req.json().catch(() => ({}));
  const dateRe = /^(\d{4})-(\d{2})-(\d{2})$/;
  const from = typeof body.date === "string" ? dateRe.exec(body.date) : null;
  const to = typeof body.toDate === "string" ? dateRe.exec(body.toDate) : null;
  if (!from || !to) return NextResponse.json({ error: "Pick both days." }, { status: 400 });
  if (body.date === body.toDate) return NextResponse.json({ error: "That's the same day." }, { status: 400 });
  const userId = typeof body.userId === "string" && body.userId ? body.userId : null;
  const onlyIds = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string") : null;
  const includeAppointments = body.includeAppointments !== false;
  const notify = Boolean(body.notify);

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  const tz = company?.timezone || "America/Chicago";

  // Day bounds in the COMPANY's wall clock — never the server's
  const fy = Number(from[1]), fm = Number(from[2]), fd = Number(from[3]);
  const ty = Number(to[1]), tm = Number(to[2]), td = Number(to[3]);
  const dayStart = wallTimeToUtc(tz, fy, fm, fd, 0);
  const dayEnd = wallTimeToUtc(tz, fy, fm, fd, 24 * 60);
  // Whole-day shift in wall-clock terms (DST-safe: re-anchor each item by
  // its own local minutes on the target day)
  const minuteFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const shiftItem = (at: Date): Date => {
    let localMin = 0;
    for (const part of minuteFmt.formatToParts(at)) {
      if (part.type === "hour") localMin += Number(part.value) * 60;
      if (part.type === "minute") localMin += Number(part.value);
    }
    return wallTimeToUtc(tz, ty, tm, td, localMin);
  };

  const [jobsRaw, appointmentsRaw] = await Promise.all([
    prisma.job.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        scheduledAt: { gte: dayStart, lt: dayEnd },
        ...(userId ? { assignments: { some: { userId } } } : {}),
        ...(onlyIds ? { id: { in: onlyIds } } : {}),
      },
      select: {
        id: true,
        scheduledAt: true,
        scheduledEnd: true,
        scheduledAnytime: true,
        assignments: { select: { userId: true } },
        contact: { select: { firstName: true, lastName: true } },
        title: true,
      },
    }),
    includeAppointments
      ? prisma.appointment.findMany({
          where: {
            companyId,
            status: "SCHEDULED",
            scheduledAt: { gte: dayStart, lt: dayEnd },
            ...(userId ? { assignedToId: userId } : {}),
            ...(onlyIds ? { id: { in: onlyIds } } : {}),
          },
          select: {
            id: true,
            scheduledAt: true,
            scheduledEnd: true,
            scheduledAnytime: true,
            assignedToId: true,
            contact: { select: { firstName: true, lastName: true } },
            title: true,
          },
        })
      : Promise.resolve([]),
  ]);

  // Moving TODAY mid-day must not drag this morning's finished visits (or
  // the one a tech is on right now) to tomorrow — and text those clients
  // about it. Anything timed that has already started, or has an open clock
  // entry, stays put; the response says how many were left behind.
  const now = new Date();
  const isToday = now.getTime() >= dayStart.getTime() && now.getTime() < dayEnd.getTime();
  const onTheClock = new Set(
    isToday && jobsRaw.length
      ? (
          await prisma.timeEntry.findMany({
            where: { jobId: { in: jobsRaw.map((j) => j.id) }, endedAt: null },
            select: { jobId: true },
          })
        ).map((e) => e.jobId!)
      : []
  );
  // An explicit id list (undo, or a deliberate pick in the sheet) is the
  // dispatcher's decision — the "already started" protection is for the
  // whole-day sweep, where it stops a mid-day move from dragging this
  // morning's finished visits along.
  const started = (at: Date, anytime: boolean) => !onlyIds && isToday && !anytime && at.getTime() < now.getTime();
  const jobs = jobsRaw.filter((j) => (onlyIds || !onTheClock.has(j.id)) && !started(j.scheduledAt!, j.scheduledAnytime));
  const appointments = appointmentsRaw.filter((a) => !started(a.scheduledAt, a.scheduledAnytime));
  const left = jobsRaw.length - jobs.length + (appointmentsRaw.length - appointments.length);

  if (jobs.length + appointments.length === 0) {
    return NextResponse.json(
      { error: left ? "Everything on that day has already started." : "Nothing on that day to move.", left },
      { status: 400 }
    );
  }

  const moved: { kind: "job" | "appointment"; id: string; previousStart: string; previousAnytime: boolean }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const j of jobs) {
      const start = shiftItem(j.scheduledAt!);
      const end = j.scheduledEnd ? new Date(start.getTime() + (j.scheduledEnd.getTime() - j.scheduledAt!.getTime())) : null;
      await tx.job.update({
        where: { id: j.id },
        data: {
          scheduledAt: start,
          scheduledEnd: end,
          reminderDaySentAt: null,
          reminderHourSentAt: null,
          techHeadsUpSentAt: null,
          conflictNote: null,
        },
      });
      moved.push({ kind: "job", id: j.id, previousStart: j.scheduledAt!.toISOString(), previousAnytime: j.scheduledAnytime });
    }
    for (const a of appointments) {
      const start = shiftItem(a.scheduledAt);
      const end = a.scheduledEnd ? new Date(start.getTime() + (a.scheduledEnd.getTime() - a.scheduledAt.getTime())) : null;
      await tx.appointment.update({
        where: { id: a.id },
        data: { scheduledAt: start, scheduledEnd: end, reminderDaySentAt: null, reminderHourSentAt: null },
      });
      moved.push({ kind: "appointment", id: a.id, previousStart: a.scheduledAt.toISOString(), previousAnytime: a.scheduledAnytime });
    }
  });

  // Heads-up on the destination day (non-blocking, same as a single drag)
  const conflicts = new Set<string>();
  await Promise.all(
    jobs
      .filter((j) => !j.scheduledAnytime && j.assignments.length > 0)
      .map(async (j) => {
        const start = shiftItem(j.scheduledAt!);
        const end = j.scheduledEnd ? new Date(start.getTime() + (j.scheduledEnd.getTime() - j.scheduledAt!.getTime())) : new Date(start.getTime() + 3600_000);
        const list = await findScheduleConflicts({
          companyId,
          start,
          end,
          userIds: j.assignments.map((x) => x.userId),
          excludeJobId: j.id,
        }).catch(() => []);
        // Only flag collisions with things that were already on the new day
        list.filter((c) => !moved.some((m) => c.includes(m.id))).forEach((c) => conflicts.add(c));
      })
  );

  let notified = 0;
  if (notify) {
    for (const m of moved) {
      const r = await notifyClientOfMove({
        companyId,
        kind: m.kind,
        id: m.id,
        previousStart: new Date(m.previousStart),
        previousAnytime: m.previousAnytime,
      }).catch(() => ({ sent: false }));
      if (r.sent) notified++;
    }
  }

  return NextResponse.json({
    success: true,
    moved: moved.length,
    jobs: jobs.length,
    appointments: appointments.length,
    left,
    notified,
    conflicts: [...conflicts].slice(0, 8),
    undo: moved,
  });
}
