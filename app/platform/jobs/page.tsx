import { prisma } from "@/lib/db";
import { requirePageActor, jobScope, canSeePricing, isManager } from "@/lib/permissions";
import Link from "next/link";
import { Plus, ChevronRight, Briefcase } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES } from "@/lib/section-colors";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import KpiStrip from "@/components/KpiStrip";
import { FilterRow, FilterChip } from "@/components/FilterChips";
import type { JobStatus } from "@prisma/client";

const statusFilters = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "REQUIRES_INVOICING", label: "Requires Invoicing" },
  { value: "ARCHIVED", label: "Closed" },
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; unscheduled?: string }>;
}) {
  const actor = await requirePageActor();
  const companyId = actor.companyId;
  const scope = jobScope(actor);
  const showMoney = canSeePricing(actor.role);
  const canCreate = isManager(actor.role) || actor.role === "USER";

  const { status, unscheduled } = await searchParams;
  const validStatus = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"].includes(status ?? "")
    ? (status as JobStatus)
    : undefined;

  const [jobs, activeCount, requiresInvoicingCount, unscheduledCount] = await Promise.all([
    prisma.job.findMany({
      where: {
        companyId,
        ...scope,
        ...(validStatus ? { status: validStatus } : {}),
        ...(unscheduled ? { scheduledAt: null } : {}),
      },
      include: { contact: true, lineItems: true },
      orderBy: { updatedAt: "desc" },
    }),
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
        {canCreate && (
          <Link
            href="/app/jobs/new"
            className="hidden lg:flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <Plus size={15} />
            New Job
          </Link>
        )}
      </div>

      <KpiStrip kpis={kpis} desktopCols={3} hue={SECTION_HUES.jobs} />

      {/* Filter tabs */}
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

      <div
        className="card-ledger overflow-hidden"
        style={{ borderTop: `3px solid ${SECTION_HUES.jobs}` }}
      >
        {jobs.length === 0 ? (
          <EmptyState
            art="jobs"
            hue={SECTION_HUES.jobs}
            title={validStatus || unscheduled ? "No jobs match this filter" : "No jobs yet"}
            body={
              validStatus || unscheduled
                ? "Try a different status, or create a new job."
                : "Track work from first visit to final payment — create your first job to get going."
            }
            actionHref="/app/jobs/new"
            actionLabel="Create a Job"
          />
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              <div className="hidden lg:grid grid-cols-[1fr_70px_150px_160px_100px_40px] gap-4 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                <span>Client</span>
                <span>#</span>
                <span>Schedule</span>
                <span>Status</span>
                <span className="text-right">Total</span>
                <span></span>
              </div>
              {jobs.map((j) => {
                const total = j.lineItems.reduce((s, li) => s + Number(li.total), 0);
                return (
                  <Link
                    key={j.id}
                    href={`/app/jobs/${j.id}`}
                    className="block lg:grid lg:grid-cols-[1fr_70px_150px_160px_100px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    {/* Phone row: two stacked lines — name + money, then
                        schedule/title + status. The desktop columns crammed
                        side-by-side here never aligned. */}
                    <div className="lg:hidden min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                          {j.contact.firstName} {j.contact.lastName}
                        </p>
                        {showMoney && total > 0 && (
                          <p className="numeral-ledger shrink-0 text-sm font-semibold text-gray-900">
                            {money(total)}
                          </p>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-xs text-gray-500">
                          {j.scheduledAt ? `${shortDate(j.scheduledAt)} · ` : ""}
                          {j.title}
                        </p>
                        <StatusChip kind="job" status={j.status} className="shrink-0" />
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
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
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
    </div>
  );
}
