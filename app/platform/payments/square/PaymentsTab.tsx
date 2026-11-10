import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { isManager, type Actor } from "@/lib/permissions";
import { money, shortDate } from "@/lib/statuses";
import { isOnlinePayment } from "@/lib/payment-ref";
import { Chip } from "@/components/ds";
import EmptyState from "@/components/EmptyState";
import Pager from "@/components/Pager";
import { listHref } from "@/components/FilterBar";
import RefundAction from "../RefundAction";
import { SquareUnavailable } from "./bits";
import { paymentSourceLabel, squarePaymentStatus, squareProductLabel } from "./labels";
import type { SquareWindow } from "./data";

const PAGE_SIZE = 25;

type Tone = "primary" | "secondary" | "good" | "warn" | "bad" | "neutral";

export type PaymentsFilter = "all" | "workbench" | "outside" | "refunded";
const FILTERS: { value: PaymentsFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "workbench", label: "Through WorkBench" },
  { value: "outside", label: "Outside WorkBench" },
  { value: "refunded", label: "Refunded" },
];
export function parsePaymentsFilter(v: string | undefined): PaymentsFilter {
  return FILTERS.some((f) => f.value === v) ? (v as PaymentsFilter) : "all";
}

/** One line of the table, from either side. */
type Txn = {
  key: string;
  at: Date;
  /** What it is worth now (after refunds), cents. */
  amountCents: number;
  refundedCents: number;
  status: { label: string; tone: Tone };
  who: string;
  sub: string;
  method: string;
  /** Where the row opens. */
  href: string;
  outside: boolean;
  /** Our Payment id when a manager may refund it here. */
  refundId: string | null;
  /** Outside sales: record it on an invoice, prefilled. */
  recordHref: string | null;
  receiptUrl: string | null;
};

function refundStatus(refundedCents: number, grossCents: number): { label: string; tone: Tone } | null {
  if (refundedCents <= 0) return null;
  return refundedCents >= grossCents ? { label: "Refunded", tone: "neutral" } : { label: "Partly refunded", tone: "warn" };
}

const COLS = "lg:grid-cols-[150px_minmax(0,1fr)_170px_110px_150px]";

/**
 * Payments tab (Square), one table like Stripe's (2026-11-10 redesign; it was
 * two — "Through WorkBench" and "Square · outside WorkBench"): WorkBench's
 * online payments with their LIVE Square status and fee, and every sale the
 * seller's Square account took elsewhere in the window, marked "Outside
 * WorkBench" with "Add to invoice" prefilled so the books match the bank.
 * All / Outside / Refunded cover the Square window; Through WorkBench pages
 * through every payment we ever took.
 */
