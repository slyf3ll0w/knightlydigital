import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Inbox, FileText, Receipt, ArrowRight } from "lucide-react";

export default async function HubHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: {
      quotes: { where: { status: "AWAITING_RESPONSE" } },
      invoices: { where: { status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } }, include: { payments: true } },
    },
  });
  if (!contact) notFound();

  const openQuotes = contact.quotes.length;
  const openBalance = contact.invoices.reduce((s, inv) => {
    const paid = inv.payments.reduce((p, x) => p + Number(x.amount), 0);
    return s + Math.max(0, Number(inv.total) - paid);
  }, 0);
  const base = `/hub/${token}`;

  return (
    <div className="space-y-4">
      {/* Action items */}
      {openQuotes > 0 && (
        <Link
          href={`${base}/quotes`}
          className="flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <p className="text-sm font-medium text-blue-800">
            {openQuotes} {openQuotes === 1 ? "quote is" : "quotes are"} waiting for your approval
          </p>
          <ArrowRight size={14} className="text-blue-700" />
        </Link>
      )}
      {openBalance > 0 && (
        <Link
          href={`${base}/invoices`}
          className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
        >
          <p className="text-sm font-medium text-amber-800">
            You have an outstanding balance of $
            {openBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <ArrowRight size={14} className="text-amber-700" />
        </Link>
      )}

      {/* Get work done */}
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <Inbox size={32} className="text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900 mb-1">Get work done</h2>
        <p className="text-sm text-gray-500 mb-5">
          Send us a request and fill us in on the details.
        </p>
        <Link
          href={`${base}/requests/new`}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          New Request
        </Link>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`${base}/quotes`}
          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
        >
          <FileText size={18} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-800">Your quotes</span>
        </Link>
        <Link
          href={`${base}/invoices`}
          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
        >
          <Receipt size={18} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-800">Your invoices</span>
        </Link>
      </div>
    </div>
  );
}
