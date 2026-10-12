import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, CalendarClock, UserCheck } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { FilterChip } from "@/components/FilterChips";
import FilterBar, { listHref } from "@/components/FilterBar";
import { shortDate, appointmentTypeLabel } from "@/lib/statuses";
import { fmtTime } from "@/lib/format";
import { startOfDayIn } from "@/lib/timezone";
import StatusChip from "@/components/StatusChip";
import { Chip } from "@/components/ds";
import EmptyState from "@/components/EmptyState";
import MobileSearch from "@/components/MobileSearch";
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

  const [appointments, listCount] = await Promise.all([
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
  ]);

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
  const when = (a: (typeof appointments)[number]) =>
    `${shortDate(a.scheduledAt, tz)}${a.scheduledAnytime ? "" : ` ${fmtTime(a.scheduledAt, tz)}`}`;

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle section="schedule" icon={CalendarClock}>
          Appointments
        </PageTitle>
        {/* Phones create from the tab-bar FAB */}
        <Link href="/app/appointments/new" className="btn-primary hidden lg:flex">
          <Plus size={15} />
          New appointment
        </Link>
      </div>

      <MobileSearch
        action="/app/appointments"
        placeholder="Search appointments, clients…"
        defaultValue={query}
        params={{ status: filter || undefined, assignee: mineOnly ? "me" : undefined }}
      />

      <FilterBar
        options={statusFilters}
        value={filter}
        href={(v) => listHref("/app/appointments", cur, { status: v })}
        scope={
          showAll ? (
            <FilterChip
              hue="var(--ds-primary)"
              active={mineOnly}
              href={listHref("/app/appointments", cur, { assignee: mineOnly ? undefined : "me" })}
            >
              <UserCheck size={13} />
              Mine
            </FilterChip>
          ) : undefined
        }
      />

      <div className="ds-card overflow-hidden">
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
            <div className="hidden lg:grid grid-cols-[1fr_1fr_170px_140px_120px_40px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
              <span>Client</span>
              <span>Appointment</span>
              <span>When</span>
              <span>Who</span>
              <span>Status</span>
              <span></span>
            </div>
            {appointments.map((a) => (
              <EntityRowActions
                key={a.id}
                meta={{ kind: "appointment", id: a.id, title: a.title, status: a.status, contactId: a.contactId, canDelete }}
              >
                <Link
                  prefetch={false}
                  href={`/app/appointments/${a.id}`}
                  className="block lg:grid lg:grid-cols-[1fr_1fr_170px_140px_120px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {/* Phone row: monogram anchor, the appointment leads, the
                      client supports, status trails */}
                  <div className="lg:hidden flex min-w-0 items-center gap-3">
                    <Monogram name={`${a.contact.firstName} ${a.contact.lastName}`} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900">{a.title}</p>
                        <p className="shrink-0 text-xs text-gray-500">{when(a)}</p>
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
                  <span className="hidden lg:block text-sm font-medium text-gray-900 truncate">
                    {a.contact.firstName} {a.contact.lastName}
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
                  <span className="hidden lg:block text-sm text-gray-500 truncate">
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
    </div>
  );
}
