import { prisma } from "@/lib/db";
import { requirePageActor, isManager, jobScope, canSell, appointmentScope } from "@/lib/permissions";
import ScheduleClient, { type ScheduleJobDTO } from "./ScheduleClient";

/**
 * Schedule — month / week / day calendar (Jobber-style, spec §6).
 * Server side only loads data for the visible range; all rendering,
 * navigation and drag-to-schedule lives in ScheduleClient.
 */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDateParam(s?: string): Date {
  if (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

type JobWithContact = {
  id: string;
  jobNumber: number;
  title: string;
  status: string;
  scheduledAt: Date | null;
  scheduledEnd: Date | null;
  scheduledAnytime: boolean;
  subscriptionId: string | null;
  contact: { firstName: string; lastName: string };
};

function toDTO(j: JobWithContact): ScheduleJobDTO {
  return {
    id: j.id,
    kind: "job",
    jobNumber: j.jobNumber,
    title: j.title,
    status: j.status,
    apptType: null,
    scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
    scheduledEnd: j.scheduledEnd ? j.scheduledEnd.toISOString() : null,
    scheduledAnytime: j.scheduledAnytime,
    contactName: `${j.contact.firstName} ${j.contact.lastName}`.trim(),
    recurring: !!j.subscriptionId,
  };
}

type ApptWithContact = {
  id: string;
  title: string;
  status: string;
  type: string;
  scheduledAt: Date;
  scheduledEnd: Date | null;
  scheduledAnytime: boolean;
  tentative: boolean;
  contact: { firstName: string; lastName: string };
};

function apptToDTO(a: ApptWithContact): ScheduleJobDTO {
  return {
    id: a.id,
    kind: "appointment",
    jobNumber: null,
    title: a.title,
    status: a.status,
    apptType: a.type,
    scheduledAt: a.scheduledAt.toISOString(),
    scheduledEnd: a.scheduledEnd ? a.scheduledEnd.toISOString() : null,
    scheduledAnytime: a.scheduledAnytime,
    contactName: `${a.contact.firstName} ${a.contact.lastName}`.trim(),
    tentative: a.tentative,
  };
}

type BlockRow = {
  id: string;
  userId: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  user: { name: string } | null;
};

/**
 * A block can span days (vacation) but the calendar buckets by day, so emit
 * one clamped segment per visible day. Segment ids are `${blockId}#${n}` for
 * React keys; the real block travels in `block` for the edit sheet.
 */
function blockToDTOs(b: BlockRow, fetchStart: Date, fetchEnd: Date, canEdit: boolean): ScheduleJobDTO[] {
  const info = {
    id: b.id,
    userId: b.userId,
    userName: b.user?.name ?? null,
    title: b.title,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    allDay: b.allDay,
    canEdit,
  };
  const segs: ScheduleJobDTO[] = [];
  const day = new Date(Math.max(b.startAt.getTime(), fetchStart.getTime()));
  day.setHours(0, 0, 0, 0);
  const stop = Math.min(b.endAt.getTime(), fetchEnd.getTime());
  for (let i = 0; day.getTime() < stop && i < 120; i++) {
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const segStart = new Date(Math.max(b.startAt.getTime(), day.getTime()));
    const segEnd = new Date(Math.min(b.endAt.getTime(), dayEnd.getTime()));
    if (segEnd > segStart) {
      segs.push({
        id: `${b.id}#${i}`,
        kind: "block",
        jobNumber: null,
        title: b.title,
        status: "BLOCK",
        apptType: null,
        // all-day segments follow the date-only convention: anchored at noon
        scheduledAt: (b.allDay ? new Date(day.getTime() + 12 * 3600000) : segStart).toISOString(),
        scheduledEnd: segEnd.toISOString(),
        scheduledAnytime: b.allDay,
        contactName: b.userId ? (b.user?.name ?? "") : "Everyone",
        block: info,
      });
    }
    day.setDate(day.getDate() + 1);
  }
  return segs;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; team?: string }>;
}) {
  const actor = await requirePageActor();
  const companyId = actor.companyId;
  // Sales/tech are already scoped to their own work — no team filter for them
  const canFilterTeam = isManager(actor.role) || actor.role === "USER";

  const { view: viewParam, date: dateParam, team: teamParam } = await searchParams;
  const team = canFilterTeam ? teamParam : undefined;
  const explicitView = viewParam === "month" || viewParam === "week" || viewParam === "day";
  const view = viewParam === "week" || viewParam === "day" ? viewParam : "month";
  const anchor = parseDateParam(dateParam);

  // Visible range (server TZ = company TZ via Railway TZ env)
  let start: Date;
  let end: Date;
  if (view === "month") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (view === "week") {
    start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else {
    start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    end = new Date(anchor);
    end.setHours(23, 59, 59, 999);
  }

  // The visible grid buckets items in the BROWSER's timezone, but this range is
  // built in the server timezone (Railway TZ). For a company outside the server
  // TZ, an item near a day/week/month boundary can land just outside [start, end]
  // in server time yet still be visible in browser time — so widen the FETCH by
  // a day on each side. ScheduleClient discards anything outside the visible range.
  const fetchStart = new Date(start.getTime() - 86400000);
  const fetchEnd = new Date(end.getTime() + 86400000);

  const teamWhere = team ? { assignments: { some: { userId: team } } } : {};
  const scope = jobScope(actor);
  // Sales meetings live on the calendar too — but not for techs
  const showAppointments = canSell(actor.role);

  // Blocked-off time: managers + USER see everyone's blocks (named), narrowed
  // by the team filter; sales/tech see their own plus company-wide ones.
  const blockScope = canFilterTeam
    ? team
      ? { OR: [{ userId: null }, { userId: team }] }
      : {}
    : { OR: [{ userId: null }, { userId: actor.id }] };

  const [jobs, appointments, unscheduled, users, blocks] = await Promise.all([
    prisma.job.findMany({
      where: { companyId, ...scope, scheduledAt: { gte: fetchStart, lte: fetchEnd }, ...teamWhere },
      include: { contact: { select: { firstName: true, lastName: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    showAppointments
      ? prisma.appointment.findMany({
          where: {
            companyId,
            ...appointmentScope(actor),
            status: { not: "CANCELLED" },
            scheduledAt: { gte: fetchStart, lte: fetchEnd },
            ...(team ? { assignedToId: team } : {}),
          },
          include: { contact: { select: { firstName: true, lastName: true } } },
          orderBy: { scheduledAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.job.findMany({
      where: { companyId, ...scope, status: "ACTIVE", scheduledAt: null, ...teamWhere },
      include: { contact: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    canFilterTeam
      ? prisma.user.findMany({
          where: { companyId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.timeBlock.findMany({
      where: { companyId, startAt: { lt: fetchEnd }, endAt: { gt: fetchStart }, ...blockScope },
      include: { user: { select: { name: true } } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const blockDTOs = blocks.flatMap((b) =>
    blockToDTOs(b, fetchStart, fetchEnd, isManager(actor.role) || b.userId === actor.id)
  );

  return (
    <ScheduleClient
      view={view}
      explicitView={explicitView}
      date={`${anchor.getFullYear()}-${pad(anchor.getMonth() + 1)}-${pad(anchor.getDate())}`}
      team={team ?? ""}
      jobs={[...jobs.map(toDTO), ...appointments.map(apptToDTO), ...blockDTOs]}
      unscheduled={unscheduled.map(toDTO)}
      users={users}
      canCreateJob={canFilterTeam}
      canCreateAppointment={showAppointments}
      canBlockForOthers={isManager(actor.role)}
      meId={actor.id}
    />
  );
}
