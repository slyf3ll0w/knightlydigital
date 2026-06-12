import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { FileText, ChevronRight } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";

// Client-facing stamps — friendlier labels than the internal ones
const clientQuoteStamp: Record<string, { label: string; tone: string }> = {
  AWAITING_RESPONSE: {
    label: "Needs your approval",
    tone: "border-amber-600/35 bg-amber-500/[0.07] text-amber-700",
  },
  APPROVED: { label: "Approved", tone: "border-green-600/30 bg-green-600/[0.06] text-green-700" },
  CONVERTED: { label: "Approved", tone: "border-green-600/30 bg-green-600/[0.06] text-green-700" },
  CHANGES_REQUESTED: {
    label: "Changes requested",
    tone: "border-blue-600/30 bg-blue-600/[0.06] text-blue-700",
  },
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
        <div className="card-ledger py-14 text-center">
          <FileText size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No quotes yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contact.quotes.map((q) => {
            const stamp = clientQuoteStamp[q.status];
            return (
              <Link
                key={q.id}
                href={`/quote/${q.publicToken}`}
                className="flex items-center gap-4 card-ledger p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {q.title || `Quote #${q.quoteNumber}`}
                    </p>
                    {stamp && <span className={`stamp ${stamp.tone}`}>{stamp.label}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    #{q.quoteNumber} · {shortDate(q.createdAt)}
                  </p>
                </div>
                <span className="numeral-ledger text-base font-semibold text-gray-900">
                  {money(q.total)}
                </span>
                <ChevronRight size={15} className="text-gray-300" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
