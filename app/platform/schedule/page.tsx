import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager, jobScope, canSell, appointmentScope } from "@/lib/permissions";
import { localDayParts, wallTimeToUtc } from "@/lib/booking-engine";
import { DAY_KEYS, earliestOpenMinutes, sanitizeBusinessHours, timeToMinutes } from "@/lib/business-hours";
import { resolveSlotInterval } from "@/lib/scheduling";
import ScheduleClient from "./ScheduleClient";
import type { ScheduleJobDTO, WeekHours } from "./schedule-lib";

/**
 * Schedule — month / week / day calendar (Jobber-style, spec §6).
 * Server side only loads data for the visible range; all rendering,
 * navigation and drag-to-schedule lives in ScheduleClient.
 */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDateParam(s: string | undefined, tz: string): Date {
  if (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  // No date = "today" in the COMPANY's calendar, not the server's — a
  // late-evening tenant west of the server would otherwise open on tomorrow.
  const { y, m, d } = localDayParts(tz, new Date());
  return new Date(y, m - 1, d);
}

type JobWithContact = {
  id: string;
  contactId: string;
  jobNumber: number;
  title: string;
  status: string;
  scheduledAt: Date | null;
  scheduledEnd: Date | null;
  scheduledAnytime: boolean;
  subscriptionId: string | null;
  conflictNote?: string | null;
  address: string | null;
  contact: { firstName: string; lastName: string; phone: string | null; address: string | null };
  assignments?: { userId: string; user: { name: string | null } }[];
  outsourced?: boolean;
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
    contactId: j.contactId,
    recurring: !!j.subscriptionId,
    conflictNote: j.conflictNote ?? null,
    assignees: (j.assignments ?? [])
      .map((a) => a.user.name?.trim() ?? "")
      .filter(Boolean),
    assigneeIds: (j.assignments ?? []).map((a) => a.userId),
    outsourced: Boolean(j.outsourced),
    // Phone agenda swipe actions (call / directions)
    phone: j.contact.phone,
    address: j.address ?? j.contact.address,
  };
}

type ApptWithContact = {
  id: string;
  contactId: string;
  requestId: string | null;
  assignedToId: string | null;
  title: string;
  status: string;
  type: string;
  scheduledAt: Date;
  scheduledEnd: Date | null;
  scheduledAnytime: boolean;
  tentative: boolean;
  contact: { firstName: string; lastName: string; phone: string | null; address: string | null };
  assignedTo?: { name: string | null } | null;
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
    contactId: a.contactId,
    requestId: a.requestId,
    tentative: a.tentative,
    assignees: a.assignedTo?.name?.trim() ? [a.assignedTo.name.trim()] : [],
    assigneeIds: a.assignedToId ? [a.assignedToId] : [],
    phone: a.contact.phone,
    // Directions only make sense for an on-site visit
    address: a.type === "IN_PERSON" ? a.contact.address : null,
  };
}

type BlockRow = {
  id: string;
  userId: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  address?: string | null;
  source?: "MANUAL" | "GOOGLE";
  user: { name: string } | null;
};

/**
 * A block can span days (vacation) but the calendar buckets by day, so emit
 * one clamped segment per visible day. Segment ids are `${blockId}#${n}` for
 * React keys; the real block travels in `block` for the edit sheet.
 */
