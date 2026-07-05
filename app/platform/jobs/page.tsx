import { prisma } from "@/lib/db";
import { requirePageActor, jobScope, canSeePricing, isManager } from "@/lib/permissions";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
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
    { label: "Active", value: activeCount, href: "/app/jobs?status=ACTIVE" },
    {
      label: "Requires invoicing",
      value: requiresInvoicingCount,
      href: "/app/jobs?status=REQUIRES_INVOICING",
    },
    { label: "Unscheduled", value: unscheduledCount, href: "/app/jobs?status=ACTIVE&unscheduled=1" },
  ];

  const pageTotal = jobs.reduce(
    (s, j) => s + j.lineItems.reduce((t, li) => t + Number(li.total), 0),
    0
  );

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Jobs</h1>
        {canCreate && (
          <Link
            href="/app/jobs/new"
            className="flex items-center gap-1.5 px-4 py-2 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            <Plus size={15} />
            New Job
          </Link>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="card-ledger p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-xs font-medium text-gray-500 mb-1">{k.label}</p>
            <p className="numeral-ledger text-2xl font-semibold text-gray-900">{k.value}</p>
          </Link>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/app/jobs?status=${f.value}` : "/app/jobs"}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              (validStatus ?? "") === f.value && !unscheduled
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card-ledger overflow-hidden">
        {jobs.length === 0 ? (
          <EmptyState
            art="jobs"
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
                    className="flex lg:grid lg:grid-cols-[1fr_70px_150px_160px_100px_40px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {j.contact.firstName} {j.contact.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{j.title}</p>
                    </div>
                    <span className="text-sm text-gray-500">#{j.jobNumber}</span>
                    <span className="hidden lg:block text-sm text-gray-500">
                      {j.scheduledAt ? shortDate(j.scheduledAt) : "Unscheduled"}
                    </span>
                    <StatusChip kind="job" status={j.status} />
                    <span className="numeral-ledger text-sm font-semibold text-gray-900 lg:text-right">
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
