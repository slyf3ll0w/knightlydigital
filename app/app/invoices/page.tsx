import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Receipt, Plus, ChevronRight, AlertCircle } from "lucide-react";

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

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

  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      ...(status ? { status: status as never } : {}),
    },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });

  const tabs = [
    { label: "All", value: "" },
    { label: "Draft", value: "DRAFT" },
    { label: "Sent", value: "SENT" },
    { label: "Overdue", value: "OVERDUE" },
    { label: "Paid", value: "PAID" },
  ];

  const totalOutstanding = await prisma.invoice.aggregate({
    where: { companyId, status: { in: ["SENT", "OVERDUE"] } },
    _sum: { total: true },
  });

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500">
            ${(Number(totalOutstanding._sum.total) || 0).toFixed(2)} outstanding
          </p>
        </div>
        <Link
          href="/app/invoices/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Invoice
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={t.value ? `/app/invoices?status=${t.value}` : "/app/invoices"}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              (status ?? "") === t.value
                ? "border-green-500 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {invoices.length === 0 ? (
          <div className="py-16 text-center">
            <Receipt size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">No invoices{status ? ` with status ${status}` : " yet"}.</p>
            {!status && (
              <Link
                href="/app/invoices/new"
                className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
              >
                <Plus size={13} />
                Create your first invoice
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden lg:grid grid-cols-[80px_1fr_140px_100px_100px_40px] gap-4 px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
              <span>#</span>
              <span>Customer</span>
              <span>Due</span>
              <span>Total</span>
              <span>Status</span>
              <span></span>
            </div>
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/app/invoices/${inv.id}`}
                className="flex lg:grid lg:grid-cols-[80px_1fr_140px_100px_100px_40px] gap-4 items-center px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-500 font-medium">#{inv.invoiceNumber}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {inv.contact?.firstName} {inv.contact?.lastName}
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-1 text-sm text-gray-500">
                  {inv.status === "OVERDUE" && <AlertCircle size={12} className="text-red-500" />}
                  {inv.dueDate
                    ? new Date(inv.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "—"}
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  ${Number(inv.total).toFixed(2)}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[inv.status]}`}>
                  {inv.status}
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
