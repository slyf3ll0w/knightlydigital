import { prisma } from "@/lib/db";
import { requirePageActor, jobScope, canSeePricing, isManager } from "@/lib/permissions";
import Link from "next/link";
import { Plus, ChevronRight, Briefcase, Download } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES } from "@/lib/section-colors";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import KpiStrip from "@/components/KpiStrip";
import MobileSearch from "@/components/MobileSearch";
import Monogram from "@/components/Monogram";
import { FilterRow, FilterChip, SegmentedRow, Segment } from "@/components/FilterChips";
import Pager from "@/components/Pager";
import type { JobStatus } from "@prisma/client";

const statusFilters = [
  { value: "", label: "All", mobile: "All" },
  { value: "ACTIVE", label: "Active", mobile: "Active" },
  { value: "REQUIRES_INVOICING", label: "Requires Invoicing", mobile: "To invoice" },
  { value: "ARCHIVED", label: "Closed", mobile: "Closed" },
];

const PAGE_SIZE = 100;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; unscheduled?: string; q?: string; page?: string }>;
}) {
  const actor = await requirePageActor();
  const companyId = actor.companyId;
  const scope = jobScope(actor);
  const showMoney = canSeePricing(actor.role);
  const canCreate = isManager(actor.role) || actor.role === "USER";

  const { status, unscheduled, q, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const validStatus = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"].includes(status ?? "")
    ? (status as JobStatus)
    : undefined;
  const query = q?.trim() || undefined;
  const search = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { address: { contains: query, mode: "insensitive" as const } },
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

  const listWhere = {
    companyId,
    ...scope,
    ...(validStatus ? { status: validStatus } : {}),
    ...(unscheduled ? { scheduledAt: null } : {}),
    ...search,
  };
  const [jobs, listCount, activeCount, requiresInvoicingCount, unscheduledCount] = await Promise.all([
    prisma.job.findMany({
      where: listWhere,
      include: { contact: true, lineItems: true },
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.job.count({ where: listWhere }),
    prisma.job.count({ where: { companyId, ...scope, status: "ACTIVE" } }),
    prisma.job.count({ where: { companyId, ...scope, status: "REQUIRES_INVOICING" } }),
    prisma.job.count({ where: { companyId, ...scope, status: "ACTIVE", scheduledAt: null } }),
  ]);

  const kpis = [
    { label: "Active", value: activeCount, href: "/app/jobs?status=ACTIVE", zero: activeCount === 0 },
    {
      label: "Requires invoicing",
      mobileLabel: "To invoice",
      value: requiresInvoicingCount,
      href: "/app/jobs?status=REQUIRES_INVOICING",
      zero: requiresInvoicingCount === 0,
    },
    {
      label: "Unscheduled",
      value: unscheduledCount,
      href: "/app/jobs?status=ACTIVE&unscheduled=1",
      zero: unscheduledCount === 0,
    },
  ];

  const pageTotal = jobs.reduce(
    (s, j) => s + j.lineItems.reduce((t, li) => t + Number(li.total), 0),
    0
  );

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle section="jobs" icon={Briefcase}>
          Jobs
        </PageTitle>
        {/* Phones create from the tab-bar FAB — a second button here just
            crowded the header */}
        <div className="hidden lg:flex items-center gap-2">
          <a
            href="/api/app/export/jobs"
            title="Download all jobs as CSV"
            className="flex items-center gap-1.5 px-3 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <Download size={14} />
            Export
          </a>
          {canCreate && (
            <Link
              href="/app/jobs/new"
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
            >
              <Plus size={15} />
              New Job
            </Link>
          )}
        </div>
      </div>

      <MobileSearch
        action="/app/jobs"
        placeholder="Search jobs, clients, addresses…"
        defaultValue={query}
        params={{ status: validStatus, unscheduled }}
      />

      <KpiStrip kpis={kpis} desktopCols={3} hue={SECTION_HUES.jobs} />

      {/* Filter tabs — phones get a segmented control (all options visible,
          nothing scrolled off-screen); desktop keeps the chip rail */}
      <SegmentedRow className="mb-4 lg:hidden">
        {statusFilters.map((f) => (
          <Segment
            key={f.value}
            active={(validStatus ?? "") === f.value && !unscheduled}
            href={f.value ? `/app/jobs?status=${f.value}` : "/app/jobs"}
          >
            {f.mobile}
          </Segment>
        ))}
      </SegmentedRow>
      <div className="hidden lg:block">
        <FilterRow>
          {statusFilters.map((f) => (
            <FilterChip
              key={f.value}
              hue={SECTION_HUES.jobs}
              active={(validStatus ?? "") === f.value && !unscheduled}
              href={f.value ? `/app/jobs?status=${f.value}` : "/app/jobs"}
            >
              {f.label}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      <div className="card-ledger overflow-hidden">
        {jobs.length === 0 ? (
          <EmptyState
            art="jobs"
            hue={SECTION_HUES.jobs}
            title={validStatus || unscheduled || query ? "No jobs match this filter" : "No jobs yet"}
            body={
              validStatus || unscheduled || query
                ? "Try a different search or status, or create a new job."
                : "Track work from first visit to final payment — create your first job to get going."
            }
            actionHref="/app/jobs/new"
            actionLabel="Create a Job"
          />
        ) : (
          <>
            <div className="list-settle divide-y divide-gray-100">
              <div className="hidden lg:grid grid-cols-[1fr_70px_150px_160px_100px_40px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                <span>Client</span>
                <span>#</span>
                <span>Schedule</span>
                <span>Status</span>
                <span className="text-right">Total</span>
                <span></span>
              </div>
              {jobs.map((j) => {
                const total = j.lineItems.reduce((s, li) => s + Number(li.total), 0);
                const when = j.scheduledAt
                  ? j.scheduledAnytime
                    ? `${shortDate(j.scheduledAt)} · Anytime`
                    : `${shortDate(j.scheduledAt)} · ${new Date(j.scheduledAt).toLocaleTimeString(
                        "en-US",
                        { hour: "numeric", minute: "2-digit" }
                      )}`
                  : "Unscheduled";
                return (
                  <Link
                    key={j.id}
                    href={`/app/jobs/${j.id}`}
                    className="block lg:grid lg:grid-cols-[1fr_70px_150px_160px_100px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    {/* Phone card: two lines only — glance and go. Address,
                        totals, and the rest live on the job page (David:
                        "users should just click on the jobs if they want to
                        learn more"). */}
                    <div className="lg:hidden flex min-w-0 items-center gap-3">
                      <Monogram name={`${j.contact.firstName} ${j.contact.lastName}`} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900">
                            {j.title}
                          </p>
                          <StatusChip kind="job" status={j.status} className="shrink-0" />
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-gray-500">
                          {j.contact.firstName} {j.contact.lastName} · {when}
                        </p>
                      </div>
                    </div>
                    <div className="hidden lg:block min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {j.contact.firstName} {j.contact.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{j.title}</p>
                    </div>
                    <span className="hidden lg:block text-sm text-gray-500">#{j.jobNumber}</span>
                    <span className="hidden lg:block text-sm text-gray-500">
                      {j.scheduledAt ? shortDate(j.scheduledAt) : "Unscheduled"}
                    </span>
                    <span className="hidden lg:block">
                      <StatusChip kind="job" status={j.status} />
                    </span>
                    <span className="numeral-ledger hidden lg:block text-sm font-semibold text-gray-900 lg:text-right">
                      {showMoney && total > 0 ? money(total) : "—"}
                    </span>
                    <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                  </Link>
                );
              })}
            </div>
            {/* Ledger foot */}
            <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[1fr_70px_150px_160px_100px_40px]">
              <span className="text-xs font-medium text-gray-500">
                {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
              </span>
              <span className="hidden lg:block" />
              <span className="hidden lg:block" />
              <span className="hidden lg:block" />
              <span className="numeral-ledger text-sm font-bold text-gray-900 lg:text-right">
                {showMoney && pageTotal > 0 ? money(pageTotal) : ""}
              </span>
              <span className="hidden lg:block" />
            </div>
          </>
        )}
      </div>
      <Pager
        basePath="/app/jobs"
        params={{ status: validStatus, unscheduled, q: query }}
        page={page}
        pageSize={PAGE_SIZE}
        total={listCount}
      />
    </div>
  );
}
