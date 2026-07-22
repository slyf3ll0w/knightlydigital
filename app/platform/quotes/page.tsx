import { prisma } from "@/lib/db";
import { requirePageActor, canSell, viaContactScope } from "@/lib/permissions";
import Link from "next/link";
import { Plus, ChevronRight, FileText } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { FilterRow, FilterChip } from "@/components/FilterChips";
import { SECTION_HUES } from "@/lib/section-colors";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import KpiStrip from "@/components/KpiStrip";
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

  const approved30Total = Number(approved30._sum.total) || 0;
  const kpis = [
    { label: "Draft", value: draftCount, href: "/app/quotes?status=DRAFT", zero: draftCount === 0 },
    {
      label: "Awaiting response",
      mobileLabel: "Awaiting",
      value: awaitingCount,
      href: "/app/quotes?status=AWAITING_RESPONSE",
      zero: awaitingCount === 0,
    },
    {
      label: "Approved",
      value: approvedCount,
      href: "/app/quotes?status=APPROVED",
      zero: approvedCount === 0,
    },
    {
      label: "Approved (30 days)",
      mobileLabel: "Won 30 days",
      value: money(approved30Total),
      sub: conversionRate !== null ? `${conversionRate}% conversion` : undefined,
      href: "/app/quotes?status=APPROVED",
      zero: approved30Total === 0,
    },
  ];

  const pageTotal = quotes.reduce((s, q) => s + Number(q.total), 0);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle section="quotes" icon={FileText}>
          Quotes
        </PageTitle>
        {/* Phones create from the tab-bar FAB */}
        <Link
          href="/app/quotes/new"
          className="hidden lg:flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
        >
          <Plus size={15} />
          New Quote
        </Link>
      </div>

      <KpiStrip kpis={kpis} desktopCols={4} hue={SECTION_HUES.quotes} />

      {/* Filter tabs */}
      <FilterRow>
        {statusFilters.map((f) => (
          <FilterChip
            key={f.value}
            hue={SECTION_HUES.quotes}
            active={(validStatus ?? "") === f.value}
            href={f.value ? `/app/quotes?status=${f.value}` : "/app/quotes"}
          >
            {f.label}
          </FilterChip>
        ))}
      </FilterRow>

      <div className="card-ledger overflow-hidden">
        {quotes.length === 0 ? (
          <EmptyState
            art="quotes"
            hue={SECTION_HUES.quotes}
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
          <>
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
                  className="block lg:grid lg:grid-cols-[1fr_70px_140px_150px_100px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {/* Phone row: name + total, then #/title + status */}
                  <div className="lg:hidden min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                        {q.contact.firstName} {q.contact.lastName}
                      </p>
                      <p className="numeral-ledger shrink-0 text-sm font-semibold text-gray-900">
                        {money(q.total)}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-xs text-gray-500">
                        #{q.quoteNumber}
                        {q.title ? ` · ${q.title}` : ""}
                      </p>
                      <StatusChip kind="quote" status={q.status} className="shrink-0" />
                    </div>
                  </div>
                  <div className="hidden lg:block min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {q.contact.firstName} {q.contact.lastName}
                    </p>
                    {q.title && <p className="text-xs text-gray-500 truncate">{q.title}</p>}
                  </div>
                  <span className="hidden lg:block text-sm text-gray-500">#{q.quoteNumber}</span>
                  <span className="hidden lg:block text-sm text-gray-500">{shortDate(q.createdAt)}</span>
                  <span className="hidden lg:block">
                    <StatusChip kind="quote" status={q.status} />
                  </span>
                  <span className="numeral-ledger hidden lg:block text-sm font-semibold text-gray-900 lg:text-right">
                    {money(q.total)}
                  </span>
                  <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                </Link>
              ))}
            </div>
            {/* Ledger foot — total quoted value */}
            <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[1fr_70px_140px_150px_100px_40px]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}
              </span>
              <span className="hidden lg:block" />
              <span className="hidden lg:block" />
              <span className="hidden lg:block" />
              <span className="numeral-ledger text-sm font-bold text-gray-900 lg:text-right">
                {money(pageTotal)}
              </span>
              <span className="hidden lg:block" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
