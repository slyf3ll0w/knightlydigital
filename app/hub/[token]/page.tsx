import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import {
  Inbox,
  FileText,
  Receipt,
  ArrowRight,
  CalendarDays,
  FileSignature,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { money } from "@/lib/statuses";
import ResendContractButton from "./ResendContractButton";

export default async function HubHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: {
      quotes: { where: { status: "AWAITING_RESPONSE" } },
      invoices: {
        where: { status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
        include: { payments: true },
      },
      jobs: {
        where: { status: "ACTIVE", scheduledAt: { gte: startOfDay } },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        select: { id: true, title: true, scheduledAt: true, scheduledAnytime: true },
      },
      contracts: {
        where: { status: { in: ["SENT", "SIGNED"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, status: true, signedAt: true },
      },
    },
  });
  if (!contact) notFound();

  const openQuotes = contact.quotes.length;
  const openBalance = contact.invoices.reduce((s, inv) => {
    const paid = inv.payments.reduce((p, x) => p + Number(x.amount), 0);
    return s + Math.max(0, Number(inv.total) - paid);
  }, 0);
  const pendingContracts = contact.contracts.filter((c) => c.status === "SENT");
  const nextVisit = contact.jobs[0];
  const base = `/hub/${token}`;

  const visitTime = (d: Date, anytime: boolean) =>
    anytime
      ? "Anytime"
      : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  /** Small ledger "appointment ticket" date tile — month over day numeral. */
  const dateTile = (d: Date | null) => (
    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md border border-gray-200 bg-white">
      {d ? (
        <>
          <span className="text-[9px] font-bold uppercase tracking-wide leading-none text-red-600/80">
            {d.toLocaleDateString("en-US", { month: "short" })}
          </span>
          <span className="numeral-ledger text-lg font-semibold leading-tight text-gray-900">
            {d.getDate()}
          </span>
        </>
      ) : (
        <CalendarDays size={16} className="text-gray-300" />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Action items — the money path stays at the very top */}
      {openQuotes > 0 && (
        <Link
          href={`${base}/quotes`}
          className="anim-portal flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <p className="text-sm font-medium text-blue-800">
            {openQuotes} {openQuotes === 1 ? "quote is" : "quotes are"} waiting for your approval
          </p>
          <ArrowRight size={14} className="text-blue-700" />
        </Link>
      )}
      {pendingContracts.length > 0 && (
        <div className="anim-portal flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-800">
            {pendingContracts.length === 1
              ? "An agreement is waiting for your signature — check your email"
              : `${pendingContracts.length} agreements are waiting for your signature — check your email`}
          </p>
          <Mail size={14} className="text-amber-700 shrink-0" />
        </div>
      )}
      {openBalance > 0 && (
        <Link
          href={`${base}/invoices`}
          className="anim-portal flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
        >
          <p className="text-sm font-medium text-amber-800">
            You have an outstanding balance of $
            {openBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <ArrowRight size={14} className="text-amber-700" />
        </Link>
      )}

      {/* At-a-glance ledger strip */}
      <div className="anim-portal anim-delay-1 card-ledger grid grid-cols-3 divide-x divide-gray-100">
        <div className="px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Open balance
          </p>
          <p className="numeral-ledger mt-1 text-lg sm:text-2xl font-semibold text-gray-900">
            {money(openBalance)}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Next visit
          </p>
          <p className="numeral-ledger mt-1 text-lg sm:text-2xl font-semibold text-gray-900">
            {nextVisit?.scheduledAt
              ? new Date(nextVisit.scheduledAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "—"}
          </p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Quotes to review
          </p>
          <p className="numeral-ledger mt-1 text-lg sm:text-2xl font-semibold text-gray-900">
            {openQuotes}
          </p>
        </div>
      </div>

      {/* Upcoming visits — appointment-ticket date tiles */}
      {contact.jobs.length > 0 && (
        <div className="anim-portal anim-delay-2 card-ledger overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <CalendarDays size={15} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Upcoming visits</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {contact.jobs.map((job) => {
              const d = job.scheduledAt ? new Date(job.scheduledAt) : null;
              return (
                <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                  {dateTile(d)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                    <p className="text-xs text-gray-500">
                      {d
                        ? `${d.toLocaleDateString("en-US", { weekday: "long" })} · ${visitTime(d, job.scheduledAnytime)}`
                        : "To be scheduled"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agreements — signing happens via the emailed link, never inline here */}
      {contact.contracts.length > 0 && (
        <div className="anim-portal anim-delay-2 card-ledger overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <FileSignature size={15} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Agreements</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {contact.contracts.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.title}</p>
                    {c.status === "SIGNED" ? (
                      <span className="stamp border-green-600/30 bg-green-600/[0.06] text-green-700">
                        Signed
                      </span>
                    ) : (
                      <span className="stamp border-amber-600/35 bg-amber-500/[0.07] text-amber-700">
                        Awaiting signature
                      </span>
                    )}
                  </div>
                  {c.status === "SIGNED" ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 size={12} />
                      Signed{" "}
                      {c.signedAt
                        ? new Date(c.signedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : ""}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-amber-700">
                      We emailed you the signing link
                    </p>
                  )}
                </div>
                {c.status === "SENT" && (
                  <ResendContractButton token={token} contractId={c.id} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Get work done */}
      <div className="anim-portal anim-delay-3 card-ledger p-8 text-center">
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
      <div className="anim-portal anim-delay-4 grid grid-cols-2 gap-3">
        <Link
          href={`${base}/quotes`}
          className="flex items-center gap-3 card-ledger p-4 hover:shadow-sm transition-shadow"
        >
          <FileText size={18} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-800">Your quotes</span>
        </Link>
        <Link
          href={`${base}/invoices`}
          className="flex items-center gap-3 card-ledger p-4 hover:shadow-sm transition-shadow"
        >
          <Receipt size={18} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-800">Your invoices</span>
        </Link>
      </div>
    </div>
  );
}
