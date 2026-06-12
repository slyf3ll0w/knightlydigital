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

  const quote = await prisma.quote.findFirst({
    where: { publicToken: token },
    include: {
      contact: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      company: true,
    },
  });

  if (!quote) notFound();

  return <QuoteAcceptPage quote={JSON.parse(JSON.stringify(quote))} preview={preview === "1"} />;
}
