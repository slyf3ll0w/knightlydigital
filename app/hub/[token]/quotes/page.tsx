import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";

const clientQuoteLabel: Record<string, string> = {
  AWAITING_RESPONSE: "Awaiting your approval",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  CONVERTED: "Approved",
};

export default async function HubQuotesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: {
      quotes: {
        // Drafts and archived quotes stay internal
        where: { status: { in: ["AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "CONVERTED"] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!contact) notFound();

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Your quotes</h2>
      {contact.quotes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-14 text-center">
          <FileText size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No quotes yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contact.quotes.map((q) => (
            <Link
              key={q.id}
              href={`/quote/${q.publicToken}`}
              className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {q.title || `Quote #${q.quoteNumber}`}
                </p>
                <p className="text-xs text-gray-500">
                  #{q.quoteNumber} · {shortDate(q.createdAt)} · {clientQuoteLabel[q.status]}
                </p>
              </div>
              <span className="text-sm font-bold text-gray-900">{money(q.total)}</span>
              <ChevronRight size={15} className="text-gray-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
