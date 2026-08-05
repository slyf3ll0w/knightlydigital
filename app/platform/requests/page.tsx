import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck, Inbox } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { FilterRow, FilterChip, FilterDivider } from "@/components/FilterChips";
import FilterSelect from "@/components/FilterSelect";
import { SECTION_HUES } from "@/lib/section-colors";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import KpiStrip from "@/components/KpiStrip";
import MobileSearch from "@/components/MobileSearch";
import Monogram from "@/components/Monogram";
import { requirePageActor, canSell, viaContactScope, seesAllLeads } from "@/lib/permissions";
import type { RequestStatus } from "@prisma/client";

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
  searchParams: Promise<{ status?: string; assignee?: string; q?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { status, assignee, q } = await searchParams;
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

  const [requests, newCount, needsApprovalCount] = await Promise.all([
    prisma.request.findMany({
      where: { companyId, ...scope, ...(validStatus ? { status: validStatus } : {}), ...search },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.request.count({ where: { companyId, ...scope, status: "NEW" } }),
    prisma.request.count({ where: { companyId, ...scope, status: "NEEDS_APPROVAL" } }),
  ]);

  const qs = (opts: { status?: string; mine?: boolean }) => {
    const p = new URLSearchParams();
    const s = opts.status ?? validStatus ?? "";
    if (s) p.set("status", s);
    if (opts.mine ?? mineOnly) p.set("assignee", "me");
    const str = p.toString();
    return str ? `/app/requests?${str}` : "/app/requests";
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle section="requests" icon={Inbox}>
          Requests
        </PageTitle>
        {/* Phones create from the tab-bar FAB */}
        <Link
          href="/app/requests/new"
          className="hidden lg:flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
        >
          <Plus size={15} />
          New Request
        </Link>
      </div>

      <MobileSearch
        action="/app/requests"
        placeholder="Search requests, clients…"
        defaultValue={query}
        params={{ status: validStatus, assignee: mineOnly ? "me" : undefined }}
      />

      <KpiStrip
        desktopCols={4}
        hue={SECTION_HUES.requests}
        kpis={[
          {
            label: "New requests",
            value: newCount,
            href: "/app/requests?status=NEW",
            zero: newCount === 0,
          },
          ...(needsApprovalCount > 0
            ? [
                {
                  label: "Bookings to approve",
                  mobileLabel: "To approve",
                  value: needsApprovalCount,
                  href: "/app/requests?status=NEEDS_APPROVAL",
                  tone: "danger" as const,
                },
              ]
            : []),
        ]}
      />

      {/* Status filter — five options crowded the segmented row, so phones
          get a compact dropdown (David's call) with the My-leads scope
          toggle beside it. Desktop keeps the chip rail. */}
      <div className="mb-4 flex items-center gap-2 lg:hidden">
        <FilterSelect
          value={validStatus ?? ""}
          options={statusFilters.map((f) => ({
            value: f.value,
            label: f.mobile,
            href: qs({ status: f.value }),
          }))}
        />
        {showAll && (
          <FilterChip
            hue={SECTION_HUES.requests}
            active={mineOnly}
            href={qs({ mine: !mineOnly })}
          >
            <UserCheck size={13} />
            My leads
          </FilterChip>
        )}
      </div>
      <div className="hidden lg:block">
        <FilterRow>
          {statusFilters.map((f) => (
            <FilterChip
              key={f.value}
              hue={SECTION_HUES.requests}
              active={(validStatus ?? "") === f.value}
              href={qs({ status: f.value })}
            >
              {f.label}
            </FilterChip>
          ))}
          {showAll && (
            <>
              <FilterDivider />
              <FilterChip
                hue={SECTION_HUES.requests}
                active={mineOnly}
                href={qs({ mine: !mineOnly })}
              >
                <UserCheck size={13} />
                My leads
              </FilterChip>
            </>
          )}
        </FilterRow>
      </div>

      <div className="card-ledger overflow-hidden">
        {requests.length === 0 ? (
          <EmptyState
            art="requests"
            hue={SECTION_HUES.requests}
            title={validStatus ? "No requests with this status" : "No requests yet"}
            body={
              validStatus
                ? "Try a different status, or log a request yourself."
                : "New work starts here — requests arrive from your booking form, or log them yourself."
            }
            actionHref="/app/requests/new"
            actionLabel="Create a Request"
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
              <Link
                key={r.id}
                href={`/app/requests/${r.id}`}
                className="block lg:grid lg:grid-cols-[1fr_1fr_140px_130px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
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
                      <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900">
                        {r.title}
                      </p>
                      <p className="shrink-0 text-xs text-gray-500">{shortDate(r.createdAt)}</p>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-[13px] text-gray-600">
                        {r.contact.firstName} {r.contact.lastName}
                      </p>
                      <StatusChip kind="request" status={r.status} className="shrink-0" />
                    </div>
                  </div>
                </div>
                <span className="hidden lg:block text-sm font-medium text-gray-900">
                  {r.contact.firstName} {r.contact.lastName}
                </span>
                <span className="hidden lg:block text-sm text-gray-600 truncate">{r.title}</span>
                <span className="hidden lg:block text-sm text-gray-500">{shortDate(r.createdAt)}</span>
                <span className="hidden lg:block">
                  <StatusChip kind="request" status={r.status} />
                </span>
                <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
