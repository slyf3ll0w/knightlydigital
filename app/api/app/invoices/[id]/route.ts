import { NextRequest, NextResponse } from "next/server";
import type { InvoiceStatus, RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, isManager, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { intQuantity } from "@/lib/work-items";
import { paidDepositTotal } from "@/lib/deposits";

/**
 * PATCH — full-document invoice edit (subject, line items, discount, tax,
 * due date, notes), mirroring the quote editor.
 *
 * Edit rules follow the money: DRAFT / AWAITING_PAYMENT / PAST_DUE edit
 * freely; PAID is locked (re-open the invoice first). The total can never
 * drop below what's already been paid, and any deposit credit from the
 * originating quote is preserved and re-netted. Status recomputes after the
 * edit — a payment that now covers the new total flips it PAID; a due-date
 * change can move it between AWAITING_PAYMENT and PAST_DUE.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: { payments: true },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  if (invoice.status === "PAID") {
    return NextResponse.json(
      { error: "Paid invoices are locked — re-open the invoice first to make changes." },
      { status: 400 }
    );
  }

  const body = await req.json();
  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }

  const lineItems = body.lineItems as {
    name?: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    serviceDate?: string;
    workItemId?: string | null;
    recurringInterval?: RecurringInterval | null;
    sortOrder?: number;
  }[];
  for (const li of lineItems) li.quantity = intQuantity(li.quantity);

  const subtotal = lineItems.reduce((s, li) => s + (li.quantity || 0) * (li.unitPrice || 0), 0);
  const discountType =
    body.discountType === "PERCENT" || body.discountType === "FIXED" ? body.discountType : "NONE";
  const discountValue = Number(body.discountValue) || 0;
  const discount =
    discountType === "PERCENT"
      ? Math.round(subtotal * Math.min(Math.max(discountValue, 0), 100)) / 100
      : discountType === "FIXED"
        ? Math.min(Math.max(discountValue, 0), subtotal)
        : 0;
  const taxRate = Number(body.taxRate) || null;
  const taxable = subtotal - discount;
  const tax = taxRate ? taxable * taxRate : null;
  const gross = taxable + (tax ?? 0);

  // Re-net the deposit from SOURCE — the actual PAID deposit invoices on the
  // originating quote — not by ratcheting the stored depositApplied down against
  // the new (possibly smaller) gross. The old min(stored, gross) was a one-way
  // ratchet: temporarily removing a line item shrank the credit permanently and
  // over-billed the client when the line was restored. Resolve the quote via the
  // invoice's own link or its job.
  let quoteIdForDeposit = invoice.quoteId ?? null;
  if (!quoteIdForDeposit && invoice.jobId) {
    const q = await prisma.quote.findFirst({
      where: { jobId: invoice.jobId, companyId },
      select: { id: true },
    });
    quoteIdForDeposit = q?.id ?? null;
  }
  const paidDeposits = quoteIdForDeposit ? await paidDepositTotal(prisma, quoteIdForDeposit) : 0;
  const depositApplied = Math.min(paidDeposits, gross);
  const netTotal = Math.round((gross - depositApplied) * 100) / 100;

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  if (netTotal < paid - 0.005) {
    return NextResponse.json(
      {
        error: `The new total ($${netTotal.toFixed(2)}) is less than the $${paid.toFixed(
          2
        )} already paid on this invoice. Remove or adjust the payments first.`,
      },
      { status: 400 }
    );
  }

  // Empty due date keeps the current one — clearing it entirely would lose
  // the payment-terms anchor reminders key off
  const due = body.dueDate
    ? new Date(body.dueDate.length === 10 ? `${body.dueDate}T12:00:00` : body.dueDate)
    : invoice.dueDate;

  // Recompute status: full coverage → PAID; otherwise sent invoices land on
  // AWAITING_PAYMENT or PAST_DUE by the (possibly new) due date
  const fullyPaid = paid > 0 && paid >= netTotal - 0.005;
  let status: InvoiceStatus = invoice.status;
  if (fullyPaid) {
    status = "PAID";
  } else if (invoice.status !== "DRAFT") {
    status = due && due < new Date() ? "PAST_DUE" : "AWAITING_PAYMENT";
  }
  const lastPaidAt = invoice.payments.reduce<Date | null>(
    (latest, p) => (!latest || p.paidAt > latest ? p.paidAt : latest),
    null
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subject: body.subject || null,
        notes: body.notes || null,
        subtotal,
        discountType,
        discountValue: discount > 0 ? discountValue : null,
        discount: discount > 0 ? discount : null,
        taxRate,
        tax,
        depositApplied: depositApplied > 0 ? depositApplied : null,
        total: netTotal,
        dueDate: due,
        status,
        paidAt: status === "PAID" ? (lastPaidAt ?? new Date()) : null,
        lineItems: {
          create: lineItems.map((li, i) => ({
            name: li.name ?? "",
            description: li.description ?? "",
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            total: li.quantity * li.unitPrice,
            serviceDate: li.serviceDate ? new Date(li.serviceDate) : null,
            workItemId: li.workItemId ?? null,
            recurringInterval: li.recurringInterval ?? null,
            sortOrder: li.sortOrder ?? i,
          })),
        },
      },
    });
  });

  return NextResponse.json(updated);
}

/**
 * DELETE — permanently remove an invoice (managers only). Recorded payments
 * cascade with it (they change revenue history), so the UI requires an
 * explicit force flag when any exist.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: actor.companyId },
    include: { _count: { select: { payments: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (invoice._count.payments > 0 && !force) {
    return NextResponse.json(
      { error: "This invoice has recorded payments — deleting it removes them too." },
      { status: 400 }
    );
  }

  // line items + reminders cascade; payments deliberately don't (money
  // records never vanish implicitly) — remove them explicitly
  try {
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { invoiceId: invoice.id } }),
      prisma.invoice.delete({ where: { id: invoice.id } }),
    ]);
  } catch (e) {
    console.error("[invoice delete] failed", { invoiceId: invoice.id, error: e });
    return NextResponse.json({ error: "Couldn't delete this invoice. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
