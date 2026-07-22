import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { companyMeta } from "@/lib/client-meta";
import { getProcessor } from "@/lib/payments";
import { recomputeDepositApplied } from "@/lib/deposits";
import { finixApplicationId, finixEnvironment } from "@/lib/finix";
import PayPage from "./PayPage";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { publicToken: token },
    select: { invoiceNumber: true, company: { select: { name: true, logoUrl: true } } },
  });
  return companyMeta(invoice?.company, invoice ? `Invoice #${invoice.invoiceNumber}` : undefined);
}

export default async function PublicPayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // A final invoice's deposit credit may have changed since it was created
  // (deposit paid late, or a pending ACH deposit bounced) — re-derive it before
  // showing the amount due.
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

  // Explicit select — serialized into public page HTML, so client-facing fields
  // ONLY. Never `include: { contact, company }`: that leaks company.leadWebhookToken,
  // contact.hubToken/processorCustomerRef, and line-item unitCost into page source.
  const invoice = await prisma.invoice.findFirst({
    where: { publicToken: token },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      publicToken: true,
      subtotal: true,
      discount: true,
      tax: true,
      surcharge: true,
      depositApplied: true,
      total: true,
      notes: true,
      dueDate: true,
      contact: { select: { firstName: true, lastName: true, email: true } },
      company: {
        select: {
          name: true,
          phone: true,
          email: true,
          logoUrl: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          surchargeEnabled: true,
          surchargeRate: true,
        },
      },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          quantity: true,
          unitPrice: true,
          total: true,
          recurringInterval: true,
        },
      },
      payments: { select: { amount: true } },
    },
  });

  if (!invoice) notFound();

  // The server charge path bills the remaining balance (total minus recorded
  // payments) — the page must display and authorize that same amount.
  const { payments, ...publicInvoice } = invoice;
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.round((Number(invoice.total) - paid) * 100) / 100;

  // Online charging is on only when the platform processor is Finix AND this
  // company's merchant is approved. Checked with a separate server-only query —
  // merchant/onboarding ids must never ride the serialized invoice into HTML.
  // The application id IS public by design (finix.js needs it client-side).
  let finix: { applicationId: string; environment: "sandbox" | "live" } | null = null;
  const processor = getProcessor();
  if (processor.name === "finix" && processor.live) {
    const gate = await prisma.invoice.findFirst({
      where: { publicToken: token },
      select: {
        company: { select: { finixMerchantId: true, finixOnboardingState: true } },
      },
    });
    if (gate?.company.finixMerchantId && gate.company.finixOnboardingState === "APPROVED") {
      finix = { applicationId: finixApplicationId(), environment: finixEnvironment() };
    }
  }

  return <PayPage invoice={JSON.parse(JSON.stringify(publicInvoice))} balance={balance} finix={finix} />;
}
