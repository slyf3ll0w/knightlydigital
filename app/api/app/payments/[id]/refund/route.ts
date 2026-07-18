import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { recomputeInvoiceStatus } from "@/lib/payments";
import { reverseTransfer, toCents, FinixError } from "@/lib/finix";

/**
 * POST — refund an online (Finix) payment, full or partial. Managers only.
 *
 * This actually moves money back (a Finix reversal), then applies the same
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
  });
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
  if (!payment.processorRef?.startsWith("TR")) {
    return NextResponse.json(
      { error: "This payment wasn't processed online — edit or delete the record instead." },
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

  try {
    const reversal = await reverseTransfer({
      transferId: payment.processorRef,
      refundCents: toCents(refundAmount),
    });

    const note = `Refunded $${refundAmount.toFixed(2)} (${reversal.id})`;
    const remaining = Math.round((paymentAmount - refundAmount) * 100) / 100;

    const updated = await prisma.$transaction(async (tx) => {
      // Full refund keeps the row (audit trail of the charge + reversal ids)
      // with the amount zeroed out — deleting would erase that history.
      const p = await tx.payment.update({
        where: { id },
        data: {
          amount: remaining,
          details: payment.details ? `${payment.details} · ${note}` : note,
        },
      });
      await recomputeInvoiceStatus(tx, payment.invoiceId);
      return p;
    });

    return NextResponse.json({ success: true, payment: updated, reversalId: reversal.id });
  } catch (err) {
    console.error("[payments] refund failed", err);
    const message =
      err instanceof FinixError
        ? `Refund failed: ${err.message}`
        : "Refund failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
