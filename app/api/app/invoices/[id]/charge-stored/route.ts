import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import {
  getProcessor,
  recordPayment,
  invoiceBalance,
  sendReviewRequest,
  savedCardLabel,
} from "@/lib/payments";
import { recomputeDepositApplied } from "@/lib/deposits";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { logActivity } from "@/lib/activity";
import { defaultSavedCard, addSavedCard } from "@/lib/saved-cards";
import { reviveAutopayForContact } from "@/lib/auto-charge";

/**
 * POST — charge the invoice's remaining balance. Two shapes:
 *   { cardId? }                    — a card on the client's file (default card
 *                                    when omitted)
 *   { paymentToken, saveCard? }    — a NEW card the staff member just typed
 *                                    (finix.js token). Saving it to the
 *                                    client's file is the client's/owner's
 *                                    CHOICE, not a side effect — same opt-in
 *                                    as the public /pay page.
 * Managers only: this moves the client's money without them present. No card
 * surcharge is applied to staff-initiated charges — the client never saw a
 * pay-by-bank-instead choice for this transaction.
 */
export async function POST(
  req: NextRequest,
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
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          finixBuyerIdentityId: true,
          processorCustomerRef: true,
          savedCardLabel: true,
        },
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
  if (!invoice.contact)
    return NextResponse.json({ error: "This invoice has no client." }, { status: 400 });

  // Which card: a new one typed into the charge sheet (paymentToken), an
  // explicit pick from the client's file, or the default card on file.
  const body = await req.json().catch(() => null);
  const paymentToken = typeof body?.paymentToken === "string" ? body.paymentToken : "";
  const saveNewCard = body?.saveCard === true;
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  const card = paymentToken
    ? null
    : cardId
      ? await prisma.savedCard.findFirst({
          where: { id: cardId, contactId: invoice.contact.id },
        })
      : await defaultSavedCard(invoice.contact.id);
  // Legacy fallback: contacts saved before the SavedCard table (backfill
  // should have caught them, but the mirror columns are authoritative enough)
  const instrumentRef = card?.instrumentRef ?? invoice.contact.processorCustomerRef;
  let cardLabel = card?.label ?? invoice.contact.savedCardLabel;
  if (!paymentToken && !instrumentRef)
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

  const description = `Invoice #${invoice.invoiceNumber} — ${invoice.company.name}`;
  const metadata = { invoiceId: invoice.id, companyId: actor.companyId, chargedBy: actor.id };
  const result = paymentToken
    ? await processor.charge({
        amount: balance,
        method: "card",
        surcharge: 0,
        description,
        metadata,
        token: paymentToken,
        merchantRef: invoice.company.finixMerchantId ?? undefined,
        buyer: {
          identityRef: invoice.contact.finixBuyerIdentityId,
          firstName: invoice.contact.firstName,
          lastName: invoice.contact.lastName,
          email: invoice.contact.email,
          phone: invoice.contact.phone,
        },
      })
    : await processor.chargeStored({
        customerRef: instrumentRef!,
        amount: balance,
        description,
        metadata,
      });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 402 });
  }

  if (paymentToken) {
    cardLabel = savedCardLabel(result) || "new card";
    // First online charge mints the contact's buyer identity — keep it so
    // repeat charges don't create duplicate identities.
    if (result.buyerIdentityRef && !invoice.contact.finixBuyerIdentityId) {
      await prisma.contact
        .update({
          where: { id: invoice.contact.id },
          data: { finixBuyerIdentityId: result.buyerIdentityRef },
        })
        .catch(() => {});
    }
    // Keep the card ONLY when the box was ticked — same opt-in as /pay.
    // Never allowed to fail the charge that already went through.
    if (saveNewCard && result.instrumentRef) {
      await addSavedCard({
        companyId: actor.companyId,
        contactId: invoice.contact.id,
        instrumentRef: result.instrumentRef,
        label: cardLabel,
        brand: result.cardBrand,
        last4: result.cardLast4,
        expMonth: result.cardExpMonth,
        expYear: result.cardExpYear,
      }).catch((e) => console.error("[charge] save card failed", e));
      await reviveAutopayForContact(invoice.contact.id).catch((e) =>
        console.error("[charge] autopay revive failed", e)
      );
    }
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
    details: paymentToken
      ? `Card charged by staff${cardLabel ? ` (${cardLabel})` : ""}${saveNewCard ? "" : " — not kept on file"}`
      : `Card on file${cardLabel ? ` (${cardLabel})` : ""}`,
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
    detail: `$${balance.toFixed(2)} charged to ${cardLabel ?? "saved card"}`,
  });

  return NextResponse.json({ success: true, amount: balance, fullyPaid });
}
