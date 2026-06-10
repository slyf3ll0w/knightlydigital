import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Briefcase, Plus, ChevronRight } from "lucide-react";
import { jobStatusColor, jobStatusLabel, money, shortDate } from "@/lib/statuses";
import type { JobStatus } from "@prisma/client";

const statusFilters = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "REQUIRES_INVOICING", label: "Requires Invoicing" },
  { value: "ARCHIVED", label: "Archived" },
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; unscheduled?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { status, unscheduled } = await searchParams;
  const validStatus = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"].includes(status ?? "")
    ? (status as JobStatus)
    : undefined;

  const [jobs, activeCount, requiresInvoicingCount, unscheduledCount] = await Promise.all([
    prisma.job.findMany({
      where: {
        companyId,
        ...(validStatus ? { status: validStatus } : {}),
        ...(unscheduled ? { scheduledAt: null } : {}),
      },
      include: { contact: true, lineItems: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.job.count({ where: { companyId, status: "ACTIVE" } }),
    prisma.job.count({ where: { companyId, status: "REQUIRES_INVOICING" } }),
    prisma.job.count({ where: { companyId, status: "ACTIVE", scheduledAt: null } }),
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

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <Link
          href="/app/jobs/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Job
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-xs font-medium text-gray-500 mb-1">{k.label}</p>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
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

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {jobs.length === 0 ? (
          <div className="py-16 text-center">
            <Briefcase size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">
              No jobs{validStatus || unscheduled ? " match this filter" : " yet"}.
            </p>
            <Link
              href="/app/jobs/new"
              className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
            >
              <Plus size={13} />
              Create a job
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden lg:grid grid-cols-[1fr_70px_150px_160px_100px_40px] gap-4 px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
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
                  className="flex lg:grid lg:grid-cols-[1fr_70px_150px_160px_100px_40px] gap-4 items-center px-5 py-3.5 hover:bg-gray-50 transition-colors"
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
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded w-fit ${jobStatusColor[j.status]}`}
                  >
                    {jobStatusLabel[j.status]}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 lg:text-right">
                    {total > 0 ? money(total) : "—"}
                  </span>
                  <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
