import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProcessor, recordPayment, calculateSurcharge, sendReviewRequest } from "@/lib/payments";

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
  const { method, paymentToken } = await req.json();

  const invoice = await prisma.invoice.findFirst({
    where: { publicToken: token },
    include: { contact: true, company: true, payments: true },
  });

  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "Already paid." }, { status: 400 });
  }

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.round((Number(invoice.total) - paid) * 100) / 100;
  if (balance <= 0) return NextResponse.json({ error: "Nothing left to pay." }, { status: 400 });

  let surchargeAmount = 0;
  if (method === "CARD" && invoice.company.surchargeEnabled) {
    surchargeAmount = calculateSurcharge(balance, Number(invoice.company.surchargeRate));
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
          amount: balance + surchargeAmount,
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

  const { fullyPaid } = await recordPayment({
    companyId: invoice.companyId,
    invoiceId: invoice.id,
    amount: balance + surchargeAmount,
    method: method === "CARD" ? "CARD" : "ACH",
    processorRef: result.transactionId,
    surchargeAmount: surchargeAmount > 0 ? surchargeAmount : null,
    details: result.pending ? "Online payment — ACH processing" : "Online payment",
  });

  if (surchargeAmount > 0) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { surcharge: surchargeAmount },
    });
  }

  if (fullyPaid && invoice.company.reviewLink) {
    await sendReviewRequest({
      companyName: invoice.company.name,
      reviewLink: invoice.company.reviewLink,
      email: invoice.contact?.email ?? undefined,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, pending: result.pending ?? false });
}
