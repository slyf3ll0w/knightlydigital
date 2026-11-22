import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { getProcessor, recomputeInvoiceStatus, estimateFeeCents, refundSplit } from "@/lib/payments";
import { estimateProcessingCostCents } from "@/lib/platform-costs";
import { reverseTransfer, toCents, FinixError } from "@/lib/finix";
import { refundSquarePayment, SquareError } from "@/lib/square";
import { squareTokenForMerchant } from "@/lib/square-connection";
import { queueQuickBooksPaymentRefresh } from "@/lib/quickbooks";
import { logActivity } from "@/lib/activity";
import { fireAutomations } from "@/lib/automations-server";
import { isFinixPayment } from "@/lib/payment-ref";

/**
 * POST — refund an online payment (Finix or Square), full or partial.
 * Managers only.
 *
 * This actually moves money back (a Finix reversal / a Square refund under
 * the seller's own token), then applies the same
 * bookkeeping as a manual correction: the Payment row's amount drops by the
 * refund and the invoice status is recomputed. Manually-recorded payments
 * (cash/check/Zelle…) have no processor to reverse — correct those by editing
 * the payment instead.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const payment = await prisma.payment.findFirst({
    where: { id, companyId: actor.companyId },
    include: { company: { select: { squareMerchantId: true, squareConnectedAt: true } } },
  });
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  // Which processor ran the charge: Finix transfers are TR…; anything else
  // with a processorRef came through Square (a Square payment id).
  const viaFinix = isFinixPayment(payment.processorRef);
  const viaSquare = Boolean(payment.processorRef) && !viaFinix && getProcessor().name === "square";
  if (!payment.processorRef || (!viaFinix && !viaSquare)) {
    return NextResponse.json(
      { error: "This payment wasn't processed online — edit or delete the record instead." },
      { status: 400 }
    );
  }
  if (viaSquare && (!payment.company.squareMerchantId || !payment.company.squareConnectedAt)) {
    return NextResponse.json(
      { error: "Square isn't connected, so this payment can't be refunded from here. Reconnect Square in Settings or refund it from your Square dashboard." },
      { status: 400 }
    );
  }

  const paymentAmount = Number(payment.amount);
  const refundAmount =
    body.amount === undefined ? paymentAmount : Math.round(Number(body.amount) * 100) / 100;
  if (!refundAmount || refundAmount <= 0) {
    return NextResponse.json({ error: "Refund amount must be greater than zero." }, { status: 400 });
  }
  if (refundAmount > paymentAmount + 0.005) {
    return NextResponse.json(
      { error: `Refund can't exceed the $${paymentAmount.toFixed(2)} payment.` },
      { status: 400 }
    );
  }

  // The surcharge shrinks with the principal (zero on a full refund) — the
  // invoice balance adds every surcharge back on top of the total, so leaving
  // it alone would keep the client owing the refunded surcharge.
  const split = refundSplit(payment, refundAmount);
  const remaining = split.remainingAmount;

  // Reserve the refund atomically before touching the processor: the update
  // only lands if the amount is still what we validated against, so a
  // concurrent refund of the same payment loses the race and gets a 409.
  const reserved = await prisma.payment.updateMany({
    where: { id, companyId: actor.companyId, amount: payment.amount },
    data: { amount: remaining, surchargeAmount: split.remainingSurcharge },
  });
  if (reserved.count === 0) {
    return NextResponse.json(
      { error: "This payment just changed — reload and try again." },
      { status: 409 }
    );
  }

  try {
    let reversal: { id: string };
    if (viaSquare) {
      const { token } = await squareTokenForMerchant(payment.company.squareMerchantId!);
      const refund = await refundSquarePayment({
        token,
        // One refund per payment+amount+minute — a double-click can't refund twice
        idempotencyKey: `refund-${id}-${toCents(refundAmount)}-${Math.floor(Date.now() / 60000)}`,
        paymentId: payment.processorRef,
        amountCents: toCents(refundAmount),
        reason: typeof body.reason === "string" ? body.reason : null,
      });
      if (refund.status === "REJECTED" || refund.status === "FAILED") {
        throw new Error(`Square rejected the refund (${refund.status}).`);
      }
      reversal = { id: refund.id };
    } else {
      reversal = await reverseTransfer({
        transferId: payment.processorRef,
        refundCents: toCents(refundAmount),
      });
    }

    const note = `Refunded $${refundAmount.toFixed(2)} (${reversal.id})`;

    // The platform-economics estimates track the money still held, so they
    // shrink with the refund (0 once fully refunded). Settlements and the
    // monthly FinixCostSnapshot true-up carry the real numbers.
    const remainingCents = Math.round(remaining * 100);
    const method = payment.method === "ACH" ? "ACH" : "CARD";
    const feeCents =
      payment.feeCents == null
        ? undefined
        : remainingCents === 0
          ? 0
          : estimateFeeCents(remainingCents, method);
    const estCostCents =
      payment.estCostCents == null
        ? undefined
        : remainingCents === 0
          ? 0
          : estimateProcessingCostCents({
              amountCents: remainingCents,
              method,
              cardBrand: payment.cardBrand,
              cardType: payment.cardType,
            });

    const updated = await prisma.$transaction(async (tx) => {
      // Full refund keeps the row (audit trail of the charge + reversal ids)
      // with the amount zeroed out — deleting would erase that history.
      const p = await tx.payment.update({
        where: { id },
        data: {
          details: payment.details ? `${payment.details} · ${note}` : note,
          ...(feeCents !== undefined ? { feeCents } : {}),
          ...(estCostCents !== undefined ? { estCostCents } : {}),
        },
      });
      // The durable refund record — the amount decrement above is what every
      // balance computation reads, but this row is what reporting queries and
      // the webhook's failed-reversal unwind key off.
      await tx.refund.create({
        data: {
          companyId: actor.companyId,
          paymentId: id,
          amount: refundAmount,
          surchargeAmount: split.refundedSurcharge > 0 ? split.refundedSurcharge : null,
          reversalRef: reversal.id,
        },
      });
      await recomputeInvoiceStatus(tx, payment.invoiceId);
      return p;
    });

    fireAutomations(actor.companyId, "payment.refunded", id);

    // QuickBooks still has the pre-refund amount. Payments carry no updatedAt,
    // so the nightly sweep can't spot this on its own — push the corrected
    // amount now (or remove the payment entirely if it refunded to zero).
    queueQuickBooksPaymentRefresh({ companyId: actor.companyId, paymentId: id });

    logActivity({
      companyId: actor.companyId,
      userId: actor.id,
      userName: actor.name,
      entityType: "invoice",
      entityId: payment.invoiceId,
      action: "refund",
      detail: `$${refundAmount.toFixed(2)} refunded (${reversal.id})`,
    });

    return NextResponse.json({ success: true, payment: updated, reversalId: reversal.id });
  } catch (err) {
    await prisma.payment
      .update({
        where: { id },
        data: { amount: payment.amount, surchargeAmount: payment.surchargeAmount },
      })
      .catch((restoreErr) => {
        reportError("[payments] refund reservation rollback failed", restoreErr);
      });
    reportError("[payments] refund failed", err);
    const message =
      err instanceof FinixError || err instanceof SquareError
        ? `Refund failed: ${err.message}`
        : "Refund failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 424 });
  }
}
