import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PayPage from "./PayPage";

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
