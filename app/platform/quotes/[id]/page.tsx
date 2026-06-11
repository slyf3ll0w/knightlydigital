import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, viaContactScope } from "@/lib/permissions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { money, shortDate, quoteDepositAmount } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import QuoteActions from "./QuoteActions";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { id } = await params;

  const quote = await prisma.quote.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: {
      contact: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      job: true,
      request: true,
    },
  });

  if (!quote) notFound();

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const publicUrl = `${baseUrl}/quote/${quote.publicToken}`;
  const deposit = quoteDepositAmount(quote);

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/app/quotes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <StatusChip kind="quote" status={quote.status} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {quote.title || `Quote #${quote.quoteNumber}`}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <Link href={`/app/contacts/${quote.contactId}`} className="text-green-700 hover:underline">
              {quote.contact.firstName} {quote.contact.lastName}
            </Link>
          </p>
        </div>
        <QuoteActions
          quoteId={quote.id}
          status={quote.status}
          publicUrl={publicUrl}
          hasJob={!!quote.jobId}
        />
      </div>

      {/* Header facts (Jobber-style definition list with backlinks) */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 bg-white border border-gray-200 rounded-lg mb-6 text-sm">
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Quote #</span>
          <span className="text-gray-800">{quote.quoteNumber}</span>
        </div>
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Created</span>
          <span className="text-gray-800">{shortDate(quote.createdAt)}</span>
        </div>
        {deposit > 0 && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">
              Required deposit
            </span>
            <span className="text-gray-800 font-semibold">{money(deposit)}</span>
          </div>
        )}
        {quote.request && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">From request</span>
            <Link
              href={`/app/requests/${quote.requestId}`}
              className="text-green-700 hover:underline"
            >
              {quote.request.title}
            </Link>
          </div>
        )}
        {quote.job && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">Used for</span>
            <Link href={`/app/jobs/${quote.jobId}`} className="text-green-700 hover:underline">
              Job #{quote.job.jobNumber}
            </Link>
          </div>
        )}
        {quote.approvedAt && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">Approved</span>
            <span className="text-gray-800">
              {shortDate(quote.approvedAt)}
              {quote.signatureName ? ` by ${quote.signatureName}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Changes requested note */}
      {quote.status === "CHANGES_REQUESTED" && quote.changeRequest && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg mb-6 text-sm text-amber-800">
          <span className="font-semibold">Client requested changes:</span> {quote.changeRequest}
        </div>
      )}

      {/* Quote body */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {quote.clientMessage && (
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.clientMessage}</p>
          </div>
        )}

        {/* Line items */}
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-xs uppercase text-gray-500 font-semibold">
                  Product / Service
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
              {quote.lineItems.map((item) => (
                <tr key={item.id} className={item.isOptional && item.optedOut ? "opacity-40" : ""}>
                  <td className="py-3">
                    <p className="text-gray-900 font-medium">
                      {item.name || item.description}
                      {item.isOptional && (
                        <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                          Optional{item.optedOut ? " — removed by client" : ""}
                        </span>
                      )}
                    </p>
                    {item.name && item.description && (
                      <p className="text-gray-500 text-xs mt-0.5">{item.description}</p>
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

        {/* Totals */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="ml-auto w-64 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-800">{money(quote.subtotal)}</span>
            </div>
            {quote.tax && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Tax ({(Number(quote.taxRate) * 100).toFixed(1)}%)
                </span>
                <span className="text-gray-800">{money(quote.tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1.5 border-t border-gray-200">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">{money(quote.total)}</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between text-green-700">
                <span>
                  Required deposit
                  {quote.depositType === "PERCENT" ? ` (${Number(quote.depositValue)}%)` : ""}
                </span>
                <span className="font-semibold">{money(deposit)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        {quote.disclaimer && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
              Contract / Disclaimer
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.disclaimer}</p>
          </div>
        )}

        {/* Internal notes */}
        {quote.notes && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Internal notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
