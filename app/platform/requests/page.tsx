import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck } from "lucide-react";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import { requirePageActor, canSell, viaContactScope, seesAllLeads } from "@/lib/permissions";
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
  searchParams: Promise<{ status?: string; assignee?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { status, assignee } = await searchParams;
  const validStatus = ["NEW", "CONVERTED", "ARCHIVED"].includes(status ?? "")
    ? (status as RequestStatus)
    : undefined;

  const showAll = seesAllLeads(actor.role);
  const mineOnly = showAll && assignee === "me";
  const scope = {
    ...viaContactScope(actor),
    ...(mineOnly ? { contact: { assignedToId: actor.id } } : {}),
  };

  const [requests, newCount] = await Promise.all([
    prisma.request.findMany({
      where: { companyId, ...scope, ...(validStatus ? { status: validStatus } : {}) },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.request.count({ where: { companyId, ...scope, status: "NEW" } }),
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Requests</h1>
        <Link
          href="/app/requests/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Request
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Link
          href="/app/requests?status=NEW"
          className="card-ledger p-4 hover:shadow-sm transition-shadow"
        >
          <p className="text-xs font-medium text-gray-500 mb-1">New requests</p>
          <p className="text-2xl font-bold text-gray-900">{newCount}</p>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-1 mb-4">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={qs({ status: f.value })}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              (validStatus ?? "") === f.value
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </Link>
        ))}
        {showAll && (
          <>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            <Link
              href={qs({ mine: !mineOnly })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                mineOnly ? "bg-green-500 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <UserCheck size={13} />
              My leads
            </Link>
          </>
        )}
      </div>

      <div className="card-ledger overflow-hidden">
        {requests.length === 0 ? (
          <EmptyState
            art="requests"
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
            <div className="hidden lg:grid grid-cols-[1fr_1fr_140px_130px_40px] gap-4 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
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
                className="flex lg:grid lg:grid-cols-[1fr_1fr_140px_130px_40px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <span className="text-sm font-medium text-gray-900">
                  {r.contact.firstName} {r.contact.lastName}
                </span>
                <span className="text-sm text-gray-600 truncate">{r.title}</span>
                <span className="hidden lg:block text-sm text-gray-500">{shortDate(r.createdAt)}</span>
                <StatusChip kind="request" status={r.status} />
                <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
