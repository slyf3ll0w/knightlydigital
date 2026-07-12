import { NextRequest, NextResponse } from "next/server";
import type { RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, contactScope } from "@/lib/permissions";
import { recordLeadWin } from "@/lib/pipeline";
import { ensureSubscriptionsForContact } from "@/lib/subscriptions";
import { paidDepositTotal } from "@/lib/deposits";
import { intQuantity } from "@/lib/work-items";

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const { contactId, jobId, subject, lineItems, taxRate, notes, dueDate } = body;

  if (!lineItems?.length) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }
  for (const li of lineItems) li.quantity = intQuantity(li.quantity);

  const contact = contactId
    ? await prisma.contact.findFirst({ where: { id: contactId, companyId, ...contactScope(actor) } })
    : null;

  const subtotal = lineItems.reduce(
    (s: number, li: { quantity: number; unitPrice: number }) => s + li.quantity * li.unitPrice,
    0
  );
  // Discount comes off the subtotal before tax
  const discountType = body.discountType === "PERCENT" || body.discountType === "FIXED" ? body.discountType : "NONE";
  const discountValue = Number(body.discountValue) || 0;
  const discount =
    discountType === "PERCENT"
      ? Math.round(subtotal * Math.min(Math.max(discountValue, 0), 100)) / 100
      : discountType === "FIXED"
        ? Math.min(Math.max(discountValue, 0), subtotal)
        : 0;
  const taxable = subtotal - discount;
  const tax = taxRate ? taxable * taxRate : null;
  const total = taxable + (tax ?? 0);

  // Due date from explicit value, else the client's payment terms (Net N).
  // Date-only strings get anchored to midday so they don't shift a day in
  // timezone conversion.
  const issuedAt = new Date();
  const due = dueDate
    ? new Date(dueDate.length === 10 ? `${dueDate}T12:00:00` : dueDate)
    : contact
      ? new Date(issuedAt.getTime() + contact.paymentTermsDays * 86400000)
      : null;

  const invoice = await prisma.$transaction(async (tx) => {
    const last = await tx.invoice.findFirst({
      where: { companyId },
      orderBy: { invoiceNumber: "desc" },
    });

    // A final invoice for a job nets any deposit already paid on the job's quote,
    // so the client isn't billed twice. `total` is stored net; depositApplied
    // drives the "Deposit applied" credit line on the invoice.
    let depositApplied = 0;
    if (jobId) {
      const quote = await tx.quote.findFirst({ where: { jobId, companyId }, select: { id: true } });
      if (quote) {
        depositApplied = Math.min(await paidDepositTotal(tx, quote.id), total);
        // Retire any NEVER-PAID deposit invoice for this quote — it's superseded
        // by this final invoice, which bills the full remaining scope. Leaving it
        // outstanding would bill AND dun the client twice for the deposit. Only
        // touch deposit invoices with zero payments; anything with payment
        // history is left intact (its paid amount is already netted above).
        const staleDeposits = await tx.invoice.findMany({
          where: { quoteId: quote.id, kind: "DEPOSIT", status: { not: "PAID" }, payments: { none: {} } },
          select: { id: true },
        });
        if (staleDeposits.length > 0) {
          const ids = staleDeposits.map((d) => d.id);
          await tx.invoiceLineItem.deleteMany({ where: { invoiceId: { in: ids } } });
          await tx.invoice.deleteMany({ where: { id: { in: ids } } });
        }
      }
    }
    const netTotal = Math.round((total - depositApplied) * 100) / 100;

    const created = await tx.invoice.create({
      data: {
        companyId,
        contactId: contactId || null,
        jobId: jobId || null,
        invoiceNumber: (last?.invoiceNumber ?? 0) + 1,
        subject: subject || null,
        subtotal,
        discountType,
        discountValue: discount > 0 ? discountValue : null,
        discount: discount > 0 ? discount : null,
        taxRate: taxRate || null,
        tax,
        depositApplied: depositApplied > 0 ? depositApplied : null,
        total: netTotal,
        notes: notes || null,
        issuedAt,
        dueDate: due,
        lineItems: {
          create: lineItems.map(
            (li: {
              name?: string;
              description: string;
              quantity: number;
              unitPrice: number;
              serviceDate?: string;
              workItemId?: string | null;
              recurringInterval?: RecurringInterval | null;
              sortOrder?: number;
            }) => ({
              name: li.name ?? "",
              description: li.description ?? "",
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              total: li.quantity * li.unitPrice,
              serviceDate: li.serviceDate ? new Date(li.serviceDate) : null,
              workItemId: li.workItemId ?? null,
              recurringInterval: li.recurringInterval ?? null,
              sortOrder: li.sortOrder ?? 0,
            })
          ),
        },
      },
    });

    // Invoicing a completed job resolves its "requires invoicing" state
    if (jobId) {
      const job = await tx.job.findFirst({ where: { id: jobId, companyId } });
      if (job?.status === "REQUIRES_INVOICING") {
        await tx.job.update({
          where: { id: jobId },
          data: { status: "ARCHIVED", closedAt: new Date() },
        });
      }
    }

    // Billing a lead closes them: active client, off the pipeline board
    if (contact) {
      await recordLeadWin(tx, companyId, contact);
    }

    // Recurring services billed directly also start a subscription
    if (contact) {
      await ensureSubscriptionsForContact(
        tx,
        companyId,
        contact.id,
        (lineItems as { workItemId?: string | null; quantity?: number }[]).map((li) => ({
          workItemId: li.workItemId,
          quantity: Number(li.quantity) || 1,
        }))
      );
    }

    return created;
  });

  return NextResponse.json(invoice, { status: 201 });
}
