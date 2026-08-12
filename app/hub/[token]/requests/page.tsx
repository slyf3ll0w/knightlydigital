import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { shortDate } from "@/lib/statuses";
import EmptyState from "@/components/EmptyState";

/**
 * Client hub: the requests this client has filed, with an honest status —
 * before this, a client could submit a request and never see it again.
 * Status is derived across the request's lifecycle (quote sent / work
 * scheduled) rather than parroting internal enum names.
 */
export default async function HubRequestsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      requests: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          quotes: { select: { status: true, publicToken: true } },
          jobs: { select: { status: true, scheduledAt: true } },
        },
      },
    },
  });
  if (!contact) notFound();

  const requests = contact.requests;
  const base = `/hub/${token}`;

  /** Client-facing lifecycle label, derived — not the internal enum. */
  function describe(r: (typeof requests)[number]): {
    label: string;
    tone: string;
    quoteToken?: string;
  } {
    const openQuote = r.quotes.find((q) => q.status === "AWAITING_RESPONSE");
    if (openQuote) {
      return {
        label: "Quote ready for review",
        tone: "border-blue-600/30 bg-blue-600/[0.06] text-blue-700",
        quoteToken: openQuote.publicToken,
      };
    }
    const activeJob = r.jobs.find((j) => j.status === "ACTIVE");
    if (activeJob) {
      return activeJob.scheduledAt
        ? {
            label: `Scheduled · ${shortDate(activeJob.scheduledAt)}`,
            tone: "border-green-600/30 bg-green-600/[0.06] text-green-700",
          }
        : {
            label: "In progress",
            tone: "border-green-600/30 bg-green-600/[0.06] text-green-700",
          };
    }
    if (r.jobs.length > 0 || r.status === "CONVERTED") {
      return { label: "Completed", tone: "border-gray-400/40 bg-gray-500/[0.06] text-gray-600" };
    }
    if (r.status === "NEEDS_APPROVAL") {
      return {
        label: "Booking awaiting confirmation",
        tone: "border-amber-600/35 bg-amber-500/[0.07] text-amber-700",
      };
    }
    if (r.status === "ARCHIVED") {
      return { label: "Closed", tone: "border-gray-400/40 bg-gray-500/[0.06] text-gray-600" };
    }
    return {
      label: "Received — we'll be in touch",
      tone: "border-amber-600/35 bg-amber-500/[0.07] text-amber-700",
    };
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="numeral-ledger relative w-fit text-[22px] font-bold text-gray-900">
          Your requests
          <span aria-hidden className="title-rule" />
        </h2>
        <Link
          href={`${base}/requests/new`}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-xs font-semibold rounded-[10px] btn-tool transition-colors"
        >
          <Plus size={13} />
          New Request
        </Link>
      </div>
      {requests.length === 0 ? (
        <div className="card-ledger overflow-hidden">
          <EmptyState
            art="requests"
            title="You haven't sent any requests yet"
            body="Tell us what you need done and we'll take it from there."
            actionHref={`${base}/requests/new`}
            actionLabel="Send your first request"
            showPlusIcon={false}
          />
        </div>
      ) : (
        <div className="card-ledger overflow-hidden">
          <div className="list-settle divide-y divide-gray-100">
            {requests.map((r) => {
              const s = describe(r);
              const inner = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                      <span className={`stamp ${s.tone}`}>{s.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Sent {shortDate(r.createdAt)}</p>
                  </div>
                  {s.quoteToken && <ChevronRight size={15} className="text-gray-400 shrink-0" />}
                </>
              );
              return s.quoteToken ? (
                <Link
                  key={r.id}
                  href={`/quote/${s.quoteToken}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {inner}
                </Link>
              ) : (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
