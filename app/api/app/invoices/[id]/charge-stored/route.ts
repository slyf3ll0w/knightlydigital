import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { getProcessor, recordPayment, invoiceBalance, sendReviewRequest } from "@/lib/payments";
import { recomputeDepositApplied } from "@/lib/deposits";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { logActivity } from "@/lib/activity";

/**
 * POST — charge the invoice's remaining balance to the client's card on file
 * (Contact.processorCustomerRef, saved by the client on /pay or in the hub).
 * Managers only: this moves the client's money without them present. No card
 * surcharge is applied to stored charges — the client never saw a
 * pay-by-bank-instead choice for this transaction.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Charging cards"), { status: 403 });

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: actor.companyId },
    include: {
      payments: true,
      contact: {
        select: { id: true, firstName: true, email: true, processorCustomerRef: true, savedCardLabel: true },
      },
      company: { select: { suspendedAt: true, finixMerchantId: true, finixOnboardingState: true, name: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.company.suspendedAt)
    return NextResponse.json({ error: "Payments are paused on this account." }, { status: 403 });
  if (invoice.status === "PAID")
    return NextResponse.json({ error: "This invoice is already paid." }, { status: 400 });
  if (invoice.status === "ARCHIVED")
    return NextResponse.json({ error: "This invoice is archived — reopen it first." }, { status: 400 });
  if (!invoice.contact?.processorCustomerRef)
    return NextResponse.json({ error: "This client has no card on file." }, { status: 400 });

  // A final invoice's deposit credit may have moved since creation.
  if (invoice.quoteId) await recomputeDepositApplied(prisma, invoice.quoteId);

  const fresh = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
    include: { payments: true },
  });
  const balance = invoiceBalance(fresh);
  if (balance <= 0) return NextResponse.json({ error: "Nothing left to charge." }, { status: 400 });

  const processor = getProcessor();
  if (!processor.live)
    return NextResponse.json({ error: "Online payments are not enabled yet." }, { status: 503 });

  const result = await processor.chargeStored({
    customerRef: invoice.contact.processorCustomerRef,
    amount: balance,
    description: `Invoice #${invoice.invoiceNumber} — ${invoice.company.name}`,
    metadata: { invoiceId: invoice.id, companyId: actor.companyId, chargedBy: actor.id },
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 402 });
  }

  const { fullyPaid } = await recordPayment({
    companyId: actor.companyId,
    invoiceId: invoice.id,
    amount: balance,
    method: "CARD",
    processorRef: result.transactionId,
    cardBrand: result.cardBrand,
    cardType: result.cardType,
    recordedById: actor.id,
    details: `Card on file${invoice.contact.savedCardLabel ? ` (${invoice.contact.savedCardLabel})` : ""}`,
    receiptPending: result.pending,
  });

  if (fullyPaid && !result.pending && invoice.contact.email) {
    await sendReviewRequest({
      companyId: actor.companyId,
      contactId: invoice.contact.id,
      jobId: invoice.jobId,
      email: invoice.contact.email,
      contactFirstName: invoice.contact.firstName,
      jobTitle: null,
    }).catch((e) => console.error("[charge-stored] review request failed", e));
  }

  logActivity({
    companyId: actor.companyId,
    userId: actor.id,
    userName: actor.name,
    entityType: "invoice",
    entityId: invoice.id,
    action: "card_on_file_charged",
    detail: `$${balance.toFixed(2)} charged to ${invoice.contact.savedCardLabel ?? "saved card"}`,
  });

  return NextResponse.json({ success: true, amount: balance, fullyPaid });
}
