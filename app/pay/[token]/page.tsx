import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { companyMeta } from "@/lib/client-meta";
import { getProcessor } from "@/lib/payments";
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
    },
  });

  if (!invoice) notFound();

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

  return <PayPage invoice={JSON.parse(JSON.stringify(invoice))} finix={finix} />;
}
