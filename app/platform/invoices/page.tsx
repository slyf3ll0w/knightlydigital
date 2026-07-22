import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import Link from "next/link";
import { Plus, ChevronRight, DollarSign, Receipt } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { FilterRow, FilterChip } from "@/components/FilterChips";
import { SECTION_HUES } from "@/lib/section-colors";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import KpiStrip from "@/components/KpiStrip";
import type { InvoiceStatus } from "@prisma/client";

const statusFilters = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "AWAITING_PAYMENT", label: "Awaiting Payment" },
  { value: "PAST_DUE", label: "Past Due" },
  { value: "PAID", label: "Paid" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;
  const scope = viaContactScope(actor);

  const { status } = await searchParams;
  const validStatus = ["DRAFT", "AWAITING_PAYMENT", "PAST_DUE", "PAID"].includes(status ?? "")
    ? (status as InvoiceStatus)
    : undefined;

  // Surface past-due invoices automatically (awaiting payment + due date passed)
  await prisma.invoice.updateMany({
    where: { companyId, status: "AWAITING_PAYMENT", dueDate: { lt: new Date() } },
    data: { status: "PAST_DUE" },
  });

  const [invoices, pastDue, awaiting, draft] = await Promise.all([
    prisma.invoice.findMany({
      where: { companyId, ...scope, ...(validStatus ? { status: validStatus } : {}) },
      include: { contact: true, payments: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.aggregate({
      where: { companyId, ...scope, status: "PAST_DUE" },
      _count: true,
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { companyId, ...scope, status: "AWAITING_PAYMENT" },
      _count: true,
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { companyId, ...scope, status: "DRAFT" },
      _count: true,
      _sum: { total: true },
    }),
  ]);

  const kpis = [
    {
      label: `Past due (${pastDue._count})`,
      mobileLabel: "Past due",
      value: money(Number(pastDue._sum.total) || 0),
      href: "/app/invoices?status=PAST_DUE",
      zero: pastDue._count === 0,
      tone: pastDue._count > 0 ? ("danger" as const) : undefined,
    },
    {
      label: `Awaiting payment (${awaiting._count})`,
      mobileLabel: "Awaiting",
      value: money(Number(awaiting._sum.total) || 0),
      href: "/app/invoices?status=AWAITING_PAYMENT",
      zero: awaiting._count === 0,
    },
    {
      label: `Draft (${draft._count})`,
      mobileLabel: "Draft",
      value: money(Number(draft._sum.total) || 0),
      href: "/app/invoices?status=DRAFT",
      zero: draft._count === 0,
    },
  ];

  // Ledger foot: totals for the rows currently shown
  const pageTotal = invoices.reduce((s, i) => s + Number(i.total), 0);
  const pageBalance = invoices.reduce(
    (s, i) =>
      s + Math.max(0, Number(i.total) - i.payments.reduce((p, x) => p + Number(x.amount), 0)),
    0
  );

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle section="invoices" icon={Receipt}>
          Invoices
        </PageTitle>
        {/* Phones create from the tab-bar FAB (Invoice + Payment both live there) */}
        <div className="hidden lg:flex items-center gap-2">
          <Link
            href="/app/payments/new"
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <DollarSign size={14} />
            Collect Payment
          </Link>
          <Link
            href="/app/invoices/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <Plus size={15} />
            New Invoice
          </Link>
        </div>
      </div>

      <KpiStrip kpis={kpis} desktopCols={3} hue={SECTION_HUES.invoices} />

      {/* Filter tabs */}
      <FilterRow>
        {statusFilters.map((f) => (
          <FilterChip
            key={f.value}
            hue={SECTION_HUES.invoices}
            active={(validStatus ?? "") === f.value}
            href={f.value ? `/app/invoices?status=${f.value}` : "/app/invoices"}
          >
            {f.label}
          </FilterChip>
        ))}
      </FilterRow>

      <div
        className="card-ledger overflow-hidden"
        style={{ borderTop: `3px solid ${SECTION_HUES.invoices}` }}
      >
        {invoices.length === 0 ? (
          <EmptyState
            art="invoices"
            hue={SECTION_HUES.invoices}
            title={validStatus ? "No invoices with this status" : "No invoices yet"}
            body={
              validStatus
                ? "Try a different status, or create a new invoice."
                : "Get paid for finished work — send your first invoice with a pay-online link."
            }
            actionHref="/app/invoices/new"
            actionLabel="Create an Invoice"
          />
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              <div className="hidden lg:grid grid-cols-[1fr_70px_130px_150px_100px_100px_40px] gap-4 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                <span>Client</span>
                <span>#</span>
                <span>Due date</span>
                <span>Status</span>
                <span className="text-right">Total</span>
                <span className="text-right">Balance</span>
                <span></span>
              </div>
              {invoices.map((inv) => {
                const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
                const balance = Math.max(0, Number(inv.total) - paid);
                return (
                  <Link
                    key={inv.id}
                    href={`/app/invoices/${inv.id}`}
                    className="block lg:grid lg:grid-cols-[1fr_70px_130px_150px_100px_100px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    {/* Phone row: name + the amount that matters (balance while
                        anything is owed, else the total), then #/due + status.
                        Two unlabeled amounts side by side read as a typo. */}
                    <div className="lg:hidden min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                          {inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName}` : "—"}
                        </p>
                        <p className="numeral-ledger shrink-0 text-sm font-semibold text-gray-900">
                          {money(balance > 0 ? balance : inv.total)}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-xs text-gray-500">
                          #{inv.invoiceNumber}
                          {balance > 0 ? ` · Due ${shortDate(inv.dueDate)}` : ""}
                          {inv.subject ? ` · ${inv.subject}` : ""}
                        </p>
                        <StatusChip kind="invoice" status={inv.status} className="shrink-0" />
                      </div>
                    </div>
                    <div className="hidden lg:block min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName}` : "—"}
                      </p>
                      {inv.subject && <p className="text-xs text-gray-500 truncate">{inv.subject}</p>}
                    </div>
                    <span className="hidden lg:block text-sm text-gray-500">#{inv.invoiceNumber}</span>
                    <span className="hidden lg:block text-sm text-gray-500">
                      {shortDate(inv.dueDate)}
                    </span>
                    <span className="hidden lg:block">
                      <StatusChip kind="invoice" status={inv.status} />
                    </span>
                    <span className="numeral-ledger hidden lg:block text-sm text-gray-600 lg:text-right">
                      {money(inv.total)}
                    </span>
                    <span className="numeral-ledger hidden lg:block text-sm font-semibold text-gray-900 lg:text-right">
                      {money(balance)}
                    </span>
                    <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                  </Link>
                );
              })}
            </div>
            {/* Ledger foot — running totals, double-ruled like a register */}
            <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[1fr_70px_130px_150px_100px_100px_40px]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
              </span>
              <span className="hidden lg:block" />
              <span className="hidden lg:block" />
              <span className="hidden lg:block" />
              <span className="numeral-ledger hidden text-sm font-semibold text-gray-600 lg:block lg:text-right">
                {money(pageTotal)}
              </span>
              <span className="numeral-ledger lg:hidden text-sm font-bold text-gray-900">
                {money(pageBalance > 0 ? pageBalance : pageTotal)}
              </span>
              <span className="numeral-ledger hidden lg:block text-sm font-bold text-gray-900 lg:text-right">
                {money(pageBalance)}
              </span>
              <span className="hidden lg:block" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
