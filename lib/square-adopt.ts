import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { logActivity } from "@/lib/activity";
import { acquireChargeLock, invoiceBalance, recordPayment, releaseChargeLock } from "@/lib/payments";
import { listSquarePayments, type SellerPayment } from "@/lib/square-seller-reports";

/**
 * Square payments that moved money for a WorkBench invoice but never got a
 * Payment row (readiness review 2026-11-02, findings B4 / #4 / #7).
 *
 * Every charge WorkBench starts tags the Square payment with the invoice id
 * as `reference_id` (the pay page, card on file, Tap to Pay). Normally the
 * same request then records it. When that recording fails — the DB write
 * throws after Square said yes, the phone app's record call dies after the
 * card was tapped, a timeout after Square actually processed it — the money
 * is real and the invoice still shows it as owed. Two catchers:
 *   - the Square webhook (`payment.updated` COMPLETED) adopts a payment it
 *     has no row for (`adoptSquarePayment`);
 *   - the nightly reconcile walks the last two days of every connected
 *     seller's ListPayments (`adoptUnrecordedSquarePayments`).
 * Both take the invoice's charge lock, so a request still mid-record is left
 * alone (it holds the lock) and no payment is ever recorded twice (the row
 * check happens under the lock).
 */

export type AdoptOutcome = "adopted" | "already" | "busy" | "no_invoice" | "not_ours" | "skipped";

const ADOPT_WINDOW_MS = 2 * 86_400_000;

/** The invoice a Square payment was taken for, from its reference_id. */
function invoiceIdFromReference(referenceId: string | null | undefined): string | null {
  if (!referenceId) return null;
  // cuid / cuid2 invoice ids; the gift-card flows use "inv-<number>" and are
  // not adopted (they record their own rows and are test-only)
  return /^c[a-z0-9]{20,}$/i.test(referenceId) ? referenceId : null;
}

export async function adoptSquarePayment(params: {
  companyId: string;
  payment: Pick<SellerPayment, "id" | "status" | "totalCents" | "amountCents" | "referenceId" | "sourceType" | "cardBrand" | "createdAt">;
  source: "webhook" | "reconcile";
}): Promise<AdoptOutcome> {
  const p = params.payment;
  if (p.status !== "COMPLETED") return "skipped";
  const invoiceId = invoiceIdFromReference(p.referenceId);
  if (!invoiceId) return "not_ours";

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: params.companyId },
    select: { id: true, invoiceNumber: true, status: true, total: true, payments: { select: { amount: true, surchargeAmount: true, processorRef: true } } },
  });
  if (!invoice) return "no_invoice";
  if (invoice.payments.some((row) => row.processorRef === p.id)) return "already";

  // A request may still be recording this very payment — it holds the lock
  if (!(await acquireChargeLock(invoice.id))) return "busy";
  try {
    const fresh = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { status: true, total: true, payments: { select: { amount: true, surchargeAmount: true, processorRef: true } } },
    });
    if (fresh.payments.some((row) => row.processorRef === p.id)) return "already";

    const amount = p.totalCents / 100;
    // The charge was balance + the client service fee; whatever exceeds the
    // balance still open is the fee (0 when the fee was off or balance moved)
    const balance = Math.max(0, invoiceBalance(fresh));
    const surcharge = Math.max(0, Math.round((amount - balance) * 100) / 100);
    const method = p.sourceType === "BANK_ACCOUNT" ? "ACH" : "CARD";
    await recordPayment({
      companyId: params.companyId,
      invoiceId: invoice.id,
      amount,
      method,
      processorRef: p.id,
      surchargeAmount: surcharge > 0 && surcharge < amount ? surcharge : null,
      cardBrand: p.cardBrand,
      details: params.source === "webhook" ? "Online payment (matched from Square)" : "Online payment (matched from Square by the nightly check)",
      paidAt: p.createdAt ? new Date(p.createdAt) : undefined,
    });
    logActivity({
      companyId: params.companyId,
      userName: "Square",
      entityType: "invoice",
      entityId: invoice.id,
      action: "payment_matched",
      detail: `$${amount.toFixed(2)} Square payment ${p.id} matched to invoice #${invoice.invoiceNumber} (${params.source}) — it had been taken but not recorded`,
    });
    return "adopted";
  } finally {
    await releaseChargeLock(invoice.id);
  }
}

/**
 * Nightly: every connected seller's COMPLETED payments of the last two days
 * that reference one of its invoices and have no row. Returns what it did,
 * for the reconcile report.
 */
export async function adoptUnrecordedSquarePayments(now: Date = new Date()): Promise<{ checked: number; adopted: { companyId: string; invoiceId: string; paymentId: string; amountCents: number }[]; companies: number }> {
  const companies = await prisma.company.findMany({
    where: { squareConnection: { isNot: null }, squareConnectedAt: { not: null }, suspendedAt: null },
    select: { id: true },
  });
  const out = { checked: 0, adopted: [] as { companyId: string; invoiceId: string; paymentId: string; amountCents: number }[], companies: companies.length };
  const begin = new Date(now.getTime() - ADOPT_WINDOW_MS);
  for (const c of companies) {
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const read = await listSquarePayments(c.id, { beginTime: begin, endTime: now, cursor });
      if (!read.ok) {
        if (!read.transient && !read.missingScopes && !read.notConnected) reportError("[square-adopt] list failed", c.id, read.message);
        break;
      }
      for (const p of read.data.payments) {
        out.checked++;
        try {
          const r = await adoptSquarePayment({ companyId: c.id, payment: p, source: "reconcile" });
          if (r === "adopted") out.adopted.push({ companyId: c.id, invoiceId: p.referenceId as string, paymentId: p.id, amountCents: p.totalCents });
        } catch (err) {
          reportError("[square-adopt] adopt failed", c.id, p.id, err);
        }
      }
      cursor = read.data.cursor;
      if (!cursor) break;
    }
  }
  return out;
}
