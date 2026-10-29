import { prisma } from "@/lib/db";
import { estimateFeeCents } from "@/lib/payments";
import { jobTypeOf, type ReportRow } from "@/lib/payments-reports";
import { isWorkBenchPayment, listSquarePayments, type SellerPayment, type SellerReadFailure } from "@/lib/square-seller-reports";

/**
 * Loaders shared by the Square tabs on /app/payments and the reports API
 * route: our Payment rows plus the Square-side payments the seller took
 * outside WorkBench, shaped for lib/payments-reports. Server only.
 */

/** Pages of ListPayments we are willing to walk for one window (100 each). */
const MAX_SQUARE_PAGES = 5;

export type SquareWindow = {
  /** Every Square payment in the window (all products), newest first. */
  payments: SellerPayment[];
  /** By Square payment id. */
  byId: Map<string, SellerPayment>;
  /** Those WorkBench did NOT take (POS / Square Online / Invoices …), successful only. */
  outside: SellerPayment[];
  /** More pages existed than we walked. */
  truncated: boolean;
  /** When Square couldn't be read — the page renders from our rows alone. */
  failure: SellerReadFailure | null;
};

/**
 * Walk ListPayments over [from, to) and split WorkBench's charges from the
 * seller's other sales. `recordedIds` = Square ids our Payment rows carry as
 * processorRef (Tap to Pay and older rows may lack our application id).
 */
export async function loadSquareWindow(companyId: string, from: Date, to: Date): Promise<SquareWindow> {
  const payments: SellerPayment[] = [];
  let cursor: string | null = null;
  let truncated = false;
  let failure: SellerReadFailure | null = null;
  for (let page = 0; page < MAX_SQUARE_PAGES; page++) {
    const read = await listSquarePayments(companyId, { beginTime: from, endTime: to, cursor });
    if (!read.ok) {
      failure = read;
      break;
    }
    payments.push(...read.data.payments);
    cursor = read.data.cursor;
    if (!cursor) break;
    if (page === MAX_SQUARE_PAGES - 1) truncated = true;
  }
  const ids = payments.map((p) => p.id);
  const recorded = ids.length
    ? await prisma.payment.findMany({ where: { companyId, processorRef: { in: ids } }, select: { processorRef: true } })
    : [];
  const recordedIds = new Set(recorded.map((r) => r.processorRef as string));
  const outside = payments.filter((p) => !isWorkBenchPayment(p, recordedIds) && p.status === "COMPLETED");
  return { payments, byId: new Map(payments.map((p) => [p.id, p])), outside, truncated, failure };
}

const PAYMENT_REPORT_SELECT = {
  id: true,
  paidAt: true,
  amount: true,
  method: true,
  processorRef: true,
  feeCents: true,
  refunds: { select: { amount: true } },
  invoice: {
    select: {
      job: {
        select: {
          title: true,
          lineItems: { select: { name: true, workItemId: true } },
          assignments: { select: { user: { select: { name: true } } } },
        },
      },
    },
  },
} as const;

/**
 * Report rows for [from, to): every WorkBench payment (any method — a cash
 * payment is still money collected; fee 0) with the processor fee Square
 * actually posted when we can see it, plus the seller's outside Square sales.
 */
export async function loadReportRows(companyId: string, from: Date, to: Date, square?: SquareWindow): Promise<{ rows: ReportRow[]; square: SquareWindow }> {
  const [ours, win] = await Promise.all([
    prisma.payment.findMany({ where: { companyId, paidAt: { gte: from, lt: to } }, select: PAYMENT_REPORT_SELECT, orderBy: { paidAt: "desc" } }),
    square ? Promise.resolve(square) : loadSquareWindow(companyId, from, to),
  ]);
  const rows: ReportRow[] = ours.map((p) => {
    const amountCents = Math.round(Number(p.amount) * 100);
    const refundedCents = p.refunds.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
    const processor = p.processorRef != null && (p.method === "CARD" || p.method === "ACH");
    const live = p.processorRef ? win.byId.get(p.processorRef) : undefined;
    const feeCents = live && live.feeCents > 0 ? live.feeCents : processor ? (p.feeCents ?? estimateFeeCents(amountCents + refundedCents, p.method as "CARD" | "ACH")) : 0;
    return {
      id: p.id,
      paidAt: p.paidAt,
      amountCents,
      refundedCents,
      feeCents,
      method: p.method === "CARD" ? "CARD" : p.method === "ACH" ? "ACH" : "OTHER",
      source: "workbench",
      techs: p.invoice?.job?.assignments.map((a) => a.user.name).filter(Boolean) ?? [],
      jobType: jobTypeOf(p.invoice?.job),
    };
  });
  for (const o of win.outside) {
    rows.push({
      id: `sq:${o.id}`,
      paidAt: new Date(o.createdAt),
      amountCents: o.totalCents - o.refundedCents,
      refundedCents: o.refundedCents,
      feeCents: o.feeCents,
      method: o.sourceType === "BANK_ACCOUNT" ? "ACH" : o.sourceType === "CARD" ? "CARD" : "OTHER",
      source: "square",
      techs: [],
      jobType: null,
    });
  }
  return { rows, square: win };
}
