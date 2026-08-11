import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, isManager, viaContactScope } from "@/lib/permissions";
import { recomputeInvoiceStatus } from "@/lib/payments";
import { queueQuickBooksUnwind } from "@/lib/quickbooks";
import { logActivity } from "@/lib/activity";

const validMethods = [
  "CARD", "ACH", "CASH", "CHECK", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER",
];

/** PATCH — correct a recorded payment (amount, method, date, reference, details). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const payment = await prisma.payment.findFirst({
    where: { id, companyId: actor.companyId, invoice: { ...viaContactScope(actor) } },
  });
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  if (
    payment.processorRef?.startsWith("TR") &&
    (body.amount !== undefined || body.method !== undefined || body.paidAt !== undefined)
  ) {
    return NextResponse.json(
      { error: "This payment was processed online — issue a refund instead of editing it." },
      { status: 400 }
    );
  }

  let amount: number | undefined;
  if (body.amount !== undefined) {
    amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
    }
  }
  if (body.method !== undefined && !validMethods.includes(body.method)) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  const paidAt = body.paidAt
    ? new Date(body.paidAt.length === 10 ? `${body.paidAt}T12:00:00` : body.paidAt)
    : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount }),
        ...(body.method !== undefined && { method: body.method as PaymentMethod }),
        ...(paidAt !== undefined && { paidAt }),
        ...(body.referenceNumber !== undefined && {
          referenceNumber: body.referenceNumber || null,
        }),
        ...(body.details !== undefined && { details: body.details || null }),
      },
    });
    await recomputeInvoiceStatus(tx, payment.invoiceId);
    return p;
  });

  logActivity({
    companyId: actor.companyId,
    userId: actor.id,
    userName: actor.name,
    entityType: "invoice",
    entityId: payment.invoiceId,
    action: "payment_edited",
    detail:
      amount !== undefined && amount !== Number(payment.amount)
        ? `$${Number(payment.amount).toFixed(2)} → $${amount.toFixed(2)}`
        : "Payment details corrected",
  });

  return NextResponse.json(updated);
}

/** DELETE — remove a payment record entirely (managers only; changes revenue history). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const payment = await prisma.payment.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });

  // An online payment still holding money is real money that already moved.
  // Deleting the row doesn't give it back — it just erases the charge id we'd
  // need to reconcile against the processor, and leaves the client charged
  // with nothing on the invoice to show for it. PATCH already refuses to edit
  // these for the same reason; refund is the path that actually returns money.
  // A fully-refunded row (amount zeroed by the refund) is only bookkeeping at
  // that point, so a manager may still clear it.
  if (payment.processorRef?.startsWith("TR") && Number(payment.amount) > 0.005) {
    return NextResponse.json(
      {
        error:
          "This payment was processed online — refund it instead of deleting it. Deleting the record wouldn't return the client's money.",
      },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id } });
    await recomputeInvoiceStatus(tx, payment.invoiceId);
  });

  // The money is off the books here, so take it off the books in QuickBooks
  // too — otherwise QBO keeps showing the invoice paid.
  queueQuickBooksUnwind({ companyId: actor.companyId, entityType: "PAYMENT", localId: id });

  logActivity({
    companyId: actor.companyId,
    userId: actor.id,
    userName: actor.name,
    entityType: "invoice",
    entityId: payment.invoiceId,
    action: "payment_deleted",
    detail: `$${Number(payment.amount).toFixed(2)} ${payment.method} payment removed`,
  });

  return NextResponse.json({ success: true });
}
