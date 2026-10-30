import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { isManager, type Actor } from "@/lib/permissions";
import { money, shortDate } from "@/lib/statuses";
import { isOnlinePayment } from "@/lib/payment-ref";
import { Chip } from "@/components/ds";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";
import RefundAction from "../RefundAction";
import { RuledLabel, SquareUnavailable } from "./bits";
import { paymentSourceLabel, squarePaymentStatus, squareProductLabel } from "./labels";
import type { SquareWindow } from "./data";

const PAGE_SIZE = 25;

/**
 * Payments tab (Square): WorkBench's own online payments with their LIVE
 * Square status and the fee Square posted, then every sale the seller's
 * Square account took outside WorkBench in the last 90 days — marked, with
 * "Record on an invoice" prefilled so the books match the bank.
 */
export default async function PaymentsTab({
  companyId,
  actor,
  tz,
  page,
  window: win,
  windowDays,
}: {
  companyId: string;
  actor: Actor;
  tz: string;
  page: number;
  window: SquareWindow;
  windowDays: number;
}) {
  const where = { companyId, processorRef: { not: null } };
  const [payments, paymentsCount] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        invoice: { select: { id: true, invoiceNumber: true } },
        contact: { select: { firstName: true, lastName: true } },
        refunds: { select: { id: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  const pageTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const manager = isManager(actor.role);

  const stamp = (ref: string | null) => {
    const live = ref ? win.byId.get(ref) : undefined;
    if (!live) return <span className="hidden lg:block" />;
    const s = squarePaymentStatus(live.status);
    return (
      <span>
        <Chip tone={s.tone}>{s.label}</Chip>
      </span>
    );
  };
  const feeOf = (ref: string | null, feeCents: number | null) => {
    const live = ref ? win.byId.get(ref) : undefined;
    const cents = live && live.feeCents > 0 ? live.feeCents : feeCents;
    return cents != null && cents > 0 ? money(cents / 100) : "";
  };

  const outside = win.outside;
  const outsideTotal = outside.reduce((s, p) => s + (p.totalCents - p.refundedCents), 0) / 100;

  return (
    <>
      <div className="mb-8">
        <RuledLabel
          info={
            <>
              Payments clients made through WorkBench — pay links, saved cards, Tap to Pay. Status and fee come from
              Square as it sees them right now; a fee shows once Square posts it, usually within a day.
            </>
          }
        >
          Through WorkBench
        </RuledLabel>
        <div className="ds-card overflow-hidden">
          {payments.length === 0 ? (
            <EmptyState
              art="invoices"
              hue="var(--ds-primary)"
              title="No online payments yet"
              body="When a client pays an invoice from their pay link, it shows up here with its live Square status."
              showPlusIcon={false}
            />
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                <div className="hidden lg:grid grid-cols-[110px_1fr_90px_130px_90px_110px_56px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                  <span>Date</span>
                  <span>Client</span>
                  <span>Method</span>
                  <span>Status</span>
                  <span className="text-right">Fee</span>
                  <span className="text-right">Amount</span>
                  <span></span>
                </div>
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="relative flex lg:grid lg:grid-cols-[110px_1fr_90px_130px_90px_110px_56px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    {/* The whole row opens the invoice (stretched link); the actions at the end sit above it. */}
                    <span className="text-sm text-gray-500 w-20 lg:w-auto shrink-0">{shortDate(p.paidAt, tz)}</span>
                    <div className="flex-1 lg:flex-none min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        <Link prefetch={false} href={`/app/invoices/${p.invoiceId}`} className="after:absolute after:inset-0 after:content-['']">
                          {p.contact ? `${p.contact.firstName} ${p.contact.lastName}` : "—"}
                        </Link>
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        Invoice #{p.invoice?.invoiceNumber}
                        <span className="lg:hidden"> · {p.method === "ACH" ? "Bank" : "Card"}</span>
                        {p.refunds.length > 0 && <span className="text-[color:var(--ds-warn)]"> · refunded</span>}
                      </p>
                    </div>
                    <span className="hidden lg:block text-sm text-gray-500">{p.method === "ACH" ? "Bank" : "Card"}</span>
                    {stamp(p.processorRef)}
                    <span className="numeral-ledger hidden lg:block text-sm text-gray-500 text-right">{feeOf(p.processorRef, p.feeCents)}</span>
                    <span className="numeral-ledger text-sm font-semibold text-gray-900 text-right">{money(Number(p.amount))}</span>
                    <span className="relative z-10 flex shrink-0 items-center justify-end gap-0.5">
                      {manager && isOnlinePayment(p.processorRef) && Number(p.amount) > 0 && (
                        <RefundAction paymentId={p.id} amount={Number(p.amount)} />
                      )}
                      {p.processorRef && win.byId.has(p.processorRef) && (
                        <Link
                          prefetch={false}
                          href={`/app/payments?payment=${encodeURIComponent(p.processorRef)}`}
                          className="text-xs font-medium text-gray-500 hover:text-gray-700 px-1"
                          title="Square's detail: fee, receipt, refunds"
                        >
                          Details
                        </Link>
                      )}
                      <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[110px_1fr_90px_130px_90px_110px_56px]">
                <span className="text-xs font-medium text-gray-500 lg:col-span-5">
                  {payments.length} {payments.length === 1 ? "payment" : "payments"}
                </span>
                <span className="numeral-ledger text-sm font-bold text-gray-900 text-right">{money(pageTotal)}</span>
                <span className="hidden lg:block" />
              </div>
            </>
          )}
        </div>
        <Pager basePath="/app/payments" page={page} pageSize={PAGE_SIZE} total={paymentsCount} />
      </div>

      <div className="mb-8">
        <RuledLabel
          info={
            <>
              Sales your Square account took somewhere other than WorkBench — the Square POS app, Square Online,
              Square Invoices, a reader — in the last {windowDays} days. They are already in your bank, but not on an
              invoice here. Record each one on the invoice it paid so the client&apos;s balance and your reports are
              right; the amount, date and Square reference are filled in for you.
            </>
          }
        >
          Square · outside WorkBench
        </RuledLabel>
        {win.failure && <SquareUnavailable failure={win.failure} what="these sales" />}
        <div className="ds-card overflow-hidden">
          {outside.length === 0 ? (
            <EmptyState
              compact
              title={win.failure ? "Couldn't read Square just now" : "Nothing taken outside WorkBench"}
              body={
                win.failure
                  ? "Sales from the Square POS app or Square Online will list here once Square answers."
                  : `Every Square sale in the last ${windowDays} days came through WorkBench.`
              }
            />
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                <div className="hidden lg:grid grid-cols-[110px_1fr_150px_90px_110px_170px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                  <span>Date</span>
                  <span>Taken with</span>
                  <span>Method</span>
                  <span className="text-right">Fee</span>
                  <span className="text-right">Amount</span>
                  <span></span>
                </div>
                {outside.map((p) => {
                  const net = (p.totalCents - p.refundedCents) / 100;
                  const day = new Date(p.createdAt).toLocaleDateString("en-CA", { timeZone: tz });
                  const q = new URLSearchParams({
                    amount: net.toFixed(2),
                    paidAt: day,
                    method: p.sourceType === "BANK_ACCOUNT" ? "ACH" : p.sourceType === "CASH" ? "CASH" : "CARD",
                    reference: p.referenceId ?? p.id,
                    note: `Square · ${squareProductLabel(p.squareProduct)}`,
                  });
                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap lg:grid lg:grid-cols-[110px_1fr_150px_90px_110px_170px] gap-x-4 gap-y-1.5 items-center px-4 py-2.5"
                    >
                      <span className="text-sm text-gray-500 w-20 lg:w-auto shrink-0">{shortDate(p.createdAt, tz)}</span>
                      <div className="flex-1 lg:flex-none min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-gray-900 truncate">
                          <Link prefetch={false} href={`/app/payments?payment=${encodeURIComponent(p.id)}`} className="hover:underline" title="Items, fee, receipt">
                            {squareProductLabel(p.squareProduct)}
                          </Link>
                          <Chip tone="secondary">Outside WorkBench</Chip>
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {p.note || p.referenceId || `Square ${p.id.slice(0, 8)}`}
                          <span className="lg:hidden"> · {paymentSourceLabel(p)}</span>
                          {p.refundedCents > 0 && <span className="text-[color:var(--ds-warn)]"> · {money(p.refundedCents / 100)} refunded</span>}
                        </p>
                      </div>
                      <span className="hidden lg:block text-sm text-gray-500 truncate">{paymentSourceLabel(p)}</span>
                      <span className="numeral-ledger hidden lg:block text-sm text-gray-500 text-right">
                        {p.feeCents > 0 ? money(p.feeCents / 100) : ""}
                      </span>
                      <span className="numeral-ledger text-sm font-semibold text-gray-900 text-right">{money(net)}</span>
                      <span className="flex w-full lg:w-auto items-center justify-end gap-2">
                        {p.receiptUrl && (
                          <a
                            href={p.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden lg:inline text-xs font-medium text-gray-500 hover:text-gray-700"
                          >
                            Receipt
                          </a>
                        )}
                        <Link prefetch={false} href={`/app/payments/new?${q.toString()}`} className="ds-btn ds-btn-outline ds-btn-sm">
                          <Plus size={13} />
                          Record on an invoice
                        </Link>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:grid-cols-[110px_1fr_150px_90px_110px_170px]">
                <span className="text-xs font-medium text-gray-500 lg:col-span-4">
                  {outside.length} {outside.length === 1 ? "sale" : "sales"}
                  {win.truncated ? " · showing the most recent" : ""}
                </span>
                <span className="numeral-ledger text-sm font-bold text-gray-900 text-right">{money(outsideTotal)}</span>
                <span className="hidden lg:block" />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
