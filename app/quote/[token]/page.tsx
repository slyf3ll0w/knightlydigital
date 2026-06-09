import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import QuoteAcceptPage from "./QuoteAcceptPage";

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const quote = await prisma.quote.findFirst({
    where: { publicToken: token },
    include: {
      contact: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      company: true,
    },
  });

  if (!quote) notFound();

  return <QuoteAcceptPage quote={JSON.parse(JSON.stringify(quote))} />;
}
