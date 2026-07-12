import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { companyMeta } from "@/lib/client-meta";
import QuoteAcceptPage from "./QuoteAcceptPage";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await prisma.quote.findFirst({
    where: { publicToken: token },
    select: { quoteNumber: true, company: { select: { name: true, logoUrl: true } } },
  });
  return companyMeta(quote?.company, quote ? `Quote #${quote.quoteNumber}` : undefined);
}

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { token } = await params;
  const { preview } = await searchParams;

  // Explicit select — this payload is serialized into the public page HTML, so
  // it must expose ONLY client-facing fields. Never `include: { contact, company }`
  // here: that leaks company.leadWebhookToken, contact.hubToken/processorCustomerRef,
  // line-item unitCost (margins) and internal notes into page source.
  const quote = await prisma.quote.findFirst({
    where: { publicToken: token },
    select: {
      id: true,
      publicToken: true,
      quoteNumber: true,
      title: true,
      status: true,
      subtotal: true,
      discountType: true,
      discountValue: true,
      taxRate: true,
      tax: true,
      total: true,
      depositType: true,
      depositValue: true,
      clientMessage: true,
      disclaimer: true,
      validUntil: true,
      contact: { select: { firstName: true, lastName: true } },
      company: {
        select: {
          name: true,
          logoUrl: true,
          brandColor: true,
          brandColorSecondary: true,
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
          isOptional: true,
          optedOut: true,
        },
      },
    },
  });

  if (!quote) notFound();

  return <QuoteAcceptPage quote={JSON.parse(JSON.stringify(quote))} preview={preview === "1"} />;
}
