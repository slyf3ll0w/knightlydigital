import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, isManager, viaContactScope } from "@/lib/permissions";

const validMethods = [
  "CARD", "ACH", "CASH", "CHECK", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER",
];

/**
 * After a payment changes or disappears, the invoice's status must follow
 * the money again: covered → PAID (stamped with the latest payment date),
 * no longer covered → back to AWAITING_PAYMENT or PAST_DUE by due date.
 */
async function recomputeInvoiceStatus(tx: Prisma.TransactionClient, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return;

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const fullyPaid = paid > 0 && paid >= Number(invoice.total) - 0.005;

  if (fullyPaid) {
    const lastPaidAt = invoice.payments.reduce<Date | null>(
      (latest, p) => (!latest || p.paidAt > latest ? p.paidAt : latest),
      null
    );
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "PAID", paidAt: lastPaidAt ?? new Date() },
    });
  } else if (invoice.status === "PAID") {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status:
          invoice.dueDate && invoice.dueDate < new Date() ? "PAST_DUE" : "AWAITING_PAYMENT",
        paidAt: null,
      },
    });
  }
}

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

  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id } });
    await recomputeInvoiceStatus(tx, payment.invoiceId);
  });

  return NextResponse.json({ success: true });
}
