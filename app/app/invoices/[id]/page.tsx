import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, Copy, Send, CreditCard, Check } from "lucide-react";
import InvoiceActions from "./InvoiceActions";

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { id } = await params;

  const [invoice, company] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        contact: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { paidAt: "desc" } },
        job: true,
      },
    }),
    prisma.company.findUnique({ where: { id: companyId } }),
  ]);

  if (!invoice) notFound();

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const publicUrl = `${baseUrl}/pay/${invoice.publicToken}`;

  const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Link href="/app/invoices" className="text-gray-400 hover:text-gray-600 mt-1">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Invoice #{invoice.invoiceNumber}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[invoice.status]}`}>
              {invoice.status}
            </span>
          </div>
          {invoice.contact && (
            <Link href={`/app/contacts/${invoice.contact.id}`} className="text-sm text-gray-500 hover:text-green-600">
              {invoice.contact.firstName} {invoice.contact.lastName}
            </Link>
          )}
        </div>
        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          publicUrl={publicUrl}
        />
      </div>

      {/* Pay link banner */}
      {invoice.status !== "DRAFT" && invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg mb-6">
          <p className="text-sm text-blue-800 flex-1">
            Customer pay link ready to share
          </p>
          <span className="font-mono text-xs text-blue-600 truncate max-w-48">{publicUrl}</span>
          <button
            onClick={async () => { await navigator.clipboard.writeText(publicUrl); }}
            className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline shrink-0"
          >
            <Copy size={12} />
            Copy
          </button>
        </div>
      )}

      {/* Invoice document */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {/* Invoice header */}
        <div className="px-6 py-6 border-b border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">INVOICE</h2>
              <p className="text-gray-500 text-sm mt-1">#{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg text-gray-900">{company?.name}</p>
              {company?.phone && <p className="text-sm text-gray-500">{company.phone}</p>}
              {company?.email && <p className="text-sm text-gray-500">{company.email}</p>}
              {company?.address && <p className="text-sm text-gray-500">{company.address}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-6">
            <div>
              <p className="text-xs uppercase font-semibold text-gray-400 mb-1">Bill To</p>
              {invoice.contact && (
                <>
                  <p className="text-sm font-semibold text-gray-800">
                    {invoice.contact.firstName} {invoice.contact.lastName}
                  </p>
                  {invoice.contact.phone && <p className="text-sm text-gray-500">{invoice.contact.phone}</p>}
                  {invoice.contact.email && <p className="text-sm text-gray-500">{invoice.contact.email}</p>}
                  {invoice.contact.address && (
                    <p className="text-sm text-gray-500">
                      {[invoice.contact.address, invoice.contact.city, invoice.contact.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="text-right">
              <div className="space-y-1">
                <div>
                  <span className="text-xs uppercase font-semibold text-gray-400">Date</span>
                  <p className="text-sm text-gray-700">
                    {new Date(invoice.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                {invoice.dueDate && (
                  <div>
                    <span className="text-xs uppercase font-semibold text-gray-400">Due</span>
                    <p className="text-sm text-gray-700">
                      {new Date(invoice.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs uppercase text-gray-500 font-semibold">Description</th>
                <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-16">Qty</th>
                <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-24">Unit</th>
                <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 text-gray-800">{item.description}</td>
                  <td className="py-3 text-right text-gray-600">{Number(item.quantity)}</td>
                  <td className="py-3 text-right text-gray-600">${Number(item.unitPrice).toFixed(2)}</td>
                  <td className="py-3 text-right font-medium text-gray-900">${Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="ml-auto w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-800">${Number(invoice.subtotal).toFixed(2)}</span>
            </div>
            {invoice.tax && Number(invoice.tax) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Tax ({(Number(invoice.taxRate) * 100).toFixed(1)}%)
                </span>
                <span className="text-gray-800">${Number(invoice.tax).toFixed(2)}</span>
              </div>
            )}
            {invoice.surcharge && Number(invoice.surcharge) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Card surcharge</span>
                <span className="text-gray-800">${Number(invoice.surcharge).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t border-gray-200 pt-1.5">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">${Number(invoice.total).toFixed(2)}</span>
            </div>
            {invoice.status === "PAID" && (
              <div className="flex items-center justify-between text-green-700 font-medium">
                <span className="flex items-center gap-1">
                  <Check size={13} />
                  Paid
                </span>
                <span>${totalPaid.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* Payment history */}
      {invoice.payments.length > 0 && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Payment History
          </h3>
          <div className="space-y-2">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CreditCard size={13} className="text-gray-400" />
                  <span className="text-gray-700">{p.method}</span>
                  <span className="text-gray-400 text-xs">
                    {new Date(p.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <span className="font-semibold text-gray-900">${Number(p.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
