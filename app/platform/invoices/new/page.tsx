import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import InvoiceEditor from "./InvoiceEditor";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { jobId } = await searchParams;

  const [contacts, job] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    jobId
      ? prisma.job.findFirst({
          where: { id: jobId, companyId },
          include: {
            contact: true,
            lineItems: { orderBy: { sortOrder: "asc" } },
            quote: { include: { lineItems: true } },
          },
        })
      : null,
  ]);

  return <InvoiceEditor contacts={contacts} prefillJob={job ? JSON.parse(JSON.stringify(job)) : null} />;
}
