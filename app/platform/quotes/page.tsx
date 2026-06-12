import { prisma } from "@/lib/db";
import { requirePageActor, canSell, viaContactScope } from "@/lib/permissions";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import type { QuoteStatus } from "@prisma/client";

const statusFilters = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "AWAITING_RESPONSE", label: "Awaiting Response" },
  { value: "APPROVED", label: "Approved" },
  { value: "CHANGES_REQUESTED", label: "Changes Requested" },
  { value: "CONVERTED", label: "Converted" },
  { value: "ARCHIVED", label: "Archived" },
];

const validValues = statusFilters.map((f) => f.value).filter(Boolean);

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;
  const scope = viaContactScope(actor);

  const { status } = await searchParams;
  const validStatus = validValues.includes(status ?? "") ? (status as QuoteStatus) : undefined;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [quotes, draftCount, awaitingCount, approvedCount, sent30, approved30] = await Promise.all([
    prisma.quote.findMany({
      where: { companyId, ...scope, ...(validStatus ? { status: validStatus } : {}) },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.quote.count({ where: { companyId, ...scope, status: "DRAFT" } }),
    prisma.quote.count({ where: { companyId, ...scope, status: "AWAITING_RESPONSE" } }),
    prisma.quote.count({ where: { companyId, ...scope, status: "APPROVED" } }),
    prisma.quote.count({ where: { companyId, ...scope, sentAt: { gte: thirtyDaysAgo } } }),
    prisma.quote.aggregate({
      where: {
        companyId,
        ...scope,
        approvedAt: { gte: thirtyDaysAgo },
      },
      _count: true,
      _sum: { total: true },
    }),
  ]);

  const conversionRate = sent30 > 0 ? Math.round((approved30._count / sent30) * 100) : null;

  const kpis = [
    { label: "Draft", value: draftCount, href: "/app/quotes?status=DRAFT" },
    { label: "Awaiting response", value: awaitingCount, href: "/app/quotes?status=AWAITING_RESPONSE" },
    { label: "Approved", value: approvedCount, href: "/app/quotes?status=APPROVED" },
    {
      label: "Approved (30 days)",
      value: money(Number(approved30._sum.total) || 0),
      sub: conversionRate !== null ? `${conversionRate}% conversion` : undefined,
      href: "/app/quotes?status=APPROVED",
    },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
        <Link
          href="/app/quotes/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Quote
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="card-ledger p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-xs font-medium text-gray-500 mb-1">{k.label}</p>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            {k.sub && <p className="text-xs text-gray-500 mt-0.5">{k.sub}</p>}
          </Link>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/app/quotes?status=${f.value}` : "/app/quotes"}
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

      <div className="card-ledger overflow-hidden">
        {quotes.length === 0 ? (
          <EmptyState
            art="quotes"
            title={validStatus ? "No quotes with this status" : "No quotes yet"}
            body={
              validStatus
                ? "Try a different status, or create a new quote."
                : "Win the work before it starts — send your first quote and clients can approve it online."
            }
            actionHref="/app/quotes/new"
            actionLabel="Create a Quote"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden lg:grid grid-cols-[1fr_70px_140px_150px_100px_40px] gap-4 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
              <span>Client</span>
              <span>#</span>
              <span>Created</span>
              <span>Status</span>
              <span className="text-right">Total</span>
              <span></span>
            </div>
            {quotes.map((q) => (
              <Link
                key={q.id}
                href={`/app/quotes/${q.id}`}
                className="flex lg:grid lg:grid-cols-[1fr_70px_140px_150px_100px_40px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {q.contact.firstName} {q.contact.lastName}
                  </p>
                  {q.title && <p className="text-xs text-gray-500 truncate">{q.title}</p>}
                </div>
                <span className="text-sm text-gray-500">#{q.quoteNumber}</span>
                <span className="hidden lg:block text-sm text-gray-500">{shortDate(q.createdAt)}</span>
                <StatusChip kind="quote" status={q.status} />
                <span className="text-sm font-semibold text-gray-900 lg:text-right">
                  {money(q.total)}
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
