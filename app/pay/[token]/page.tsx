import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { companyMeta } from "@/lib/client-meta";
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

  const invoice = await prisma.invoice.findFirst({
    where: { publicToken: token },
    include: {
      contact: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      company: true,
    },
  });

  if (!invoice) notFound();

  return <PayPage invoice={JSON.parse(JSON.stringify(invoice))} />;
}
