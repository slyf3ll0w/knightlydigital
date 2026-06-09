import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { FileText, Plus, ChevronRight } from "lucide-react";

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-500",
};

export default async function QuotesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const quotes = await prisma.quote.findMany({
    where: { companyId },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
          <p className="text-sm text-gray-500">{quotes.length} total</p>
        </div>
        <Link
          href="/app/quotes/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Quote
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {quotes.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">No quotes yet.</p>
            <Link
              href="/app/quotes/new"
              className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
            >
              <Plus size={13} />
              Create your first quote
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden lg:grid grid-cols-[80px_1fr_140px_100px_100px_40px] gap-4 px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
              <span>#</span>
              <span>Customer</span>
              <span>Created</span>
              <span>Total</span>
              <span>Status</span>
              <span></span>
            </div>
            {quotes.map((q) => (
              <Link
                key={q.id}
                href={`/app/quotes/${q.id}`}
                className="flex lg:grid lg:grid-cols-[80px_1fr_140px_100px_100px_40px] gap-4 items-center px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-500 font-medium">#{q.quoteNumber}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {q.contact.firstName} {q.contact.lastName}
                  </p>
                </div>
                <span className="hidden lg:block text-sm text-gray-500">
                  {new Date(q.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  ${Number(q.total).toFixed(2)}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[q.status]}`}>
                  {q.status}
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
