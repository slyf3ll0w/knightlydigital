import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Chip } from "@/components/ds";
import EmptyState from "@/components/EmptyState";
import { money, shortDate } from "@/lib/statuses";
import { listSquarePayoutEntries, type SellerPayout, type SellerReadFailure } from "@/lib/square-seller-reports";
import { ReconnectCard, RuledLabel, SquareLinkRows, SquareUnavailable, TabBack } from "./bits";
import { payoutDestinationLabel, payoutEntryTypeLabel, payoutStatus } from "./labels";

/**
 * Payouts tab (Square): every transfer Square made to the seller's bank —
 * status, the day it lands, amount, fees, which account — and, tapped, the
 * charges / refunds / disputes / fees that made it up (ListPayoutEntries).
 * Instant transfer and the deposit schedule stay in Square (deep links).
 */
export default async function PayoutsTab({
  companyId,
  tz,
  payouts,
  failure,
  payoutId,
  sandbox,
  canReconnect,
}: {
  companyId: string;
  tz: string;
  payouts: SellerPayout[];
  failure: SellerReadFailure | null;
  payoutId: string | null;
  sandbox: boolean;
  canReconnect: boolean;
}) {
  if (failure?.missingScopes) return <ReconnectCard what="payouts and disputes" canReconnect={canReconnect} />;

  const arrival = (p: SellerPayout) => {
    if (!p.arrivalDate) return "";
    const [y, m, d] = p.arrivalDate.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };

  if (payoutId) {
    const payout = payouts.find((p) => p.id === payoutId) ?? null;
    const entriesRead = await listSquarePayoutEntries(companyId, payoutId);
    const entries = entriesRead.ok ? entriesRead.data.entries : [];
    const state = payout ? payoutStatus(payout.status) : null;
    const gross = entries.reduce((s, e) => s + e.grossCents, 0);
    const fees = entries.reduce((s, e) => s + e.feeCents, 0);
    const net = entries.reduce((s, e) => s + e.netCents, 0);
    return (
      <div className="mb-8">
        <TabBack tab="payouts" label="Payouts" />
        <div className="ds-card mb-4 overflow-hidden">
          <div className="p-5 sm:p-6">
            <p className="ds-label">{payout ? `Payout · ${shortDate(payout.createdAt, tz)}` : "Payout"}</p>
            <p className="numeral-ledger mt-1 text-[34px] font-semibold leading-none text-[color:var(--ds-ink)]">
              {payout ? money(payout.amountCents / 100) : money(net / 100)}
            </p>
            {payout && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                {state && <Chip tone={state.tone}>{state.label}</Chip>}
                <span>{payoutDestinationLabel(payout)}</span>
                {payout.arrivalDate && <span>· lands {arrival(payout)}</span>}
                {payout.feeCents > 0 && <span>· {money(payout.feeCents / 100)} transfer fee</span>}
              </p>
            )}
          </div>
        </div>
        <RuledLabel info="Each line is one thing Square moved into this payout: a payment, a refund it pulled back, a dispute, or a fee. Gross is what the client paid; fee is Square's cut; net is what reached the bank.">
          What&apos;s in it
        </RuledLabel>
        {!entriesRead.ok && <SquareUnavailable failure={entriesRead} what="the breakdown" />}
        <div className="ds-card overflow-hidden">
          {entries.length === 0 ? (
            <EmptyState compact title="Nothing to show yet" body="Square hasn't listed this payout's lines." />
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                <div className="hidden lg:grid grid-cols-[110px_1fr_110px_110px_110px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                  <span>Date</span>
                  <span>Line</span>
                  <span className="text-right">Gross</span>
                  <span className="text-right">Fee</span>
                  <span className="text-right">Net</span>
                </div>
                {entries.map((e) => (
                  <div key={e.id} className="flex lg:grid lg:grid-cols-[110px_1fr_110px_110px_110px] gap-4 items-center px-4 py-2.5">
                    <span className="text-sm text-gray-500 w-20 lg:w-auto shrink-0">{e.effectiveAt ? shortDate(e.effectiveAt, tz) : ""}</span>
                    <span className="flex-1 lg:flex-none min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">{payoutEntryTypeLabel(e.type)}</span>
                      {(e.paymentId || e.refundId || e.disputeId) && (
                        <span className="block truncate text-xs text-gray-500">
                          {e.disputeId ? `Dispute ${e.disputeId.slice(0, 10)}` : e.refundId ? `Refund ${e.refundId.slice(0, 10)}` : `Payment ${e.paymentId?.slice(0, 10)}`}
                        </span>
                      )}
                    </span>
                    <span className="numeral-ledger hidden lg:block text-sm text-gray-600 text-right">{money(e.grossCents / 100)}</span>
                    <span className="numeral-ledger hidden lg:block text-sm text-gray-600 text-right">{e.feeCents ? money(e.feeCents / 100) : ""}</span>
                    <span className={`numeral-ledger text-sm font-semibold text-right ${e.netCents < 0 ? "text-[color:var(--ds-bad)]" : "text-[color:var(--ds-ink)]"}`}>
                      {money(e.netCents / 100)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[110px_1fr_110px_110px_110px]">
                <span className="text-xs font-medium text-gray-500 lg:col-span-2">
                  {entries.length} {entries.length === 1 ? "line" : "lines"}
                  {entriesRead.ok && entriesRead.data.cursor ? " · showing the first 100" : ""}
                </span>
                <span className="numeral-ledger hidden lg:block text-sm font-semibold text-gray-600 text-right">{money(gross / 100)}</span>
                <span className="numeral-ledger hidden lg:block text-sm font-semibold text-gray-600 text-right">{money(fees / 100)}</span>
                <span className="numeral-ledger text-sm font-bold text-right text-[color:var(--ds-ink)]">{money(net / 100)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const totals = payouts.reduce(
    (acc, p) => {
      if (p.status === "PAID") acc.paid += p.amountCents;
      else if (p.status === "SENT") acc.sent += p.amountCents;
      acc.fees += p.feeCents;
      return acc;
    },
    { paid: 0, sent: 0, fees: 0 }
  );

  return (
    <>
      <div className="mb-8">
        <RuledLabel
          info={
            <>
              Square moves each day&apos;s card and bank payments to your bank on its schedule (next business day by
              default). &ldquo;On the way&rdquo; means Square has sent it and the bank hasn&apos;t posted it yet. Tap a payout
              to see exactly which payments, refunds and fees it contains. Processing fees are taken per payment; a
              transfer fee only appears on instant transfers.
            </>
          }
        >
          Payouts
        </RuledLabel>
        {failure && <SquareUnavailable failure={failure} what="payouts" />}
        <div className="ds-card overflow-hidden">
          {payouts.length === 0 ? (
            <EmptyState
              compact
              title={failure ? "Couldn't read Square just now" : "No payouts yet"}
              body={
                failure
                  ? "Payouts will list here once Square answers."
                  : sandbox
                    ? "Square's test mode doesn't make payouts — real payouts appear here once you're live."
                    : "Your first payout appears here once Square sends collected payments to your bank."
              }
            />
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                <div className="hidden lg:grid grid-cols-[110px_1fr_140px_110px_110px_28px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                  <span>Sent</span>
                  <span>To</span>
                  <span>Status</span>
                  <span className="text-right">Transfer fee</span>
                  <span className="text-right">Amount</span>
                  <span></span>
                </div>
                {payouts.map((p) => {
                  const s = payoutStatus(p.status);
                  return (
                    <Link
                      key={p.id}
                      prefetch={false}
                      href={`/app/payments?tab=payouts&payout=${encodeURIComponent(p.id)}`}
                      className="flex lg:grid lg:grid-cols-[110px_1fr_140px_110px_110px_28px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <span className="text-sm text-gray-500 w-20 lg:w-auto shrink-0">{shortDate(p.createdAt, tz)}</span>
                      <span className="flex-1 lg:flex-none min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{payoutDestinationLabel(p)}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {p.arrivalDate ? `Lands ${arrival(p)}` : ""}
                          <span className="lg:hidden">
                            {p.arrivalDate ? " · " : ""}
                            {s.label}
                          </span>
                        </span>
                      </span>
                      <span className="hidden lg:block">
                        <Chip tone={s.tone}>{s.label}</Chip>
                      </span>
                      <span className="numeral-ledger hidden lg:block text-sm text-gray-600 text-right">{p.feeCents ? money(p.feeCents / 100) : ""}</span>
                      <span className="numeral-ledger text-sm font-semibold text-gray-900 text-right">{money(p.amountCents / 100)}</span>
                      <ChevronRight size={14} className="hidden text-gray-400 lg:block" />
                    </Link>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[110px_1fr_140px_110px_110px_28px]">
                <span className="text-xs font-medium text-gray-500 lg:col-span-3">
                  {payouts.length} {payouts.length === 1 ? "payout" : "payouts"}
                  {totals.sent > 0 ? ` · ${money(totals.sent / 100)} on the way` : ""}
                </span>
                <span className="numeral-ledger hidden lg:block text-sm font-semibold text-gray-600 text-right">{totals.fees ? money(totals.fees / 100) : ""}</span>
                <span className="numeral-ledger text-sm font-bold text-right text-[color:var(--ds-ink)]">{money((totals.paid + totals.sent) / 100)}</span>
                <span className="hidden lg:block" />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mb-8">
        <RuledLabel info="These are settings on your Square account rather than records, so they open in Square's dashboard — same sign-in.">
          In Square
        </RuledLabel>
        <SquareLinkRows
          sandbox={sandbox}
          rows={[
            { screen: "instantTransfer", title: "Instant transfer", sub: "Send your balance to the bank now (Square charges a fee)" },
            { screen: "transferSchedule", title: "Deposit schedule", sub: "When Square pays out, and to which account" },
            { screen: "bankAccounts", title: "Bank accounts", sub: "Add or change the account payouts go to" },
          ]}
        />
      </div>
    </>
  );
}
