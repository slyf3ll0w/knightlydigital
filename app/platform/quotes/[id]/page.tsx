import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, Send, CheckCircle, Copy } from "lucide-react";

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-500",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { id } = await params;

  const quote = await prisma.quote.findFirst({
    where: { id, companyId },
    include: {
      contact: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      job: true,
    },
  });

  if (!quote) notFound();

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const publicUrl = `${baseUrl}/quote/${quote.publicToken}`;

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/quotes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Quote #{quote.quoteNumber}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[quote.status]}`}>
              {quote.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {quote.contact.firstName} {quote.contact.lastName}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {quote.status === "DRAFT" && (
            <form action={`/api/app/quotes/${quote.id}/send`} method="POST">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                <Send size={13} />
                Send
              </button>
            </form>
          )}
          {quote.status === "ACCEPTED" && !quote.job && (
            <Link
              href={`/app/jobs/new?quoteId=${quote.id}&contactId=${quote.contactId}`}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
            >
              <CheckCircle size={13} />
              Create Job
            </Link>
          )}
        </div>
      </div>

      {/* Public link */}
      {quote.status !== "DRAFT" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg mb-6 text-sm">
          <span className="text-gray-500 shrink-0">Customer link:</span>
          <span className="text-gray-700 truncate flex-1 font-mono text-xs">{publicUrl}</span>
          <button
            onClick={async () => { await navigator.clipboard.writeText(publicUrl); }}
            className="shrink-0 text-green-600 hover:text-green-700"
            title="Copy link"
          >
            <Copy size={14} />
          </button>
        </div>
      )}

      {/* Quote preview */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Quote header */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex justify-between">
            <div>
              <p className="text-2xl font-bold text-gray-900">QUOTE</p>
              <p className="text-sm text-gray-500">#{quote.quoteNumber}</p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <p className="font-semibold">{quote.contact.firstName} {quote.contact.lastName}</p>
              {quote.contact.phone && <p>{quote.contact.phone}</p>}
              {quote.contact.email && <p>{quote.contact.email}</p>}
              {quote.contact.address && <p>{quote.contact.address}</p>}
            </div>
          </div>
          <div className="flex gap-6 mt-4 text-sm text-gray-500">
            <div>
              <span className="text-xs uppercase font-semibold text-gray-400">Created</span>
              <p className="text-gray-700">{new Date(quote.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            </div>
            {quote.validUntil && (
              <div>
                <span className="text-xs uppercase font-semibold text-gray-400">Valid until</span>
                <p className="text-gray-700">{new Date(quote.validUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
              </div>
            )}
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
              {quote.lineItems.map((item) => (
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
          <div className="ml-auto w-56 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-800">${Number(quote.subtotal).toFixed(2)}</span>
            </div>
            {quote.tax && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tax ({(Number(quote.taxRate) * 100).toFixed(1)}%)</span>
                <span className="text-gray-800">${Number(quote.tax).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1.5 border-t border-gray-200">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">${Number(quote.total).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
