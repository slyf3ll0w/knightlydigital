import { prisma } from "@/lib/db";

/**
 * Internal double-booking detection. The calendar deliberately allows
 * overlaps (two techs on site, a manager stacking paperwork blocks), so this
 * never blocks a save — the schedule PATCH routes call it after writing and
 * return the labels for a non-blocking "heads up" in the UI.
 *
 * A conflict = the same person already committed to a job, appointment, or
 * time block that overlaps the new window — plus UNASSIGNED scheduled work,
 * which already blocks public booking and deserves the same heads-up for
 * staff. Anytime/date-only entries don't conflict (no clock position).
 * Public booking has its own stricter engine (lib/booking-availability) —
 * this one is for staff scheduling.
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

  const [company, users, jobs, appointments, blocks] = await Promise.all([
    // Labels read in the tenant's wall clock, never the server's
    prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    }),
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
        AND: [
          {
            // Overlap-bound the query itself: entries ending before the window
            // (no-end rows get their 1-hour UI default) can't conflict. Without
            // this, `take: 50` with no lower bound could return 50 historical
            // rows and miss the one that actually overlaps a busy tech's slot.
            OR: [
              { scheduledEnd: { gt: start } },
              { scheduledEnd: null, scheduledAt: { gt: new Date(start.getTime() - 3600_000) } },
            ],
          },
          {
            // Unassigned scheduled work counts too — it holds real calendar
            // time (it already blocks public booking) and someone will end up
            // doing it.
            OR: [
              { assignments: { some: { userId: { in: userIds } } } },
              { assignments: { none: {} } },
            ],
          },
        ],
      },
      select: {
        jobNumber: true,
        title: true,
        scheduledAt: true,
        scheduledEnd: true,
        assignments: { select: { userId: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 50,
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
        status: "SCHEDULED",
        scheduledAnytime: false,
        scheduledAt: { lt: end },
        AND: [
          {
            OR: [
              { scheduledEnd: { gt: start } },
              { scheduledEnd: null, scheduledAt: { gt: new Date(start.getTime() - 3600_000) } },
            ],
          },
          {
            OR: [{ assignedToId: { in: userIds } }, { assignedToId: null }],
          },
        ],
      },
      select: { title: true, scheduledAt: true, scheduledEnd: true, assignedToId: true },
      orderBy: { scheduledAt: "asc" },
      take: 50,
    }),
    // All-day blocks included: "out all day" is exactly the commitment a
    // heads-up exists for. Their stored startAt/endAt span the day, so the
    // same overlap window applies; only the label changes.
    prisma.timeBlock.findMany({
      where: {
        companyId,
        startAt: { lt: end },
        endAt: { gt: start },
        OR: [{ userId: { in: userIds } }, { userId: null }],
      },
      select: { title: true, startAt: true, endAt: true, userId: true, allDay: true },
      take: 50,
    }),
  ]);

  const tz = company?.timezone || "America/Chicago";
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

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
    const label = j.assignments.length === 0 ? "unassigned" : nameOf(who?.userId);
    conflicts.push(
      `Job #${j.jobNumber} (${j.title}) — ${label}, ${fmt(j.scheduledAt)}–${fmt(jEnd)}`
    );
  }
  for (const a of appointments) {
    const aEnd = endOf(a.scheduledAt, a.scheduledEnd);
    if (aEnd <= start) continue;
    const label = a.assignedToId === null ? "unassigned" : nameOf(a.assignedToId);
    conflicts.push(
      `Appointment "${a.title}" — ${label}, ${fmt(a.scheduledAt)}–${fmt(aEnd)}`
    );
  }
  for (const b of blocks) {
    conflicts.push(
      `Blocked time "${b.title || "Busy"}" — ${nameOf(b.userId)}, ${
        b.allDay ? "all day" : `${fmt(b.startAt)}–${fmt(b.endAt)}`
      }`
    );
  }
  return conflicts.slice(0, 5);
}
