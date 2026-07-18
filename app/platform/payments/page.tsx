import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, isManager } from "@/lib/permissions";
import Link from "next/link";
import DisputeEvidence from "./DisputeEvidence";
import PayoutButton from "./PayoutButton";
import { Plus, ArrowUpRight, ChevronRight } from "lucide-react";
import { money, shortDate } from "@/lib/statuses";
import EmptyState from "@/components/EmptyState";
import { getProcessor, processingFees, estimateFeeCents, feeRateLabel } from "@/lib/payments";
import {
  finixEnvironment,
  toCents,
  listTransfersForIdentity,
  listSettlementsForIdentity,
  listSettlementFundingTransfers,
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

  // Funding transfers = the actual bank movement once Finix approves a settlement
  const fundingBySettlement = new Map<string, FinixTransfer[]>();
  if (settlements.length > 0) {
    const fundingRes = await Promise.allSettled(
      settlements.map((s) => listSettlementFundingTransfers(s.id))
    );
    fundingRes.forEach((r, i) => {
      if (r.status === "fulfilled") fundingBySettlement.set(settlements[i].id, r.value);
    });
  }

  // Clearing = charged successfully but inside the ~1-business-day window
  // before funds are settleable. Fee estimate uses our published rates; the
  // settlement carries the exact number.
  const now = Date.now();
  const clearingPayments = payments.filter((p) => {
    const t = p.processorRef ? transferStates.get(p.processorRef) : undefined;
    return (
      t?.state === "SUCCEEDED" &&
      t.ready_to_settle_at &&
      new Date(t.ready_to_settle_at).getTime() > now &&
      Number(p.amount) > 0
    );
  });
  const clearingTotal = clearingPayments.reduce((s, p) => s + Number(p.amount), 0);
  const clearingFees =
    clearingPayments.reduce(
      (s, p) =>
        s + estimateFeeCents(toCents(Number(p.amount)), p.method === "ACH" ? "ACH" : "CARD"),
      0
    ) / 100;

  const fees = processingFees();
  const cardRate = feeRateLabel(fees.cardBps, fees.cardFixedCents);
  const achRate = feeRateLabel(fees.achBps, fees.achFixedCents);

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

  const pageTotal = payments.reduce((s, p) => s + Number(p.amount), 0);

  // Dispute debits make settlement nets negative; "$-8,888.88" reads badly
  const signedMoney = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));

  // A settlement's real-world position, funding transfers beating raw status.
  // Tones match StatusChip's dot-stamp language (see .stamp in globals.css).
  const payoutState = (s: FinixSettlement) => {
    const funding = fundingBySettlement.get(s.id) ?? [];
    if (funding.some((f) => f.state === "SUCCEEDED"))
      return { label: "Paid out", tone: "text-green-700" };
    if (funding.some((f) => f.state === "PENDING"))
      return { label: "On the way", tone: "text-blue-700" };
    if (s.status === "ACCRUING") return { label: "Accruing", tone: "text-blue-700" };
    if (s.status === "AWAITING_APPROVAL" || s.status === "APPROVED")
      return { label: "Processing", tone: "text-gray-500" };
    return { label: s.status ?? "Pending", tone: "text-gray-500" };
  };

  const stateStamp = (ref: string | null) => {
    const t = ref ? transferStates.get(ref) : undefined;
    if (!t) return <span className="hidden lg:block" />;
    const tones: Record<string, string> = {
      SUCCEEDED: "text-green-700",
      PENDING: "text-blue-700",
      FAILED: "text-red-700",
      CANCELED: "text-gray-500",
    };
    const labels: Record<string, string> = {
      SUCCEEDED: "Paid",
      PENDING: "Processing",
      FAILED: "Failed",
      CANCELED: "Canceled",
    };
    return (
      <span className={`stamp ${tones[t.state] ?? "text-gray-500"}`}>
        {labels[t.state] ?? t.state}
      </span>
    );
  };

  const kpis = [
    {
      label: `Collected this month (${monthAgg._count})`,
      value: money(Number(monthAgg._sum.amount ?? 0)),
    },
    {
      label: "Bank transfers processing",
      value: money(pendingAch),
      sub: "ACH clears in a few business days",
    },
    {
      label: `Collected all-time (${allAgg._count})`,
      value: money(Number(allAgg._sum.amount ?? 0)),
    },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 flex items-center gap-3">
          Payments
          {online && finixEnvironment() === "sandbox" && (
            <span className="stamp text-amber-700">Test mode</span>
          )}
        </h1>
        <Link
          href="/app/payments/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors"
        >
          <Plus size={15} />
          Collect Payment
        </Link>
      </div>

      {!online && (
        <div className="card-ledger p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Online payments aren&apos;t set up yet
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
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

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="card-ledger p-4">
            <p className="text-xs font-medium text-gray-500 mb-1">{k.label}</p>
            <p className="numeral-ledger text-2xl font-semibold text-gray-900">{k.value}</p>
            {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Disputes — only demand attention when there are any */}
      {disputes.length > 0 && (
        <div className="card-ledger mb-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Disputes</h2>
            <span className="stamp text-red-700">
              {disputes.length} open
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {disputes.map((d) => {
              const evidence = evidenceByDispute.get(d.id) ?? [];
              return (
                <div key={d.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="stamp text-red-700 w-24 shrink-0">{d.state ?? "Open"}</span>
                    <span className="flex-1 min-w-0 text-sm">
                      <span className="font-medium text-gray-900 capitalize">
                        {(d.reason ?? "Dispute").replaceAll("_", " ").toLowerCase()}
                      </span>
                      {d.respond_by && (
                        <span className="text-xs text-gray-500">
                          {" "}
                          · respond by {shortDate(new Date(d.respond_by))}
                        </span>
                      )}
                    </span>
                    <span className="numeral-ledger text-sm font-semibold text-gray-900">
                      {d.amount != null ? money(d.amount / 100) : ""}
                    </span>
                  </div>
                  <div className="mt-2 sm:pl-[108px]">
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
                </div>
              );
            })}
          </div>
          <p className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 text-xs text-gray-500">
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
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Payouts</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Payments clear in about a business day, then pay out to your bank
                automatically. Processing fees — cards {cardRate}, bank transfers {achRate} —
                come out of each payout.
              </p>
            </div>
            {isManager(actor.role) && <PayoutButton />}
          </div>
          {clearingTotal > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
              <span className="stamp text-blue-700 w-24 shrink-0">Clearing</span>
              <span className="flex-1 text-xs text-gray-500">
                ≈{money(clearingFees)} in fees will be deducted
              </span>
              <span className="numeral-ledger text-sm font-semibold text-gray-900">
                {money(clearingTotal)}
              </span>
            </div>
          )}
          {settlements.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No payouts yet — your first payout appears here once collected payments settle
              to your bank account.
            </p>
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                <div className="hidden lg:grid grid-cols-[110px_1fr_110px_110px_110px] gap-4 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                  <span>Date</span>
                  <span>Status</span>
                  <span className="text-right">Gross</span>
                  <span className="text-right">Fees</span>
                  <span className="text-right">Net</span>
                </div>
                {settlements.map((s) => {
                  const gross = s.total_amount != null ? s.total_amount / 100 : null;
                  const feeAmt = s.total_fees != null ? s.total_fees / 100 : null;
                  const net =
                    s.net_amount != null
                      ? s.net_amount / 100
                      : gross != null && feeAmt != null
                        ? gross - feeAmt
                        : null;
                  const state = payoutState(s);
                  return (
                    <div
                      key={s.id}
                      className="flex lg:grid lg:grid-cols-[110px_1fr_110px_110px_110px] gap-4 items-center px-4 py-2.5"
                    >
                      <span className="text-sm text-gray-500 w-20 lg:w-auto shrink-0">
                        {s.created_at ? shortDate(new Date(s.created_at)) : ""}
                      </span>
                      <span className={`stamp ${state.tone} flex-1 lg:flex-none`}>
                        {state.label}
                      </span>
                      <span className="numeral-ledger hidden lg:block text-sm text-gray-600 text-right">
                        {gross != null ? signedMoney(gross) : ""}
                      </span>
                      <span className="numeral-ledger hidden lg:block text-sm text-gray-600 text-right">
                        {feeAmt != null ? money(feeAmt) : ""}
                      </span>
                      <span
                        className={`numeral-ledger text-sm font-semibold text-right ${net != null && net < 0 ? "text-red-600" : "text-gray-900"}`}
                      >
                        {net != null ? signedMoney(net) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Ledger foot — running totals, double-ruled like a register */}
              <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[110px_1fr_110px_110px_110px]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 lg:col-span-2">
                  {settlements.length} {settlements.length === 1 ? "payout" : "payouts"}
                </span>
                <span className="numeral-ledger hidden lg:block text-sm font-semibold text-gray-600 text-right">
                  {signedMoney(payoutTotals.gross / 100)}
                </span>
                <span className="numeral-ledger hidden lg:block text-sm font-semibold text-gray-600 text-right">
                  {money(payoutTotals.fees / 100)}
                </span>
                <span
                  className={`numeral-ledger text-sm font-bold text-right ${payoutTotals.net < 0 ? "text-red-600" : "text-gray-900"}`}
                >
                  {signedMoney(payoutTotals.net / 100)}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Recent online payments */}
      <div className="card-ledger overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Online payments</h2>
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
          <>
            <div className="divide-y divide-gray-100">
              <div className="hidden lg:grid grid-cols-[110px_1fr_90px_130px_110px_28px] gap-4 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                <span>Date</span>
                <span>Client</span>
                <span>Method</span>
                <span>Status</span>
                <span className="text-right">Amount</span>
                <span></span>
              </div>
              {payments.map((p) => (
                <Link
                  key={p.id}
                  href={`/app/invoices/${p.invoiceId}`}
                  className="flex lg:grid lg:grid-cols-[110px_1fr_90px_130px_110px_28px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <span className="text-sm text-gray-500 w-20 lg:w-auto shrink-0">
                    {shortDate(p.paidAt)}
                  </span>
                  <div className="flex-1 lg:flex-none min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {p.contact ? `${p.contact.firstName} ${p.contact.lastName}` : "—"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      Invoice #{p.invoice?.invoiceNumber}
                      <span className="lg:hidden"> · {p.method === "ACH" ? "Bank" : "Card"}</span>
                      {p.details?.includes("Refunded") && (
                        <span className="text-amber-600"> · refunded</span>
                      )}
                    </p>
                  </div>
                  <span className="hidden lg:block text-sm text-gray-500">
                    {p.method === "ACH" ? "Bank" : "Card"}
                  </span>
                  {stateStamp(p.processorRef)}
                  <span className="numeral-ledger text-sm font-semibold text-gray-900 text-right">
                    {money(Number(p.amount))}
                  </span>
                  <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                </Link>
              ))}
            </div>
            {/* Ledger foot */}
            <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[110px_1fr_90px_130px_110px_28px]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 lg:col-span-4">
                {payments.length} {payments.length === 1 ? "payment" : "payments"}
              </span>
              <span className="numeral-ledger text-sm font-bold text-gray-900 text-right">
                {money(pageTotal)}
              </span>
              <span className="hidden lg:block" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
