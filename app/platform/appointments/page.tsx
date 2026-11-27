import { prisma } from "@/lib/db";
import { Fragment } from "react";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck, Search } from "lucide-react";
import TitleSentinel from "@/components/TitleSentinel";
import { listHref } from "@/components/FilterBar";
import { appointmentTypeLabel } from "@/lib/statuses";
import { fmtTime } from "@/lib/format";
import { startOfDayIn, zonedMidnight, zonedParts } from "@/lib/timezone";
import AppointmentsStrip, { type StripDay } from "./AppointmentsStrip";
import StatusChip from "@/components/StatusChip";
import { Button, Chip, DsPage, PageHeader } from "@/components/ds";
import EmptyState from "@/components/EmptyState";
import Monogram from "@/components/Monogram";
import Pager from "@/components/Pager";
import EntityRowActions from "@/components/EntityRowActions";
import { requirePageActor, canSell, appointmentScope, isManager } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

/**
 * The Appointments index. Same bones as the Requests list (2026-10-12):
 * search, status filter, pager, row quick-menu. The filter partitions the
 * table — Upcoming (scheduled, today onward — the default, soonest first),
 * Past (done, no-show, or a scheduled one whose day went by), Cancelled, All.
 */

const PAGE_SIZE = 100;

const statusFilters: { value: string; label: string; mobile: string }[] = [
  { value: "", label: "Upcoming", mobile: "Upcoming" },
  { value: "past", label: "Past", mobile: "Past" },
  { value: "cancelled", label: "Cancelled", mobile: "Cancelled" },
  { value: "all", label: "All", mobile: "All" },
];