function blockToDTOs(b: BlockRow, fetchStart: Date, fetchEnd: Date, canEdit: boolean, tz: string): ScheduleJobDTO[] {
  const source = b.source ?? "MANUAL";
  // Mirrored Google events change in Google, not here
  const mirrored = source === "GOOGLE";
  const info = {
    id: b.id,
    userId: b.userId,
    userName: b.user?.name ?? null,
    title: b.title,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    allDay: b.allDay,
    address: b.address ?? null,
    canEdit: canEdit && !mirrored,
    source,
  };
  const label = mirrored ? `${b.title} · Google` : b.title;
  const segs: ScheduleJobDTO[] = [];
  // Split at the COMPANY's midnights, not the server's. Splitting in server
  // time for a tenant west of it put the cut a few hours into their evening:
  // the segment for a middle day started "yesterday" and the day itself came
  // up empty (Google busy blocks spanning a weekend vanished from Saturday).
  const first = localDayParts(tz, new Date(Math.max(b.startAt.getTime(), fetchStart.getTime())));
  const stop = Math.min(b.endAt.getTime(), fetchEnd.getTime());
  for (let i = 0; i < 120; i++) {
    // Date.UTC inside wallTimeToUtc normalizes day overflow, so d + i walks
    // across month ends on its own
    const day = wallTimeToUtc(tz, first.y, first.m, first.d + i, 0);
    if (day.getTime() >= stop) break;
    const dayEnd = wallTimeToUtc(tz, first.y, first.m, first.d + i + 1, 0);
    const segStart = new Date(Math.max(b.startAt.getTime(), day.getTime()));
    const segEnd = new Date(Math.min(b.endAt.getTime(), dayEnd.getTime()));
    if (segEnd > segStart) {
      segs.push({
        id: `${b.id}#${i}`,
        kind: "block",
        jobNumber: null,
        title: label,
        status: "BLOCK",
        apptType: null,
        // all-day segments follow the date-only convention: anchored at noon
        scheduledAt: (b.allDay ? wallTimeToUtc(tz, first.y, first.m, first.d + i, 12 * 60) : segStart).toISOString(),
        scheduledEnd: segEnd.toISOString(),
        scheduledAnytime: b.allDay,
        contactName: b.userId ? (b.user?.name ?? "") : "Everyone",
        block: info,
      });
    }
  }
  return segs;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; team?: string; board?: string }>;
}) {
  const actor = await requirePageActor();
  const companyId = actor.companyId;
  // Sales/tech are already scoped to their own work — no team filter for them
  const canFilterTeam = isManager(actor.role) || actor.role === "USER";

  const { view: viewParam, date: dateParam, team: teamParam, board: boardParam } = await searchParams;
  const team = canFilterTeam ? teamParam : undefined;
  const board = canFilterTeam && boardParam === "team";
  const explicitView = viewParam === "month" || viewParam === "week" || viewParam === "day";
  let view: "month" | "week" | "day" =
    viewParam === "week" || viewParam === "day" ? viewParam : "month";
  // Phones open on the Day agenda. Decide it here from the user agent so the
  // first paint is already Day — the old client-side redirect flashed the
  // month grid first. The client matchMedia effect stays as a fallback for
  // narrow desktop windows the UA can't reveal.
  if (!explicitView) {
    const ua = (await headers()).get("user-agent") ?? "";
    if (/iPhone|iPod|Windows Phone|Android(?=.*Mobile)/i.test(ua)) view = "day";
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true, businessHours: true, schedulingIntervalMinutes: true },
  });
  const tz = company?.timezone || "America/Chicago";
  const anchor = parseDateParam(dateParam, tz);

  // Open hours per weekday, in minutes — shades the grid, anchors the
  // pickers, and sizes the month view's capacity bars
  const businessHours = sanitizeBusinessHours(company?.businessHours);
  const hours: WeekHours = DAY_KEYS.map((k) =>
    (businessHours[k] ?? [])
      .map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }))
      .filter((r): r is { start: number; end: number } => r.start !== null && r.end !== null && r.end > r.start)
  );
  const intervalMinutes = resolveSlotInterval({ companyIntervalMinutes: company?.schedulingIntervalMinutes });
  const dayStartMinutes = earliestOpenMinutes(businessHours);

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
    // Day view loads the whole surrounding week: the phone agenda's date
    // strip marks which nearby days have work, and the renderers already
    // discard anything outside the visible day.
    start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
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
      include: {
        contact: { select: { firstName: true, lastName: true, phone: true, address: true } },
        // Who's on it — the phone agenda shows initials so the company-wide
        // view answers "whose day is this?" without the team filter
        assignments: { select: { userId: true, user: { select: { name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    // Appointments for EVERY role, properly scoped — a tech assigned to an
    // in-person estimate used to have it on nobody's calendar but the office's
    prisma.appointment.findMany({
      where: {
        companyId,
        ...appointmentScope(actor),
        status: { not: "CANCELLED" },
        scheduledAt: { gte: fetchStart, lte: fetchEnd },
        ...(team ? { assignedToId: team } : {}),
      },
      include: {
        contact: { select: { firstName: true, lastName: true, phone: true, address: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.job.findMany({
      where: {
        companyId,
        ...scope,
        status: "ACTIVE",
        scheduledAt: null,
        // Filtering by a tech must still show the UNASSIGNED pool — those are
        // exactly the jobs a dispatcher is looking to hand that tech
        ...(team
          ? { OR: [{ assignments: { some: { userId: team } } }, { assignments: { none: {} } }] }
          : {}),
      },
      include: {
        contact: { select: { firstName: true, lastName: true, phone: true, address: true } },
        // The drop-to-schedule sheet prefills the crew — without this a job
        // assigned before scheduling would get its assignees wiped on save
        assignments: { select: { userId: true, user: { select: { name: true } } } },
      },
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
    blockToDTOs(b, fetchStart, fetchEnd, isManager(actor.role) || b.userId === actor.id, tz)
  );

  // Crew minutes available per weekday: every active member × the open hours
  // (a solo operator or a scoped tech counts as one)
  const crewSize = Math.max(1, users.length);
  const capacityByDow = hours.map((ranges) => crewSize * ranges.reduce((s, r) => s + (r.end - r.start), 0));

  // A scheduled job nobody is on (and not outsourced) is a dispatch miss in a
  // multi-person company — it's on no one's schedule or calendar sync. A
  // one-person company never gets here (jobs auto-assign to its one member).
  const badgeCrew = (d: ScheduleJobDTO): ScheduleJobDTO =>
    users.length > 1 && !d.outsourced && (d.assigneeIds?.length ?? 0) === 0 ? { ...d, needsCrew: true } : d;

  return (
    <ScheduleClient
      view={view}
      explicitView={explicitView}
      date={`${anchor.getFullYear()}-${pad(anchor.getMonth() + 1)}-${pad(anchor.getDate())}`}
      team={team ?? ""}
      board={board}
      jobs={[...jobs.map(toDTO).map(badgeCrew), ...appointments.map(apptToDTO), ...blockDTOs]}
      unscheduled={unscheduled.map(toDTO)}
      users={users}
      hours={hours}
      intervalMinutes={intervalMinutes}
      dayStartMinutes={dayStartMinutes}
      capacityByDow={capacityByDow}
      canDispatch={canFilterTeam}
      canCreateJob={canFilterTeam}
      // Viewing is for everyone (scoped above); creating stays a sales action
      canCreateAppointment={canSell(actor.role)}
      canBlockForOthers={isManager(actor.role)}
      meId={actor.id}
    />
  );
}
