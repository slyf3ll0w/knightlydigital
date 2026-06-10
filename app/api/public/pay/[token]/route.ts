import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getProcessor, recordPayment, calculateSurcharge, sendReviewRequest } from "@/lib/payments";

/**
 * Public online payment endpoint. Routes through the active payment processor;
 * while the processor is "manual" (pre-launch) online charges are declined with
 * a friendly message and the client is asked to pay the company directly.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { method } = await req.json();

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
  const result = await processor.charge({
    amount: balance + surchargeAmount,
    method: method === "CARD" ? "card" : "ach",
    surcharge: surchargeAmount,
    description: `Invoice #${invoice.invoiceNumber} — ${invoice.company.name}`,
    metadata: { invoiceId: invoice.id, companyId: invoice.companyId },
  });

  if (!result.success) {
    // Pre-launch: the manual processor can't move money
    return NextResponse.json(
      { error: result.error, processorLive: processor.live },
      { status: 503 }
    );
  }

  const { fullyPaid } = await recordPayment({
    companyId: invoice.companyId,
    invoiceId: invoice.id,
    amount: balance + surchargeAmount,
    method: method === "CARD" ? "CARD" : "ACH",
    processorRef: result.transactionId,
    surchargeAmount: surchargeAmount > 0 ? surchargeAmount : null,
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

  return NextResponse.json({ success: true });
}
