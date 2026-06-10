import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Inbox, Plus, ChevronRight } from "lucide-react";
import { requestStatusColor, requestStatusLabel, shortDate } from "@/lib/statuses";
import type { RequestStatus } from "@prisma/client";

const statusFilters: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "NEW", label: "New" },
  { value: "CONVERTED", label: "Converted" },
  { value: "ARCHIVED", label: "Archived" },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");
  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { status } = await searchParams;
  const validStatus = ["NEW", "CONVERTED", "ARCHIVED"].includes(status ?? "")
    ? (status as RequestStatus)
    : undefined;

  const [requests, newCount] = await Promise.all([
    prisma.request.findMany({
      where: { companyId, ...(validStatus ? { status: validStatus } : {}) },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.request.count({ where: { companyId, status: "NEW" } }),
  ]);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Requests</h1>
        <Link
          href="/app/requests/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Request
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Link
          href="/app/requests?status=NEW"
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
        >
          <p className="text-xs font-medium text-gray-500 mb-1">New requests</p>
          <p className="text-2xl font-bold text-gray-900">{newCount}</p>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/app/requests?status=${f.value}` : "/app/requests"}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              (validStatus ?? "") === f.value
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {requests.length === 0 ? (
          <div className="py-16 text-center">
            <Inbox size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">No requests{validStatus ? " with this status" : " yet"}.</p>
            <Link
              href="/app/requests/new"
              className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
            >
              <Plus size={13} />
              Create a request
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden lg:grid grid-cols-[1fr_1fr_140px_130px_40px] gap-4 px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
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
                className="flex lg:grid lg:grid-cols-[1fr_1fr_140px_130px_40px] gap-4 items-center px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-medium text-gray-900">
                  {r.contact.firstName} {r.contact.lastName}
                </span>
                <span className="text-sm text-gray-600 truncate">{r.title}</span>
                <span className="hidden lg:block text-sm text-gray-500">{shortDate(r.createdAt)}</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded w-fit ${requestStatusColor[r.status]}`}
                >
                  {requestStatusLabel[r.status]}
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