const FILTER_VALUES = statusFilters.map((f) => f.value);

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assignee?: string; q?: string; page?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;
  // "Upcoming" starts at the company's midnight, not the UTC server's — at
  // 7pm Central the server is already on tomorrow and tonight's appointments
  // used to slide into "Past".
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";
  const startOfToday = startOfDayIn(tz, new Date());

  const { status, assignee, q, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const query = q?.trim() || undefined;
  const filter = FILTER_VALUES.includes(status ?? "") ? (status as string) : "";

  const search: Prisma.AppointmentWhereInput = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          {
            contact: {
              OR: [
                { firstName: { contains: query, mode: "insensitive" } },
                { lastName: { contains: query, mode: "insensitive" } },
              ],
            },
          },
        ],
      }
    : {};

  // Managers see everyone's; "Mine" narrows to the ones they are on. Other
  // roles are already scoped to their own by appointmentScope.
  const showAll = isManager(actor.role);
  const mineOnly = showAll && assignee === "me";
  const scope: Prisma.AppointmentWhereInput = {
    ...(appointmentScope(actor) as Prisma.AppointmentWhereInput),
    ...(mineOnly
      ? { OR: [{ assignedToId: actor.id }, { extraAssignees: { some: { userId: actor.id } } }] }
      : {}),
  };

  const statusWhere: Prisma.AppointmentWhereInput =
    filter === "past"
      ? {
          OR: [
            { status: { in: ["COMPLETED", "NO_SHOW"] } },
            { status: "SCHEDULED", scheduledAt: { lt: startOfToday } },
          ],
        }
      : filter === "cancelled"
        ? { status: "CANCELLED" }
        : filter === "all"
          ? {}
          : { status: "SCHEDULED", scheduledAt: { gte: startOfToday } };

  // AND keeps the three OR groups (scope, search, status) from clobbering
  // each other on the same key.
  const listWhere: Prisma.AppointmentWhereInput = { companyId, AND: [scope, search, statusWhere] };

  // The picture: the next 14 days of booked visits (status SCHEDULED), plus
  // the ones whose day went by without being closed out.
  const t0 = zonedParts(tz, new Date());
  const stripEnd = zonedMidnight(tz, t0.y, t0.m, t0.d + 14);
  // Desktop tab counts (same scope, no search)
  const statusWhereFor = (v: string): Prisma.AppointmentWhereInput =>
    v === "past"
      ? { OR: [{ status: { in: ["COMPLETED", "NO_SHOW"] } }, { status: "SCHEDULED", scheduledAt: { lt: startOfToday } }] }
      : v === "cancelled"
        ? { status: "CANCELLED" }
        : v === "all"
          ? {}
          : { status: "SCHEDULED", scheduledAt: { gte: startOfToday } };
  const tabCountsP = Promise.all(
    statusFilters.map((o) => prisma.appointment.count({ where: { companyId, AND: [scope, statusWhereFor(o.value)] } }))
  );
  const [appointments, listCount, stripAppts, toCloseCount] = await Promise.all([
    prisma.appointment.findMany({
      where: listWhere,
      orderBy: { scheduledAt: filter === "" ? "asc" : "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        contact: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { name: true } },
        _count: { select: { extraAssignees: true } },
      },
    }),
    prisma.appointment.count({ where: listWhere }),
    prisma.appointment.findMany({
      where: { companyId, AND: [scope, { status: "SCHEDULED", scheduledAt: { gte: startOfToday, lt: stripEnd } }] },
      orderBy: { scheduledAt: "asc" },
      take: 300,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        scheduledAnytime: true,
        tentative: true,
        contact: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.appointment.count({
      where: {
        companyId,
        AND: [scope, { status: "SCHEDULED", scheduledAt: { lt: startOfToday, gte: new Date(startOfToday.getTime() - 30 * 86400000) } }],
      },
    }),
  ]);

  const dayKey = (d: Date) => {
    const p = zonedParts(tz, d);
    return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  };
  const stripDays: StripDay[] = Array.from({ length: 14 }, (_, i) => {
    const mid = zonedMidnight(tz, t0.y, t0.m, t0.d + i);
    const p = zonedParts(tz, mid);
    const key = dayKey(mid);
    return {
      key,
      dow: mid.toLocaleDateString("en-US", { weekday: "short", timeZone: tz }),
      date: String(p.d),
      month: i === 0 || p.d === 1 ? mid.toLocaleDateString("en-US", { month: "short", timeZone: tz }) : null,
      today: i === 0,
      weekend: p.weekday === 0 || p.weekday === 6,
      href: `/app/schedule?view=day&date=${key}`,
      appts: stripAppts
        .filter((a) => dayKey(a.scheduledAt) === key)
        .map((a) => ({
          id: a.id,
          name: `${a.contact.firstName} ${a.contact.lastName}`.trim() || "Client",
          title: a.title,
          time: a.scheduledAnytime ? "Anytime" : fmtTime(a.scheduledAt, tz),
          tentative: a.tentative,
        })),
    };
  });
  const nextAppt = stripAppts.find((a) => a.scheduledAnytime || a.scheduledAt.getTime() >= Date.now());
  const toApproveCount = stripAppts.filter((a) => a.tentative).length;

  // Rows are grouped under day headings ("Today", "Tomorrow", "Wed, Nov 26").
  const todayKey = dayKey(new Date());
  const tomorrowKey = dayKey(zonedMidnight(tz, t0.y, t0.m, t0.d + 1));
  const dayHeading = (d: Date) => {
    const k = dayKey(d);
    if (k === todayKey) return "Today";
    if (k === tomorrowKey) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: tz, ...(zonedParts(tz, d).y !== t0.y ? { year: "numeric" } : {}) });
  };

  const cur = { status: filter || undefined, assignee: mineOnly ? "me" : undefined, q: query };
  const canDelete = isManager(actor.role);

  const emptyTitle =
    query
      ? "No appointments match"
      : filter === "past"
        ? "No past appointments"
        : filter === "cancelled"
          ? "No cancelled appointments"
          : filter === "all"
            ? "No appointments yet"
            : "Nothing coming up";
  const emptyBody =
    query || filter
      ? "Try another search or filter, or book a new appointment."
      : "Book estimates and sales calls. They show here and on the schedule.";

  const who = (a: (typeof appointments)[number]) =>
    a.assignedTo?.name ? `${a.assignedTo.name}${a._count.extraAssignees ? ` +${a._count.extraAssignees}` : ""}` : "";
  // Rows sit under a day heading, so the row itself only needs the time.
  const when = (a: (typeof appointments)[number]) => (a.scheduledAnytime ? "Anytime" : fmtTime(a.scheduledAt, tz));

  const tabCounts = await tabCountsP;

  return (
    <DsPage
      open
      className="rx-appts rx-phone"
      header={
        <div>
          <PageHeader
            title="Appointments"
            actions={
              <Button href="/app/appointments/new" icon={Plus}>
                New appointment
              </Button>
            }
          />
        </div>
      }
    >
      {/* phones: the top bar takes the title once the header scrolls away */}
      <span className="hidden"><TitleSentinel title="Appointments" /></span>

      <AppointmentsStrip
        days={stripDays}
        next={
          nextAppt
            ? {
                href: `/app/appointments/${nextAppt.id}`,
                label: `${dayHeading(nextAppt.scheduledAt)}${nextAppt.scheduledAnytime ? "" : ` ${fmtTime(nextAppt.scheduledAt, tz)}`} · ${nextAppt.contact.firstName} ${nextAppt.contact.lastName}`.trim(),
              }
            : null
        }
        toApprove={{ count: toApproveCount, href: "/app/schedule" }}
        toClose={{ count: toCloseCount, href: "/app/appointments?status=past" }}
      />

      {/* Search + underline tabs with counts + Mine on one hairline row (phones: search above, tabs scroll) */}
      <div className="rx-tabsrow">
        <div className="clx-filters">
          <form action="/app/appointments" className="clx-search" role="search">
            <Search size={15} aria-hidden />
            <input type="search" name="q" defaultValue={query} placeholder="Search appointments, clients" aria-label="Search appointments" />
            {filter && <input type="hidden" name="status" value={filter} />}
            {mineOnly && <input type="hidden" name="assignee" value="me" />}
          </form>
          <nav className="clx-tabs" aria-label="Show">
            {statusFilters.map((o, i) => (
              <Link
                key={o.value || "upcoming"}
                prefetch={false}
                href={listHref("/app/appointments", cur, { status: o.value || undefined })}
                aria-current={filter === o.value ? "page" : undefined}
                className={`clx-tab ${filter === o.value ? "is-on" : ""}`}
              >
                {o.label}
                <span className="clx-tab-n">{tabCounts[i].toLocaleString("en-US")}</span>
              </Link>
            ))}
          </nav>
          {showAll && (
            <span className="clx-filters-end">
              <Link
                prefetch={false}
                href={listHref("/app/appointments", cur, { assignee: mineOnly ? undefined : "me" })}
                aria-pressed={mineOnly}
                className={`clx-mine ${mineOnly ? "is-on" : ""}`}
              >
                <UserCheck size={14} aria-hidden />
                Mine
              </Link>
            </span>
          )}
        </div>
      </div>

      <div className="ds-card rx-open-card overflow-hidden">
        {appointments.length === 0 ? (
          <EmptyState
            art="schedule"
            hue="var(--ds-primary)"
            title={emptyTitle}
            body={emptyBody}
            actionHref="/app/appointments/new"
            actionLabel="Book an appointment"
          />
        ) : (
          <div className="divide-y divide-[color:var(--ds-line)]">
            <div className="rx-thead hidden lg:grid grid-cols-[1fr_1fr_170px_140px_120px_40px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
              <span>Client</span>
              <span>Appointment</span>
              <span>When</span>
              <span>Who</span>
              <span>Status</span>
              <span></span>
            </div>
            {appointments.map((a, i) => (
              <Fragment key={a.id}>
              {(i === 0 || dayKey(appointments[i - 1].scheduledAt) !== dayKey(a.scheduledAt)) && (
                <div className="appt-dayrow" data-today={dayKey(a.scheduledAt) === todayKey || undefined}>
                  <span>{dayHeading(a.scheduledAt)}</span>
                  <span className="appt-dayrow-count">
                    {(() => {
                      const k = dayKey(a.scheduledAt);
                      let n = 0;
                      for (const b of appointments) if (dayKey(b.scheduledAt) === k) n++;
                      return n;
                    })()}
                  </span>
                </div>
              )}
              <EntityRowActions
                meta={{ kind: "appointment", id: a.id, title: a.title, status: a.status, contactId: a.contactId, canDelete }}
              >
                <Link
                  prefetch={false}
                  href={`/app/appointments/${a.id}`}
                  className="ds-trow block lg:grid lg:grid-cols-[1fr_1fr_170px_140px_120px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {/* Phone row: monogram anchor, the appointment leads, the
                      client supports, status trails */}
                  <div className="lg:hidden flex min-w-0 items-center gap-3">
                    <Monogram name={`${a.contact.firstName} ${a.contact.lastName}`} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 flex-1 ds-trow-name truncate text-[15.5px] font-semibold text-gray-900">{a.title}</p>
                        <p className="appt-time shrink-0 text-xs">{when(a)}</p>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-[13px] text-gray-600">
                          {a.contact.firstName} {a.contact.lastName} · {appointmentTypeLabel[a.type] ?? a.type}
                        </p>
                        {a.tentative ? (
                          <span className="shrink-0"><Chip tone="warn">To approve</Chip></span>
                        ) : (
                          <StatusChip kind="appointment" status={a.status} className="shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Desktop columns */}
                  <span className="hidden lg:flex min-w-0 items-center gap-2.5">
                    <Monogram name={`${a.contact.firstName} ${a.contact.lastName}`} size={28} />
                    <span className="ds-trow-name truncate text-sm font-semibold text-gray-900">
                      {a.contact.firstName} {a.contact.lastName}
                    </span>
                  </span>
                  <span className="hidden lg:flex items-center gap-2 min-w-0">
                    <span className="text-sm text-gray-600 truncate">
                      {a.title}
                      {a.appointmentNumber ? (
                        <span className="ml-1.5 text-xs text-gray-400">#{a.appointmentNumber}</span>
                      ) : null}
                    </span>
                    {a.tentative && <Chip tone="warn">To approve</Chip>}
                  </span>
                  <span className="appt-time hidden lg:block text-sm truncate">
                    {when(a)}
                    <span className="text-gray-400"> · {appointmentTypeLabel[a.type] ?? a.type}</span>
                  </span>
                  <span className="hidden lg:block text-sm text-gray-500 truncate">{who(a) || "—"}</span>
                  <span className="hidden lg:block">
                    <StatusChip kind="appointment" status={a.status} />
                  </span>
                  <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                </Link>
              </EntityRowActions>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <Pager
        basePath="/app/appointments"
        params={{ status: filter || undefined, assignee: mineOnly ? "me" : undefined, q: query }}
        page={page}
        pageSize={PAGE_SIZE}
        total={listCount}
      />
    </DsPage>
  );
}
