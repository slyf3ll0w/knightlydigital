import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, isManager } from "@/lib/permissions";
import Link from "next/link";
import DisputeEvidence from "./DisputeEvidence";
import {
  DollarSign,
  Landmark,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { money, shortDate } from "@/lib/statuses";
import EmptyState from "@/components/EmptyState";
import { getProcessor } from "@/lib/payments";
import {
  finixEnvironment,
  listTransfersForIdentity,
  listSettlementsForIdentity,
  listDisputes,
  listDisputeEvidence,
  type FinixTransfer,
  type FinixSettlement,
  type FinixDispute,
  type FinixDisputeEvidence,
} from "@/lib/finix";

/**
 * Payments dashboard — the company's money view for online processing:
 * status, volume, every online payment with its LIVE processor state,
 * payouts (settlements), and disputes. This is the sub-merchant "dashboard"
 * for Streamflaire Payments: companies never log into Finix; this page is
 * their window. All Finix reads are best-effort — the page renders from our
 * own records even if the processor API is briefly unreachable.
 */
export default async function PaymentsDashboardPage() {
  const actor = await requirePageActor(canSeeMoney);
  const companyId = actor.companyId;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      finixIdentityId: true,
      finixMerchantId: true,
      finixOnboardingState: true,
    },
  });

  const processor = getProcessor();
  const online =
    processor.name === "finix" &&
    processor.live &&
    company?.finixMerchantId != null &&
    company.finixOnboardingState === "APPROVED";

  // Online payments = rows the processor created (processorRef set)
  const payments = await prisma.payment.findMany({
    where: { companyId, processorRef: { not: null } },
    orderBy: { paidAt: "desc" },
    take: 25,
    include: {
      invoice: { select: { id: true, invoiceNumber: true } },
      contact: { select: { firstName: true, lastName: true } },
    },
  });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [monthAgg, allAgg] = await Promise.all([
    prisma.payment.aggregate({
      where: { companyId, processorRef: { not: null }, paidAt: { gte: monthStart } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { companyId, processorRef: { not: null } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  // Live processor data — one call each, tolerated to fail independently
  let transferStates = new Map<string, FinixTransfer>();
  let settlements: FinixSettlement[] = [];
  let disputes: FinixDispute[] = [];
  if (online && company?.finixIdentityId) {
    const [transfersRes, settlementsRes, disputesRes] = await Promise.allSettled([
      listTransfersForIdentity(company.finixIdentityId),
      listSettlementsForIdentity(company.finixIdentityId),
      listDisputes(),
    ]);
    if (transfersRes.status === "fulfilled") {
      transferStates = new Map(transfersRes.value.map((t) => [t.id, t]));
    }
    if (settlementsRes.status === "fulfilled") settlements = settlementsRes.value;
    if (disputesRes.status === "fulfilled") {
      // The disputes list is application-wide; keep only ours — matched by
      // identity when present, else by the disputed transfer id.
      const ourTransfers = new Set(transferStates.keys());
      disputes = disputesRes.value.filter(
        (d) =>
          (d.identity && d.identity === company.finixIdentityId) ||
          (d.transfer && ourTransfers.has(d.transfer))
      );
    }
  }

  // Evidence already uploaded per dispute — best-effort, like the reads above
  const evidenceByDispute = new Map<string, FinixDisputeEvidence[]>();
  if (disputes.length > 0) {
    const evidenceRes = await Promise.allSettled(
      disputes.map((d) => listDisputeEvidence(d.id))
    );
    evidenceRes.forEach((r, i) => {
      if (r.status === "fulfilled") evidenceByDispute.set(disputes[i].id, r.value);
    });
  }

  // Payout totals across listed settlements — the "what has processing cost me" line
  const payoutTotals = settlements.reduce(
    (acc, s) => {
      if (s.total_amount != null) acc.gross += s.total_amount;
      if (s.total_fees != null) acc.fees += s.total_fees;
      acc.net += s.net_amount ?? (s.total_amount ?? 0) - (s.total_fees ?? 0);
      return acc;
    },
    { gross: 0, fees: 0, net: 0 }
  );

  const pendingAch = payments
    .filter((p) => {
      const t = p.processorRef ? transferStates.get(p.processorRef) : undefined;
      return t?.state === "PENDING";
    })
    .reduce((s, p) => s + Number(p.amount), 0);

  // Dispute debits make settlement nets negative; "$-8,888.88" reads badly
  const signedMoney = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));

  const stateChip = (ref: string | null) => {
    const t = ref ? transferStates.get(ref) : undefined;
    if (!t) return null;
    const styles: Record<string, string> = {
      SUCCEEDED: "bg-green-100 text-green-700",
      PENDING: "bg-blue-100 text-blue-700",
      FAILED: "bg-red-100 text-red-700",
      CANCELED: "bg-gray-100 text-gray-500",
    };
    const labels: Record<string, string> = {
      SUCCEEDED: "Succeeded",
      PENDING: "Processing",
      FAILED: "Failed",
      CANCELED: "Canceled",
    };
    return (
      <span
        className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${styles[t.state] ?? "bg-gray-100 text-gray-500"}`}
      >
        {labels[t.state] ?? t.state}
      </span>
    );
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 flex items-center gap-2">
            Payments
            {online && finixEnvironment() === "sandbox" && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                Test mode
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500">
            {online
              ? "Online card & bank payments, payouts, and disputes"
              : "Payments recorded across your invoices"}
          </p>
        </div>
        <Link
          href="/app/payments/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-full transition-colors"
        >
          <Plus size={13} />
          Collect payment
        </Link>
      </div>

      {!online && (
        <div className="card-ledger p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              Online payments aren&apos;t set up yet
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Let clients pay invoices by card or bank straight from their pay links — money
              lands in your own bank account.
            </p>
          </div>
          <Link
            href="/app/settings"
            className="flex items-center gap-1 text-sm font-medium text-green-600 hover:text-green-700"
          >
            Set up in Settings <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="card-ledger p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide font-semibold">
            <DollarSign size={13} /> Collected online this month
          </div>
          <p className="numeral-ledger text-2xl font-semibold text-gray-900 mt-1">
            {money(Number(monthAgg._sum.amount ?? 0))}
          </p>
          <p className="text-xs text-gray-400">{monthAgg._count} payment{monthAgg._count === 1 ? "" : "s"}</p>
        </div>
        <div className="card-ledger p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide font-semibold">
            <Clock size={13} /> Bank transfers processing
          </div>
          <p className="numeral-ledger text-2xl font-semibold text-gray-900 mt-1">{money(pendingAch)}</p>
          <p className="text-xs text-gray-400">ACH clears in a few business days</p>
        </div>
        <div className="card-ledger p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide font-semibold">
            <Landmark size={13} /> Collected online all-time
          </div>
          <p className="numeral-ledger text-2xl font-semibold text-gray-900 mt-1">
            {money(Number(allAgg._sum.amount ?? 0))}
          </p>
          <p className="text-xs text-gray-400">{allAgg._count} payment{allAgg._count === 1 ? "" : "s"}</p>
        </div>
      </div>

      {/* Disputes — only demand attention when there are any */}
      {disputes.length > 0 && (
        <div className="card-ledger mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <ShieldAlert size={15} className="text-red-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Disputes</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {disputes.map((d) => {
              const evidence = evidenceByDispute.get(d.id) ?? [];
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 text-sm">
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                    {d.state ?? "OPEN"}
                  </span>
                  <span className="flex-1 text-gray-700">
                    {(d.reason ?? "Dispute").replaceAll("_", " ").toLowerCase()}
                    {d.respond_by && (
                      <span className="text-xs text-gray-400"> · respond by {shortDate(new Date(d.respond_by))}</span>
                    )}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {d.amount != null ? money(d.amount / 100) : ""}
                  </span>
                  <DisputeEvidence
                    disputeId={d.id}
                    canUpload={isManager(actor.role)}
                    initialEvidence={evidence.map((e) => ({
                      id: e.id,
                      fileName: e.file_name ?? "file",
                      state: e.state ?? "PENDING",
                      createdAt: e.created_at ?? null,
                    }))}
                  />
                </div>
              );
            })}
          </div>
          <p className="px-5 py-2.5 bg-red-50/50 text-xs text-red-700">
            A client&apos;s bank flagged these charges. Upload evidence before the respond-by
            date — the invoice, a signed agreement, photos of the completed work, or messages
            with the client (PDF, JPG, or PNG). It goes straight to the bank reviewing the
            dispute, and we&apos;ll reach out to help with each one too.
          </p>
        </div>
      )}

      {/* Payouts */}
      {online && (
        <div className="card-ledger mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Landmark size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Payouts</h2>
          </div>
          {settlements.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              No payouts yet — your first payout appears here once collected payments settle to
              your bank account.
            </p>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {settlements.map((s) => {
                  const gross = s.total_amount != null ? s.total_amount / 100 : null;
                  const fees = s.total_fees != null ? s.total_fees / 100 : null;
                  const net =
                    s.net_amount != null
                      ? s.net_amount / 100
                      : gross != null && fees != null
                        ? gross - fees
                        : null;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="text-gray-500 text-xs w-24">
                        {s.created_at ? shortDate(new Date(s.created_at)) : ""}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {s.status ?? "PENDING"}
                      </span>
                      <span className="flex-1 text-xs text-gray-400">
                        {gross != null && <>Gross {signedMoney(gross)}</>}
                        {fees != null && <> · Fees {money(fees)}</>}
                      </span>
                      <span
                        className={`font-semibold ${net != null && net < 0 ? "text-red-600" : "text-gray-900"}`}
                      >
                        {net != null ? signedMoney(net) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 bg-gray-50/60 border-t border-gray-100 text-xs">
                <span className="font-semibold text-gray-500 uppercase tracking-wide">Total</span>
                <span className="flex-1 text-gray-400">
                  Gross {signedMoney(payoutTotals.gross / 100)} · Fees {money(payoutTotals.fees / 100)}
                </span>
                <span
                  className={`font-semibold ${payoutTotals.net < 0 ? "text-red-600" : "text-gray-900"}`}
                >
                  Net {signedMoney(payoutTotals.net / 100)}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Recent online payments */}
      <div className="card-ledger overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Online payments
          </h2>
        </div>
        {payments.length === 0 ? (
          <EmptyState
            art="invoices"
            title="No online payments yet"
            body={
              online
                ? "When a client pays an invoice from their pay link, it shows up here with its live processing status."
                : "Once online payments are set up, client card and bank payments land here."
            }
            showPlusIcon={false}
          />
        ) : (
          <div className="divide-y divide-gray-50">
            {payments.map((p) => (
              <Link
                key={p.id}
                href={`/app/invoices/${p.invoiceId}`}
                className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm hover:bg-gray-50/60 transition-colors"
              >
                <span className="text-gray-500 text-xs w-24">{shortDate(p.paidAt)}</span>
                <span className="flex-1 min-w-40">
                  <span className="font-medium text-gray-900">
                    {p.contact ? `${p.contact.firstName} ${p.contact.lastName}` : "—"}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {" "}
                    · Invoice #{p.invoice?.invoiceNumber} · {p.method === "ACH" ? "Bank" : "Card"}
                  </span>
                  {p.details?.includes("Refunded") && (
                    <span className="text-xs text-amber-600"> · partially/fully refunded</span>
                  )}
                </span>
                {stateChip(p.processorRef)}
                <span className="font-semibold text-gray-900 w-20 text-right">
                  {money(Number(p.amount))}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