export default async function PaymentsTab({
  companyId,
  actor,
  tz,
  page,
  filter,
  window: win,
  windowDays,
  keep,
}: {
  companyId: string;
  actor: Actor;
  tz: string;
  page: number;
  filter: PaymentsFilter;
  window: SquareWindow;
  windowDays: number;
  /** Query params the filter chips and pager carry (the volume range). */
  keep: Record<string, string | undefined>;
}) {
  const manager = isManager(actor.role);
  const from = new Date(Date.now() - windowDays * 86_400_000);
  const where =
    filter === "workbench"
      ? { companyId, processorRef: { not: null } }
      : { companyId, processorRef: { not: null }, paidAt: { gte: from } };
  const [ours, oursCount] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      ...(filter === "workbench" ? { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE } : {}),
      include: {
        invoice: { select: { id: true, invoiceNumber: true } },
        contact: { select: { firstName: true, lastName: true } },
        refunds: { select: { amount: true } },
      },
    }),
    filter === "workbench" ? prisma.payment.count({ where }) : Promise.resolve(0),
  ]);

  const oursTxns: Txn[] = ours.map((p) => {
    const live = p.processorRef ? win.byId.get(p.processorRef) : undefined;
    const amountCents = Math.round(Number(p.amount) * 100);
    const refundedCents = p.refunds.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
    const status: { label: string; tone: Tone } =
      refundStatus(refundedCents, amountCents + refundedCents) ?? (live ? squarePaymentStatus(live.status) : { label: "Paid", tone: "good" });
    return {
      key: p.id,
      at: p.paidAt,
      amountCents,
      refundedCents,
      status,
      who: p.contact ? `${p.contact.firstName} ${p.contact.lastName}`.trim() : "—",
      sub: p.invoice ? `Invoice #${p.invoice.invoiceNumber}` : "Payment",
      method: live ? paymentSourceLabel(live) : p.method === "ACH" ? "Bank" : "Card",
      href: live ? `/app/payments?payment=${encodeURIComponent(live.id)}` : `/app/invoices/${p.invoiceId}`,
      outside: false,
      refundId: manager && isOnlinePayment(p.processorRef) && amountCents > 0 ? p.id : null,
      recordHref: null,
      receiptUrl: live?.receiptUrl ?? null,
    };
  });

  const outsideTxns: Txn[] =
    filter === "workbench"
      ? []
      : win.outside.map((p) => {
          const net = p.totalCents - p.refundedCents;
          const day = new Date(p.createdAt).toLocaleDateString("en-CA", { timeZone: tz });
          const q = new URLSearchParams({
            amount: (net / 100).toFixed(2),
            paidAt: day,
            method: p.sourceType === "BANK_ACCOUNT" ? "ACH" : p.sourceType === "CASH" ? "CASH" : "CARD",
            reference: p.referenceId ?? p.id,
            square: p.id,
            note: `Square · ${squareProductLabel(p.squareProduct)}`,
          });
          return {
            key: `sq:${p.id}`,
            at: new Date(p.createdAt),
            amountCents: net,
            refundedCents: p.refundedCents,
            status: refundStatus(p.refundedCents, p.totalCents) ?? squarePaymentStatus(p.status),
            who: squareProductLabel(p.squareProduct),
            sub: p.note || p.referenceId || `Square ${p.id.slice(0, 8)}`,
            method: paymentSourceLabel(p),
            href: `/app/payments?payment=${encodeURIComponent(p.id)}`,
            outside: true,
            refundId: null,
            recordHref: `/app/payments/new?${q.toString()}`,
            receiptUrl: p.receiptUrl,
          };
        });

  let rows: Txn[];
  let total: number;
  if (filter === "workbench") {
    rows = oursTxns;
    total = oursCount;
  } else {
    let all = [...oursTxns, ...outsideTxns].sort((a, b) => b.at.getTime() - a.at.getTime());
    if (filter === "outside") all = all.filter((t) => t.outside);
    if (filter === "refunded") all = all.filter((t) => t.refundedCents > 0);
    total = all.length;
    rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }
  const outsideCount = outsideTxns.length;

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Show" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const active = f.value === filter;
            return (
              <Link
                key={f.value}
                prefetch={false}
                scroll={false}
                href={listHref("/app/payments", {}, { ...keep, show: f.value === "all" ? undefined : f.value })}
                aria-current={active ? "true" : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-ink)]"
                    : "border-[color:var(--ds-line-strong)] text-[color:var(--ds-muted)] hover:text-[color:var(--ds-ink)]"
                }`}
              >
                {f.label}
                {f.value === "outside" && outsideCount > 0 && <span className="ml-1 text-[color:var(--ds-muted)]">{outsideCount}</span>}
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-[color:var(--ds-muted)]">{filter === "workbench" ? "Every payment through WorkBench" : `Last ${windowDays} days`}</p>
      </div>

      {win.failure && filter !== "workbench" && <SquareUnavailable failure={win.failure} what="sales taken outside WorkBench" />}

      <div className="ds-card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            art="invoices"
            hue="var(--ds-primary)"
            title={filter === "refunded" ? "No refunds" : filter === "outside" ? "Nothing taken outside WorkBench" : "No payments yet"}
            body={
              filter === "outside"
                ? "Sales from the Square POS app, Square Online or a reader show here so you can put them on an invoice."
                : "When a client pays from their pay link, a saved card or Tap to Pay, it shows here with its live Square status."
            }
            showPlusIcon={false}
          />
        ) : (
          <div className="divide-y divide-[color:var(--ds-line)]">
            <div className={`hidden ${COLS} gap-4 bg-[color:var(--ds-surface-2)] px-4 py-2 text-xs font-medium text-[color:var(--ds-muted)] lg:grid`}>
              <span>Amount</span>
              <span>Description</span>
              <span>Method</span>
              <span>Date</span>
              <span />
            </div>
            {rows.map((t) => (
              <div
                key={t.key}
                className={`relative flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-[color:var(--ds-surface-2)] lg:grid ${COLS} lg:gap-4 lg:py-2.5`}
              >
                {/* Amount + status: first on a desk (Stripe's order), at the right on a phone. */}
                <div className="order-2 ml-auto flex shrink-0 flex-col items-end gap-1 lg:order-none lg:ml-0 lg:flex-row lg:items-center lg:gap-2">
                  <span className="numeral-ledger text-sm font-semibold text-[color:var(--ds-ink)]">{money(t.amountCents / 100)}</span>
                  <Chip tone={t.status.tone}>{t.status.label}</Chip>
                </div>
                <div className="order-1 min-w-0 flex-1 lg:order-none">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-[color:var(--ds-ink)]">
                    {/* The whole row opens the detail (stretched link); the actions sit above it. */}
                    <Link prefetch={false} href={t.href} className="truncate after:absolute after:inset-0 after:content-['']">
                      {t.who}
                    </Link>
                    {t.outside && <span className="shrink-0 text-[11px] font-normal text-[color:var(--ds-muted)]">Outside WorkBench</span>}
                  </p>
                  <p className="truncate text-xs text-[color:var(--ds-muted)]">
                    {t.sub}
                    <span className="lg:hidden">
                      {" · "}
                      {t.method} · {shortDate(t.at, tz)}
                    </span>
                    {t.receiptUrl && (
                      <span className="relative z-10 hidden lg:inline">
                        {" · "}
                        <a href={t.receiptUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--ds-ink)] hover:underline">
                          Receipt
                        </a>
                      </span>
                    )}
                  </p>
                </div>
                <span className="hidden truncate text-sm text-[color:var(--ds-muted)] lg:block">{t.method}</span>
                <span className="hidden text-sm text-[color:var(--ds-muted)] lg:block">{shortDate(t.at, tz)}</span>
                <span
                  className={`relative z-10 order-3 items-center justify-end gap-1 lg:order-none lg:flex ${
                    t.recordHref ? "flex w-full lg:w-auto" : t.refundId ? "flex" : "hidden"
                  }`}
                >
                  {t.refundId && <RefundAction paymentId={t.refundId} amount={t.amountCents / 100} />}
                  {t.recordHref && (
                    <Link prefetch={false} href={t.recordHref} className="ds-btn ds-btn-outline ds-btn-sm" title="Record this sale on the invoice it paid">
                      <Plus size={13} />
                      Add to invoice
                    </Link>
                  )}
                  <ChevronRight size={14} className="hidden shrink-0 text-[color:var(--ds-faint)] lg:block" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <Pager basePath="/app/payments" params={{ ...keep, show: filter === "all" ? undefined : filter }} page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
