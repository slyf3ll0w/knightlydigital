import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProcessor, recordPayment, calculateSurcharge, sendReviewRequest, savedCardLabel } from "@/lib/payments";
import { addSavedCard } from "@/lib/saved-cards";
import { recomputeDepositApplied } from "@/lib/deposits";
import { suspendedResponse } from "@/lib/suspension";

/**
 * Public online payment endpoint. Routes through the active payment processor;
 * with Finix live, the body carries a one-time finix.js token and the charge
 * runs against the company's merchant account. While the processor is "manual"
 * (or the company hasn't finished Finix onboarding) online charges are declined
 * with a friendly message and the client is asked to pay the company directly.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { method, paymentToken, saveCard, amount: requestedAmount } = await req.json();

  // Re-derive any deposit credit on a final invoice before computing the
  // balance, so the charge reflects deposits paid (or bounced) since creation.
  const link = await prisma.invoice.findFirst({
    where: { publicToken: token },
    select: { jobId: true },
  });
  if (link?.jobId) {
    const quote = await prisma.quote.findFirst({
      where: { jobId: link.jobId },
      select: { id: true },
    });
    if (quote) await recomputeDepositApplied(prisma, quote.id);
  }

  const invoice = await prisma.invoice.findFirst({
    where: { publicToken: token },
    include: { contact: true, company: true, payments: true },
  });

  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.company.suspendedAt) {
    // Suspended merchants can't move money through the platform.
    return suspendedResponse(
      "Online payments are unavailable for this business. Please contact them directly to arrange payment."
    );
  }
  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "Already paid." }, { status: 400 });
  }
  if (invoice.status === "ARCHIVED") {
    return NextResponse.json(
      { error: "This invoice is no longer active. Please contact the business if you believe this is an error." },
      { status: 400 }
    );
  }

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.round((Number(invoice.total) - paid) * 100) / 100;
  if (balance <= 0) return NextResponse.json({ error: "Nothing left to pay." }, { status: 400 });

  // Partial payments: the client may pay any amount from $1 up to the balance.
  // Omitted/invalid amount = the full balance (the original behavior, and what
  // stale pay pages send). Clamp to cents so float math can't overshoot.
  let payAmount = balance;
  if (typeof requestedAmount === "number" && isFinite(requestedAmount)) {
    payAmount = Math.round(requestedAmount * 100) / 100;
    if (payAmount < 1 || payAmount > balance) {
      return NextResponse.json(
        { error: `Enter an amount between $1.00 and the balance ($${balance.toFixed(2)}).` },
        { status: 400 }
      );
    }
  }

  let surchargeAmount = 0;
  if (method === "CARD" && invoice.company.surchargeEnabled) {
    surchargeAmount = calculateSurcharge(payAmount, Number(invoice.company.surchargeRate));
  }

  const processor = getProcessor();
  const merchantApproved =
    invoice.company.finixMerchantId != null &&
    invoice.company.finixOnboardingState === "APPROVED";

  const result =
    processor.live && !merchantApproved
      ? // Processor is live platform-wide but THIS company hasn't finished
        // onboarding — same manual-payment fallback as the pre-launch stub.
        { success: false as const, error: "Online payments are not enabled yet. Record this payment manually." }
      : await processor.charge({
          amount: payAmount + surchargeAmount,
          method: method === "CARD" ? "card" : "ach",
          surcharge: surchargeAmount,
          description: `Invoice #${invoice.invoiceNumber} — ${invoice.company.name}`,
          metadata: { invoiceId: invoice.id, companyId: invoice.companyId },
          token: typeof paymentToken === "string" ? paymentToken : undefined,
          merchantRef: invoice.company.finixMerchantId ?? undefined,
          buyer: {
            identityRef: invoice.contact?.finixBuyerIdentityId,
            firstName: invoice.contact?.firstName,
            lastName: invoice.contact?.lastName,
            email: invoice.contact?.email,
            phone: invoice.contact?.phone,
          },
        });

  if (!result.success) {
    // Pre-launch / not-onboarded: no money can move — tell the client to pay
    // the business directly (503). A live decline is a 402 with the reason.
    const notEnabled = !processor.live || !merchantApproved;
    return NextResponse.json(
      { error: result.error, processorLive: processor.live && merchantApproved },
      { status: notEnabled ? 503 : 402 }
    );
  }

  // First online payment creates the contact's buyer identity — keep it for
  // reuse so repeat payments don't mint duplicate identities.
  if (
    result.buyerIdentityRef &&
    invoice.contact &&
    !invoice.contact.finixBuyerIdentityId
  ) {
    await prisma.contact
      .update({
        where: { id: invoice.contact.id },
        data: { finixBuyerIdentityId: result.buyerIdentityRef },
      })
      .catch(() => {});
  }

  // Client asked to keep this card on file: the charge already vaulted the
  // instrument at Finix, so persisting the ref is all "saving" means. Enables
  // subscription auto-charge and staff "charge card on file". Never fails the
  // payment. Cards only — ACH debits can bounce days later.
  if (saveCard === true && method === "CARD" && result.instrumentRef && invoice.contact) {
    await addSavedCard({
      companyId: invoice.companyId,
      contactId: invoice.contact.id,
      instrumentRef: result.instrumentRef,
      label: savedCardLabel(result),
      brand: result.cardBrand,
      last4: result.cardLast4,
      expMonth: result.cardExpMonth,
      expYear: result.cardExpYear,
    }).catch((e) => console.error("[pay] save card failed", e));
  }

  const { fullyPaid } = await recordPayment({
    companyId: invoice.companyId,
    invoiceId: invoice.id,
    amount: payAmount + surchargeAmount,
    method: method === "CARD" ? "CARD" : "ACH",
    processorRef: result.transactionId,
    surchargeAmount: surchargeAmount > 0 ? surchargeAmount : null,
    cardBrand: result.cardBrand,
    cardType: result.cardType,
    details: result.pending ? "Online payment — ACH processing" : "Online payment",
    receiptPending: result.pending,
  });

  if (surchargeAmount > 0) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { surcharge: surchargeAmount },
    });
  }

  // Paid in full → ask for a review. A pending ACH debit hasn't settled yet
  // (it can still bounce), so that one waits for the webhook rather than
  // thanking someone whose money may come back. Never allowed to fail the
  // payment: the client's card is already charged by this point.
  if (fullyPaid && !result.pending && invoice.contact?.email) {
    await sendReviewRequest({
      companyId: invoice.companyId,
      contactId: invoice.contactId,
      jobId: invoice.jobId,
      email: invoice.contact.email,
      contactFirstName: invoice.contact.firstName,
      jobTitle: null,
    }).catch((e) => console.error("[pay] review request failed", e));
  }

  return NextResponse.json({
    success: true,
    pending: result.pending ?? false,
    remaining: Math.max(0, Math.round((balance - payAmount) * 100) / 100),
  });
}
