import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chargePayment, calculateSurcharge, sendReviewRequest } from "@/lib/payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { method } = await req.json();

  const invoice = await prisma.invoice.findFirst({
    where: { publicToken: token },
    include: { contact: true, company: true },
  });

  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status === "PAID") return NextResponse.json({ error: "Already paid." }, { status: 400 });

  const baseAmount = Number(invoice.total);
  let surchargeAmount = 0;

  if (method === "CARD" && invoice.company.surchargeEnabled) {
    surchargeAmount = calculateSurcharge(baseAmount, Number(invoice.company.surchargeRate));
  }

  const totalCharged = baseAmount + surchargeAmount;

  const result = await chargePayment({
    amount: totalCharged,
    method: method === "CARD" ? "card" : "ach",
    description: `Invoice #${invoice.invoiceNumber} — ${invoice.company.name}`,
    metadata: { invoiceId: invoice.id, companyId: invoice.companyId },
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 402 });
  }

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        surcharge: surchargeAmount > 0 ? surchargeAmount : undefined,
      },
    }),
    prisma.payment.create({
      data: {
        companyId: invoice.companyId,
        invoiceId: invoice.id,
        amount: totalCharged,
        method: method ?? "CARD",
        processorRef: result.transactionId,
        surchargeAmount: surchargeAmount > 0 ? surchargeAmount : null,
      },
    }),
    ...(invoice.jobId
      ? [
          prisma.job.updateMany({
            where: { id: invoice.jobId, companyId: invoice.companyId },
            data: { status: "PAID" },
          }),
        ]
      : []),
  ]);

  if (invoice.company.reviewLink) {
    await sendReviewRequest({
      companyName: invoice.company.name,
      reviewLink: invoice.company.reviewLink,
      email: invoice.contact?.email ?? undefined,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
