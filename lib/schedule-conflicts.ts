import { prisma } from "@/lib/db";

/**
 * Internal double-booking detection. The calendar deliberately allows
 * overlaps (two techs on site, a manager stacking paperwork blocks), so this
 * never blocks a save — the schedule PATCH routes call it after writing and
 * return the labels for a non-blocking "heads up" in the UI.
 *
 * A conflict = the same person already committed to a job, appointment, or
 * time block that overlaps the new window. Anytime/date-only entries don't
 * conflict (no clock position). Public booking has its own stricter engine
 * (lib/booking-availability) — this one is for staff scheduling.
 */
export async function findScheduleConflicts(params: {
  companyId: string;
  start: Date;
  /** null = date-only/anytime — no clock position, nothing to conflict with */
  end: Date | null;
  userIds: string[];
  excludeJobId?: string;
  excludeAppointmentId?: string;
}): Promise<string[]> {
  const { companyId, start, end, userIds } = params;
  if (!end || userIds.length === 0) return [];

  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const [users, jobs, appointments, blocks] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, companyId },
      select: { id: true, name: true, email: true },
    }),
    prisma.job.findMany({
      where: {
        companyId,
        ...(params.excludeJobId ? { id: { not: params.excludeJobId } } : {}),
        status: "ACTIVE",
        scheduledAnytime: false,
        scheduledAt: { not: null, lt: end },
        assignments: { some: { userId: { in: userIds } } },
      },
      select: {
        jobNumber: true,
        title: true,
        scheduledAt: true,
        scheduledEnd: true,
        assignments: { select: { userId: true } },
      },
      take: 50,
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
        status: "SCHEDULED",
        scheduledAnytime: false,
        scheduledAt: { lt: end },
        assignedToId: { in: userIds },
      },
      select: { title: true, scheduledAt: true, scheduledEnd: true, assignedToId: true },
      take: 50,
    }),
    prisma.timeBlock.findMany({
      where: {
        companyId,
        allDay: false,
        startAt: { lt: end },
        endAt: { gt: start },
        OR: [{ userId: { in: userIds } }, { userId: null }],
      },
      select: { title: true, startAt: true, endAt: true, userId: true },
      take: 50,
    }),
  ]);

  const nameOf = (id: string | null | undefined) => {
    if (!id) return "the whole team";
    const u = users.find((x) => x.id === id);
    return u?.name || u?.email || "a teammate";
  };
  // Jobs/appointments without an end block their UI default of one hour
  const endOf = (s: Date, e: Date | null) => e ?? new Date(s.getTime() + 3600_000);

  const conflicts: string[] = [];
  for (const j of jobs) {
    if (!j.scheduledAt) continue;
    const jEnd = endOf(j.scheduledAt, j.scheduledEnd);
    if (jEnd <= start) continue;
    const who = j.assignments.find((a) => userIds.includes(a.userId));
    conflicts.push(
      `Job #${j.jobNumber} (${j.title}) — ${nameOf(who?.userId)}, ${fmt(j.scheduledAt)}–${fmt(jEnd)}`
    );
  }
  for (const a of appointments) {
    const aEnd = endOf(a.scheduledAt, a.scheduledEnd);
    if (aEnd <= start) continue;
    conflicts.push(
      `Appointment "${a.title}" — ${nameOf(a.assignedToId)}, ${fmt(a.scheduledAt)}–${fmt(aEnd)}`
    );
  }
  for (const b of blocks) {
    conflicts.push(
      `Blocked time "${b.title || "Busy"}" — ${nameOf(b.userId)}, ${fmt(b.startAt)}–${fmt(b.endAt)}`
    );
  }
  return conflicts.slice(0, 5);
}
