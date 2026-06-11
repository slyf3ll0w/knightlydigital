import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, DollarSign } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
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
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

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
      where: { companyId, ...(validStatus ? { status: validStatus } : {}) },
      include: { contact: true, payments: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.aggregate({
      where: { companyId, status: "PAST_DUE" },
      _count: true,
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { companyId, status: "AWAITING_PAYMENT" },
      _count: true,
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { companyId, status: "DRAFT" },
      _count: true,
      _sum: { total: true },
    }),
  ]);

  const kpis = [
    {
      label: "Past due",
      count: pastDue._count,
      value: money(Number(pastDue._sum.total) || 0),
      href: "/app/invoices?status=PAST_DUE",
    },
    {
      label: "Awaiting payment",
      count: awaiting._count,
      value: money(Number(awaiting._sum.total) || 0),
      href: "/app/invoices?status=AWAITING_PAYMENT",
    },
    {
      label: "Draft",
      count: draft._count,
      value: money(Number(draft._sum.total) || 0),
      href: "/app/invoices?status=DRAFT",
    },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/app/payments/new"
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <DollarSign size={14} />
            Collect Payment
          </Link>
          <Link
            href="/app/invoices/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            <Plus size={15} />
            New Invoice
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-xs font-medium text-gray-500 mb-1">
              {k.label} ({k.count})
            </p>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
          </Link>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/app/invoices?status=${f.value}` : "/app/invoices"}
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
        {invoices.length === 0 ? (
          <EmptyState
            art="invoices"
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
                  className="flex lg:grid lg:grid-cols-[1fr_70px_130px_150px_100px_100px_40px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName}` : "—"}
                    </p>
                    {inv.subject && <p className="text-xs text-gray-500 truncate">{inv.subject}</p>}
                  </div>
                  <span className="text-sm text-gray-500">#{inv.invoiceNumber}</span>
                  <span className="hidden lg:block text-sm text-gray-500">
                    {shortDate(inv.dueDate)}
                  </span>
                  <StatusChip kind="invoice" status={inv.status} />
                  <span className="text-sm text-gray-700 lg:text-right">{money(inv.total)}</span>
                  <span className="text-sm font-semibold text-gray-900 lg:text-right">
                    {money(balance)}
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
