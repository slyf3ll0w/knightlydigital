import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, viaContactScope, isManager } from "@/lib/permissions";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { paymentMethodLabel, money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import InvoiceActions from "./InvoiceActions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;

  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: {
      contact: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
      job: true,
    },
  });

  if (!invoice) notFound();

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const publicUrl = `${baseUrl}/pay/${invoice.publicToken}`;
  const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, Number(invoice.total) - totalPaid);

  // Jobber-style nudge: invoice paid but the linked job is still open
  const showCloseJobNudge =
    invoice.status === "PAID" && invoice.job && invoice.job.status !== "ARCHIVED";

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/app/invoices" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <StatusChip kind="invoice" status={invoice.status} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {invoice.subject || `Invoice #${invoice.invoiceNumber}`}
          </h1>
          {invoice.contact && (
            <Link
              href={`/app/contacts/${invoice.contact.id}`}
              className="text-sm text-green-700 hover:underline"
            >
              {invoice.contact.firstName} {invoice.contact.lastName}
            </Link>
          )}
        </div>
        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          publicUrl={publicUrl}
          canDelete={isManager(actor.role)}
          paymentCount={invoice.payments.length}
          paymentTotal={totalPaid}
        />
      </div>

      {/* Close-job nudge */}
      {showCloseJobNudge && (
        <Link
          href={`/app/jobs/${invoice.job!.id}`}
          className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-lg mb-6 hover:bg-green-100 transition-colors"
        >
          <p className="text-sm font-medium text-green-800">
            You may want to close this job: Job #{invoice.job!.jobNumber} — {invoice.job!.title}
          </p>
          <ArrowRight size={14} className="text-green-700" />
        </Link>
      )}

      {/* Header facts */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 card-ledger mb-6 text-sm">
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Invoice #</span>
          <span className="text-gray-800">{invoice.invoiceNumber}</span>
        </div>
        {invoice.job && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">Invoice for</span>
            <Link href={`/app/jobs/${invoice.job.id}`} className="text-green-700 hover:underline">
              Job #{invoice.job.jobNumber}
            </Link>
          </div>
        )}
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Issued</span>
          <span className="text-gray-800">{shortDate(invoice.issuedAt ?? invoice.createdAt)}</span>
        </div>
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Due date</span>
          <span className="text-gray-800">{shortDate(invoice.dueDate)}</span>
        </div>
        {invoice.paidAt && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">Paid</span>
            <span className="text-gray-800">{shortDate(invoice.paidAt)}</span>
          </div>
        )}
      </div>

      {/* Invoice body */}
      <div className="card-ledger overflow-hidden mb-6">
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs uppercase text-gray-500 font-semibold">
                  Line item
                </th>
                <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-16">
                  Qty
                </th>
                <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-24">
                  Unit Price
                </th>
                <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-24">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="py-3">
                    <p className="text-gray-900 font-medium">{item.name || item.description}</p>
                    {item.name && item.description && (
                      <p className="text-gray-500 text-xs mt-0.5">{item.description}</p>
                    )}
                    {item.serviceDate && (
                      <p className="text-gray-400 text-xs mt-0.5">
                        Service date: {shortDate(item.serviceDate)}
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-right text-gray-600">{Number(item.quantity)}</td>
                  <td className="py-3 text-right text-gray-600">{money(item.unitPrice)}</td>
                  <td className="py-3 text-right font-medium text-gray-900">{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="ml-auto w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-800">{money(invoice.subtotal)}</span>
            </div>
            {invoice.discount && Number(invoice.discount) > 0 && (
              <div className="flex justify-between text-green-700">
                <span>
                  Discount
                  {invoice.discountType === "PERCENT" && invoice.discountValue
                    ? ` (${Number(invoice.discountValue)}%)`
                    : ""}
                </span>
                <span>-{money(invoice.discount)}</span>
              </div>
            )}
            {invoice.tax && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Tax ({(Number(invoice.taxRate) * 100).toFixed(1)}%)
                </span>
                <span className="text-gray-800">{money(invoice.tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1.5 border-t border-gray-200">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">{money(invoice.total)}</span>
            </div>
            {totalPaid > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Payments</span>
                <span>-{money(totalPaid)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span className="text-gray-900">Invoice balance</span>
              <span className={balance > 0 ? "text-gray-900" : "text-green-700"}>
                {money(balance)}
              </span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="card-ledger overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Payments</h2>
          {balance > 0 && (
            <Link
              href={`/app/payments/new?invoiceId=${invoice.id}`}
              className="text-xs text-green-600 hover:underline font-medium"
            >
              + Collect Payment
            </Link>
          )}
        </div>
        {invoice.payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No payments recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{paymentMethodLabel[p.method]}</p>
                  <p className="text-xs text-gray-500">
                    {shortDate(p.paidAt)}
                    {p.referenceNumber && ` · Ref: ${p.referenceNumber}`}
                    {p.details && ` · ${p.details}`}
                  </p>
                </div>
                <span className="font-semibold text-gray-900">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
