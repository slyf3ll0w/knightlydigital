import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { chargePayment, sendReviewRequest } from "@/lib/payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { method } = await req.json();

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId },
    include: { contact: true, company: true },
  });

  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status === "PAID") return NextResponse.json({ error: "Already paid." }, { status: 400 });

  const result = await chargePayment({
    amount: Number(invoice.total),
    method: method === "CARD" ? "card" : "ach",
    description: `Invoice #${invoice.invoiceNumber}`,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 402 });
  }

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date() },
    }),
    prisma.payment.create({
      data: {
        companyId,
        invoiceId: id,
        amount: Number(invoice.total),
        method: method ?? "OTHER",
        processorRef: result.transactionId,
      },
    }),
    // Update linked job to PAID
    ...(invoice.jobId
      ? [
          prisma.job.updateMany({
            where: { id: invoice.jobId, companyId },
            data: { status: "PAID" },
          }),
        ]
      : []),
  ]);

  // Fire review request if configured
  if (invoice.company.reviewLink) {
    await sendReviewRequest({
      companyName: invoice.company.name,
      reviewLink: invoice.company.reviewLink,
      email: invoice.contact?.email ?? undefined,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, transactionId: result.transactionId });
}
