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

  const teamWhere = team ? { assignments: { some: { userId: team } } } : {};
  const scope = jobScope(actor);
  // Sales meetings live on the calendar too — but not for techs
  const showAppointments = canSell(actor.role);

  const [jobs, appointments, unscheduled, users] = await Promise.all([
    prisma.job.findMany({
      where: { companyId, ...scope, scheduledAt: { gte: start, lte: end }, ...teamWhere },
      include: { contact: { select: { firstName: true, lastName: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    showAppointments
      ? prisma.appointment.findMany({
          where: {
            companyId,
            ...appointmentScope(actor),
            status: { not: "CANCELLED" },
            scheduledAt: { gte: start, lte: end },
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
  ]);

  return (
    <ScheduleClient
      view={view}
      date={`${anchor.getFullYear()}-${pad(anchor.getMonth() + 1)}-${pad(anchor.getDate())}`}
      team={team ?? ""}
      jobs={[...jobs.map(toDTO), ...appointments.map(apptToDTO)]}
      unscheduled={unscheduled.map(toDTO)}
      users={users}
      canCreateJob={canFilterTeam}
      canCreateAppointment={showAppointments}
    />
  );
}
