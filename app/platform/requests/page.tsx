import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck, Inbox } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { FilterChip } from "@/components/FilterChips";
import FilterBar, { listHref } from "@/components/FilterBar";
import { pickSort, REQUEST_SORTS, requestOrderBy } from "@/lib/list-sort";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import { InboxBand, waitedFor } from "@/components/ListBands";
import MobileSearch from "@/components/MobileSearch";
import Monogram from "@/components/Monogram";
import Pager from "@/components/Pager";
import { requirePageActor, canSell, viaContactScope, seesAllLeads, isManager } from "@/lib/permissions";
import EntityRowActions from "@/components/EntityRowActions";
import type { RequestStatus } from "@prisma/client";

const PAGE_SIZE = 100;

const statusFilters: { value: string; label: string; mobile: string }[] = [
  { value: "", label: "All", mobile: "All requests" },
  { value: "NEEDS_APPROVAL", label: "Needs approval", mobile: "Needs approval" },
  { value: "NEW", label: "New", mobile: "New" },
  { value: "CONVERTED", label: "Converted", mobile: "Converted" },
  { value: "ARCHIVED", label: "Archived", mobile: "Archived" },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assignee?: string; q?: string; page?: string; sort?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;
  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  const { status, assignee, q, page: pageParam, sort: sortRaw } = await searchParams;
  const sort = pickSort(sortRaw, REQUEST_SORTS);
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const query = q?.trim() || undefined;
  const search = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          {
            contact: {
              OR: [
                { firstName: { contains: query, mode: "insensitive" as const } },
                { lastName: { contains: query, mode: "insensitive" as const } },
              ],
            },
          },
        ],
      }
    : {};
  const validStatus = ["NEW", "NEEDS_APPROVAL", "CONVERTED", "ARCHIVED"].includes(status ?? "")
    ? (status as RequestStatus)
    : undefined;

  const showAll = seesAllLeads(actor.role);
  const mineOnly = showAll && assignee === "me";
  const scope = {
    ...viaContactScope(actor),
    ...(mineOnly ? { contact: { assignedToId: actor.id } } : {}),
  };

  const listWhere = { companyId, ...scope, ...(validStatus ? { status: validStatus } : {}), ...search };
  const [requests, listCount, newCount, needsApprovalCount, waitingList] = await Promise.all([
    prisma.request.findMany({
      where: listWhere,
      include: { contact: true },
      orderBy: requestOrderBy(sort),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.request.count({ where: listWhere }),
    prisma.request.count({ where: { companyId, ...scope, status: "NEW" } }),
    prisma.request.count({ where: { companyId, ...scope, status: "NEEDS_APPROVAL" } }),
    // The band's inbox: what's waiting on a reply, oldest first
    prisma.request.findMany({
      where: { companyId, ...scope, status: { in: ["NEW", "NEEDS_APPROVAL"] } },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true, title: true, status: true, createdAt: true, contact: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const cur = { status: validStatus, assignee: mineOnly ? "me" : undefined, q: query, sort: sortRaw };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle heavy section="requests" icon={Inbox}>
          Requests
        </PageTitle>
        {/* Phones create from the tab-bar FAB */}
        <Link
          href="/app/requests/new"
          className="btn-primary hidden lg:flex"
        >
          <Plus size={15} />
          New request
        </Link>
      </div>

      <MobileSearch
        action="/app/requests"
        placeholder="Search requests, clients…"
        defaultValue={query}
        params={{ status: validStatus, assignee: mineOnly ? "me" : undefined, sort: sortRaw }}
      />

      <InboxBand
        waiting={newCount + needsApprovalCount}
        oldest={waitingList[0] ? waitedFor(waitingList[0].createdAt) : null}
        items={waitingList.map((r) => ({
          id: r.id,
          name: `${r.contact.firstName} ${r.contact.lastName}`.trim(),
          title: r.title,
          age: waitedFor(r.createdAt),
          approval: r.status === "NEEDS_APPROVAL",
        }))}
        needsApproval={{ count: needsApprovalCount, href: "/app/requests?status=NEEDS_APPROVAL" }}
        allHref="/app/requests?status=NEW"
      />

      <FilterBar
        options={statusFilters}
        value={validStatus ?? ""}
        href={(v) => listHref("/app/requests", cur, { status: v })}
        scope={
          showAll ? (
            <FilterChip
              hue="var(--ds-primary)"
              active={mineOnly}
              href={listHref("/app/requests", cur, { assignee: mineOnly ? undefined : "me" })}
            >
              <UserCheck size={13} />
              Mine
            </FilterChip>
          ) : undefined
        }
        sort={{
          options: REQUEST_SORTS,
          value: sort,
          href: (v) => listHref("/app/requests", cur, { sort: v }),
        }}
      />

      <div className="ds-card overflow-hidden">
        {requests.length === 0 ? (
          <EmptyState
            art="requests"
            hue="var(--ds-primary)"
            title={validStatus ? "No requests with this status" : "No requests yet"}
            body={
              validStatus
                ? "Try a different status, or log a request yourself."
                : "New work starts here — requests arrive from your booking page and contact forms, or log them yourself."
            }
            actionHref="/app/requests/new"
            actionLabel="Create a request"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden lg:grid grid-cols-[1fr_1fr_140px_130px_40px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
              <span>Client</span>
              <span>Title</span>
              <span>Requested</span>
              <span>Status</span>
              <span></span>
            </div>
            {requests.map((r) => (
              <EntityRowActions
                key={r.id}
                meta={{ kind: "request", id: r.id, title: r.title, status: r.status, contactId: r.contactId, canDelete: isManager(actor.role) }}
              >
              <Link
                prefetch={false} href={`/app/requests/${r.id}`}
                className="ds-trow block lg:grid lg:grid-cols-[1fr_1fr_140px_130px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                {/* Phone row: monogram anchor, the work leads, the client
                    supports */}
                <div className="lg:hidden flex min-w-0 items-center gap-3">
                  <Monogram
                    name={`${r.contact.firstName} ${r.contact.lastName}`}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 ds-trow-name truncate text-[15.5px] font-semibold text-gray-900">
                        {r.title}
                      </p>
                      <p className="shrink-0 text-xs text-gray-500">{shortDate(r.createdAt, tz)}</p>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-[13px] text-gray-600">
                        {r.contact.firstName} {r.contact.lastName}
                      </p>
                      <StatusChip kind="request" status={r.status} className="shrink-0" />
                    </div>
                  </div>
                </div>
                <span className="ds-trow-name hidden lg:block text-sm font-medium text-gray-900">
                  {r.contact.firstName} {r.contact.lastName}
                </span>
                <span className="hidden lg:block text-sm text-gray-600 truncate">{r.title}</span>
                <span className="hidden lg:block text-sm text-gray-500">{shortDate(r.createdAt, tz)}</span>
                <span className="hidden lg:block">
                  <StatusChip kind="request" status={r.status} />
                </span>
                <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
              </Link>
              </EntityRowActions>
            ))}
          </div>
        )}
      </div>
      <Pager
        basePath="/app/requests"
        params={{
          status: validStatus,
          assignee: mineOnly ? "me" : undefined, sort: sortRaw,
          q: query,
        }}
        page={page}
        pageSize={PAGE_SIZE}
        total={listCount}
      />
    </div>
  );
}
